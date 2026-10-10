import * as THREE from 'three';
import { glow, type Mats } from './common';
import { facing, Kit, lathe, polar, type V3 } from './kit';

// 火星上的航天器：载人着陆器与火星上升器（MAV）。原点在地面中心，单位约为米
const LEGS = [0, 1, 2, 3].map((i) => (i / 4) * Math.PI * 2 + Math.PI / 4); // 着陆腿、下降发动机所在的对角线方向

const accent = () => new THREE.MeshStandardMaterial({ color: '#c8322a', roughness: 0.5, metalness: 0.1 });

// 发动机喷管：喉部在上、出口在下，出口位于 y = 0
function bell(exit: number, len: number): THREE.BufferGeometry {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const k = i / 8;
    pts.push([exit * (0.36 + 0.64 * (1 - k) ** 1.8), k * len]);
  }
  return lathe(pts, 24);
}

// 着陆腿脚垫：浅碟形
const footpad = (r: number) => lathe([[0.001, 0], [r * 0.95, 0.03], [r, 0.12], [r * 0.6, 0.26], [r * 0.15, 0.32]], 16);

// RCS 推力器组：小方块 + 三个朝外的小喷口
function rcsQuad(k: Kit, m: Mats, a: number, r: number, y: number): void {
  k.add(new THREE.BoxGeometry(0.34, 0.34, 0.22), m.dark, polar(a, r, y), facing(a));
  for (const [dy, dz] of [[0.2, 0], [-0.2, 0], [0, 0.2]]) {
    const n = new THREE.ConeGeometry(0.06, 0.16, 8, 1, true);
    const p = polar(a, r, y + dy);
    const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(dz);
    k.add(n, m.nozzle, [p[0] + side.x, p[1], p[2] + side.z], dy > 0 ? [0, 0, 0] : dy < 0 ? [Math.PI, 0, 0] : [Math.PI / 2, 0, 0]);
  }
}

// 舷窗：深色窗框 + 暖光玻璃，贴在倾斜的舱壁上（r 为该高度处舱壁的半径）
function porthole(k: Kit, m: Mats, a: number, r: number, y: number, tilt: number, w = 0.62, h = 0.42): void {
  k.add(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.06), m.dark, polar(a, r + 0.01, y), facing(a, tilt));
  k.add(new THREE.BoxGeometry(w, h, 0.06), m.windowWarm, polar(a, r + 0.035, y), facing(a, tilt));
}

