// 圆轨道近似下的地火几何：霍曼转移、光速延迟、日凌
// 简化：行星轨道视为共面圆轨道（火星真实偏心率 0.093，见 SCIENCE.md）

export const EARTH_PERIOD = 365.256; // 天
export const MARS_PERIOD = 686.98;
export const R_EARTH = 1.0; // AU
export const R_MARS = 1.524;
export const LIGHT_MIN_PER_AU = 8.3167;

const TAU = Math.PI * 2;
const W_E = TAU / EARTH_PERIOD;
const W_M = TAU / MARS_PERIOD;
const A_T = (R_EARTH + R_MARS) / 2; // 转移椭圆半长轴
const E_T = (R_MARS - R_EARTH) / (R_MARS + R_EARTH);

export const TRANSFER_DAYS = Math.round(0.5 * EARTH_PERIOD * Math.pow(A_T, 1.5));
const T = TRANSFER_DAYS;

// 发射时地球位于 0 弧度，火星相位使其在抵达时位于 π
const MARS_PHASE0 = Math.PI - W_M * T;

function stayDays(): number {
  const relArrive = W_E * T - Math.PI;
  const relDepart = Math.PI - W_E * T;
  let delta = (relDepart - relArrive) % TAU;
  if (delta < 0) delta += TAU;
  return Math.round(delta / (W_E - W_M));
}

export const STAY_DAYS = stayDays();
export const ARRIVAL_DAY = TRANSFER_DAYS;
export const DEPARTURE_DAY = ARRIVAL_DAY + STAY_DAYS;
export const RETURN_DAY = DEPARTURE_DAY + TRANSFER_DAYS;

export type Phase = 'earth' | 'cruise' | 'surface' | 'return' | 'home';

export function phaseOf(day: number): Phase {
  if (day < 0) return 'earth';
  if (day < ARRIVAL_DAY) return 'cruise';
  if (day < DEPARTURE_DAY) return 'surface';
  if (day < RETURN_DAY) return 'return';
  return 'home';
}

export interface Vec2 { x: number; y: number }

const polar = (r: number, a: number): Vec2 => ({ x: r * Math.cos(a), y: r * Math.sin(a) });

export function earthPos(day: number): Vec2 {
  return polar(R_EARTH, W_E * day);
}

export function marsPos(day: number): Vec2 {
  return polar(R_MARS, MARS_PHASE0 + W_M * day);
}

// 解开普勒方程 M = E - e sinE
function eccentricAnomaly(M: number): number {
  let E = M;
  for (let i = 0; i < 12; i++) E -= (E - E_T * Math.sin(E) - M) / (1 - E_T * Math.cos(E));
  return E;
}

// 沿转移椭圆的位置；fraction ∈ [0,1]，outbound 从近日点到远日点
function transferPos(fraction: number, outbound: boolean, startAngle: number): Vec2 {
  const M = Math.PI * fraction + (outbound ? 0 : Math.PI);
  const E = eccentricAnomaly(M);
  const r = A_T * (1 - E_T * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + E_T) * Math.sin(E / 2), Math.sqrt(1 - E_T) * Math.cos(E / 2));
  const sweep = outbound ? nu : nu - Math.PI;
  return polar(r, startAngle + (outbound ? sweep : (sweep < 0 ? sweep + TAU : sweep)));
}

// 飞船（或乘组）所在位置
export function crewPos(day: number): Vec2 {
  switch (phaseOf(day)) {
    case 'earth': return earthPos(Math.max(day, 0));
    case 'cruise': return transferPos(day / T, true, 0);
    case 'surface': return marsPos(day);
    case 'return': {
      const start = MARS_PHASE0 + W_M * DEPARTURE_DAY;
      return transferPos((day - DEPARTURE_DAY) / T, false, start);
    }
    default: return earthPos(day);
  }
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

export function lightDelayMinutes(day: number): number {
  if (day < 0) return 0;
  return dist(earthPos(day), crewPos(day)) * LIGHT_MIN_PER_AU;
}

// 从地球看，太阳与火星的夹角（度）；接近 0 即日凌
export function sunEarthMarsElongationDeg(day: number): number {
  const e = earthPos(day), m = marsPos(day);
  const toSun = { x: -e.x, y: -e.y };
  const toMars = { x: m.x - e.x, y: m.y - e.y };
  const cos = (toSun.x * toMars.x + toSun.y * toMars.y) / (Math.hypot(toSun.x, toSun.y) * Math.hypot(toMars.x, toMars.y));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

export const CONJUNCTION_LIMIT_DEG = 2;

export function isSolarConjunction(day: number): boolean {
  return phaseOf(day) === 'surface' && sunEarthMarsElongationDeg(day) < CONJUNCTION_LIMIT_DEG;
}

export const SOL_IN_DAYS = 1.02749;
export const solOf = (day: number) => Math.max(0, Math.floor((day - ARRIVAL_DAY) / SOL_IN_DAYS));

function findConjunction(): { start: number; end: number } {
  let start = -1;
  for (let day = ARRIVAL_DAY; day < DEPARTURE_DAY; day++) {
    const c = isSolarConjunction(day);
    if (c && start < 0) start = day;
    if (!c && start >= 0) return { start, end: day };
  }
  return { start: DEPARTURE_DAY, end: DEPARTURE_DAY };
}

const CONJ = findConjunction();
export const CONJUNCTION_START = CONJ.start;
export const CONJUNCTION_END = CONJ.end; // 首个恢复通信的日子

export function earthMarsDelayMinutes(day: number): number {
  return dist(earthPos(day), marsPos(day)) * LIGHT_MIN_PER_AU;
}
