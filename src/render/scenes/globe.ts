import * as THREE from 'three';
import type { SceneCue } from '../../core/content';
import type { MissionState, SiteId } from '../../core/types';
import { siteById, SITES } from '../../content/sites';
import { latLonToVec, planetTexture } from '../assets';
import type { Shot } from '../director';
import { HOLO_RED, HOLO_WHITE, holoBracket, holoGraticule, holoLabel, holoRing, setHoloColor } from '../holo';
import { marsTexture, starField } from '../textures';
import { atmosphere, disposeTree, type SceneCtx, type SceneModule } from './common';

const R = 10;
export const siteLon = (coord: string) => { const v = Number(coord.split(' ')[1].replace('°E', '')); return v > 180 ? v - 360 : v; };

// 着色器补丁：在 NASA 贴图上叠加细尺度程序噪声，掩盖近看时的模糊
export function detailPatch(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vObjPos;
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{ vec3 q = normalize(vObjPos) * 60.0; float d = n3(q) * 0.5 + n3(q * 2.3) * 0.3 + n3(q * 5.1) * 0.2;
  diffuseColor.rgb *= 0.86 + d * 0.28;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 0.86, 0.74), 0.55); }`);
  };
}

// ---------------- 火星全球（标题、飞控大厅、选址） ----------------
export class MarsGlobeScene implements SceneModule {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 3000);
  exposure = 1.05;
  private globe = new THREE.Group();
  private planet = new THREE.Group(); // 自转部分：星球 + 选址标记
  private markers = new Map<SiteId, { group: THREE.Group; ring: THREE.Object3D; label: THREE.Sprite; bracket: THREE.Sprite }>();
  private phobos: THREE.Mesh;
  private targetRot: number | null = null;
  private targetTilt = 0.32;
  private chosen: SiteId | null = null;

  constructor(ctx: SceneCtx) {
    const map = planetTexture('mars', ctx.tier, () => marsTexture(512).map);
    const mat = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 0.9, roughness: 0.97, metalness: 0 });
    detailPatch(mat);
    const mars = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), mat);
    const sunDir = new THREE.Vector3(-1, 0.35, 0.6).normalize();
    this.planet.add(mars);
    for (const s of SITES) {
      const pos = latLonToVec(s.latDeg, siteLon(s.coord), R);
      const n = pos.clone().normalize();
      const group = new THREE.Group();
      group.position.copy(pos);
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      const ring = holoRing(0.42, { ticks: 16, opacity: 0.9 });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 6), new THREE.MeshBasicMaterial({ color: HOLO_WHITE, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      beam.position.y = 0.8;
      const label = holoLabel(EN[s.id], s.name, HOLO_WHITE, 0.042);
      label.position.y = 1.6;
      const bracket = holoBracket(1.6);
      bracket.visible = false;
      group.add(ring, beam, label, bracket);
      this.markers.set(s.id, { group, ring, label, bracket });
      this.planet.add(group);
    }
    this.globe.add(this.planet, holoGraticule(R * 1.004, { opacity: 0.07 }),
      atmosphere(R * 1.035, '#e8a57a', 4.2, 0.95, sunDir), atmosphere(R * 1.012, '#ffd0a8', 2.2, 0.25, sunDir));
    this.globe.rotation.x = this.targetTilt;
    this.phobos = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 2), new THREE.MeshStandardMaterial({ color: '#6b5d52', roughness: 1, flatShading: true }));
    this.phobos.scale.set(1.3, 0.9, 1);
    const sun = new THREE.DirectionalLight('#fff4e6', 3.0);
    sun.position.copy(sunDir).multiplyScalar(60);
    this.scene.add(this.globe, this.phobos, sun, new THREE.AmbientLight('#3a2018', 0.25), starField(ctx.tier === 'low' ? 1500 : 4000, 900));
  }

  shots(cue: SceneCue): Shot[] {
    void cue;
    return [
      { from: [7, 4, 56], to: [3, 2, 46], look: [0, 0, 0], fov: 34, dur: 18 },
      { from: [-22, 3, 18], to: [-16, 6, 22], look: [0, 1, 0], fov: 30, dur: 20 },
      { from: [0, 22, 30], to: [4, 16, 26], look: [0, 2, 0], fov: 32, dur: 18 },
    ];
  }

  apply(s: MissionState | null): void {
    this.chosen = s?.site ?? null;
    // 选址前（序章）不显示候选点；选址时由 focus 打开；选定后只保留一个
    for (const [id, m] of this.markers) m.group.visible = this.chosen === id;
    if (this.chosen) this.focus(this.chosen, false);
  }

  // 选址预览：标记变红、加角标框，并把该点转到镜头前
  focus(id: SiteId, highlight = true): void {
    const site = siteById(id)!;
    this.targetRot = -THREE.MathUtils.degToRad(siteLon(site.coord)) - Math.PI / 2;
    this.targetTilt = THREE.MathUtils.degToRad(site.latDeg) * 0.85;
    for (const [mid, m] of this.markers) {
      const on = mid === id && highlight;
      m.group.visible = !this.chosen || mid === this.chosen || highlight;
      setHoloColor(m.ring, on ? HOLO_RED : HOLO_WHITE);
      m.bracket.visible = on;
      m.ring.scale.setScalar(on ? 1.8 : 1);
    }
  }

  tick(dt: number, t: number): void {
    if (this.targetRot === null) this.planet.rotation.y += dt * 0.04;
    else {
      let d = this.targetRot - this.planet.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.planet.rotation.y += d * Math.min(1, dt * 1.5);
      this.globe.rotation.x += (this.targetTilt - this.globe.rotation.x) * Math.min(1, dt * 1.5);
    }
    for (const m of this.markers.values()) m.ring.rotation.y = t * 0.6;
    const a = t * 0.05;
    this.phobos.position.set(Math.cos(a) * 19, Math.sin(a) * 3.5, Math.sin(a) * 19);
    this.phobos.rotation.y = a;
  }

  dispose(): void { disposeTree(this.scene); }
}

const EN: Record<SiteId, string> = { utopia: 'UTOPIA PLANITIA', jezero: 'JEZERO CRATER', arcadia: 'ARCADIA PLANITIA' };
