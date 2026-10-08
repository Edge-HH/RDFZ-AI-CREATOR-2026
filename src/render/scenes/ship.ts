import * as THREE from 'three';
import type { SceneCue } from '../../core/content';
import { ARRIVAL_DAY } from '../../core/orbit';
import type { MissionState } from '../../core/types';
import { planetTexture } from '../assets';
import type { Shot, Vec3 } from '../director';
import { HOLO_RED, holoGraticule, holoLabel } from '../holo';
import { earthTexture, marsTexture, solarCellTexture, starField } from '../textures';
import { mulberry } from '../noise';
import { disposeTree, glow, makeMats, navLight, useEnv, type Mats, type SceneCtx, type SceneModule } from './common';

const X = new THREE.Vector3(1, 0, 0);

// 细杆：从 a 到 b，写入实例矩阵
function strutMatrix(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Matrix4 {
  const d = b.clone().sub(a);
  const q = new THREE.Quaternion().setFromUnitVectors(X, d.clone().normalize());
  return new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(d.length(), t, t));
}

// 喷管：旋转体
function bell(r0: number, r1: number, len: number, mat: THREE.Material): THREE.Mesh {
  const pts = Array.from({ length: 12 }, (_, i) => { const k = i / 11; return new THREE.Vector2(r0 + (r1 - r0) * Math.pow(k, 1.6), -k * len); });
  return new THREE.Mesh(new THREE.LatheGeometry(pts, 32), mat);
}

// 祝融一号：居住舱 + 节点舱 + 对接的着陆器 + 桁架 + 散热板 + 太阳翼 + 推进段（机头朝 +x）
export function buildShip(m: Mats, tier: 'high' | 'medium' | 'low'): { ship: THREE.Group; wall: THREE.Object3D; dish: THREE.Object3D; lights: THREE.Sprite[] } {
  const ship = new THREE.Group();
  // 居住舱：分段圆柱 + 环肋 + 舷窗
  const hab = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 7, 40, 1), m.panel);
  hab.rotation.z = Math.PI / 2;
  ship.add(hab);
  for (let i = -3; i <= 3; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(1.63, 0.06, 6, 40), m.metal);
    rib.rotation.y = Math.PI / 2;
    rib.position.x = i * 1.15;
    ship.add(rib);
  }
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.05), m.windowWarm);
    w.position.set(-1.8 + i * 1.2, 0.5, 1.6);
    ship.add(w);
  }
  // 节点舱与上下对接口
  const node = new THREE.Mesh(new THREE.SphereGeometry(1.45, 32, 24), m.panel);
  node.position.x = 4.3;
  ship.add(node);
  for (const s of [1, -1]) {
    const port = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.8, 24), m.metal);
    port.position.set(4.3, s * 1.6, 0);
    ship.add(port);
  }
  // 着陆器：70° 球锥气动外壳，防热罩朝前（深色），后罩包金色隔热毯
  const lander = new THREE.Group();
  const backshell = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2.4, 2.1, 40, 1), m.foil);
  backshell.rotation.z = Math.PI / 2;
  const shield = new THREE.Mesh(new THREE.SphereGeometry(2.6, 40, 12, 0, Math.PI * 2, 0, 0.75), new THREE.MeshStandardMaterial({ color: '#3b2a20', roughness: 0.85, metalness: 0.1 }));
  shield.rotation.z = -Math.PI / 2;
  shield.position.x = -0.9;
  lander.add(backshell, shield);
  lander.position.x = 6.9;
  ship.add(lander);
  // 桁架：方形格构（实例化）
  const bays = 8, bay = 1.2, hw = 0.55, x0 = -3.5;
  const strut = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), m.metal, bays * 12 + 4);
  let n = 0;
  const corner = (x: number, i: number) => new THREE.Vector3(x, (i & 1 ? 1 : -1) * hw, (i & 2 ? 1 : -1) * hw);
  for (let b = 0; b < bays; b++) {
    const xa = x0 - b * bay, xb = xa - bay;
    for (let i = 0; i < 4; i++) {
      strut.setMatrixAt(n++, strutMatrix(corner(xa, i), corner(xb, i), 0.08));
      const j = [1, 3, 0, 2][i];
      strut.setMatrixAt(n++, strutMatrix(corner(xa, i), corner(xa, j), 0.05));
      strut.setMatrixAt(n++, strutMatrix(corner(xa, i), corner(xb, j), 0.04));
    }
  }
  strut.count = n;
  ship.add(strut);
  // 散热板：上下竖直白板，侧对太阳
  for (const s of [1, -1]) {
    const rad = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.0, 0.06), m.panel);
    rad.position.set(-7.5, s * 2.2, 0);
    ship.add(rad);
  }
  // 太阳翼：两侧各两片电池毯 + 金色边框 + 桅杆
  const cells = solarCellTexture(8);
  cells.repeat.set(2, 6);
  const cellMat = new THREE.MeshStandardMaterial({ map: cells, roughness: 0.28, metalness: 0.6 });
  for (const s of [1, -1]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 11, 8), m.metal);
    mast.rotation.x = Math.PI / 2;
    mast.position.set(-10.2, 0, s * 6.2);
    ship.add(mast);
    for (const dx of [-1.8, 1.8]) {
      const blanket = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.04, 10), cellMat);
      blanket.position.set(-10.2 + dx, 0, s * 6.4);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.08, 10.1), m.foil);
      frame.position.copy(blanket.position).add(new THREE.Vector3(0, -0.03, 0));
      ship.add(frame, blanket);
    }
  }
  // 推进段：两个包隔热毯的贮箱 + 三台发动机
  for (const z of [1.3, -1.3]) {
    const tank = new THREE.Mesh(new THREE.SphereGeometry(1.25, 28, 20), m.foil);
    tank.position.set(-14.2, 0, z);
    ship.add(tank);
  }
  const thrust = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 1.2, 24), m.dark);
  thrust.rotation.z = Math.PI / 2;
  thrust.position.x = -15.9;
  ship.add(thrust);
  for (const [y, z] of [[0, 0], [0.75, 0.75], [-0.75, -0.75]]) {
    const b = bell(0.32, 0.75, 1.6, m.nozzle);
    b.rotation.z = -Math.PI / 2;
    b.position.set(-16.5, y, z);
    ship.add(b);
  }
  // 高增益天线（碟形，指向地球）
  const dish = new THREE.Group();
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), m.metal);
  boom.position.y = 0.8;
  const dishPts = Array.from({ length: 10 }, (_, i) => { const r = (i / 9) * 1.1; return new THREE.Vector2(r, r * r * 0.25); });
  const reflector = new THREE.Mesh(new THREE.LatheGeometry(dishPts, 32), new THREE.MeshStandardMaterial({ color: '#f1f2f4', roughness: 0.4, side: THREE.DoubleSide }));
  reflector.position.y = 1.6;
  dish.add(boom, reflector);
  dish.position.set(-1.5, 1.6, 0);
  ship.add(dish);
  // 水墙屏蔽：包在居住舱外的半透明环
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 1.95, 4.5, 40, 1, true), new THREE.MeshStandardMaterial({ color: '#cfe6ff', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.16, side: THREE.DoubleSide }));
  wall.rotation.z = Math.PI / 2;
  ship.add(wall);
  // 航行灯
  const lights = [navLight('#ff3b30', 0.9), navLight('#3bff7a', 0.9), navLight('#ffffff', 1.1)];
  lights[0].position.set(-10.2, 0, -11.5);
  lights[1].position.set(-10.2, 0, 11.5);
  lights[2].position.set(-17.4, 0, 0);
  ship.add(...lights);
  if (tier !== 'low') ship.traverse((o) => { (o as THREE.Mesh).castShadow = tier === 'high'; (o as THREE.Mesh).receiveShadow = tier === 'high'; });
  return { ship, wall, dish, lights };
}

