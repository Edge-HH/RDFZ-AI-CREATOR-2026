import * as THREE from 'three';
import type { MissionState } from '../../core/types';
import { HOLO_RED, HOLO_WHITE, holoLabel, holoRing } from '../holo';
import { solarCellTexture } from '../textures';
import { glow, type Mats } from './common';
import { landerModel, mavModel } from './craft';

// 基地布局（以主居住舱为原点，单位约为米）。笨笨的巡检线 z = -11 避开下列所有模块，见 benben.ts
export const LAYOUT = {
  hab: [0, 0], lab: [0, 9], airlock: [8.6, 0], greenhouse: [16, 8], solar: [-30, -19], reactor: [70, 55],
  rover: [-15, 9], drill: [24, -10], mast: [-10, -6], mav: [40, -36], lander: [32, 24], flag: [-8, 6],
} as const;

export interface BaseParts {
  group: THREE.Group;
  windows: THREE.MeshStandardMaterial;
  beacons: THREE.Sprite[];
  panels: THREE.Object3D[];
  drillBit: THREE.Object3D | null;
  labels: THREE.Object3D[];
}

type Add = (o: THREE.Object3D, x: number, z: number, lift?: number) => THREE.Object3D;

// 充气式居住舱：带环肋的卧式圆柱 + 半球端盖 + 一排舷窗
function habitat(m: Mats, len: number, r: number, windows: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 40, 1), m.white);
  body.rotation.z = Math.PI / 2;
  g.add(body);
  for (const s of [1, -1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), m.white);
    cap.rotation.z = -s * Math.PI / 2;
    cap.position.x = (s * len) / 2;
    cap.scale.y = 0.45;
    g.add(cap);
  }
  const ribs = Math.round(len / 1.6);
  for (let i = 0; i <= ribs; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(r * 1.01, 0.07, 6, 40), m.metal);
    rib.rotation.y = Math.PI / 2;
    rib.position.x = -len / 2 + (len * i) / ribs;
    g.add(rib);
  }
  for (let i = 0; i < Math.floor(len / 2.6); i++) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.1), windows);
    w.position.set(-len / 2 + 1.6 + i * 2.6, r * 0.35, r * 0.95);
    g.add(w);
  }
  // 支脚
  for (const x of [-len / 2 + 1, len / 2 - 1]) for (const z of [-r * 0.6, r * 0.6]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, r * 0.6, 8), m.dark);
    leg.position.set(x, -r * 0.75, z);
    g.add(leg);
  }
  g.position.y = r * 1.05;
  const outer = new THREE.Group(); // 外层留给布局定位，内层抬高到地面以上
  outer.add(g);
  return outer;
}

