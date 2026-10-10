import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];

const UP = new THREE.Vector3(0, 1, 0);

// 零件合并器：静态零件按材质合并成一个网格。细节可以做得很多，绘制调用却只随材质数增长
export class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private mtx = new THREE.Matrix4();

  // r 可以是欧拉角数组（XYZ 顺序）或现成的欧拉角/四元数
  add(geo: THREE.BufferGeometry, mat: THREE.Material, p: V3 = [0, 0, 0], r: V3 | THREE.Euler | THREE.Quaternion = [0, 0, 0], s: V3 | number = 1): this {
    const q = r instanceof THREE.Quaternion ? r : new THREE.Quaternion().setFromEuler(r instanceof THREE.Euler ? r : new THREE.Euler(...r));
    const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
    return this.addMatrix(geo, mat, this.mtx.compose(new THREE.Vector3(...p), q, sc));
  }

  addMatrix(geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    g.clearGroups();
    g.applyMatrix4(m);
    const list = this.parts.get(mat) ?? [];
    list.push(g);
    this.parts.set(mat, list);
    return this;
  }

  // 两点之间的杆件（圆柱）。r2 为终点半径，可做成锥形
  rod(a: V3, b: V3, r: number, mat: THREE.Material, seg = 8, r2 = r): this {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
    const mid = va.add(vb).multiplyScalar(0.5);
    return this.add(new THREE.CylinderGeometry(r2, r, len, seg, 1), mat, [mid.x, mid.y, mid.z], q);
  }

  build(): THREE.Group {
    const g = new THREE.Group();
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const p of list) p.dispose();
      if (merged) g.add(new THREE.Mesh(merged, mat));
    }
    this.parts.clear();
    return g;
  }
}

// 旋转体轮廓：[半径, 高度] 列表，绕 y 轴旋转
export const lathe = (pts: [number, number][], seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// 极坐标定位：角度 a（自 +x 轴起，逆时针朝 +z）与半径 r
export const polar = (a: number, r: number, y: number): V3 => [Math.cos(a) * r, y, Math.sin(a) * r];

// 贴在旋转体侧面的零件朝向：先绕 y 转到角度 a（零件正面朝外），再按 tilt 向轴线倾斜
export const facing = (a: number, tilt = 0) => new THREE.Euler(-tilt, Math.PI / 2 - a, 0, 'YXZ');
