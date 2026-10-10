import * as THREE from 'three';
import { Kit, lathe, type V3 } from './kit';

// 笨笨：营地的四足轮腿搬运机器人（致敬《流浪地球》）。机头朝 +x。
// 四条腿末端各有一个轮子：平时靠轮子滚动前进，腿只做支撑和减震；掉头时左右轮反向转动，原地转向
export interface Benben {
  body: THREE.Group;
  chassis: THREE.Group; // 车身（含腿），随地形俯仰、侧倾
  head: THREE.Group;
  wheels: { g: THREE.Group; side: number }[];
  last: { x: number; yaw: number } | null;
}

const WHEEL_R = 0.31;
const HIP_X = 0.86, HIP_Y = 1.3, HIP_Z = 0.6, WHEEL_Z = 0.8;

// 侧面铭牌：“笨笨 BB-01”
function nameplate(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#2b2f36';
  ctx.font = 'bold 40px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('笨笨', 8, 34);
  ctx.font = 'bold 26px monospace';
  ctx.fillText('BB-01', 104, 36);
  ctx.fillStyle = '#ff8a1e';
  ctx.fillRect(210, 18, 36, 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 机身侧视轮廓：前端下沿切角、后端略高
function hullShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-1.12, -0.32);
  s.lineTo(0.88, -0.32);
  s.lineTo(1.12, -0.1);
  s.lineTo(1.12, 0.3);
  s.quadraticCurveTo(1.12, 0.38, 1.02, 0.38);
  s.lineTo(-1.04, 0.4);
  s.quadraticCurveTo(-1.12, 0.4, -1.12, 0.32);
  s.closePath();
  return s;
}

// 轮子：圆角胎面 + 横向花纹 + 轮毂电机（轮毂上的螺栓与橙色标记能看出转动）
function wheel(rubber: THREE.Material, metal: THREE.Material, orange: THREE.Material, side: number): THREE.Group {
  const k = new Kit();
  const w = 0.12;
  k.add(lathe([[0.17, -w], [0.27, -w], [0.3, -w + 0.03], [WHEEL_R, 0], [0.3, w - 0.03], [0.27, w], [0.17, w]], 28), rubber, [0, 0, 0], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    k.add(new THREE.BoxGeometry(0.03, 0.04, 0.17), rubber, [Math.cos(a) * (WHEEL_R - 0.005), Math.sin(a) * (WHEEL_R - 0.005), 0], [0, 0, a]);
  }
  k.add(new THREE.CylinderGeometry(0.18, 0.18, 0.2, 20), metal, [0, 0, 0], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.add(new THREE.CylinderGeometry(0.022, 0.022, 0.04, 6), rubber, [Math.cos(a) * 0.12, Math.sin(a) * 0.12, side * 0.11], [Math.PI / 2, 0, 0]);
  }
  k.add(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 12), orange, [0, 0, side * 0.115], [Math.PI / 2, 0, 0]);
  k.add(new THREE.BoxGeometry(0.1, 0.03, 0.02), orange, [0.12, 0, side * 0.105]); // 偏心标记
  return k.build();
}

