import * as THREE from 'three';
import type { SceneCue } from '../../core/content';
import { ARRIVAL_DAY, crewPos, DEPARTURE_DAY, earthPos, isSolarConjunction, lightDelayMinutes, earthMarsDelayMinutes, marsPos, phaseOf, TRANSFER_DAYS, CONJUNCTION_START } from '../../core/orbit';
import type { MissionState } from '../../core/types';
import { planetTexture } from '../assets';
import type { Shot, Vec3 } from '../director';
import { dotTexture, HOLO_RED, HOLO_WHITE, HoloArc, holoLabel, holoMat, holoRing } from '../holo';
import { earthTexture, marsTexture, starField } from '../textures';
import { atmosphere, disposeTree, glow, type SceneCtx, type SceneModule } from './common';

const AU = 12;
const to3 = (p: { x: number; y: number }, y = 0) => new THREE.Vector3(p.x * AU, y, -p.y * AU);

// ---------------- 太阳系（窗口、日凌） ----------------
export class OrbitScene implements SceneModule {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 4000);
  exposure = 1.1;
  private earth = new THREE.Group();
  private mars = new THREE.Group();
  private ship = new THREE.Group();
  private shipLabel: THREE.Sprite;
  private outArc: HoloArc;
  private backArc: HoloArc;
  private link: THREE.Line;
  private linkMat: THREE.ShaderMaterial;
  private photons: THREE.Sprite[] = [];
  private linkLabel: THREE.Sprite;
  private lostLabel: THREE.Sprite;
  private wedge: THREE.Mesh;
  private cue: SceneCue = 'orbit';
  private day = 0;
  private demo = true;
  private delay = 0;
  private labelText = '';

  constructor(ctx: SceneCtx) {
    const sun = new THREE.Mesh(new THREE.SphereGeometry(0.9, 48, 24), new THREE.MeshBasicMaterial({ color: '#fff4dc' }));
    this.scene.add(sun, glow('rgba(255,236,200,1)', 3.6), glow('rgba(255,190,120,0.25)', 7), new THREE.PointLight('#fff1dc', 900, 0, 1.6), new THREE.AmbientLight('#223', 0.35));
    this.scene.add(holoRing(AU, { ticks: 72, opacity: 0.32, tickLen: 0.18 }), holoRing(AU * 1.524, { ticks: 72, opacity: 0.22, tickLen: 0.18 }));
    const eMap = planetTexture('earth', ctx.tier, () => earthTexture(256).map);
    const mMap = planetTexture('mars', ctx.tier, () => marsTexture(256).map);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.55, 48, 24), new THREE.MeshStandardMaterial({ map: eMap, roughness: 0.75 }));
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.42, 48, 24), new THREE.MeshStandardMaterial({ map: mMap, roughness: 0.95 }));
    this.earth.add(e, atmosphere(0.62, '#7fb6ff', 2.5, 1.1));
    this.mars.add(m, atmosphere(0.46, '#e8a57a', 3, 0.7));
    const el = holoLabel('EARTH', '地球 · 北京飞控', HOLO_WHITE, 0.038); el.position.y = 0.7;
    const ml = holoLabel('MARS', '火星', HOLO_WHITE, 0.038); ml.position.y = 0.6;
    this.earth.add(el);
    this.mars.add(ml);
    const shipDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: HOLO_RED, blending: THREE.AdditiveBlending, depthWrite: false }));
    shipDot.scale.setScalar(0.9);
    this.shipLabel = holoLabel('ZHURONG-1', '', HOLO_RED, 0.038);
    this.shipLabel.position.y = 0.5;
    this.ship.add(shipDot, this.shipLabel);
    // 转移轨道：去程与返程
    const outPts: THREE.Vector3[] = [], backPts: THREE.Vector3[] = [];
    for (let d = 0; d <= TRANSFER_DAYS; d += 4) outPts.push(to3(crewPos(d), 0.02));
    for (let d = DEPARTURE_DAY; d <= DEPARTURE_DAY + TRANSFER_DAYS; d += 4) backPts.push(to3(crewPos(d), 0.02));
    this.outArc = new HoloArc(outPts, { color: HOLO_RED, opacity: 0.75, dash: 0.6, gap: 0.4, speed: 0.6 });
    this.backArc = new HoloArc(backPts, { color: HOLO_RED, opacity: 0.6, dash: 0.6, gap: 0.4, speed: 0.6 });
    // 通信链路与光子脉冲
    this.linkMat = holoMat({ opacity: 0.55 });
    this.link = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), this.linkMat);
    this.link.frustumCulled = false;
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false }));
      p.scale.setScalar(0.45);
      this.photons.push(p);
    }
    this.linkLabel = holoLabel('LIGHT DELAY', '', HOLO_WHITE, 0.034);
    this.lostLabel = holoLabel('SIGNAL LOST', '日凌 · 太阳干扰', HOLO_RED, 0.04);
    // 日凌：从地球指向太阳方向的红色干扰楔形（角度放大以便看见）
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0.12, 1, 0, -0.12], 3));
    this.wedge = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ color: HOLO_RED, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.scene.add(this.earth, this.mars, this.ship, this.outArc.obj, this.backArc.obj, this.link, ...this.photons, this.linkLabel, this.lostLabel, this.wedge,
      starField(ctx.tier === 'low' ? 1200 : 3000, 1500));
  }

  shots(cue: SceneCue): Shot[] {
    const e = to3(earthPos(Math.max(0, this.day))), m = to3(marsPos(this.day)), c = to3(crewPos(Math.max(0, this.day)));
    const v = (p: THREE.Vector3): Vec3 => [p.x, p.y, p.z];
    if (cue === 'conjunction') {
      const behind = e.clone().multiplyScalar(1.5).add(new THREE.Vector3(0, 4, 0));
      return [{ from: v(behind), to: v(behind.clone().multiplyScalar(0.92)), look: v(m.clone().multiplyScalar(0.4)), fov: 42, dur: 20 }];
    }
    return [
      { from: [0, 36, 28], to: [5, 30, 30], look: [0, 0, 0], fov: 40, dur: 20 },
      { from: [30, 5, 20], to: [25, 4, 25], look: [0, 0, 0], fov: 38, dur: 20 },
      { from: v(c.clone().multiplyScalar(1.35).add(new THREE.Vector3(0, 7, 0))), to: v(c.clone().multiplyScalar(1.25).add(new THREE.Vector3(0, 5, 0))), look: () => this.ship.position, fov: 36, dur: 18 },
    ];
  }

  apply(s: MissionState | null, cue: SceneCue): void {
    this.cue = cue;
    this.demo = !s || s.day < 0;
    this.day = cue === 'conjunction' ? CONJUNCTION_START + 7 : s?.day ?? 0;
    this.outArc.obj.visible = this.demo || this.day < ARRIVAL_DAY + 5;
    this.backArc.obj.visible = !this.demo && this.day >= DEPARTURE_DAY - 5;
  }

  private place(day: number): void {
    const conj = this.cue === 'conjunction' || isSolarConjunction(day);
    this.earth.position.copy(to3(earthPos(day)));
    this.mars.position.copy(to3(marsPos(day)));
    const onMarsSurface = phaseOf(day) === 'surface';
    this.ship.visible = day >= 0 && !onMarsSurface && day < DEPARTURE_DAY + TRANSFER_DAYS;
    this.ship.position.copy(to3(crewPos(Math.max(0, day)), 0.05));
    const target = day >= 0 && !onMarsSurface ? this.ship.position : this.mars.position;
    const pos = this.link.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, this.earth.position.x, 0, this.earth.position.z);
    pos.setXYZ(1, target.x, 0, target.z);
    pos.needsUpdate = true;
    this.linkMat.uniforms.uColor.value.set(conj ? HOLO_RED : HOLO_WHITE);
    this.delay = day < 0 ? earthMarsDelayMinutes(day) : lightDelayMinutes(day);
    const mid = this.earth.position.clone().lerp(target, 0.5);
    this.linkLabel.position.copy(mid).add(new THREE.Vector3(0, 0.3, 0));
    this.linkLabel.visible = !conj;
    this.lostLabel.visible = conj;
    this.lostLabel.position.copy(mid).add(new THREE.Vector3(0, 0.6, 0));
    this.wedge.visible = conj;
    if (conj) {
      const toSun = this.earth.position.clone().negate();
      this.wedge.position.copy(this.earth.position);
      this.wedge.rotation.y = Math.atan2(-toSun.z, toSun.x);
      this.wedge.scale.setScalar(toSun.length() * 2.6);
    }
    const text = `单程 ${this.delay.toFixed(1)} 分`;
    if (text !== this.labelText) {
      this.labelText = text;
      const fresh = holoLabel('LIGHT DELAY', text, HOLO_WHITE, 0.034);
      (this.linkLabel.material as THREE.SpriteMaterial).map?.dispose();
      (this.linkLabel.material as THREE.SpriteMaterial).map = (fresh.material as THREE.SpriteMaterial).map;
      (this.linkLabel.material as THREE.SpriteMaterial).needsUpdate = true;
      fresh.material.dispose();
    }
    // 光子脉冲：一次往返约 4 秒，表示“压缩后的光速”
    this.photons.forEach((p, i) => {
      p.visible = !conj;
      const k = ((performance.now() / 1000) * 0.5 + i / 3) % 1;
      p.position.lerpVectors(this.earth.position, target, k);
    });
  }

  tick(dt: number, t: number): void {
    const day = this.demo ? ((t * 22) % (TRANSFER_DAYS + 60)) - 30 : this.day;
    this.place(day);
    this.earth.children[0].rotation.y += dt * 0.6;
    this.mars.children[0].rotation.y += dt * 0.5;
  }

  dispose(): void { disposeTree(this.scene); }
}