// ---------------- 飞船巡航（含太阳粒子事件） ----------------
export class ShipScene implements SceneModule {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
  exposure = 1.0;
  fx = { sensorHits: 0 };
  private ship: THREE.Group;
  private wall: THREE.Object3D;
  private dish: THREE.Object3D;
  private lights: THREE.Sprite[];
  private streaks: THREE.InstancedMesh;
  private seeds: Float32Array;
  private shield: THREE.Group;
  private shieldLabel: THREE.Sprite;
  private alarm: THREE.PointLight;
  private planet = new THREE.Group();
  private planetMesh: THREE.Mesh;
  private earthMesh: THREE.Mesh;
  private spe = false;
  private sunDir = new THREE.Vector3(-1, 0.32, 0.42).normalize();
  private planetDir = new THREE.Vector3(0.62, -0.22, -0.75).normalize();
  private dummy = new THREE.Object3D();

  constructor(ctx: SceneCtx) {
    const m = makeMats(ctx.tier);
    const built = buildShip(m, ctx.tier);
    this.ship = built.ship; this.wall = built.wall; this.dish = built.dish; this.lights = built.lights;
    this.ship.rotation.set(0.12, 0.35, 0.04);
    useEnv(ctx, this.scene, 'space', 0.8);
    const sun = new THREE.DirectionalLight('#fff3e0', 3.4);
    sun.position.copy(this.sunDir).multiplyScalar(60);
    if (ctx.tier === 'high') {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const c = sun.shadow.camera as THREE.OrthographicCamera;
      c.left = -22; c.right = 22; c.top = 22; c.bottom = -22; c.near = 10; c.far = 120;
    }
    const sunGlow = glow('rgba(255,236,210,1)', 70);
    sunGlow.position.copy(this.sunDir).multiplyScalar(900);
    // 远处的行星：巡航早期是地球，后期是火星，越近越大
    this.planetMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.MeshStandardMaterial({ map: planetTexture('mars', ctx.tier, () => marsTexture(256).map), roughness: 0.95 }));
    this.earthMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.MeshStandardMaterial({ map: planetTexture('earth', ctx.tier, () => earthTexture(256).map), roughness: 0.8 }));
    this.planet.add(this.planetMesh, this.earthMesh);
    this.planet.position.copy(this.planetDir).multiplyScalar(700);
    // 太阳粒子事件：沿太阳方向飞来的细长光线
    const N = ctx.tier === 'low' ? 260 : 900;
    this.streaks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffd6c4', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), N);
    this.seeds = new Float32Array(N * 4);
    const r = mulberry(5);
    for (let i = 0; i < N; i++) this.seeds.set([r(), (r() - 0.5) * 50, (r() - 0.5) * 40, 0.5 + r() * 1.2], i * 4);
    this.streaks.visible = false;
    this.streaks.frustumCulled = false;
    this.shield = holoGraticule(2.9, { color: HOLO_RED, opacity: 0.35 });
    this.shieldLabel = holoLabel('STORM SHELTER', '风暴避难区 · 屏蔽', HOLO_RED, 0.04);
    this.shieldLabel.position.set(0, 3.1, 0);
    this.shield.add(this.shieldLabel);
    this.ship.add(this.shield);
    this.alarm = new THREE.PointLight('#ff3b2f', 0, 30);
    this.alarm.position.set(0, 3, 3);
    this.scene.add(this.ship, sun, sun.target, sunGlow, this.planet, this.streaks, this.alarm, new THREE.AmbientLight('#203050', 0.25), starField(ctx.tier === 'low' ? 1500 : 4000, 1500));
  }

  shots(cue: SceneCue): Shot[] {
    const back = this.planetDir.clone().multiplyScalar(-46).add(new THREE.Vector3(0, 9, 0));
    const v = (p: THREE.Vector3): Vec3 => [p.x, p.y, p.z];
    const hero: Shot = { from: [2, 7, 28], to: [-1, 5, 22], look: [-3, 0, 0], fov: 40, dur: 18 };
    if (cue === 'spe') {
      return [{ from: [6, 5, 26], to: [3, 4, 21], look: [-3, 0, 0], fov: 44, dur: 16, shake: 0.02 }, hero];
    }
    return [
      hero,
      { from: [9, 2.8, 5.2], to: [-6, 2.4, 4.8], look: [6, 0, 0], lookTo: [-9, 0, 0], fov: 48, dur: 20 },
      { from: v(back), to: v(back.clone().multiplyScalar(0.88)), look: [0, 0, 0], fov: 36, dur: 20 },
    ];
  }

  apply(s: MissionState | null, cue: SceneCue): void {
    this.spe = cue === 'spe';
    this.streaks.visible = this.spe;
    this.shield.visible = this.spe;
    this.fx.sensorHits = this.spe ? 1 : 0;
    this.wall.visible = !!s?.loadout.includes('water_wall');
    // 巡航进度：前 20% 回望地球，之后火星逐渐变大
    const k = s ? Math.max(0, Math.min(1, s.day / ARRIVAL_DAY)) : 0.5;
    const toMars = k > 0.2;
    this.planetMesh.visible = toMars;
    this.earthMesh.visible = !toMars;
    const size = toMars ? 8 + k * k * 70 : 22 * (1 - k * 3);
    this.planet.scale.setScalar(Math.max(4, size));
    // 高增益天线指向地球（巡航期地球大致在船尾方向）
    this.dish.lookAt(this.dish.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(-1, 0.4, -0.3)));
  }

  tick(dt: number, t: number): void {
    this.ship.position.y = Math.sin(t * 0.3) * 0.15;
    this.ship.rotation.y = 0.35 + Math.sin(t * 0.05) * 0.04;
    this.planet.rotation.y += dt * 0.01;
    const blink = (Math.sin(t * 3) > 0.6 ? 1 : 0.15);
    this.lights.forEach((l, i) => { (l.material as THREE.SpriteMaterial).opacity = i === 2 ? (Math.sin(t * 5) > 0.95 ? 1 : 0.05) : blink; });
    if (this.spe) {
      const flow = this.sunDir.clone().negate();
      const q = new THREE.Quaternion().setFromUnitVectors(X, flow);
      const n = this.streaks.count;
      for (let i = 0; i < n; i++) {
        const [phase, a, b, len] = this.seeds.subarray(i * 4, i * 4 + 4);
        const k = (phase + t * 0.45 * len) % 1;
        const side = new THREE.Vector3(a, b, (phase - 0.5) * 40);
        this.dummy.position.copy(this.sunDir).multiplyScalar(80 - k * 160).add(side);
        this.dummy.quaternion.copy(q);
        this.dummy.scale.set(2.5 * len, 0.025, 1);
        this.dummy.updateMatrix();
        this.streaks.setMatrixAt(i, this.dummy.matrix);
      }
      this.streaks.instanceMatrix.needsUpdate = true;
      this.alarm.intensity = (Math.sin(t * 6) > 0 ? 1 : 0) * 40;
      this.shield.rotation.y = t * 0.2;
    } else this.alarm.intensity = 0;
  }

  dispose(): void { disposeTree(this.scene); }
}