export function benbenModel(): Benben {
  const shell = new THREE.MeshStandardMaterial({ color: '#e9ecef', roughness: 0.5, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.65, metalness: 0.35 });
  const metal = new THREE.MeshStandardMaterial({ color: '#9aa1aa', roughness: 0.35, metalness: 0.85 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#17191c', roughness: 0.92 });
  const orange = new THREE.MeshStandardMaterial({ color: '#ff8a1e', roughness: 0.5, metalness: 0.1 });
  const eye = new THREE.MeshBasicMaterial({ color: '#7fd1ff' });
  const tail = new THREE.MeshBasicMaterial({ color: '#ff3b30' });
  const lamp = new THREE.MeshBasicMaterial({ color: '#fff4e0' });

  const k = new Kit();
  // 机身：倒角的侧视轮廓挤出成形，中心高 1.45
  const hull = new THREE.ExtrudeGeometry(hullShape(), { depth: 0.9, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
  hull.translate(0, 0, -0.45);
  k.add(hull, shell, [0, 1.45, 0]);
  // 侧面电池仓盖板 + 散热格栅 + 橙色警示条
  for (const s of [1, -1]) {
    k.add(new THREE.BoxGeometry(1.3, 0.36, 0.03), dark, [-0.12, 1.43, s * 0.51]);
    for (let i = 0; i < 6; i++) k.add(new THREE.BoxGeometry(0.06, 0.26, 0.02), metal, [-0.62 + i * 0.12, 1.43, s * 0.53]);
    k.add(new THREE.BoxGeometry(2.1, 0.05, 0.02), orange, [0, 1.16, s * 0.51]);
  }
  // 前保险杠与车灯、后部尾灯条
  k.add(new THREE.BoxGeometry(0.1, 0.16, 1.0), dark, [1.2, 1.23, 0]);
  for (const z of [-0.32, 0.32]) k.add(new THREE.BoxGeometry(0.03, 0.08, 0.16), lamp, [1.255, 1.25, z]);
  k.add(new THREE.BoxGeometry(0.03, 0.06, 0.7), tail, [-1.18, 1.62, 0]);
  // 货架：底板 + 四角立柱 + 栏杆，上面两只货箱（带捆扎带）
  k.add(new THREE.BoxGeometry(1.7, 0.06, 0.95), dark, [-0.15, 1.88, 0]);
  for (const [x, z] of [[-0.95, -0.44], [-0.95, 0.44], [0.65, -0.44], [0.65, 0.44]]) k.rod([x, 1.88, z], [x, 2.22, z], 0.025, metal, 6);
  for (const z of [-0.44, 0.44]) k.rod([-0.95, 2.22, z], [0.65, 2.22, z], 0.02, metal, 6);
  k.add(new THREE.BoxGeometry(0.8, 0.44, 0.78), dark, [-0.5, 2.13, 0]);
  k.add(new THREE.BoxGeometry(0.6, 0.32, 0.7), orange, [0.25, 2.07, 0]);
  for (const x of [-0.7, -0.3, 0.25]) k.add(new THREE.BoxGeometry(0.05, 0.02, 0.82), metal, [x, x > 0 ? 2.24 : 2.36, 0]);
  // 天线（尾部）
  k.rod([-1.0, 1.85, -0.36], [-1.08, 2.75, -0.36], 0.012, dark, 4);
  k.add(new THREE.SphereGeometry(0.035, 8, 6), tail, [-1.08, 2.76, -0.36]);

  // 四条腿：髋关节电机 → 大腿（白色护壳）→ 膝关节 → 小腿 → 轮毂电机。前腿膝盖朝前、后腿朝后，呈“> <”站姿
  const wheels: Benben['wheels'] = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const hip: V3 = [sx * HIP_X, HIP_Y, sz * HIP_Z];
    const axle: V3 = [sx * HIP_X, WHEEL_R, sz * (HIP_Z + 0.06)];
    const knee: V3 = [sx * (HIP_X + 0.37), (HIP_Y + WHEEL_R) / 2, sz * (HIP_Z + 0.03)];
    k.add(new THREE.CylinderGeometry(0.17, 0.17, 0.2, 20), dark, [hip[0], hip[1], sz * (HIP_Z - 0.04)], [Math.PI / 2, 0, 0]);
    k.add(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 16), orange, [hip[0], hip[1], sz * (HIP_Z + 0.07)], [Math.PI / 2, 0, 0]);
    k.rod(hip, knee, 0.1, shell, 8, 0.075);
    k.add(new THREE.CylinderGeometry(0.11, 0.11, 0.17, 16), dark, knee, [Math.PI / 2, 0, 0]);
    k.rod(knee, axle, 0.06, metal, 8, 0.05);
    k.rod([knee[0], knee[1], knee[2] - sz * 0.05], [axle[0] + sx * 0.12, axle[1] + 0.12, axle[2] - sz * 0.05], 0.025, dark, 6); // 减震连杆
    k.add(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 14), dark, [axle[0], axle[1], axle[2] + sz * 0.02], [Math.PI / 2, 0, 0]);
    const wg = new THREE.Group();
    wg.add(wheel(rubber, metal, orange, sz));
    wg.position.set(axle[0], axle[1], sz * WHEEL_Z);
    wheels.push({ g: wg, side: sz });
  }

  // 头部：传感器舱 + 圆形主“眼” + 激光雷达 + 两侧补光灯，平时左右扫视
  const h = new Kit();
  h.add(new THREE.BoxGeometry(0.42, 0.42, 0.66), shell, [0, 0, 0]);
  h.add(new THREE.BoxGeometry(0.06, 0.36, 0.6), dark, [0.22, 0, 0]);
  h.add(new THREE.TorusGeometry(0.13, 0.03, 8, 24), metal, [0.255, 0.02, 0], [0, Math.PI / 2, 0]);
  h.add(new THREE.CircleGeometry(0.11, 24), eye, [0.256, 0.02, 0], [0, Math.PI / 2, 0]);
  for (const z of [-0.22, 0.22]) h.add(new THREE.CircleGeometry(0.035, 12), lamp, [0.256, -0.1, z], [0, Math.PI / 2, 0]);
  h.add(new THREE.CylinderGeometry(0.09, 0.1, 0.1, 16), dark, [0, 0.26, 0]);
  h.add(new THREE.CylinderGeometry(0.092, 0.092, 0.025, 16), eye, [0, 0.27, 0]);
  const head = new THREE.Group();
  head.add(h.build());
  head.position.set(1.32, 1.72, 0);
  head.rotation.z = -0.08;
  // 颈部
  k.rod([1.0, 1.7, 0], [1.2, 1.7, 0], 0.09, dark, 10);

  const chassis = new THREE.Group();
  chassis.add(k.build(), head, ...wheels.map((w) => w.g));
  // 侧面铭牌
  const plate = new THREE.MeshStandardMaterial({ map: nameplate(), transparent: true, roughness: 0.6 });
  for (const s of [1, -1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155), plate);
    m.position.set(0.55, 1.71, s * 0.506);
    if (s < 0) m.rotation.y = Math.PI;
    chassis.add(m);
  }
  const body = new THREE.Group();
  body.add(chassis);
  return { body, chassis, head, wheels, last: null };
}

