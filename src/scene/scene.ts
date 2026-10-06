import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { heightAt, LOCATIONS, routeBetween, sunAzimuth, WORLD_SIZE, type LocationId } from '../world/terrain';
import type { Governance, UndercityStatus } from '../engine/types';
import { makeEarth, makeMoonGeometry, makeMoonTexture, makeGlowTexture } from './bodies';

/**
 * 场景采用“球面月球 + 南极局部地形”的单一坐标系：
 * 基地局部地形位于月球球体顶部（+y 方向即月球南极的“当地竖直方向”），
 * 月心在 (0, -MOON_R, 0)。全景视图中相机把 −y 设为“上”，让南极出现在球体下方。
 * 月球半径为示意缩小比例（便于在同一画面中看到球体与地形），地形本身仍按 1 单位 = 125 m 计算坡度与光照。
 */
export const MOON_R = 1500;
const MOON_C = new THREE.Vector3(0, -MOON_R, 0);
/** 剖切平面：沿 z = CUT_Z 切开地形，展示月面基地核心舱的内部结构示意 */
const CUT_Z = LOCATIONS.core.z;
const DEPTH = 70;
/** 视觉光源高度角（真实约 1.5°，为便于观察略抬高） */
const VISUAL_SUN_ELEVATION = (4 * Math.PI) / 180;
const HALF = WORLD_SIZE / 2;
const SKIRT = 240;
/** 地球方向（从月心看），使基地看到的地球贴近地平线 */
const EARTH_DIR = new THREE.Vector3(-0.6, 0.21, -0.78).normalize();
const EARTH_POS = MOON_C.clone().addScaledVector(EARTH_DIR, 12000);
const EARTH_R = 820;
/** 全景视图中相机所在的水平方向 */
const VIEW_H = new THREE.Vector3(0.75, 0, 0.66).normalize();
const ORBIT_K = new THREE.Vector3().crossVectors(VIEW_H, new THREE.Vector3(0, 1, 0)).normalize();
/** 领航员空间站位于地球近地轨道；轨道半径为视觉示意比例。 */
const STATION_ORBIT_R = EARTH_R + 360;

export type ViewMode = 'globe' | 'overview' | 'cutaway';
export type Shot = 'earthmoon' | 'globe' | 'descent' | 'overview' | 'cutaway' | 'station' | `loc:${LocationId}`;

export interface SceneApi {
  setDay(day: number): void;
  setView(mode: ViewMode): Promise<void>;
  shot(name: Shot, seconds?: number): Promise<void>;
  setUndercity(status: UndercityStatus, governance: Governance): void;
  setStation(unlocked: boolean): void;
  setFocus(id: LocationId | null): void;
  sendRover(to: LocationId): void;
  onSelect(cb: (id: LocationId) => void): void;
  dispose(): void;
}

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 球面下降量：局部平面坐标映射到月球球面 */
function drop(x: number, z: number): number {
  const r2 = x * x + z * z;
  return Math.sqrt(Math.max(0, MOON_R * MOON_R - r2)) - MOON_R;
}

/** 局部地形之外的“裙边”：从地形边缘平滑过渡到月球球面 */
function localHeight(x: number, z: number): number {
  const e = Math.max(Math.abs(x), Math.abs(z));
  if (e <= HALF) return heightAt(x, z);
  const base = heightAt(Math.max(-HALF, Math.min(HALF, x)), Math.max(-HALF, Math.min(HALF, z)));
  const t = smoothstep(HALF, SKIRT * 0.85, e);
  const bumps = (Math.sin(x * 0.07) * Math.cos(z * 0.06) + Math.sin(x * 0.023 + z * 0.031)) * 2.2;
  return base * (1 - t) + (-3 + bumps * (1 - t * 0.6)) * t;
}

/** 视觉高度（含球面下降） */
function vh(x: number, z: number): number {
  return localHeight(x, z) + drop(x, z);
}

function vpoint(id: LocationId): THREE.Vector3 {
  const l = LOCATIONS[id];
  return new THREE.Vector3(l.x, vh(l.x, l.z) + l.yOffset, l.z);
}

const LABELS: Record<LocationId, string> = {
  core: '基地核心舱',
  psr: '永久阴影区采样点',
  ridge: '阳照能源脊',
  relay: '通信中继点',
  station: '领航员空间站',
  undercity: '基地核心舱剖切',
};

interface Pose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
}

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
/** 镜头飞行时与月球实体保持的最小径向间隙，避免直线运镜穿过月面。 */
const CAMERA_CLEARANCE = 6;

