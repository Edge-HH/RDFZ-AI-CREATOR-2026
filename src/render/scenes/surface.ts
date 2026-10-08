import * as THREE from 'three';
import type { SceneCue } from '../../core/content';
import type { MissionState, SiteId } from '../../core/types';
import { siteById } from '../../content/sites';
import type { Shot } from '../director';
import { HOLO_RED, HoloArc, holoLabel, holoRing } from '../holo';
import { fbm3, mulberry, ridged3 } from '../noise';
import { dustWallTexture, noiseNormal, puffTexture } from '../textures';
import { benbenModel, patrolBenben, type Benben } from './benben';
import { buildBase, landerModel, LAYOUT, type BaseParts } from './base';
import { disposeTree, glow, makeMats, useEnv, type Mats, type SceneCtx, type SceneModule } from './common';

const SUN = new THREE.Vector3(0.55, 0.42, -0.72).normalize();

// 地面细节：灰度碎石、裂纹与风纹（与顶点色相乘，不改变整体色调）
function groundDetail(size: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const a = (i / size) * Math.PI * 2, b = (j / size) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const n = fbm3(ca * 3, sa * 3 + cb * 3, sb * 3, 5, 9);
    const crack = ridged3(ca * 6, sa * 6 + cb * 6, sb * 6, 3, 21);
    const ripple = Math.sin((i / size) * Math.PI * 2 * 11 + n * 14) * 0.012;
    const v = 0.82 + n * 0.3 - Math.max(0, crack - 0.82) * 1.2 + ripple;
    const k = (j * size + i) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.max(0, Math.min(255, v * 230));
    img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const r = mulberry(3);
  for (let p = 0; p < size * 2; p++) { // 碎石：深色小点 + 亮边
    const x = r() * size, y = r() * size, s = 0.6 + r() * r() * 3;
    ctx.fillStyle = `rgba(40,28,22,${0.25 + r() * 0.35})`;
    ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,220,0.12)';
    ctx.beginPath(); ctx.arc(x - s * 0.3, y - s * 0.3, s * 0.5, 0, Math.PI * 2); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 喷焰：加色锥体（尖端向下）
function plume(len: number, radius: number, color = '#ffd29a'): THREE.Mesh {
  const geo = new THREE.ConeGeometry(radius, len, 20, 1, true);
  geo.rotateX(Math.PI); // 尖端朝下
  geo.translate(0, -len / 2, 0); // 宽口在喷管处（y=0），尖端在 -len
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
}

interface Puff { s: THREE.Sprite; age: number; life: number; vel: THREE.Vector3; grow: number; alpha: number }

// ---------------- 火星地表：着陆点、基地、沙尘暴、上升 ----------------
export class SurfaceScene implements SceneModule {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.3, 4000);
  exposure = 1.0;
  private m: Mats;
  private terrain: THREE.Mesh | null = null;
  private scenery = new THREE.Group();
  private baseRoot = new THREE.Group();
  private base: BaseParts | null = null;
  private benben: Benben | null = null;
  private skyMat: THREE.ShaderMaterial;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private fog = new THREE.FogExp2('#b88a62', 0.0011);
  private motes: THREE.Points;
  private walls: THREE.Mesh[] = [];
  private streaks: THREE.InstancedMesh;
  private streakSeed: Float32Array;
  private puffs: Puff[] = [];
  private puffTex: THREE.Texture;
  // 着陆演出
  private landing = new THREE.Group();
  private descender: THREE.Group;
  private chute = new THREE.Group();
  private landerPlumes: THREE.Mesh[] = [];
  private ellipse = new THREE.Group();
  // 上升演出
  private mavPlume: THREE.Mesh;
  private mavGlow: THREE.Sprite;
  private ascentArc: HoloArc;
  private siteId: SiteId | null = null;
  private baseKey = '';
  private cue: SceneCue = 'surface';
  private beat = '';
  private tau = 0.5;
  private t0 = 0;
  private replay = false;
  private launching = false;
  private heightAt: (x: number, z: number) => number = () => 0;
  private dummy = new THREE.Object3D();

  constructor(private ctx: SceneCtx) {
    this.m = makeMats(ctx.tier);
    useEnv(ctx, this.scene, 'mars', 0.7);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDir: { value: SUN.clone() }, tau: { value: 0.5 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform vec3 sunDir; uniform float tau; varying vec3 vD;
        void main(){
          vec3 d = normalize(vD);
          float h = d.y;
          float sd = max(dot(d, sunDir), 0.0);
          // 颜色为线性空间（后期统一做色调映射与 sRGB 转换）
          vec3 zenith = vec3(0.13, 0.058, 0.03);
          vec3 horizon = vec3(0.50, 0.27, 0.135);
          vec3 c = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.5));
          c = mix(c, vec3(0.26, 0.12, 0.06), smoothstep(0.0, -0.15, h));
          float low = 1.0 - smoothstep(0.05, 0.6, sunDir.y);
          c += vec3(0.07, 0.16, 0.45) * pow(sd, 10.0) * (0.35 + low * 0.6);  // 火星特有的蓝色日晕
          c += vec3(1.0, 0.95, 0.88) * pow(sd, 1400.0) * 3.0;
          float storm = clamp((tau - 0.5) / 8.5, 0.0, 1.0);
          c = mix(c, vec3(0.075, 0.03, 0.013) + vec3(0.09, 0.04, 0.015) * pow(sd, 3.0), storm * 0.92);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), this.skyMat));
    this.sun = new THREE.DirectionalLight('#fff0dc', 2.6);
    this.sun.position.copy(SUN).multiplyScalar(300);
    if (ctx.tier === 'high') {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const c = this.sun.shadow.camera as THREE.OrthographicCamera;
      c.left = -110; c.right = 110; c.top = 110; c.bottom = -110; c.near = 10; c.far = 800;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.4;
    }
    this.hemi = new THREE.HemisphereLight('#e8c09a', '#5a3020', ctx.tier === 'high' ? 0.7 : 1.0);
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.scene.fog = this.fog;
    this.puffTex = puffTexture();

    // 平时飘浮的细尘
    const n = ctx.tier === 'low' ? 600 : 2000;
    const pos = new Float32Array(n * 3);
    const r = mulberry(13);
    for (let i = 0; i < n; i++) pos.set([(r() - 0.5) * 300, r() * 40, (r() - 0.5) * 300], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({ color: '#e0b08a', size: 0.18, transparent: true, opacity: 0.35, depthWrite: false }));
    // 沙尘暴：围绕营地的多层尘墙（近浓远淡）+ 风向条纹
    const layers = ctx.tier === 'high' ? 4 : ctx.tier === 'medium' ? 3 : 2;
    const wallTex = dustWallTexture();
    for (let i = 0; i < layers; i++) {
      const t = wallTex.clone();
      t.repeat.set(3 + i, 1);
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(70 + i * 70, 70 + i * 70, 90, 48, 1, true), new THREE.MeshBasicMaterial({ map: t, color: '#a0603a', transparent: true, opacity: 0, depthWrite: false, side: THREE.BackSide, fog: false }));
      wall.position.y = 30;
      this.walls.push(wall);
    }
    const S = ctx.tier === 'low' ? 200 : 700;
    this.streaks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#d9a070', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }), S);
    this.streakSeed = new Float32Array(S * 4);
    for (let i = 0; i < S; i++) this.streakSeed.set([r(), (r() - 0.5) * 160, r() * 25, (r() - 0.5) * 160], i * 4);
    this.streaks.frustumCulled = false;

    // 着陆演出：下降中的着陆器、降落伞与后罩、喷焰、着陆椭圆
    this.descender = landerModel(this.m);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const p = plume(7, 0.7);
      p.position.set(Math.cos(a) * 1.8, 1.2, Math.sin(a) * 1.8);
      this.landerPlumes.push(p);
      this.descender.add(p);
    }
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.8, side: THREE.DoubleSide, emissive: '#3a2418', emissiveIntensity: 0.3 }));
    canopy.position.y = 26;
    const stripes = new THREE.Mesh(new THREE.SphereGeometry(9.05, 32, 10, 0, Math.PI * 2, 0.2, 0.25), new THREE.MeshStandardMaterial({ color: '#d14b2a', roughness: 0.8, side: THREE.DoubleSide }));
    stripes.position.y = 26;
    const backshell = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 4.4, 3.6, 32, 1, true), this.m.foil);
    backshell.position.y = 11;
    const lines: THREE.Vector3[] = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; lines.push(new THREE.Vector3(0, 13, 0), new THREE.Vector3(Math.cos(a) * 8.6, 23, Math.sin(a) * 8.6)); }
    const riser = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: '#cfc6bc', transparent: true, opacity: 0.6 }));
    this.chute.add(canopy, stripes, backshell, riser);
    const ring = holoRing(16, { ticks: 64, color: HOLO_RED, opacity: 0.7 });
    ring.scale.set(1.8, 1, 1);
    const lbl = holoLabel('LANDING ELLIPSE', '着陆椭圆 · 预定落点', HOLO_RED, 0.04);
    lbl.position.set(0, 2, 0);
    this.ellipse.add(ring, lbl);
    this.landing.add(this.descender, this.chute, this.ellipse);

    // 上升演出：喷焰 + 上升轨迹
    this.mavPlume = plume(16, 1.6, '#ffe2b0');
    this.mavGlow = glow('rgba(255,210,150,1)', 14);
    const mx = LAYOUT.mav[0], mz = LAYOUT.mav[1];
    this.ascentArc = new HoloArc([new THREE.Vector3(mx, 25, mz), new THREE.Vector3(mx + 6, 120, mz - 8), new THREE.Vector3(mx + 40, 300, mz - 40), new THREE.Vector3(mx + 140, 520, mz - 120)], { color: HOLO_RED, opacity: 0.6, dash: 6, gap: 4, speed: 12 });
    const al = holoLabel('MAV · ORBIT INSERTION', '上升入轨', HOLO_RED, 0.04);
    al.position.set(mx + 6, 120, mz - 8);
    this.ascentArc.obj.add(al);

    this.scene.add(this.scenery, this.baseRoot, this.motes, ...this.walls, this.streaks, this.landing, this.mavPlume, this.mavGlow, this.ascentArc.obj);
  }

  // ---------- 地形 ----------
  private buildTerrain(siteId: SiteId): void {
    if (this.terrain) { this.scene.remove(this.terrain); this.terrain.geometry.dispose(); (this.terrain.material as THREE.Material).dispose(); }
    const site = siteById(siteId)!;
    const size = 1000;
    const seg = this.ctx.tier === 'high' ? 280 : this.ctx.tier === 'medium' ? 180 : 100;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const prof = site.profile;
    const mid = prof[Math.floor(prof.length / 2)];
    const rough = siteId === 'jezero' ? 1.6 : siteId === 'arcadia' ? 0.7 : 0.6;
    const r = mulberry(siteId.length * 97);
    const craters = Array.from({ length: 30 }, () => ({ x: (r() - 0.5) * size, z: (r() - 0.5) * size, rad: 6 + r() * 42 }));
    this.heightAt = (x, z) => {
      const u = (x / size + 0.5) * (prof.length - 1);
      const i = Math.max(0, Math.min(prof.length - 2, Math.floor(u)));
      const f = u - i, s = f * f * (3 - 2 * f);
      let h = ((prof[i] * (1 - s) + prof[i + 1] * s) - mid) * 70;
      h += (fbm3(x * 0.01, 0, z * 0.01, 5, 2) - 0.5) * 14 * rough;
      h += (ridged3(x * 0.03, 1, z * 0.03, 3, 4) - 0.3) * 3 * rough;
      for (const c of craters) {
        const d = Math.hypot(x - c.x, z - c.z) / c.rad;
        if (d < 1.4) h += d < 1 ? -(1 - d * d) * c.rad * 0.18 : (1.4 - d) * c.rad * 0.1;
      }
      const flat = Math.min(1, Math.hypot(x, z) / 75);
      return h * flat * flat;
    };
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    // 顶点色：按高度、坡度与噪声混合玄武岩、土壤、亮色尘土
    const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const basalt = new THREE.Color('#4b3024'), soil = new THREE.Color('#8b5a3a'), dust = new THREE.Color('#b8875e'), bright = new THREE.Color('#c99f76'), ice = new THREE.Color('#d8c8bc');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = fbm3(x * 0.015, 5, z * 0.015, 4, 8);
      const slope = 1 - nrm.getY(i);
      c.copy(soil).lerp(dust, Math.min(1, Math.max(0, n * 1.5 - 0.3)));
      c.lerp(bright, Math.max(0, n - 0.62) * 1.6);
      c.lerp(basalt, Math.min(1, slope * 4.5 + Math.max(0, 0.36 - n) * 0.6));
      if (siteId === 'arcadia') c.lerp(ice, Math.max(0, n - 0.6) * 0.7);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const detail = groundDetail(this.ctx.tier === 'low' ? 256 : 512);
    detail.repeat.set(140, 140);
    const normal = this.ctx.tier === 'low' ? null : noiseNormal(256, 4, 3.5, 31);
    normal?.repeat.set(60, 60);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, normalMap: normal ?? undefined, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.96, metalness: 0 });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = this.ctx.tier === 'high';
    this.scene.add(this.terrain);
    this.buildScenery(siteId);
  }

  // 岩石与远处台地：提供尺度感与纵深（雾气形成大气透视）
  private buildScenery(siteId: SiteId): void {
    disposeTree(this.scenery);
    this.scenery.clear();
    const r = mulberry(siteId.length * 131 + 7);
    const count = this.ctx.tier === 'high' ? 800 : this.ctx.tier === 'medium' ? 480 : 220;
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#5a3828', roughness: 0.92, flatShading: true }), count);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const density = siteId === 'jezero' ? 1.6 : siteId === 'arcadia' ? 0.6 : 1;
    let n = 0;
    for (let i = 0; i < count; i++) {
      const ang = r() * Math.PI * 2, dist = 18 + Math.pow(r(), 0.7) * 400;
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      if (r() > density * 0.75) continue;
      if (Math.abs(z - (-11)) < 3 && x > -22 && x < 14) continue; // 不挡笨笨的巡检线
      const s = (0.2 + Math.pow(r(), 3) * 2.8) * (siteId === 'jezero' ? 1.3 : 1);
      p.set(x, this.heightAt(x, z) + s * 0.2, z);
      q.setFromEuler(e.set(r() * 3, r() * 3, r() * 3));
      sc.set(s * (0.8 + r() * 0.7), s * (0.35 + r() * 0.45), s * (0.7 + r() * 0.6));
      rocks.setMatrixAt(n++, mtx.compose(p, q, sc));
    }
    rocks.count = n;
    rocks.castShadow = rocks.receiveShadow = this.ctx.tier === 'high';
    this.scenery.add(rocks);
    const mesaMat = new THREE.MeshStandardMaterial({ color: '#86563a', roughness: 1, flatShading: true });
    const mesas = siteId === 'jezero' ? 22 : 14;
    for (let i = 0; i < mesas; i++) {
      const ang = (i / mesas) * Math.PI * 2 + r() * 0.3;
      const dist = 480 + r() * 300;
      const w = 50 + r() * 140, h = (siteId === 'jezero' ? 45 : 18) + r() * 30;
      const geo = new THREE.CylinderGeometry(w * (0.55 + r() * 0.2), w, h, 7 + Math.floor(r() * 4), 2);
      const gp = geo.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < gp.count; k++) gp.setXYZ(k, gp.getX(k) * (0.85 + r() * 0.3), gp.getY(k), gp.getZ(k) * (0.85 + r() * 0.3));
      geo.computeVertexNormals();
      const mesa = new THREE.Mesh(geo, mesaMat);
      mesa.position.set(Math.cos(ang) * dist, h / 2 - 8, Math.sin(ang) * dist);
      mesa.rotation.y = r() * Math.PI;
      this.scenery.add(mesa);
    }
  }

  private rebuildBase(s: MissionState): void {
    disposeTree(this.baseRoot);
    this.baseRoot.clear();
    this.base = null;
    this.benben = null;
    if (this.cue === 'landing') return; // 着陆当下还没有基地，也没有笨笨
    const add = (o: THREE.Object3D, x: number, z: number, lift = 0) => {
      o.position.set(x, this.heightAt(x, z) + lift, z);
      this.baseRoot.add(o);
      return o;
    };
    this.base = buildBase(s, this.m, add, Math.atan2(SUN.x, SUN.z), this.ctx.tier);
    this.baseRoot.add(this.base.group);
    this.benben = benbenModel();
    add(this.benben.body, -4, -11);
  }

  shots(cue: SceneCue): Shot[] {
    const mav = () => {
      const r = this.baseRoot.getObjectByName('rocket');
      const v = new THREE.Vector3(LAYOUT.mav[0], 10, LAYOUT.mav[1]);
      if (r) r.getWorldPosition(v).add(new THREE.Vector3(0, 10, 0));
      return v;
    };
    switch (cue) {
      case 'landing': return [
        { from: [-42, 2.5, 40], to: [-34, 2.2, 32], look: () => this.descender.position.clone().add(new THREE.Vector3(0, 5, 0)), fov: 48, dur: 14, ease: 'out' },
        { from: [-13, 2.2, 15], to: [-10, 2.6, 12], look: [0, 4, 0], fov: 42, dur: 18 },
      ];
      case 'storm': return [
        { from: [-52, 10, 42], to: [-46, 8, 37], look: [0, 4, 0], fov: 46, dur: 18, shake: 0.03 },
        { from: [-17, 3, 15], to: [-13, 3, 12], look: [2, 3.5, 2], fov: 44, dur: 16, shake: 0.04 },
      ];
      case 'ascent': return [
        { from: [12, 1.8, -4], to: [10, 2, -6], look: mav, fov: 48, dur: 14 },
        { from: [-30, 10, 30], to: [-32, 30, 32], look: mav, fov: 40, dur: 16 },
      ];
      default: return [
        { from: [-48, 13, 54], to: [-40, 10, 46], look: [4, 2, 2], fov: 44, dur: 20 },
        { from: [16, 4, 26], to: [-6, 3.6, 24], look: [6, 2.5, 4], lookTo: [-4, 2.5, 4], fov: 46, dur: 22 },
        { from: [22, 6, -22], to: [30, 5, -32], look: [140, 8, -160], fov: 42, dur: 20 },
        { from: [-40, 6, 56], to: [-34, 5, 50], look: [10, 4, -4], fov: 40, dur: 18 },
      ];
    }
  }

  onShot(cue: SceneCue, index: number, beat: string | undefined, now: number): void {
    this.beat = beat ?? this.beat;
    if (cue === 'landing' && index === 0) { this.replay = true; this.t0 = now; }
    if (cue === 'landing' && index > 0) this.replay = false;
    if (cue === 'ascent' && this.beat === 'ascent' && !this.launching) { this.launching = true; this.t0 = now; }
  }

  apply(s: MissionState | null, cue: SceneCue): void {
    if (cue !== this.cue) { this.launching = false; if (cue !== 'landing') this.replay = false; }
    this.cue = cue;
    const site = (s?.site ?? 'utopia') as SiteId;
    if (site !== this.siteId) { this.siteId = site; this.buildTerrain(site); this.baseKey = ''; }
    if (s) {
      const key = `${cue === 'landing'}|${s.loadout.join(',')}|${s.crew.map((c) => c.status).join(',')}`;
      if (key !== this.baseKey) { this.baseKey = key; this.rebuildBase(s); }
    }
    this.tau = cue === 'storm' ? 9 : s?.dustTau ?? 0.5;
    const landing = cue === 'landing';
    this.landing.visible = landing;
    this.ellipse.visible = landing;
    this.ascentArc.obj.visible = cue === 'ascent';
    if (this.base) for (const l of this.base.labels) l.visible = cue === 'surface';
  }

  // 尘团：在地面附近生成，向外扩散、变大、淡出
  private spawnPuff(at: THREE.Vector3, vel: THREE.Vector3, life: number, size: number, alpha: number, color = '#c29068'): void {
    let p = this.puffs.find((x) => x.age >= x.life);
    if (!p) {
      if (this.puffs.length > (this.ctx.tier === 'low' ? 60 : 160)) return;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffTex, transparent: true, depthWrite: false }));
      this.scene.add(s);
      p = { s, age: 0, life: 1, vel: new THREE.Vector3(), grow: 1, alpha: 1 };
      this.puffs.push(p);
    }
    p.s.position.copy(at);
    p.vel.copy(vel);
    p.age = 0; p.life = life; p.grow = size; p.alpha = alpha;
    (p.s.material as THREE.SpriteMaterial).color.set(color);
    p.s.visible = true;
  }

  private tickPuffs(dt: number): void {
    for (const p of this.puffs) {
      if (p.age >= p.life) { p.s.visible = false; continue; }
      p.age += dt;
      const k = p.age / p.life;
      p.s.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - dt * 0.6);
      p.s.scale.setScalar(p.grow * (0.4 + k * 1.6));
      (p.s.material as THREE.SpriteMaterial).opacity = p.alpha * Math.sin(Math.PI * Math.min(1, k * 1.2)) * (1 - k);
    }
  }

  private tickLanding(t: number): void {
    const T = this.replay ? t - this.t0 : 99;
    const sep = 2.5, touch = 11;
    let y = 0;
    if (T < sep) y = 74 - T * 3;
    else if (T < touch) { const u = (T - sep) / (touch - sep); y = 66.5 * (1 - u) ** 2.2; }
    this.descender.position.set(0, this.heightAt(0, 0) + y, 0);
    this.descender.rotation.z = T < touch ? Math.sin(t * 2.3) * 0.02 : 0;
    const firing = T >= sep && T < touch + 0.3;
    for (const p of this.landerPlumes) { p.visible = firing; p.scale.set(1, 0.7 + Math.random() * 0.5, 1); }
    // 降落伞与后罩：分离前与着陆器一起下降，分离后被风吹向一侧
    this.chute.visible = T < touch + 4;
    if (T < sep) this.chute.position.copy(this.descender.position);
    else this.chute.position.set((T - sep) * 2.5, this.heightAt(0, 0) + 74 - sep * 3 + (T - sep) * 0.8, -(T - sep) * 1.2);
    // 扬尘：离地 18 以下开始，触地后逐渐落定
    if (firing && y < 18 && Math.random() < 0.9) {
      const a = Math.random() * Math.PI * 2, sp = 10 + Math.random() * 10;
      this.spawnPuff(new THREE.Vector3(Math.cos(a) * 3, this.heightAt(0, 0) + 0.8, Math.sin(a) * 3), new THREE.Vector3(Math.cos(a) * sp, 1 + Math.random() * 2, Math.sin(a) * sp), 3.5, 5 + Math.random() * 5, 0.75);
    }
  }

  private tickAscent(t: number): void {
    const rocket = this.baseRoot.getObjectByName('rocket');
    const T = this.launching ? t - this.t0 : -1;
    const lit = T >= 0;
    this.mavPlume.visible = this.mavGlow.visible = lit && this.cue === 'ascent';
    if (!rocket) return;
    const lift = T > 1.5 ? 3 * (T - 1.5) ** 2 : 0;
    rocket.position.y = 0.6 + lift;
    if (!lit) return;
    const base = rocket.getWorldPosition(new THREE.Vector3());
    this.mavPlume.position.copy(base).add(new THREE.Vector3(0, 0.2, 0));
    this.mavPlume.scale.set(1, Math.min(1, T / 1.5) * (0.8 + Math.random() * 0.4), 1);
    this.mavGlow.position.copy(base).add(new THREE.Vector3(0, -2, 0));
    if (Math.random() < 0.8) {
      const a = Math.random() * Math.PI * 2;
      if (lift < 25) this.spawnPuff(new THREE.Vector3(LAYOUT.mav[0] + Math.cos(a) * 4, this.heightAt(LAYOUT.mav[0], LAYOUT.mav[1]) + 1, LAYOUT.mav[1] + Math.sin(a) * 4), new THREE.Vector3(Math.cos(a) * 16, 2, Math.sin(a) * 16), 4, 8, 0.7);
      else this.spawnPuff(base.clone().add(new THREE.Vector3(0, -6, 0)), new THREE.Vector3((Math.random() - 0.5) * 2, -1, (Math.random() - 0.5) * 2), 7, 6, 0.35, '#d8d0c8');
    }
  }

  tick(dt: number, t: number): void {
    const storm = Math.min(1, Math.max(0, (this.tau - 0.5) / 8.5));
    this.skyMat.uniforms.tau.value = this.tau;
    this.fog.density = 0.0011 + storm * 0.011;
    this.fog.color.set(storm > 0.3 ? '#5e3420' : '#b88a62');
    this.sun.intensity = 2.6 * (1 - storm * 0.85);
    this.hemi.intensity = (this.ctx.tier === 'high' ? 0.7 : 1.0) * (1 - storm * 0.45);
    // 细尘与风向条纹
    const mp = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    const wind = 3 + storm * 50;
    for (let i = 0; i < mp.count; i++) { let x = mp.getX(i) + dt * wind; if (x > 150) x -= 300; mp.setX(i, x); }
    mp.needsUpdate = true;
    (this.motes.material as THREE.PointsMaterial).opacity = 0.3 + storm * 0.5;
    this.streaks.visible = storm > 0.2;
    if (this.streaks.visible) {
      for (let i = 0; i < this.streaks.count; i++) {
        const [ph, x0, y0, z0] = this.streakSeed.subarray(i * 4, i * 4 + 4);
        const x = ((x0 + 80 + (ph * 160 + t * 70)) % 160) - 80;
        this.dummy.position.set(x, y0 + 0.5, z0);
        this.dummy.rotation.set(0, 0, 0.05);
        this.dummy.scale.set(3 + ph * 5, 0.04, 1);
        this.dummy.updateMatrix();
        this.streaks.setMatrixAt(i, this.dummy.matrix);
      }
      this.streaks.instanceMatrix.needsUpdate = true;
    }
    this.walls.forEach((w, i) => {
      const mat = w.material as THREE.MeshBasicMaterial;
      mat.opacity = storm * (0.75 - i * 0.12);
      w.visible = storm > 0.05;
      if (mat.map) mat.map.offset.x = t * (0.012 + i * 0.004);
    });
    // 基地：风暴中亮灯、告警信标闪烁；太阳能板缓慢跟踪；冰钻转动；笨笨巡检
    if (this.base) {
      this.base.windows.emissiveIntensity = 0.6 + storm * 1.6;
      const blink = Math.sin(t * 5) > 0.3;
      this.base.beacons.forEach((b, i) => { b.visible = i === 0 ? Math.sin(t * 2) > 0 : storm > 0.3 && blink; });
      for (const p of this.base.panels) p.rotation.y += Math.sin(t * 0.05) * 0.0004;
      if (this.base.drillBit) this.base.drillBit.rotation.y += dt * 3;
    }
    if (this.benben) patrolBenben(this.benben, t, this.heightAt);
    if (this.cue === 'landing') this.tickLanding(t);
    this.tickAscent(t);
    this.tickPuffs(dt);
  }

  dispose(): void { disposeTree(this.scene); }
}