// ---------------- 载人着陆器 ----------------
// 八角形下降级（金色隔热毯、推进剂球罐、四台下降发动机）+ 锥形乘员舱（舷窗、舱门、梯子、对接口、天线）
// 四条倒三角着陆腿；下降发动机在对角线半径 1.8、出口 y ≈ 1.15 处，与着陆演出的喷焰对齐
export function landerModel(m: Mats): THREE.Group {
  const k = new Kit();
  const red = accent();
  // 下降级
  k.add(new THREE.CylinderGeometry(3.3, 3.45, 2.2, 8), m.foil, [0, 3.4, 0], [0, Math.PI / 8, 0]);
  k.add(new THREE.CylinderGeometry(3.6, 3.6, 0.22, 8), m.metal, [0, 4.6, 0], [0, Math.PI / 8, 0]);
  k.add(new THREE.CylinderGeometry(3.55, 3.6, 0.24, 8), m.dark, [0, 2.2, 0], [0, Math.PI / 8, 0]);
  for (let i = 0; i < 8; i++) { // 八根竖向桁条
    const a = (i / 8) * Math.PI * 2;
    k.rod(polar(a, 3.42, 2.3), polar(a, 3.42, 4.5), 0.07, m.metal, 6);
  }
  // 推进剂球罐：三个方向露出半个球，第四个方向留给舱门与梯子（+x）
  for (const a of [Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    k.add(new THREE.SphereGeometry(1.05, 20, 12), m.white, polar(a, 2.85, 3.4));
    k.add(new THREE.TorusGeometry(1.06, 0.05, 6, 28), m.metal, polar(a, 2.85, 3.4), [Math.PI / 2, 0, 0]);
  }
  // 下降发动机：燃烧室 + 喷管 + 万向节支架
  for (const a of LEGS) {
    const [x, , z] = polar(a, 1.8, 0);
    k.add(bell(0.58, 1.0), m.nozzle, [x, 1.15, z]);
    k.add(new THREE.CylinderGeometry(0.26, 0.22, 0.5, 12), m.metal, [x, 2.35, z]);
    k.rod([x, 2.1, z], [x * 0.5, 2.15, z * 0.5], 0.05, m.dark, 6);
  }
  // 着陆腿：主支柱（带减震筒）+ 两根斜撑 + 脚垫
  for (const a of LEGS) {
    const top = polar(a, 3.35, 4.2), foot = polar(a, 4.9, 0.42), knee = polar(a, 4.62, 0.95);
    k.rod(top, foot, 0.11, m.metal, 8);
    const sleeveEnd: V3 = [top[0] + (foot[0] - top[0]) * 0.45, top[1] + (foot[1] - top[1]) * 0.45, top[2] + (foot[2] - top[2]) * 0.45];
    k.rod(top, sleeveEnd, 0.2, m.dark, 10);
    for (const s of [-0.34, 0.34]) k.rod(knee, polar(a + s, 3.45, 2.2), 0.07, m.metal, 6);
    k.add(new THREE.SphereGeometry(0.17, 10, 8), m.dark, foot);
    k.add(footpad(0.85), m.dark, [foot[0], 0, foot[2]]);
  }
  // RCS 推力器：上甲板四周
  for (const a of LEGS) rcsQuad(k, m, a + Math.PI / 4 + 0.25, 3.62, 4.25);

  // 乘员舱：锥形旋转体（防热底边 + 白色面板舱壁 + 顶部对接通道）
  const base = 4.72;
  k.add(new THREE.CylinderGeometry(2.5, 2.45, 0.22, 40), m.dark, [0, base + 0.11, 0]);
  k.add(lathe([[2.48, 0.22], [2.42, 0.6], [1.78, 2.5], [1.4, 3.0], [1.0, 3.2], [0.001, 3.22]], 40), m.panel, [0, base, 0]);
  k.add(new THREE.CylinderGeometry(0.85, 0.9, 0.55, 24), m.metal, [0, base + 3.45, 0]);
  k.add(new THREE.TorusGeometry(0.88, 0.07, 8, 28), m.dark, [0, base + 3.72, 0], [Math.PI / 2, 0, 0]);
  const tilt = Math.atan2(0.64, 1.9);
  const wall = (y: number) => 2.42 - 0.64 * Math.max(0, y - 0.6) / 1.9; // 舱壁在局部高度 y 处的半径
  k.add(new THREE.CylinderGeometry(wall(2.45) + 0.02, wall(2.25) + 0.02, 0.2, 40, 1, true), red, [0, base + 2.35, 0]); // 信号红环带
  for (const a of [Math.PI * 0.75, Math.PI, Math.PI * 1.25]) porthole(k, m, a, wall(1.75), base + 1.75, tilt);
  // 舱门（朝 +x）：门框、门板、把手
  k.add(new THREE.BoxGeometry(1.06, 1.41, 0.06), m.dark, polar(0, wall(1.15) + 0.01, base + 1.15), facing(0, tilt));
  k.add(new THREE.BoxGeometry(0.9, 1.25, 0.06), m.white, polar(0, wall(1.15) + 0.04, base + 1.15), facing(0, tilt));
  k.add(new THREE.BoxGeometry(0.08, 0.36, 0.08), m.dark, polar(0, wall(1.15) + 0.1, base + 1.15), facing(0, tilt));
  // 舱门外的小平台与扶手、通往地面的梯子
  k.add(new THREE.BoxGeometry(1.0, 0.08, 1.3), m.metal, [3.95, base - 0.02, 0]);
  for (const z of [-0.62, 0.62]) {
    k.rod([3.5, base, z], [3.5, base + 1.0, z], 0.035, m.metal, 6);
    k.rod([3.5, base + 1.0, z], [4.42, base + 1.0, z], 0.035, m.metal, 6);
    k.rod([4.42, base, z], [4.42, base + 1.0, z], 0.035, m.metal, 6);
    k.rod([4.4, base, z * 0.55], [5.1, 0.05, z * 0.55], 0.045, m.metal, 6);
  }
  for (let i = 1; i < 12; i++) {
    const f = i / 12, x = 4.4 + 0.7 * f, y = base * (1 - f);
    k.rod([x, y, -0.34], [x, y, 0.34], 0.03, m.metal, 5);
  }
  // 天线：桅杆 + 小碟形天线 + 鞭状天线
  k.rod([-0.6, base + 2.9, 0.6], [-0.9, base + 4.3, 0.9], 0.05, m.metal, 6);
  k.add(lathe(Array.from({ length: 6 }, (_, i) => [(i / 5) * 0.5, ((i / 5) * 0.5) ** 2 * 0.5] as [number, number]), 20), m.white, [-0.95, base + 4.3, 0.95], [0.6, 0, -0.5]);
  k.rod([0.5, base + 3.1, -0.5], [0.55, base + 4.9, -0.55], 0.015, m.dark, 4);
  // 散热板：两侧竖直贴装
  for (const a of [Math.PI * 0.5, Math.PI * 1.5]) k.add(new THREE.BoxGeometry(1.1, 1.2, 0.05), m.white, polar(a, wall(1.5) + 0.04, base + 1.5), facing(a, tilt));

  const g = new THREE.Group();
  g.add(k.build());
  // 舱外照明灯与航行灯
  const flood = glow('rgba(255,236,210,1)', 0.5);
  flood.position.set(3.0, base + 1.9, 0.75);
  const nav = glow('rgba(255,59,48,1)', 0.5);
  nav.position.set(0, base + 3.85, 0);
  g.add(flood, nav);
  return g;
}

// ---------------- 火星上升器 ----------------
// rocket 组原点在箭体底部（发动机出口），放在发射台台面上；umbilical 为脐带臂（起飞前摆开）
export interface Mav { group: THREE.Group; rocket: THREE.Group; umbilical: THREE.Group }

export function mavModel(m: Mats): Mav {
  const red = accent();
  const paint = new THREE.MeshStandardMaterial({ color: '#8e3526', roughness: 0.6, metalness: 0.3 }); // 服务塔涂装
  const regolith = new THREE.MeshStandardMaterial({ color: '#6a5c52', roughness: 0.95 }); // 烧结风化层台面

  // 箭体
  const k = new Kit();
  for (const [x, z] of [[0.75, 0.75], [-0.75, 0.75], [0.75, -0.75], [-0.75, -0.75]]) {
    k.add(bell(0.55, 1.35), m.nozzle, [x, 0.15, z]);
    k.add(new THREE.CylinderGeometry(0.28, 0.24, 0.5, 12), m.metal, [x, 1.6, z]);
  }
  k.add(lathe([[0.001, 1.25], [1.95, 1.25], [2.25, 2.1]], 40), m.dark, [0, 0, 0]); // 防热底板与收缩裙
  // 一级：面板舱壁、环向加强带、黑白滚转标记、电缆整流罩、信号红环带
  k.add(new THREE.CylinderGeometry(2.25, 2.25, 10, 40, 1, true), m.panel, [0, 7.1, 0]);
  for (const y of [2.1, 4.6, 7.1, 9.6, 12.1]) k.add(new THREE.CylinderGeometry(2.29, 2.29, 0.14, 40, 1, true), m.metal, [0, y, 0]);
  for (const q of [0, 2]) k.add(new THREE.CylinderGeometry(2.265, 2.265, 1.6, 16, 1, true, q * Math.PI / 2, Math.PI / 2), m.dark, [0, 10.7, 0]);
  k.add(new THREE.CylinderGeometry(2.27, 2.27, 0.36, 40, 1, true), red, [0, 8.2, 0]);
  k.add(new THREE.BoxGeometry(0.22, 9.4, 0.3), m.metal, polar(Math.PI * 0.5 + 0.35, 2.36, 7.1), facing(Math.PI * 0.5 + 0.35));
  // 尾翼：梯形薄板
  const fin = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.35, 0.25), new THREE.Vector2(1.35, 1.3), new THREE.Vector2(0, 3.1)]);
  for (const a of LEGS.map((x) => x - Math.PI / 4)) {
    const g = new THREE.ExtrudeGeometry(fin, { depth: 0.12, bevelEnabled: false });
    g.translate(2.2, 2.1, -0.06);
    k.add(g, m.dark, [0, 0, 0], [0, -a, 0]);
  }
  // 着陆腿：主支柱 + 斜撑 + 脚垫（落在台面上）
  for (const a of LEGS) {
    const top = polar(a, 2.2, 4.0), foot = polar(a, 3.5, 0.3), knee = polar(a, 3.25, 0.8);
    k.rod(top, foot, 0.12, m.metal, 8);
    k.rod(top, [top[0] + (foot[0] - top[0]) * 0.4, top[1] + (foot[1] - top[1]) * 0.4, top[2] + (foot[2] - top[2]) * 0.4], 0.2, m.dark, 10);
    for (const s of [-0.3, 0.3]) k.rod(knee, polar(a + s, 2.2, 2.2), 0.07, m.metal, 6);
    k.add(footpad(0.6), m.dark, [foot[0], 0, foot[2]]);
  }
  // 级间段（深色，带排气格栅）+ 二级
  k.add(new THREE.CylinderGeometry(2.0, 2.25, 0.9, 40, 1, true), m.dark, [0, 12.6, 0]);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.add(new THREE.BoxGeometry(0.5, 0.36, 0.05), m.metal, polar(a, 2.14, 12.6), facing(a, Math.atan2(0.25, 0.9))); }
  k.add(new THREE.CylinderGeometry(2.0, 2.0, 4.1, 40, 1, true), m.panel, [0, 15.1, 0]);
  for (const y of [13.1, 15.1, 17.1]) k.add(new THREE.CylinderGeometry(2.04, 2.04, 0.12, 40, 1, true), m.metal, [0, y, 0]);
  // 乘员上升舱：防热环 + 锥形舱壁 + 舷窗 + 舱门 + RCS + 对接口 + 头锥
  k.add(new THREE.CylinderGeometry(2.06, 2.06, 0.25, 40), m.dark, [0, 17.3, 0]);
  k.add(lathe([[2.0, 17.42], [1.25, 19.7], [0.001, 19.72]], 40), m.panel, [0, 0, 0]);
  const tilt = Math.atan2(0.75, 2.28);
  const view = Math.atan2(0.75, -0.66); // 朝向主要机位
  const cone = (y: number) => 2.0 - 0.75 * (y - 17.42) / 2.28; // 上升舱舱壁半径
  for (const a of [view - 0.45, view + 0.45]) porthole(k, m, a, cone(18.3), 18.3, tilt, 0.5, 0.34);
  porthole(k, m, view + Math.PI * 0.6, cone(18.1), 18.1, tilt, 0.7, 0.9);
  for (let i = 0; i < 4; i++) rcsQuad(k, m, (i / 4) * Math.PI * 2 + 0.4, 1.9, 17.75);
  k.add(new THREE.CylinderGeometry(0.72, 0.78, 0.5, 24), m.metal, [0, 19.9, 0]);
  k.add(lathe([[0.72, 0], [0.66, 0.6], [0.45, 1.15], [0.18, 1.5], [0.001, 1.58]], 24), m.white, [0, 20.15, 0]);

  const rocket = new THREE.Group();
  rocket.name = 'rocket';
  rocket.add(k.build());
  rocket.position.y = 0.6;

  // 发射台：烧结台面、导流板、压紧环、台边指示灯；服务塔与脐带臂；ISRU 推进剂储罐
  const p = new Kit();
  p.add(new THREE.CylinderGeometry(6, 6.6, 0.6, 48), regolith, [0, 0.3, 0]);
  p.add(new THREE.CylinderGeometry(2.7, 2.7, 0.04, 8), m.dark, [0, 0.62, 0]);
  p.add(new THREE.TorusGeometry(5.4, 0.08, 6, 64), m.dark, [0, 0.62, 0], [Math.PI / 2, 0, 0]);
  for (const a of LEGS) p.add(new THREE.CylinderGeometry(0.8, 0.8, 0.08, 16), m.dark, polar(a, 3.5, 0.62));
  // 服务塔：四柱桁架 + X 形斜撑 + 顶部平台
  const T: [number, number] = [5.6, -5.6], hw = 0.65, H = 18.5;
  const corners: [number, number][] = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]];
  for (const [cx, cz] of corners) p.rod([T[0] + cx, -1, T[1] + cz], [T[0] + cx, H, T[1] + cz], 0.09, paint, 6); // 柱脚埋入地面，适应起伏
  for (let y = 0; y < H - 0.1; y += 2.3) {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
      p.rod([T[0] + ax, y + 2.3, T[1] + az], [T[0] + bx, y + 2.3, T[1] + bz], 0.05, paint, 5);
      p.rod([T[0] + ax, y, T[1] + az], [T[0] + bx, y + 2.3, T[1] + bz], 0.04, paint, 5);
    }
  }
  p.add(new THREE.BoxGeometry(2.2, 0.12, 2.2), m.metal, [T[0], H, T[1]]);
  p.rod([T[0], H, T[1]], [T[0], H + 2.6, T[1]], 0.05, m.metal, 5); // 避雷针兼气象桅杆
  // ISRU 储罐：液氧、甲烷各一，经管道接入台面
  for (const [x, z, c] of [[-7.2, -2.6, m.white], [-5.6, -6.6, m.metal]] as const) {
    p.add(new THREE.SphereGeometry(1.5, 24, 14), c, [x, 2.4, z]);
    p.add(new THREE.TorusGeometry(1.52, 0.06, 6, 32), m.dark, [x, 2.4, z], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      p.rod([x + Math.cos(a) * 1.0, 1.4, z + Math.sin(a) * 1.0], [x + Math.cos(a) * 1.3, -0.6, z + Math.sin(a) * 1.3], 0.08, m.metal, 6);
    }
    p.rod([x, 0.9, z], [x, 0.35, z], 0.12, m.dark, 8);
    p.rod([x, 0.35, z], [x * 0.62, 0.35, z * 0.62], 0.12, m.dark, 8);
  }

  // 脐带臂：从服务塔伸向二级箭体（局部 +x 指向箭体），起飞前绕塔旋开
  const arm = new Kit();
  const L = 4.82;
  for (const z of [-0.3, 0.3]) {
    arm.rod([0, 0, z], [L, 0, z], 0.05, paint, 5);
    arm.rod([0, 0.6, z], [L - 0.3, 0.6, z], 0.05, paint, 5);
    for (let x = 0; x < L - 0.4; x += 0.75) arm.rod([x, 0, z], [x + 0.75, 0.6, z], 0.035, paint, 4);
  }
  arm.add(new THREE.BoxGeometry(0.3, 0.8, 0.9), m.dark, [L, 0.2, 0]);
  arm.rod([0.4, -0.05, 0], [L - 0.2, -0.35, 0], 0.09, m.rubber, 6); // 加注软管
  const umbilical = new THREE.Group();
  umbilical.name = 'umbilical';
  umbilical.add(arm.build());
  umbilical.position.set(T[0] - hw, 14.4, T[1] + hw);
  umbilical.rotation.y = Math.atan2(T[1] + hw, -(T[0] - hw)); // 让局部 +x 指向箭体轴线
  umbilical.userData.rest = umbilical.rotation.y;

  const group = new THREE.Group();
  group.name = 'mav';
  const pad = p.build();
  pad.name = 'pad';
  // 台边指示灯
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const l = glow('rgba(255,170,90,1)', 0.45);
    l.position.set(Math.cos(a) * 6.2, 0.7, Math.sin(a) * 6.2);
    pad.add(l);
  }
  const towerTop = glow('rgba(255,59,48,1)', 0.9);
  towerTop.position.set(T[0], H + 2.7, T[1]);
  pad.add(towerTop);
  group.add(pad, rocket, umbilical);
  return { group, rocket, umbilical };
}
