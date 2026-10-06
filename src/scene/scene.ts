import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { heightAt, LOCATIONS, routeBetween, sunAzimuth, surfacePoint, WORLD_SIZE, type LocationId } from '../world/terrain';
import type { Governance, UndercityStatus } from '../engine/types';

/** 剖切平面：沿 z = CUT_Z 切开地形，正好穿过基地核心舱与地下城 */
const CUT_Z = LOCATIONS.core.z;
const DEPTH = 34;
/** 视觉光源高度角（真实约 1.5°，为便于观察略抬高） */
const VISUAL_SUN_ELEVATION = (4 * Math.PI) / 180;

export type ViewMode = 'overview' | 'cutaway' | 'orbit';

export interface SceneApi {
  setDay(day: number): void;
  setView(mode: ViewMode): void;
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

const LABELS: Record<LocationId, string> = {
  core: '基地核心舱',
  psr: '永久阴影区采样点',
  ridge: '阳照能源脊',
  relay: '通信中继点',
  station: '领航员空间站',
  undercity: '地下城核心舱',
};

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
  scene.background = new THREE.Color(0x02030a);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 2000);
  camera.position.set(70, 75, 120);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 30;
  controls.maxDistance = 320;
  controls.target.set(0, 0, 5);

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
  sc.far = 600;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  // 地球反照与星光的极弱环境光
  scene.add(new THREE.HemisphereLight(0x8aa4ff, 0x1a1410, 0.1));
  const fill = new THREE.AmbientLight(0x404a66, 0.05);
  scene.add(fill);

  // ---------- 星空 ----------
  {
    const rnd = mulberry(7);
    const pos: number[] = [];
    for (let i = 0; i < 2600; i++) {
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const r = 900;
      const s = Math.sqrt(1 - u * u);
      const y = Math.abs(u) * r - 40;
      pos.push(Math.cos(th) * s * r, y, Math.sin(th) * s * r);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.8 })));
  }

  // 地球：贴近地平线
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(26, 32, 24),
    new THREE.MeshStandardMaterial({ color: 0x3b6fd8, emissive: 0x1d3c88, emissiveIntensity: 0.55, roughness: 0.6 }),
  );
  earth.position.set(-420, 30, -620);
  scene.add(earth);

  // 太阳圆盘
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff6dd }));
  scene.add(sunDisc);

  // ---------- 剖切平面 ----------
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), CUT_Z);
  let clipping: THREE.Plane[] = [];

  // ---------- 地形 ----------
  const SEG = 150;
  const terrainGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEG, SEG);
  terrainGeo.rotateX(-Math.PI / 2);
  const tpos = terrainGeo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const rnd = mulberry(11);
  for (let i = 0; i < tpos.count; i++) {
    const x = tpos.getX(i);
    const z = tpos.getZ(i);
    const h = heightAt(x, z);
    tpos.setY(i, h);
    const base = 0.42 + (h + 20) * 0.006 + (rnd() - 0.5) * 0.05;
    colors.push(base * 0.98, base * 0.96, base * 0.93);
  }
  terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const terrainFlat = terrainGeo.toNonIndexed();
  terrainFlat.computeVertexNormals();
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0, flatShading: true, side: THREE.DoubleSide });
  const terrain = new THREE.Mesh(terrainFlat, terrainMat);
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  scene.add(terrain);

  // ---------- 剖切面（地层） ----------
  const section = new THREE.Group();
  {
    const NX = 160;
    const NY = 24;
    const verts: number[] = [];
    const cols: number[] = [];
    const idx: number[] = [];
    const r2 = mulberry(23);
    for (let i = 0; i <= NX; i++) {
      const x = -WORLD_SIZE / 2 + (WORLD_SIZE * i) / NX;
      const top = heightAt(x, CUT_Z);
      for (let j = 0; j <= NY; j++) {
        const t = j / NY;
        const y = top + (-DEPTH - top) * t;
        const d = top - y;
        verts.push(x, y, CUT_Z);
        // 地层：表层月壤 → 巨角砾层 → 基岩
        let c: [number, number, number];
        if (d < 2.2) c = [0.55, 0.52, 0.48];
        else if (d < 9) c = [0.4, 0.37, 0.34];
        else c = [0.27, 0.25, 0.25];
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
    g.computeVertexNormals();
    // 剖切面是示意图，不参与光照，保证地层在任何太阳方位下都清晰可读
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    section.add(new THREE.Mesh(g, m));
    // 地层分界线
    for (const depth of [2.2, 9]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= NX; i++) {
        const x = -WORLD_SIZE / 2 + (WORLD_SIZE * i) / NX;
        pts.push(new THREE.Vector3(x, heightAt(x, CUT_Z) - depth, CUT_Z + 0.05));
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
  const coreP = surfacePoint('core');
  const base = new THREE.Group();
  {
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
    base.add(hab, hab2, dome, lab, win, shaft);
    const lamp = new THREE.PointLight(0xffc27a, 30, 22, 2);
    lamp.position.set(0, 5, 3);
    base.add(lamp);
    base.position.set(coreP.x, coreP.y - 0.2, coreP.z - 4);
    scene.add(shadow(base));
  }

  // ---------- 阳照能源脊：竖立式光伏 ----------
  const ridgeP = surfacePoint('ridge');
  const panels: THREE.Group[] = [];
  {
    const offsets = [
      [0, 0],
      [5, 3],
      [-5, -3],
      [3, -6],
      [-3, 6],
      [8, -2],
    ];
    for (const [dx, dz] of offsets) {
      const g = new THREE.Group();
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 6), metal);
      mast.position.y = 2.5;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(3, 4.5), panelMat);
      p.position.y = 4.5;
      g.add(mast, p);
      const x = ridgeP.x + dx;
      const z = ridgeP.z + dz;
      g.position.set(x, heightAt(x, z), z);
      panels.push(g);
      scene.add(shadow(g));
    }
  }

  // ---------- 通信中继塔 ----------
  {
    const p = surfacePoint('relay');
    const g = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 9, 6), metal);
    mast.position.y = 4.5;
    const dish = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), whiteShell);
    dish.material = whiteShell.clone();
    (dish.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    dish.position.y = 9;
    dish.rotation.x = Math.PI * 0.62;
    dish.rotation.z = -0.6;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4040 }));
    beacon.position.y = 9.6;
    g.add(mast, dish, beacon);
    g.position.set(p.x, p.y, p.z);
    scene.add(shadow(g));
  }

  // ---------- 永久阴影区采样点 ----------
  {
    const p = surfacePoint('psr');
    const g = new THREE.Group();
    const rig = new THREE.Mesh(new THREE.ConeGeometry(1.4, 5, 4, 1, true), metal);
    rig.position.y = 2.5;
    const lamp = new THREE.SpotLight(0x9fd0ff, 120, 30, Math.PI / 5, 0.6, 1.5);
    lamp.position.set(0, 6, 0);
    lamp.target.position.set(0, 0, 0);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9fd0ff }));
    glow.position.y = 5.2;
    g.add(rig, lamp, lamp.target, glow);
    g.position.set(p.x, p.y, p.z);
    scene.add(shadow(g));
  }

  // ---------- 路线 ----------
  const routes = new Map<LocationId, THREE.Line>();
  for (const to of ['psr', 'ridge', 'relay'] as LocationId[]) {
    const r = routeBetween('core', to);
    const pts = r.points.map((p) => new THREE.Vector3(p.x, p.y + 0.35, p.z));
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineDashedMaterial({ color: 0x7fd8ff, dashSize: 1.6, gapSize: 1.1, transparent: true, opacity: 0.55 });
    const line = new THREE.Line(g, m);
    line.computeLineDistances();
    routes.set(to, line);
    scene.add(line);
  }

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
  rover.position.set(coreP.x + 5, coreP.y, coreP.z + 2);
  scene.add(shadow(rover));
  let roverPath: THREE.Vector3[] | null = null;
  let roverT = 0;

  // ---------- 地下城 ----------
  const under = new THREE.Group();
  const underLight = new THREE.PointLight(0xffb066, 0, 40, 1.6);
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x6fb7ff, wireframe: true, transparent: true, opacity: 0.35 });
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
      const len = a.distanceTo(b);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, len, 8), ghostMat);
      t.position.copy(a).add(b).multiplyScalar(0.5);
      t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
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

  // ---------- 领航员空间站 ----------
  const station = new THREE.Group();
  {
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 9, 10), whiteShell);
    core.rotation.z = Math.PI / 2;
    const node = new THREE.Mesh(new THREE.SphereGeometry(1.9, 12, 10), metal);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 18), metal);
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(4, 7), panelMat);
    p1.position.set(0, 0, 8);
    p1.rotation.x = Math.PI / 2;
    const p2 = p1.clone();
    p2.position.z = -8;
    station.add(core, node, arm, p1, p2);
  }
  station.scale.setScalar(1.3);
  scene.add(station);
  const orbitLine = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, i) => {
      const a = (i / 96) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * 75, 62 + Math.sin(a * 2) * 4, Math.sin(a) * 45);
    })),
    new THREE.LineDashedMaterial({ color: 0x8899bb, dashSize: 2, gapSize: 2, transparent: true, opacity: 0.35 }),
  );
  orbitLine.computeLineDistances();
  scene.add(orbitLine);
  let stationUnlocked = false;

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
    if (id === 'station') return station.position.clone().add(new THREE.Vector3(0, 4, 0));
    if (id === 'undercity') return new THREE.Vector3(coreP.x, coreP.y - 12, CUT_Z + 2.2);
    const p = surfacePoint(id);
    return new THREE.Vector3(p.x, p.y + (id === 'relay' ? 12 : 8), p.z);
  }

  // ---------- 视图 ----------
  let view: ViewMode = 'overview';
  const camGoal = { pos: camera.position.clone(), target: controls.target.clone(), active: false };
  function setView(mode: ViewMode) {
    view = mode;
    const cut = mode === 'cutaway';
    clipping = cut ? [clipPlane] : [];
    terrainMat.clippingPlanes = clipping;
    section.visible = cut;
    under.visible = cut;
    for (const r of routes.values()) (r.material as THREE.Material).clippingPlanes = clipping;
    if (mode === 'overview') {
      camGoal.pos.set(70, 75, 120);
      camGoal.target.set(0, 0, 5);
    } else if (mode === 'cutaway') {
      camGoal.pos.set(coreP.x + 18, coreP.y + 14, CUT_Z + 78);
      camGoal.target.set(coreP.x, coreP.y - 10, CUT_Z);
    } else {
      camGoal.pos.set(150, 120, 170);
      camGoal.target.set(0, 30, 0);
    }
    camGoal.active = true;
  }

  // ---------- 时间与太阳 ----------
  let currentDay = 0;
  let displayDay = 0;
  function applySun(day: number) {
    const az = sunAzimuth(day);
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(VISUAL_SUN_ELEVATION), Math.sin(VISUAL_SUN_ELEVATION), Math.sin(az) * Math.cos(VISUAL_SUN_ELEVATION));
    sun.position.copy(dir.clone().multiplyScalar(300));
    sun.target.position.set(0, 0, 0);
    sunDisc.position.copy(dir.clone().multiplyScalar(800));
    for (const p of panels) p.rotation.y = -az + Math.PI / 2;
  }
  applySun(0);

  // ---------- 拾取 ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  renderer.domElement.addEventListener('dblclick', (e) => {
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
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ---------- 渲染循环 ----------
  const clock = new THREE.Clock();
  let raf = 0;
  const tmp = new THREE.Vector3();
  function tick() {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;

    if (Math.abs(displayDay - currentDay) > 0.01) {
      displayDay += (currentDay - displayDay) * Math.min(1, dt * 1.6);
      applySun(displayDay);
    }

    if (camGoal.active) {
      camera.position.lerp(camGoal.pos, Math.min(1, dt * 2.2));
      controls.target.lerp(camGoal.target, Math.min(1, dt * 2.2));
      if (camera.position.distanceTo(camGoal.pos) < 0.5) camGoal.active = false;
    }
    controls.update();

    // 空间站轨道
    const a = t * 0.08;
    station.position.set(Math.cos(a) * 75, 62 + Math.sin(a * 2) * 4, Math.sin(a) * 45);
    station.rotation.y = -a;
    const sm = station.children[0] as THREE.Mesh;
    (sm.material as THREE.MeshStandardMaterial).emissive.setHex(stationUnlocked ? 0x223344 : 0x000000);

    // 勘测车
    if (roverPath) {
      roverT = Math.min(1, roverT + dt * 0.18);
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

    // 路线流动
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
      const hidden = (id === 'undercity' && view !== 'cutaway') || (id === 'station' && view === 'cutaway');
      const p = labelAnchor(id).project(camera);
      const visible = !hidden && p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
      el.style.display = visible ? '' : 'none';
      if (visible) el.style.transform = `translate(-50%, -100%) translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px)`;
      el.classList.toggle('is-focus', id === focus);
      el.classList.toggle('is-locked', id === 'station' && !stationUnlocked);
    }
  }
  tick();

  return {
    setDay(day) {
      currentDay = day;
    },
    setView,
    setUndercity(status, governance) {
      const mat =
        status === 'online'
          ? underMat
          : status === 'building'
            ? new THREE.MeshStandardMaterial({ color: 0xd9a050, roughness: 0.6, transparent: true, opacity: 0.75 })
            : ghostMat;
      for (const m of underModules) m.material = mat;
      underLight.intensity = status === 'online' ? 260 : status === 'building' ? 60 : 0;
      underLight.color.setHex(governance === 'luna' ? 0x7fc8ff : 0xffb066);
      const el = labelEls.get('undercity')!;
      el.textContent = status === 'online' ? `地下城核心舱 · ${governance === 'luna' ? 'Luna 托管' : '人类自治'}` : status === 'building' ? '地下城核心舱 · 建设中' : status === 'available' ? '地下城核心舱 · 可启动' : '地下城核心舱 · 未解锁';
    },
    setStation(unlocked) {
      stationUnlocked = unlocked;
    },
    setFocus(id) {
      focus = id;
    },
    sendRover(to) {
      if (to === 'core' || to === 'station' || to === 'undercity') return;
      const r = routeBetween('core', to);
      roverPath = r.points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
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
