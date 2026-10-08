import * as THREE from 'three';

// 笨笨：营地的四足搬运机器人（致敬《流浪地球》）。机头朝 +x，返回身体与四个髋关节
// 模型与动作原样迁自原 scenes.ts（彩蛋会话 6b6eac6），只把巡检行为封装成函数
export interface Benben { body: THREE.Group; hips: THREE.Group[] }

export function benbenModel(): Benben {
  const shell = new THREE.MeshStandardMaterial({ color: '#e9ecef', roughness: 0.55, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.7, metalness: 0.3 });
  const body = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.2), shell);
  torso.position.y = 1.6;
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1), dark); // 背上的货箱
  cargo.position.y = 2.3;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.8), shell);
  head.position.set(1.3, 1.8, 0);
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ color: '#7fd1ff' }));
  lamp.position.set(1.56, 1.85, 0);
  lamp.rotation.y = Math.PI / 2;
  body.add(torso, cargo, head, lamp);
  const hips = [[0.8, 0.6], [0.8, -0.6], [-0.8, 0.6], [-0.8, -0.6]].map(([x, z]) => {
    const hip = new THREE.Group();
    hip.position.set(x, 1.4, z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 1.4, 8), dark);
    leg.position.y = -0.7;
    hip.add(leg);
    body.add(hip);
    return hip;
  });
  return { body, hips };
}

// 巡检路线：沿 z = -11 往返，x ∈ [-18, 10]。
// 新布局下依然不穿模：居住舱 |z| ≤ 3.4，通信天线杆在 (-10, -6)、半径 1，太阳能阵列 z ≤ -18，冰钻在 (24, -10)。
export const BENBEN_Z = -11;

export function patrolBenben(b: Benben, t: number, heightAt: (x: number, z: number) => number): void {
  // 在居住舱与太阳能板之间来回巡检，走到两端时原地掉头
  const x = -4 + 14 * Math.sin(t * 0.07);
  const v = Math.cos(t * 0.07);
  b.body.position.set(x, heightAt(x, BENBEN_Z), BENBEN_Z);
  b.body.rotation.y = (1 - Math.max(-1, Math.min(1, v * 4))) * (Math.PI / 2);
  b.hips.forEach((hip, i) => { hip.rotation.z = Math.sin(t * 6 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.45 * Math.abs(v); });
}
