/**
 * 示意地形（简化模型）。
 *
 * 地形为原创程序化高度场，参照月球南极“环形山—连接脊—高地”的空间关系：
 * 一个深环形山（内部为永久阴影区）、一条高耸的阳照脊、以及两者之间的平缓高地。
 * 水平与垂直使用同一比例（1 场景单位 = 125 m），不做垂直夸张，坡度数值可直接计算。
 *
 * 该模块不依赖 Three.js，供场景渲染与规则引擎（光照窗口计算）共用。
 */

export const WORLD_SIZE = 160; // 场景单位
export const METERS_PER_UNIT = 125; // 1 单位 = 125 m，整幅地图约 20 km × 20 km
export const SUN_ELEVATION_DEG = 1.5; // 南极附近太阳高度角通常不超过约 1.5°（科学事实）
export const SYNODIC_DAYS = 29.53; // 朔望月长度（地球日）

export type LocationId = 'core' | 'psr' | 'ridge' | 'relay' | 'station' | 'undercity';

export interface WorldLocation {
  id: LocationId;
  x: number;
  z: number;
  /** 高出地面的偏移（空间站在轨道上；地下城在地表以下） */
  yOffset: number;
}

function hash(ix: number, iz: number): number {
  let h = ix * 374761393 + iz * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 100000;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

function fbm(x: number, z: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    sum += amp * (valueNoise(x * freq, z * freq) - 0.5);
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum;
}

/** 主环形山（永久阴影区所在） */
export const CRATER = { x: -40, z: 26, radius: 36, depth: 24, rim: 4 };
/** 阳照能源脊：一条从东南向东北延伸的高脊 */
const RIDGE = { ax: 18, az: -58, bx: 46, bz: 30, width: 18, height: 15 };
/** 小型撞击坑，增加地貌层次 */
const SMALL_CRATERS = [
  { x: 30, z: 52, radius: 9, depth: 5, rim: 1.5 },
  { x: -50, z: -45, radius: 12, depth: 6, rim: 2 },
  { x: -8, z: -30, radius: 6, depth: 3, rim: 1 },
];

function craterProfile(d: number, radius: number, depth: number, rim: number): number {
  const r = d / radius;
  let h = 0;
  if (r < 1) h -= depth * 0.5 * (1 + Math.cos(Math.PI * r));
  h += rim * Math.exp(-(((d - radius) / (radius * 0.22)) ** 2));
  return h;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)));
  const cx = ax + vx * t;
  const cz = az + vz * t;
  return Math.hypot(px - cx, pz - cz);
}

/** 地表高度（场景单位） */
export function heightAt(x: number, z: number): number {
  let h = fbm(x * 0.035, z * 0.035) * 5 + fbm(x * 0.12 + 7, z * 0.12 - 3) * 0.9;
  h += craterProfile(Math.hypot(x - CRATER.x, z - CRATER.z), CRATER.radius, CRATER.depth, CRATER.rim);
  for (const c of SMALL_CRATERS) h += craterProfile(Math.hypot(x - c.x, z - c.z), c.radius, c.depth, c.rim);
  const dr = distToSegment(x, z, RIDGE.ax, RIDGE.az, RIDGE.bx, RIDGE.bz);
  h += RIDGE.height * Math.exp(-((dr / RIDGE.width) ** 2));
  // 地图边缘缓降，便于剖切展示
  const edge = Math.max(Math.abs(x), Math.abs(z)) / (WORLD_SIZE / 2);
  if (edge > 0.85) h -= (edge - 0.85) * 20;
  return h;
}

/** 坡度（度），中心差分 */
export function slopeAt(x: number, z: number): number {
  const e = 1.5;
  const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
}

export const LOCATIONS: Record<LocationId, WorldLocation> = {
  core: { id: 'core', x: -5, z: 15, yOffset: 0 },
  psr: { id: 'psr', x: -38, z: 24, yOffset: 0 },
  ridge: { id: 'ridge', x: 33, z: -14, yOffset: 0 },
  relay: { id: 'relay', x: 44, z: 24, yOffset: 0 },
  station: { id: 'station', x: 0, z: 0, yOffset: 70 },
  undercity: { id: 'undercity', x: -5, z: 15, yOffset: -12 },
};

export function surfacePoint(id: LocationId): { x: number; y: number; z: number } {
  const l = LOCATIONS[id];
  return { x: l.x, y: heightAt(l.x, l.z) + l.yOffset, z: l.z };
}

/** 两地点间沿地表的路线（直线投影 + 采样），返回路线点与长度（km） */
export function routeBetween(a: LocationId, b: LocationId, samples = 48): { points: { x: number; y: number; z: number }[]; km: number; maxSlope: number } {
  const A = LOCATIONS[a];
  const B = LOCATIONS[b];
  const points: { x: number; y: number; z: number }[] = [];
  let len = 0;
  let maxSlope = 0;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    // 轻微弯曲，模拟绕行
    const bend = Math.sin(t * Math.PI) * 6;
    const nx = -(B.z - A.z);
    const nz = B.x - A.x;
    const nl = Math.hypot(nx, nz) || 1;
    const x = A.x + (B.x - A.x) * t + (nx / nl) * bend;
    const z = A.z + (B.z - A.z) * t + (nz / nl) * bend;
    const p = { x, y: heightAt(x, z), z };
    if (points.length) {
      const q = points[points.length - 1];
      len += Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    }
    maxSlope = Math.max(maxSlope, slopeAt(x, z));
    points.push(p);
  }
  return { points, km: (len * METERS_PER_UNIT) / 1000, maxSlope };
}

/** 给定月面日（可为小数）的太阳方位角（弧度）：太阳约每个朔望月绕地平线一周 */
export function sunAzimuth(day: number): number {
  return ((day / SYNODIC_DAYS) * Math.PI * 2 + 0.6) % (Math.PI * 2);
}

/** 某点在某天是否被太阳照到：沿太阳方向步进，检查地形是否高于视线 */
export function isSunlit(x: number, z: number, day: number, mastHeight = 0.4): boolean {
  const az = sunAzimuth(day);
  const dx = Math.cos(az);
  const dz = Math.sin(az);
  const tanEl = Math.tan((SUN_ELEVATION_DEG * Math.PI) / 180);
  const h0 = heightAt(x, z) + mastHeight;
  for (let s = 1; s < 220; s += 1) {
    const px = x + dx * s;
    const pz = z + dz * s;
    if (Math.abs(px) > 120 || Math.abs(pz) > 120) break;
    if (heightAt(px, pz) > h0 + s * tanEl) return false;
  }
  return true;
}

/** 某地点在 [fromDay, toDay) 内的受照比例（按 0.5 日采样） */
export function sunlitFraction(id: LocationId, fromDay: number, toDay: number): number {
  const l = LOCATIONS[id];
  if (id === 'station') return 1;
  if (id === 'undercity') return 0;
  let lit = 0;
  let n = 0;
  for (let d = fromDay; d < toDay; d += 0.5) {
    n++;
    if (isSunlit(l.x, l.z, d)) lit++;
  }
  return n ? lit / n : 0;
}

/** 30 个月面日的逐日光照窗口 */
export function lightWindow(id: LocationId, days = 30): boolean[] {
  const l = LOCATIONS[id];
  const out: boolean[] = [];
  for (let d = 0; d < days; d++) {
    if (id === 'station') out.push(true);
    else if (id === 'undercity') out.push(false);
    else out.push(isSunlit(l.x, l.z, d + 0.5));
  }
  return out;
}