export function buildBase(s: MissionState, m: Mats, add: Add, sunAz: number, tier: 'high' | 'medium' | 'low'): BaseParts {
  const group = new THREE.Group();
  const windows = m.windowWarm.clone();
  windows.emissiveIntensity = 0.6;
  const beacons: THREE.Sprite[] = [];
  const panels: THREE.Object3D[] = [];
  const labels: THREE.Object3D[] = [];
  const has = (id: string) => s.loadout.includes(id);
  const label = (o: THREE.Object3D, en: string, zh: string, h: number, color = HOLO_WHITE) => {
    const l = holoLabel(en, zh, color, 0.036);
    l.position.y = h;
    o.add(l);
    labels.push(l);
  };

  // 主居住舱 + 实验舱 + 气闸
  const hab = habitat(m, 14, 3.4, windows);
  add(hab, LAYOUT.hab[0], LAYOUT.hab[1]);
  label(hab, 'HAB-1', '主居住舱', 4.6);
  const lab = habitat(m, 9, 2.8, windows);
  lab.rotation.y = Math.PI / 2;
  add(lab, LAYOUT.lab[0], LAYOUT.lab[1] + 4.5);
  const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.4, 20), m.panel);
  tunnel.rotation.x = Math.PI / 2;
  add(tunnel, 0, 3.8, 2.4);
  const airlock = new THREE.Group();
  const al = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3, 24), m.panel);
  al.rotation.z = Math.PI / 2;
  al.position.y = 1.7;
  const hatch = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), m.dark);
  hatch.rotation.y = Math.PI / 2;
  hatch.position.set(1.52, 1.7, 0);
  airlock.add(al, hatch);
  add(airlock, LAYOUT.airlock[0], LAYOUT.airlock[1]);
  if (has('regolith')) {
    const berm = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8f5232', roughness: 1 }));
    berm.scale.set(9.5, 5.2, 5.4);
    add(berm, 0, 0);
  }
  // 通信天线杆（碟形天线指向天空中的地球方向）
  const mast = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 9, 8), m.metal);
  pole.position.y = 4.5;
  const dish = new THREE.Mesh(new THREE.LatheGeometry(Array.from({ length: 8 }, (_, i) => new THREE.Vector2((i / 7) * 1.4, ((i / 7) * 1.4) ** 2 * 0.2)), 24), new THREE.MeshStandardMaterial({ color: '#f1f2f4', roughness: 0.4, side: THREE.DoubleSide }));
  dish.position.y = 9.2;
  dish.rotation.x = -0.9;
  const tip = glow('rgba(255,59,48,1)', 0.8);
  tip.position.y = 9.6;
  beacons.push(tip);
  mast.add(pole, dish, tip);
  add(mast, LAYOUT.mast[0], LAYOUT.mast[1]);

  // 太阳能阵列：南侧成排，支架上缓慢跟踪太阳
  const solarCount = s.loadout.filter((id) => id.startsWith('solar')).length;
  const rows = solarCount ? 4 + solarCount * 4 : 2;
  const cells = solarCellTexture(6);
  cells.repeat.set(4, 2);
  const cellMat = new THREE.MeshStandardMaterial({ map: cells, roughness: 0.25, metalness: 0.55 });
  for (let i = 0; i < rows; i++) {
    const p = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2, 8), m.metal);
    post.position.y = 1;
    const tilt = new THREE.Group();
    tilt.position.y = 2;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 3.6), cellMat);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.06, 3.8), m.metal);
    frame.position.y = -0.06;
    tilt.add(panel, frame);
    tilt.rotation.set(-0.55, sunAz, 0, 'YXZ');
    p.add(post, tilt);
    panels.push(tilt);
    add(p, LAYOUT.solar[0] + (i % 5) * 9.5, LAYOUT.solar[1] - Math.floor(i / 5) * 6);
  }
  if (solarCount) label(panels[Math.min(2, panels.length - 1)].parent!, 'SOLAR ARRAY', `太阳能阵列 · ${rows} 组`, 4.2);

  // Kilopower 裂变堆：远处，圆柱堆芯 + 锥形散热片 + 全息禁区
  if (has('fission')) {
    const reactor = new THREE.Group();
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 3.6, 20), m.metal);
    core.position.y = 1.8;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide }));
    cone.position.y = 6.1;
    cone.rotation.x = Math.PI;
    reactor.add(core, cone);
    for (let i = 0; i < 8; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 4.6, 2.2), m.dark);
      const a = (i / 8) * Math.PI * 2;
      fin.position.set(Math.cos(a) * 1.6, 6, Math.sin(a) * 1.6);
      fin.rotation.y = -a;
      reactor.add(fin);
    }
    const zone = holoRing(18, { ticks: 48, color: HOLO_RED, opacity: 0.55, dash: 2, gap: 1.2, speed: 1 });
    zone.position.y = 0.3;
    reactor.add(zone);
    add(reactor, LAYOUT.reactor[0], LAYOUT.reactor[1]);
    label(reactor, 'KILOPOWER', '裂变电源 · 禁区 18 m', 9, HOLO_RED);
  }
  // 温室穹顶：内部植物生长灯
  if (has('greenhouse')) {
    const gh = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#efe6ea', transparent: true, opacity: 0.28, roughness: 0.08, metalness: 0.1, emissive: '#ff7fb6', emissiveIntensity: 0.12 }));
    const ribs = new THREE.Mesh(new THREE.SphereGeometry(5.02, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#d8d8d8', wireframe: true, transparent: true, opacity: 0.5 }));
    const beds = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 4), new THREE.MeshStandardMaterial({ color: '#3d6b35', emissive: '#2a5a20', emissiveIntensity: 0.4, roughness: 0.9 }));
    beds.position.y = 0.4;
    const light = glow('rgba(255,120,190,0.45)', 5);
    light.position.y = 2.5;
    gh.add(dome, ribs, beds, light);
    add(gh, LAYOUT.greenhouse[0], LAYOUT.greenhouse[1]);
    label(gh, 'GREENHOUSE', '密闭温室', 6.2);
  }
  // 加压漫游车
  if (has('rover')) {
    const rover = new THREE.Group();
    const cab = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 3.2), m.white);
    cab.position.y = 2.1;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 3), windows);
    nose.position.set(3.4, 2.3, 0);
    rover.add(cab, nose);
    for (const [x, z] of [[-2, 1.8], [2, 1.8], [-2, -1.8], [2, -1.8], [0, 1.8], [0, -1.8]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.6, 18), m.rubber);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.85, z);
      rover.add(w);
    }
    add(rover, LAYOUT.rover[0], LAYOUT.rover[1]).rotation.y = 0.6;
  }
  // 冰钻井架
  let drillBit: THREE.Object3D | null = null;
  if (has('ice_drill')) {
    const rig = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 9.4, 6), new THREE.MeshStandardMaterial({ color: '#ff9b3d', metalness: 0.4, roughness: 0.5 }));
      leg.position.set(Math.cos(a) * 1.4, 4.5, Math.sin(a) * 1.4);
      leg.lookAt(0, 9, 0);
      leg.rotateX(Math.PI / 2);
      rig.add(leg);
    }
    drillBit = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 6, 8), m.metal);
    drillBit.position.y = 3;
    rig.add(drillBit);
    add(rig, LAYOUT.drill[0], LAYOUT.drill[1]);
  }
  // 火星上升器：两级箭体 + 发射台、服务塔、脐带臂、推进剂储罐（模型见 craft.ts）
  const { group: mav, rocket } = mavModel(m);
  add(mav, LAYOUT.mav[0], LAYOUT.mav[1]);
  label(rocket, 'MAV', '火星上升器', 23);
  // 着陆器停在基地旁（着陆后保留）
  const landerRest = landerModel(m);
  add(landerRest, LAYOUT.lander[0], LAYOUT.lander[1]).rotation.y = 0.8;
  // 留守或失去乘员时的旗帜
  if (s.crew.some((c) => c.status === 'lost' || c.status === 'stayed')) {
    const flag = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 8), m.white);
    p.position.y = 2;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshStandardMaterial({ color: '#d62a1e', side: THREE.DoubleSide }));
    cloth.position.set(0.9, 3.4, 0);
    flag.add(p, cloth);
    add(flag, LAYOUT.flag[0], LAYOUT.flag[1]);
  }
  // 告警信标（风暴时闪烁）
  for (const [x, z] of [[-7.5, 3.6], [7.5, 3.6], [0, 13.5]]) {
    const b = glow('rgba(255,59,48,1)', 1.2);
    b.position.set(x, 7.5, z);
    beacons.push(b);
    group.add(b);
  }
  if (tier === 'high') group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group, windows, beacons, panels, drillBit, labels };
}
