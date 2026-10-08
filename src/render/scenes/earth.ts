import * as THREE from 'three';
import type { SceneCue } from '../../core/content';
import type { MissionState } from '../../core/types';
import { planetTexture } from '../assets';
import type { Shot } from '../director';
import { HOLO_RED, HOLO_WHITE, HoloArc, holoLabel, holoRing } from '../holo';
import { cloudTexture, earthTexture, starField } from '../textures';
import { atmosphere, disposeTree, glow, texSize, type SceneCtx, type SceneModule } from './common';

const R = 10;
const WENCHANG = { lat: 19.6, lon: 110.9 };
const SPLASH = { lat: 16.5, lon: 114.5 };

// 海洋更光滑：按贴图蓝色程度降低粗糙度，得到太阳镜面反光
function oceanPatch(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
{ float water = smoothstep(0.02, 0.12, diffuseColor.b - max(diffuseColor.r, diffuseColor.g * 0.9));
  roughnessFactor = mix(roughnessFactor, 0.32, water); }`);
  };
}

// ---------------- 地球（发射、回家） ----------------
export class EarthScene implements SceneModule {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.01, 3000);
  exposure = 1.0;
  private tilt = new THREE.Group();
  private spin = new THREE.Group();
  private clouds: THREE.Mesh;
  private cue: SceneCue = 'launch';
  private trail: THREE.Mesh;
  private trailGeo: THREE.TubeGeometry;
  private head: THREE.Sprite;
  private path: THREE.CatmullRomCurve3;
  private ascent: HoloArc;
  private padLabel: THREE.Sprite;
  private splash = new THREE.Group();
  private t0 = 0;

  constructor(ctx: SceneCtx) {
    const map = planetTexture('earth', ctx.tier, () => earthTexture(512).map);
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0 });
    oceanPatch(mat);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 160, 120), mat);
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.008, 128, 96), new THREE.MeshStandardMaterial({ map: cloudTexture(texSize(ctx.tier)), transparent: true, depthWrite: false, roughness: 1 }));
    const sunDir = new THREE.Vector3(0.7, 0.45, 0.55).normalize();
    this.spin.add(earth, this.clouds);
    this.tilt.add(this.spin);
    this.scene.add(this.tilt, atmosphere(R * 1.03, '#5fa8ff', 3.6, 1.5, sunDir), atmosphere(R * 1.008, '#bfe0ff', 1.6, 0.18, sunDir));
    const sun = new THREE.DirectionalLight('#ffffff', 3.2);
    sun.position.copy(sunDir).multiplyScalar(80);
    this.scene.add(sun, new THREE.AmbientLight('#0a1530', 0.12), starField(ctx.tier === 'low' ? 1500 : 4000, 900));
    this.scene.add(glow('rgba(255,250,240,1)', 30).translateOnAxis(sunDir, 600));

    // 发射：从文昌升起、向东弯曲的尾迹（场景坐标，地球朝向固定后计算）
    this.path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, R), new THREE.Vector3(0.05, 0.4, R + 0.25), new THREE.Vector3(0.5, 1.4, R + 0.8), new THREE.Vector3(1.6, 2.6, R + 1.0), new THREE.Vector3(3.2, 3.4, R + 0.6)]);
    this.trailGeo = new THREE.TubeGeometry(this.path, 120, 0.02, 6, false);
    this.trail = new THREE.Mesh(this.trailGeo, new THREE.MeshBasicMaterial({ color: '#fff6ea', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.head = glow('rgba(255,214,160,1)', 0.4);
    this.ascent = new HoloArc(this.path.getPoints(40).map((p) => p.clone().multiplyScalar(1.002)), { color: HOLO_WHITE, opacity: 0.35, dash: 0.08, gap: 0.06, speed: 0.2 });
    this.padLabel = holoLabel('WENCHANG LC-101', '文昌航天发射场', HOLO_WHITE, 0.04);
    this.padLabel.position.set(0, 0.05, R + 0.02);
    // 回家：溅落区圆环与标签
    const ring = holoRing(0.55, { ticks: 24, color: HOLO_RED, opacity: 0.9 });
    ring.rotation.x = Math.PI / 2;
    const sl = holoLabel('SPLASHDOWN ZONE', '南海预定溅落区', HOLO_RED, 0.04);
    sl.position.set(0, 0.2, 0);
    this.splash.add(ring, sl);
    this.splash.position.set(0, 0, R + 0.01);
    this.scene.add(this.trail, this.head, this.ascent.obj, this.padLabel, this.splash);
  }

  // 让指定经纬度正对 +z
  private face(lat: number, lon: number): void {
    this.spin.rotation.y = -THREE.MathUtils.degToRad(lon) - Math.PI / 2;
    this.tilt.rotation.x = THREE.MathUtils.degToRad(lat);
  }

  shots(cue: SceneCue): Shot[] {
    if (cue === 'home') {
      return [
        { from: [5, 7, R + 14], to: [3, 5, R + 11], look: [0, 0.5, R], fov: 34, dur: 18 },
        { from: [-2, 1, R + 3.5], to: [-1, 0.6, R + 2.8], look: () => this.head.position, fov: 40, dur: 14 },
      ];
    }
    return [
      { from: [0.4, -3.3, R + 1.1], to: [-0.4, -3.1, R + 1.3], look: [0, 1.6, R - 0.4], fov: 46, dur: 16 },
      { from: [2.5, -1.2, R + 3.2], to: [2.2, 0, R + 3.6], look: () => this.head.position, fov: 42, dur: 14 },
    ];
  }

  onShot(_cue: SceneCue, _index: number, _beat: string | undefined, now: number): void { this.t0 = now; }

  apply(_s: MissionState | null, cue: SceneCue): void {
    this.cue = cue;
    const p = cue === 'home' ? SPLASH : WENCHANG;
    this.face(p.lat, p.lon);
    const launch = cue === 'launch';
    this.ascent.obj.visible = launch;
    this.padLabel.visible = launch;
    this.splash.visible = !launch;
  }

  tick(dt: number, t: number): void {
    this.clouds.rotation.y += dt * 0.004;
    const k = ((t - this.t0) % 16) / 16;
    if (this.cue === 'launch') {
      const p = Math.min(1, k * 1.4);
      this.trailGeo.setDrawRange(0, Math.floor(p * this.trailGeo.index!.count / 6) * 6);
      this.head.position.copy(this.path.getPointAt(Math.max(0.001, p)));
      (this.head.material as THREE.SpriteMaterial).opacity = p < 1 ? 1 : 1 - (k * 1.4 - 1) * 2;
      this.head.scale.setScalar(0.25 + Math.random() * 0.08);
      (this.trail.material as THREE.MeshBasicMaterial).opacity = 0.85 * (k < 0.85 ? 1 : (1 - k) / 0.15);
      this.trail.visible = true;
    } else {
      // 再入火流星：从高空斜插向溅落区
      this.trail.visible = false;
      const a = new THREE.Vector3(-5, 4.5, R + 3), b = new THREE.Vector3(0, 0.25, R + 0.15);
      const p = Math.min(1, k * 1.25);
      this.head.position.lerpVectors(a, b, p);
      (this.head.material as THREE.SpriteMaterial).opacity = p < 1 ? 0.6 + Math.sin(t * 40) * 0.2 : 0;
      this.head.scale.setScalar(0.35 + (1 - p) * 0.5);
    }
  }

  dispose(): void { disposeTree(this.scene); }
}