function slerpUnit(a: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3, axis: THREE.Vector3): THREE.Vector3 {
  const dot = Math.max(-1, Math.min(1, a.dot(b)));
  if (dot > 0.9995) return out.lerpVectors(a, b, t).normalize();
  if (dot < -0.9995) {
    axis.set(1, 0, 0).cross(a);
    if (axis.lengthSq() < 1e-6) axis.set(0, 1, 0).cross(a);
    axis.normalize();
    return out.copy(a).applyAxisAngle(axis, Math.PI * t);
  }
  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;
  return out.copy(a).multiplyScalar(wa).addScaledVector(b, wb).normalize();
}

/**
 * 在月球外侧插值镜头位置：方向沿球面旋转，半径按指数变化。
 * 这样从地月全景下降到月面时不会走一条穿过月球内部的弦线。
 */
function safeFlightPosition(
  from: THREE.Vector3,
  to: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
  fromDir: THREE.Vector3,
  toDir: THREE.Vector3,
  direction: THREE.Vector3,
  axis: THREE.Vector3,
): THREE.Vector3 {
  const minRadius = MOON_R + CAMERA_CLEARANCE;
  const fromRadius = Math.max(minRadius, fromDir.subVectors(from, MOON_C).length());
  const toRadius = Math.max(minRadius, toDir.subVectors(to, MOON_C).length());
  fromDir.multiplyScalar(1 / fromRadius);
  toDir.multiplyScalar(1 / toRadius);
  slerpUnit(fromDir, toDir, t, direction, axis);
  const radius = Math.exp(Math.log(fromRadius) * (1 - t) + Math.log(toRadius) * t);
  return out.copy(MOON_C).addScaledVector(direction, radius);
}

/** 把镜头抬到局部地形之上，防止切换剖切/地点镜头时钻进山脊或月壤。 */
function keepCameraAboveTerrain(position: THREE.Vector3): void {
  if (Math.max(Math.abs(position.x), Math.abs(position.z)) > SKIRT + 24) return;
  const terrainFloor = vh(position.x, position.z) + 10;
  if (position.y < terrainFloor) position.y = terrainFloor;
}

/** 交互缩放也不能把镜头推进月球实体内部。 */
function keepCameraOutsideMoon(position: THREE.Vector3): void {
  const offset = position.clone().sub(MOON_C);
  const distance = offset.length();
  const minRadius = MOON_R + CAMERA_CLEARANCE;
  if (distance < minRadius) {
    if (distance < 1e-4) offset.set(0, 1, 0);
    offset.setLength(minRadius);
    position.copy(MOON_C).add(offset);
  }
}