// 巡检路线：沿 z = -11 往返，x ∈ [-18, 10]。
// 新布局下依然不穿模：居住舱 |z| ≤ 3.4，通信天线杆在 (-10, -6)、半径 1，太阳能阵列 z ≤ -18，冰钻在 (24, -10)。
export const BENBEN_Z = -11;

export function patrolBenben(b: Benben, t: number, heightAt: (x: number, z: number) => number): void {
  // 在居住舱与太阳能板之间来回巡检，走到两端时原地掉头（左右轮反向转动）
  const x = -4 + 14 * Math.sin(t * 0.07);
  const v = Math.cos(t * 0.07);
  const yaw = (1 - Math.max(-1, Math.min(1, v * 4))) * (Math.PI / 2);
  const z = BENBEN_Z;
  b.body.position.set(x, heightAt(x, z), z);
  b.body.rotation.y = yaw;
  // 随地形俯仰、侧倾：用四个轮子的触地高度估算车身姿态；行驶时有轻微的颠簸
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (f: number, r: number) => heightAt(x + c * f + s * r, z - s * f + c * r);
  const pitch = Math.atan2((at(HIP_X, 0) - at(-HIP_X, 0)), HIP_X * 2);
  const roll = Math.atan2((at(0, -WHEEL_Z) - at(0, WHEEL_Z)), WHEEL_Z * 2);
  const speed = Math.abs(v);
  b.chassis.rotation.set(roll, 0, pitch + Math.sin(t * 7.3) * 0.006 * speed, 'YXZ');
  b.chassis.position.y = Math.sin(t * 11) * 0.008 * speed;
  // 轮子：前进距离 / 半径 = 转角；转向时左右两侧差速
  if (b.last) {
    const fwd = (x - b.last.x) * c;
    const dyaw = yaw - b.last.yaw;
    if (Math.abs(fwd) < 1 && Math.abs(dyaw) < 1) for (const w of b.wheels) w.g.rotation.z -= (fwd + w.side * dyaw * WHEEL_Z) / WHEEL_R;
  }
  b.last = { x, yaw };
  // 头部左右扫视
  b.head.rotation.y = Math.sin(t * 0.5) * 0.35 + Math.sin(t * 1.3) * 0.08;
}

// 巡检线上的车辙：两条压实的轮印，贴着地形
export function benbenTracks(heightAt: (x: number, z: number) => number): THREE.Group {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(60,34,22,0.32)';
  ctx.fillRect(0, 4, 64, 24);
  ctx.fillStyle = 'rgba(40,22,14,0.35)';
  for (let i = 0; i < 64; i += 8) ctx.fillRect(i, 6, 3, 20);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  const x0 = -19.5, x1 = 11.5, len = x1 - x0;
  tex.repeat.set(len / 0.5, 1);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  const g = new THREE.Group();
  for (const dz of [-WHEEL_Z, WHEEL_Z]) {
    const geo = new THREE.PlaneGeometry(len, 0.26, 80, 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (x0 + x1) / 2, z = pos.getZ(i) + BENBEN_Z + dz;
      pos.setXYZ(i, x, heightAt(x, z) + 0.02, z);
    }
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, mat));
  }
  return g;
}