export function createScene(container: HTMLElement, labelLayer: HTMLElement): SceneApi {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010207);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 80000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 25;
  controls.maxDistance = 360;
  controls.enablePan = false;

  // ---------- 灯光 ----------
  const sun = new THREE.DirectionalLight(0xfff4e0, 4.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -110;
  sc.right = 110;
  sc.top = 110;
  sc.bottom = -110;
  sc.near = 1;
  sc.far = 700;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  // 地球反照与星光的极弱环境光
  scene.add(new THREE.HemisphereLight(0x8aa4ff, 0x1a1410, 0.12));
  scene.add(new THREE.AmbientLight(0x404a66, 0.06));

  // ---------- 星空 ----------
  {
    const rnd = mulberry(7);
    const pos: number[] = [];
    const col: number[] = [];
    for (let i = 0; i < 4200; i++) {
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = 40000;
      pos.push(Math.cos(th) * s * r, u * r, Math.sin(th) * s * r);
      const warm = rnd();
      const b = 0.55 + rnd() * 0.45;
      col.push(b * (warm > 0.8 ? 1 : 0.85), b * 0.92, b * (warm < 0.2 ? 1 : 0.85));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false })));
  }

  // ---------- 地球 ----------
  // 地球采用独立球体 + 云层 + 大气辉光，远景也能读出海陆轮廓。
  const earth = makeEarth(820);
  earth.group.position.copy(EARTH_POS);
  scene.add(earth.group);

  // ---------- 太阳 ----------
  const glowTex = makeGlowTexture();
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1d0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sunGlow.scale.setScalar(5200);
  const sunCore = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfffaf0 }));
  scene.add(sunGlow, sunCore);

  // ---------- 剖切平面 ----------
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), CUT_Z);
  let clipping: THREE.Plane[] = [];

  // ---------- 月球球体 ----------
  const moonTex = makeMoonTexture();
  // 球体和月面工作区共用一张月壤贴图，避免两个区域出现明显不同的纹理语言。
  const moonMat = new THREE.MeshStandardMaterial({ map: moonTex, bumpMap: moonTex, bumpScale: 1.6, roughness: 1, metalness: 0 });
  const moon = new THREE.Mesh(makeMoonGeometry(MOON_R - 2.5), moonMat);
  moon.position.copy(MOON_C);
  // 让纹理赤道经过基地，避免极点纹理拉伸出现在基地附近
  moon.rotation.x = Math.PI / 2;
  scene.add(moon);

  // ---------- 局部地形（非均匀网格：中心高精度，裙边渐疏） ----------
  const terrainMat = new THREE.MeshStandardMaterial({ map: moonTex, bumpMap: moonTex, bumpScale: 0.8, color: 0xffffff, roughness: 0.97, metalness: 0, flatShading: false, side: THREE.DoubleSide });
  const terrain = (() => {
    const axis: number[] = [];
    const inner = 150;
    for (let i = 0; i <= inner; i++) axis.push(-HALF + (WORLD_SIZE * i) / inner);
    const outer: number[] = [];
    const n = 22;
    for (let i = 1; i <= n; i++) outer.push(HALF + (SKIRT - HALF) * Math.pow(i / n, 1.6));
    const xs = [...outer.map((v) => -v).reverse(), ...axis, ...outer];
    const N = xs.length;
    const pos: number[] = [];
    const uv: number[] = [];
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = xs[i];
        const z = xs[j];
        const h = localHeight(x, z);
        pos.push(x, h + drop(x, z), z);
        // 平面 UV 只取月球贴图的中段，避免工作区出现拉伸或接缝。
        uv.push(0.5 + x / (WORLD_SIZE * 3.3), 0.5 + z / (WORLD_SIZE * 3.3));
      }
    const idx: number[] = [];
    for (let j = 0; j < N - 1; j++)
      for (let i = 0; i < N - 1; i++) {
        const a = j * N + i;
        const b = a + 1;
        const c = a + N;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    const m = new THREE.Mesh(flat, terrainMat);
    m.receiveShadow = true;
    m.castShadow = true;
    return m;
  })();
  scene.add(terrain);

  // ---------- 剖切面（地层） ----------
  const section = new THREE.Group();
  {
    const NX = 240;
    const NY = 30;
    const verts: number[] = [];
    const cols: number[] = [];
    const idx: number[] = [];
    const r2 = mulberry(23);
    for (let i = 0; i <= NX; i++) {
      const x = -SKIRT + (2 * SKIRT * i) / NX;
      const top = vh(x, CUT_Z);
      const bottom = drop(x, CUT_Z) - DEPTH;
      for (let j = 0; j <= NY; j++) {
        const t = j / NY;
        const y = top + (bottom - top) * t;
        const d = top - y;
        verts.push(x, y, CUT_Z);
        // 地层：表层月壤 → 巨角砾层 → 基岩
        let c: [number, number, number];
        if (d < 2.2) c = [0.55, 0.52, 0.48];
        else if (d < 9) c = [0.4, 0.37, 0.34];
        else c = [0.27 - Math.min(0.08, d * 0.001), 0.25 - Math.min(0.08, d * 0.001), 0.25 - Math.min(0.07, d * 0.001)];
        const n = (r2() - 0.5) * 0.04;
        cols.push(c[0] + n, c[1] + n, c[2] + n);
      }
    }
    for (let i = 0; i < NX; i++)
      for (let j = 0; j < NY; j++) {
        const a = i * (NY + 1) + j;
        const b = (i + 1) * (NY + 1) + j;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx);
    // 剖切面是示意图，不参与光照，保证地层在任何太阳方位下都清晰可读
    section.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    for (const depth of [2.2, 9]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= NX; i++) {
        const x = -SKIRT + (2 * SKIRT * i) / NX;
        pts.push(new THREE.Vector3(x, vh(x, CUT_Z) - depth, CUT_Z + 0.05));
      }
      section.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x9a8a72, transparent: true, opacity: 0.5 })));
    }
  }
  section.visible = false;
  scene.add(section);

  // ---------- 通用材质 ----------
  const metal = new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.45, metalness: 0.6 });
  const whiteShell = new THREE.MeshStandardMaterial({ color: 0xeeeae2, roughness: 0.7, metalness: 0.1 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.35, metalness: 0.9 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x1c2f5e, roughness: 0.25, metalness: 0.7, emissive: 0x0a1430, emissiveIntensity: 0.4, side: THREE.DoubleSide });
  const windowMat = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffb050, emissiveIntensity: 2 });

  function shadow<T extends THREE.Object3D>(o: T): T {
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    return o;
  }

  // ---------- 基地核心舱 ----------
  const coreP = vpoint('core');
  {
    const base = new THREE.Group();
    const hab = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 6, 12), whiteShell);
    hab.rotation.z = Math.PI / 2;
    hab.position.set(0, 2.2, 0);
    const hab2 = hab.clone();
    hab2.rotation.set(0, Math.PI / 2, Math.PI / 2);
    hab2.position.set(-3.5, 2.2, -2.5);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), whiteShell);
    dome.position.set(4.5, 0.3, 1.5);
    const lab = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 3), metal);
    lab.position.set(-3, 1.1, 3);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 2.5), windowMat);
    win.position.set(3.05, 2.4, 0);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.6, 10), gold);
    shaft.position.set(1, 0.6, 3.5);
    // 着陆器
    const lander = new THREE.Group();
    const lbody = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 2.4, 8), gold);
    lbody.position.y = 2.4;
    const ltop = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.6, 8), whiteShell);
    ltop.position.y = 4.4;
    lander.add(lbody, ltop);
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 4), metal);
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      leg.position.set(Math.cos(a) * 1.6, 1, Math.sin(a) * 1.6);
      leg.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
      lander.add(leg);
    }
    lander.position.set(-9, 0, 7);
    base.add(hab, hab2, dome, lab, win, shaft, lander);
    const lamp = new THREE.PointLight(0xffc27a, 30, 22, 2);
    lamp.position.set(0, 5, 3);
    base.add(lamp);
    base.position.set(coreP.x, coreP.y - 0.2, coreP.z - 4);
    scene.add(shadow(base));
  }

  // ---------- 阳照能源脊：竖立式光伏 ----------
  const ridgeP = vpoint('ridge');
  const panels: THREE.Group[] = [];
  for (const [dx, dz] of [
    [0, 0],
    [5, 3],
    [-5, -3],
    [3, -6],
    [-3, 6],
    [8, -2],
  ]) {
    const g = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 6), metal);
    mast.position.y = 2.5;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3, 4.5), panelMat);
    p.position.y = 4.5;
    g.add(mast, p);
    const x = ridgeP.x + dx;
    const z = ridgeP.z + dz;
    g.position.set(x, vh(x, z), z);
    panels.push(g);
    scene.add(shadow(g));
  }

  // ---------- 通信中继塔 ----------
  let beacon: THREE.Mesh;
  let dish: THREE.Mesh;
  {
    const p = vpoint('relay');
    const g = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 9, 6), metal);
    mast.position.y = 4.5;
    const dishMat = whiteShell.clone();
    dishMat.side = THREE.DoubleSide;
    dish = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), dishMat);
    dish.position.y = 9;
    dish.rotation.x = Math.PI * 0.62;
    beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4040 }));
    beacon.position.y = 9.6;
    g.add(mast, dish, beacon);
    g.position.copy(p);
    scene.add(shadow(g));
  }

  // ---------- 永久阴影区采样点 ----------
  {
    const p = vpoint('psr');
    const g = new THREE.Group();
    const rig = new THREE.Mesh(new THREE.ConeGeometry(1.4, 5, 4, 1, true), metal);
    rig.position.y = 2.5;
    const lamp = new THREE.SpotLight(0x9fd0ff, 120, 30, Math.PI / 5, 0.6, 1.5);
    lamp.position.set(0, 6, 0);
    lamp.target.position.set(0, 0, 0);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9fd0ff }));
    glow.position.y = 5.2;
    g.add(rig, lamp, lamp.target, glow);
    g.position.copy(p);
    scene.add(shadow(g));
  }

  // ---------- 路线 ----------
  const routes = new Map<LocationId, THREE.Line>();
  const routePts = new Map<LocationId, THREE.Vector3[]>();
  for (const to of ['psr', 'ridge', 'relay'] as LocationId[]) {
    const r = routeBetween('core', to);
    const pts = r.points.map((p) => new THREE.Vector3(p.x, p.y + drop(p.x, p.z), p.z));
    routePts.set(to, pts);
    const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => p.clone().setY(p.y + 0.35)));
    const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0x7fd8ff, dashSize: 1.6, gapSize: 1.1, transparent: true, opacity: 0.55 }));
    line.computeLineDistances();
    routes.set(to, line);
    scene.add(line);
  }

  // ---------- 焦点光环 ----------
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.2, 5, 48),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  // ---------- 勘测车 ----------
  const rover = new THREE.Group();
  {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.4), whiteShell);
    body.position.y = 0.9;
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 0.2), metal);
    mast.position.set(0.6, 1.7, 0);
    rover.add(body, mast);
    for (const [x, z] of [
      [-0.8, 0.8],
      [0.8, 0.8],
      [-0.8, -0.8],
      [0.8, -0.8],
    ]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 10), metal);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.45, z);
      rover.add(w);
    }
    const light = new THREE.PointLight(0xbfe6ff, 12, 10, 2);
    light.position.set(1.4, 1.2, 0);
    rover.add(light);
  }
  rover.position.set(coreP.x + 5, vh(coreP.x + 5, coreP.z + 2), coreP.z + 2);
  scene.add(shadow(rover));
  let roverPath: THREE.Vector3[] | null = null;
  let roverT = 0;

  // ---------- 月面基地核心舱剖切（示意） ----------
  const under = new THREE.Group();
  const underLight = new THREE.PointLight(0xffb066, 0, 40, 1.6);
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x6fb7ff, wireframe: true, transparent: true, opacity: 0.35 });
  const buildMat = new THREE.MeshStandardMaterial({ color: 0xd9a050, roughness: 0.6, transparent: true, opacity: 0.75 });
  const underMat = new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.6, metalness: 0.2 });
  const underModules: THREE.Mesh[] = [];
  {
    const y0 = coreP.y - 12;
    const zc = CUT_Z + 2.2;
    const layout = [
      { x: coreP.x, y: y0, len: 12, r: 2.6 },
      { x: coreP.x - 15, y: y0 - 3, len: 10, r: 2.2 },
      { x: coreP.x + 15, y: y0 - 2, len: 10, r: 2.2 },
      { x: coreP.x - 4, y: y0 - 9, len: 14, r: 2.4 },
    ];
    for (const l of layout) {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(l.r, l.len, 6, 14), ghostMat);
      m.rotation.z = Math.PI / 2;
      m.position.set(l.x, l.y, zc);
      underModules.push(m);
      under.add(m);
    }
    const tunnel = (a: THREE.Vector3, b: THREE.Vector3) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, a.distanceTo(b), 8), ghostMat);
      t.position.copy(a).add(b).multiplyScalar(0.5);
      t.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
      underModules.push(t);
      under.add(t);
    };
    tunnel(new THREE.Vector3(coreP.x + 1, coreP.y, zc), new THREE.Vector3(coreP.x + 1, y0, zc));
    tunnel(new THREE.Vector3(layout[0].x, y0, zc), new THREE.Vector3(layout[1].x, layout[1].y, zc));
    tunnel(new THREE.Vector3(layout[0].x, y0, zc), new THREE.Vector3(layout[2].x, layout[2].y, zc));
    tunnel(new THREE.Vector3(layout[0].x - 2, y0, zc), new THREE.Vector3(layout[3].x, layout[3].y, zc));
    underLight.position.set(coreP.x, y0 + 1, zc + 6);
    under.add(underLight);
  }
  under.visible = false;
  scene.add(under);

  // ---------- 领航员空间站（地球近地轨道） ----------
  const station = new THREE.Group();
  const stationShell = whiteShell.clone();
  const stationLights: THREE.Mesh[] = [];
  const stationGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9fdcff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));

  const beamBetween = (a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) => {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 8), material);
    beam.position.copy(a).add(b).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    return beam;
  };

  {
    // 采用“中心舱 + 环形桁架 + 辐条 + 大型太阳翼”的整体轮廓，
    // 让空间站在月球全景中仍然有清晰、可识别的剪影。
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3b4654, roughness: 0.38, metalness: 0.82 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xb78c4d, roughness: 0.32, metalness: 0.9 });
    const windowMatStation = windowMat.clone();
    windowMatStation.emissiveIntensity = 3.2;

    const core = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 28, 16), stationShell);
    core.rotation.z = Math.PI / 2;
    const node = new THREE.Mesh(new THREE.SphereGeometry(5.8, 20, 14), stationShell);
    const collarA = new THREE.Mesh(new THREE.TorusGeometry(7.2, 1.15, 10, 32), trimMat);
    const collarB = collarA.clone();
    collarA.rotation.y = collarB.rotation.y = Math.PI / 2;
    collarA.position.x = -8;
    collarB.position.x = 8;

    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(22, 0.9, 10, 80), trimMat);
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(30, 2.1, 12, 96), frameMat);
    innerRing.rotation.y = outerRing.rotation.y = Math.PI / 2;

    const spokes: THREE.Mesh[] = [];
    const ringModules: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radial = new THREE.Vector3(0, Math.cos(angle), Math.sin(angle));
      const spoke = beamBetween(radial.clone().multiplyScalar(6), radial.clone().multiplyScalar(29), 0.72, frameMat);
      spokes.push(spoke);

      const module = new THREE.Mesh(new THREE.BoxGeometry(9, 4.6, 3.4), stationShell);
      module.position.copy(radial).multiplyScalar(30);
      const tangent = new THREE.Vector3(0, -Math.sin(angle), Math.cos(angle));
      module.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), tangent);
      ringModules.push(module);

      const window = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.5, 2.6), windowMatStation);
      window.position.copy(module.position).addScaledVector(radial, 1.75);
      window.quaternion.copy(module.quaternion);
      station.add(window);
    }

    for (const x of [-22, 22]) {
      const mast = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.1, 16), frameMat);
      mast.position.x = x * 0.68;
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 18, 44), panelMat);
      wing.position.x = x;
      station.add(mast, wing);
    }

    const dockingA = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 5, 12), trimMat);
    const dockingB = dockingA.clone();
    dockingA.rotation.z = dockingB.rotation.z = Math.PI / 2;
    dockingA.position.x = -17;
    dockingB.position.x = 17;

    for (const p of [
      new THREE.Vector3(-8, 0, 0),
      new THREE.Vector3(8, 0, 0),
      new THREE.Vector3(0, 0, 30),
      new THREE.Vector3(0, 0, -30),
    ]) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 8), windowMatStation);
      light.position.copy(p);
      stationLights.push(light);
      station.add(light);
    }

    stationGlow.scale.setScalar(52);
    station.add(core, node, collarA, collarB, innerRing, outerRing, ...spokes, ...ringModules, dockingA, dockingB, stationGlow);
  }
  // 地球轨道远景中保持比地球小一档，避免空间站喧宾夺主。
  station.scale.setScalar(7);
  shadow(station);
  scene.add(station);
  const orbitAt = (a: number) =>
    EARTH_POS.clone()
      .addScaledVector(UP, Math.cos(a) * STATION_ORBIT_R)
      .addScaledVector(ORBIT_K, Math.sin(a) * STATION_ORBIT_R);
  const orbitMat = new THREE.LineDashedMaterial({ color: 0x8fb4ff, dashSize: 60, gapSize: 50, transparent: true, opacity: 0.35, depthWrite: false });
  const orbitLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 256 }, (_, i) => orbitAt((i / 256) * Math.PI * 2))), orbitMat);
  orbitLine.computeLineDistances();
  scene.add(orbitLine);
  let stationUnlocked = false;

  // 全景中标记基地位置的光点
  const baseBeacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  baseBeacon.position.copy(coreP).add(new THREE.Vector3(0, 6, 0));
  baseBeacon.scale.setScalar(160);
  scene.add(baseBeacon);

  // ---------- 标签 ----------
  const labelEls = new Map<LocationId, HTMLButtonElement>();
  let selectCb: (id: LocationId) => void = () => {};
  for (const id of Object.keys(LABELS) as LocationId[]) {
    const el = document.createElement('button');
    el.className = `map-label map-label--${id}`;
    el.type = 'button';
    el.textContent = LABELS[id];
    el.addEventListener('click', () => selectCb(id));
    labelLayer.appendChild(el);
    labelEls.set(id, el);
  }
  let focus: LocationId | null = null;

  function labelAnchor(id: LocationId): THREE.Vector3 {
    if (id === 'station') return station.position.clone().add(new THREE.Vector3(0, 44, 0));
    if (id === 'undercity') return new THREE.Vector3(coreP.x, coreP.y - 12, CUT_Z + 2.2);
    const p = vpoint(id);
    return p.add(new THREE.Vector3(0, id === 'relay' ? 12 : 8, 0));
  }

  // ---------- 镜头 ----------
  function pose(name: Shot): Pose {
    switch (name) {
      case 'earthmoon':
        return {
          pos: MOON_C.clone().addScaledVector(VIEW_H, 9800).addScaledVector(UP, 2600),
          target: MOON_C.clone().lerp(EARTH_POS, 0.42),
          up: DOWN.clone(),
        };
      case 'globe':
        return { pos: MOON_C.clone().addScaledVector(VIEW_H, 4300).addScaledVector(UP, 2100), target: MOON_C.clone().addScaledVector(UP, 250), up: DOWN.clone() };
      case 'station':
        return {
          pos: EARTH_POS.clone().addScaledVector(VIEW_H, 2600).addScaledVector(UP, 1800),
          target: EARTH_POS.clone().addScaledVector(UP, 160),
          up: DOWN.clone(),
        };
      case 'cutaway':
        // 镜头保持在月面上方并拉开距离，让剖切层和核心舱同时进入画面。
        return { pos: new THREE.Vector3(coreP.x + 28, coreP.y + 42, CUT_Z + 112), target: new THREE.Vector3(coreP.x, coreP.y - 8, CUT_Z), up: UP.clone() };
      case 'overview':
      case 'descent':
        return { pos: new THREE.Vector3(64, 24, 124), target: coreP.clone().addScaledVector(UP, 5), up: UP.clone() };
      default: {
        const id = name.slice(4) as LocationId;
        const p = vpoint(id);
        if (id === 'psr') return { pos: p.clone().add(new THREE.Vector3(26, 26, 34)), target: p, up: UP.clone() };
        return { pos: p.clone().add(new THREE.Vector3(24, 15, 32)), target: p, up: UP.clone() };
      }
    }
  }

  let view: ViewMode = 'overview';
  interface Tween {
    fromPos: THREE.Vector3;
    fromQ: THREE.Quaternion;
    to: Pose;
    toQ: THREE.Quaternion;
    t: number;
    dur: number;
    done: () => void;
  }
  let tween: Tween | null = null;
  let interactive = false;

  function applyClip(cut: boolean) {
    clipping = cut ? [clipPlane] : [];
    terrainMat.clippingPlanes = clipping;
    moonMat.clippingPlanes = clipping;
    // 剖切视角展示的是剖面示意；隐藏完整地表，避免前景月壤遮住地下模块。
    terrain.visible = !cut;
    section.visible = cut;
    under.visible = cut;
    for (const r of routes.values()) (r.material as THREE.Material).clippingPlanes = clipping;
  }

  function shot(name: Shot, seconds?: number): Promise<void> {
    const to = pose(name);
    const isGlobe = name === 'earthmoon' || name === 'globe' || name === 'station';
    view = isGlobe ? 'globe' : name === 'cutaway' ? 'cutaway' : 'overview';
    applyClip(view === 'cutaway');
    const m = new THREE.Matrix4().lookAt(to.pos, to.target, to.up);
    const toQ = new THREE.Quaternion().setFromRotationMatrix(m);
    const far = camera.position.distanceTo(to.pos);
    const dur = seconds ?? Math.min(4.5, 1.2 + Math.log10(1 + far) * 0.7);
    tween?.done();
    interactive = false;
    controls.enabled = false;
    return new Promise((resolve) => {
      tween = { fromPos: camera.position.clone(), fromQ: camera.quaternion.clone(), to, toQ, t: 0, dur, done: resolve };
    });
  }

  function finishTween(tw: Tween) {
    camera.position.copy(tw.to.pos);
    keepCameraOutsideMoon(camera.position);
    if (view !== 'globe') keepCameraAboveTerrain(camera.position);
    camera.quaternion.copy(tw.toQ);
    camera.up.copy(tw.to.up);
    if (tw.to.up.y > 0.5) {
      controls.target.copy(tw.to.target);
      controls.enabled = true;
      interactive = true;
      controls.update();
    }
    tween = null;
    tw.done();
  }

  // 初始镜头：地月全景
  {
    const p = pose('earthmoon');
    camera.position.copy(p.pos);
    camera.up.copy(p.up);
    camera.lookAt(p.target);
    view = 'globe';
  }
  // OrbitControls 在构造时记录了 camera.up；交互模式下始终使用 +y 为上
  controls.target.copy(pose('overview').target);

  // ---------- 时间与太阳 ----------
  let currentDay = 0;
  let displayDay = 0;
  const sunDir = new THREE.Vector3();
  function applySun(day: number) {
    const az = sunAzimuth(day);
    sunDir.set(Math.cos(az) * Math.cos(VISUAL_SUN_ELEVATION), Math.sin(VISUAL_SUN_ELEVATION), Math.sin(az) * Math.cos(VISUAL_SUN_ELEVATION));
    sun.position.copy(sunDir).multiplyScalar(400);
    sun.target.position.set(0, 0, 0);
    sunCore.position.copy(sunDir).multiplyScalar(60000);
    sunGlow.position.copy(sunCore.position);
    earth.setSun(sunDir);
    for (const p of panels) p.rotation.y = -az + Math.PI / 2;
  }
  applySun(0);

  // ---------- 拾取 ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  renderer.domElement.addEventListener('dblclick', (e) => {
    if (view === 'globe') return;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(terrain)[0];
    if (!hit) return;
    let best: LocationId = 'core';
    let bd = Infinity;
    for (const id of ['core', 'psr', 'ridge', 'relay'] as LocationId[]) {
      const l = LOCATIONS[id];
      const d = Math.hypot(l.x - hit.point.x, l.z - hit.point.z);
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
    if (bd < 25) selectCb(best);
  });

  // ---------- 尺寸 ----------
  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 竖屏时加大视场，保证画面主体不被裁掉
    camera.fov = w < h ? 64 : 48;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ---------- 渲染循环 ----------
  const clock = new THREE.Clock();
  let raf = 0;
  const tmp = new THREE.Vector3();
  const flightFromDir = new THREE.Vector3();
  const flightToDir = new THREE.Vector3();
  const flightDirection = new THREE.Vector3();
  const flightAxis = new THREE.Vector3();
  const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  function tick() {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;

    if (Math.abs(displayDay - currentDay) > 0.01) {
      displayDay += (currentDay - displayDay) * Math.min(1, dt * 1.2);
      applySun(displayDay);
    }

    if (tween) {
      const tw = tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const k = ease(tw.t);
      safeFlightPosition(tw.fromPos, tw.to.pos, k, tmp, flightFromDir, flightToDir, flightDirection, flightAxis);
      keepCameraOutsideMoon(tmp);
      if (view !== 'globe') keepCameraAboveTerrain(tmp);
      camera.position.copy(tmp);
      camera.quaternion.slerpQuaternions(tw.fromQ, tw.toQ, ease(Math.min(1, tw.t * 1.15)));
      if (tw.t >= 1) finishTween(tw);
    } else if (interactive) {
      controls.update();
      keepCameraOutsideMoon(camera.position);
      if (view !== 'globe') keepCameraAboveTerrain(camera.position);
    }

    // 近裁剪面保持较小，避免远景运镜下降时把月面和基地整体裁掉。
    const dist = camera.position.distanceTo(view === 'globe' ? MOON_C : controls.target);
    camera.near = Math.max(0.2, Math.min(12, dist * 0.0015));
    camera.updateProjectionMatrix();

    earth.update(t);
    // 月面全景中的月球保持极慢自转，帮助玩家感知“球体”而非一张平面贴图。
    moon.rotation.y = Math.PI / 2 + t * 0.004;

    // 空间站轨道
    const a = t * 0.035;
    station.position.copy(orbitAt(a));
    station.lookAt(MOON_C);
    station.rotateZ(t * 0.03);
    stationShell.emissive.setHex(stationUnlocked ? 0x223344 : 0x000000);
    for (const [i, light] of stationLights.entries()) {
      const pulse = 0.8 + 0.2 * (0.5 + 0.5 * Math.sin(t * 2.4 + i * 1.7));
      light.scale.setScalar(pulse);
    }
    orbitMat.opacity = view === 'globe' ? (stationUnlocked ? 0.6 : 0.3) : 0.15;

    // 基地光点仅在远景显示
    const camAlt = camera.position.distanceTo(MOON_C) - MOON_R;
    baseBeacon.visible = camAlt > 600;
    (baseBeacon.material as THREE.SpriteMaterial).opacity = 0.6 + Math.sin(t * 3) * 0.3;

    // 中继塔信标闪烁
    (beacon.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(t * 4) > 0 ? 0xff4040 : 0x401010);

    // 焦点光环
    if (focus && focus !== 'station' && focus !== 'undercity' && view !== 'globe') {
      const p = vpoint(focus);
      ring.visible = true;
      ring.position.set(p.x, p.y + 0.6, p.z);
      const s = 1 + ((t * 0.8) % 1) * 0.8;
      ring.scale.setScalar(s);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - ((t * 0.8) % 1));
    } else ring.visible = false;

    // 勘测车
    if (roverPath) {
      roverT = Math.min(1, roverT + dt * 0.16);
      const f = roverT * (roverPath.length - 1);
      const i = Math.floor(f);
      const p0 = roverPath[i];
      const p1 = roverPath[Math.min(i + 1, roverPath.length - 1)];
      tmp.copy(p0).lerp(p1, f - i);
      rover.position.copy(tmp);
      rover.lookAt(p1.x, rover.position.y, p1.z);
      rover.rotateY(-Math.PI / 2);
      if (roverT >= 1) roverPath = null;
    }

    for (const [id, r] of routes) {
      const m = r.material as THREE.LineDashedMaterial;
      m.opacity = id === focus ? 0.95 : 0.4;
      m.color.setHex(id === focus ? 0xffd27a : 0x7fd8ff);
    }

    renderer.render(scene, camera);

    // 标签投影
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    for (const [id, el] of labelEls) {
      let hidden = (id === 'undercity' && view !== 'cutaway') || (id === 'station' && view === 'cutaway');
      if (view === 'globe' && id !== 'station' && id !== 'core') hidden = true;
      if (camAlt < 600 && id === 'station' && camera.position.distanceTo(station.position) > 900) hidden = true;
      const p = labelAnchor(id).project(camera);
      const visible = !hidden && !tween && p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
      el.style.display = visible ? '' : 'none';
      if (visible) el.style.transform = `translate(-50%, -100%) translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px)`;
      el.textContent = id === 'core' && view === 'globe' ? '联合基地 · 月球南极' : el.dataset.text || LABELS[id];
      el.classList.toggle('is-focus', id === focus);
      el.classList.toggle('is-locked', id === 'station' && !stationUnlocked);
    }
  }
  tick();

  return {
    setDay(day) {
      currentDay = day;
    },
    setView(mode) {
      return shot(mode === 'globe' ? 'station' : mode);
    },
    shot,
    setUndercity(status, governance) {
      const mat = status === 'online' ? underMat : status === 'building' ? buildMat : ghostMat;
      for (const m of underModules) m.material = mat;
      underLight.intensity = status === 'online' ? 260 : status === 'building' ? 60 : 0;
      underLight.color.setHex(governance === 'luna' ? 0x7fc8ff : 0xffb066);
      labelEls.get('undercity')!.dataset.text = '基地核心舱剖切 · 月面设施';
    },
    setStation(unlocked) {
      stationUnlocked = unlocked;
    },
    setFocus(id) {
      focus = id;
    },
    sendRover(to) {
      const pts = routePts.get(to);
      if (!pts) return;
      roverPath = pts;
      roverT = 0;
    },
    onSelect(cb) {
      selectCb = cb;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
    },
  };
}
