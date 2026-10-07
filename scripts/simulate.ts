// 蒙特卡洛平衡测试：npm run simulate -- --runs 10000
import { CHAPTERS } from '../src/content';
import { MODULES } from '../src/content/modules';
import { rateMission, type EndingId } from '../src/core/endings';
import { autoplay, heuristicPolicy, novicePolicy, randomPolicy, type AutoplayResult } from '../src/sim/autoplay';

const arg = (name: string, def: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const RUNS = arg('runs', 4000);
const ENDINGS: EndingId[] = ['triumph', 'letgo', 'safe', 'stayed', 'cost', 'abort', 'silent'];
const pct = (n: number, d: number) => `${((n / Math.max(1, d)) * 100).toFixed(1)}%`.padStart(6);

function report(name: string, results: AutoplayResult[]) {
  const n = results.length;
  console.log(`\n=== ${name}（${n} 局）===`);
  const count = (f: (r: AutoplayResult) => boolean) => results.filter(f).length;
  console.log('结局：' + ENDINGS.map((e) => `${e} ${pct(count((r) => r.ending === e), n)}`).join(' | '));
  const grades = results.map((r) => rateMission(r.state, r.ending).grade);
  console.log('评级：' + ['S', 'A', 'B', 'C', 'D'].map((g) => `${g} ${pct(grades.filter((x) => x === g).length, n)}`).join(' | '));
  const fails = count((r) => r.ending === 'abort' || r.ending === 'silent');
  console.log(`失败类（中止+寂静）：${pct(fails, n)}　满载而归：${pct(count((r) => r.ending === 'triumph'), n)}`);
  const sci = results.map((r) => r.state.science).sort((a, b) => a - b);
  console.log(`科研产出 P25/P50/P75/P90：${[0.25, 0.5, 0.75, 0.9].map((q) => Math.round(sci[Math.floor(q * (n - 1))])).join(' / ')}`);
  const dose = results.map((r) => r.state.crew.reduce((a, c) => a + c.dose, 0) / 4).sort((a, b) => a - b);
  console.log(`平均剂量 P50/P90：${Math.round(dose[Math.floor(n / 2)])} / ${Math.round(dose[Math.floor(n * 0.9)])} mSv`);
  const good = (r: AutoplayResult) => ['triumph', 'letgo'].includes(r.ending);
  const base = count(good) / n;
  const byKey = (label: string, keyOf: (r: AutoplayResult) => string) => {
    const groups = new Map<string, AutoplayResult[]>();
    for (const r of results) groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r]);
    console.log(label + [...groups].map(([k, rs]) => `${k} ${pct(rs.filter(good).length, rs.length)}(S ${pct(rs.filter((r) => rateMission(r.state, r.ending).grade === 'S').length, rs.length)})`).join(' | '));
  };
  byKey('按着陆点 最佳结局率：', (r) => r.state.site ?? '-');
  byKey('按能源路线：', (r) => (r.state.loadout.includes('fission') ? (r.state.loadout.some((m) => m.startsWith('solar')) ? 'hybrid' : 'fission') : 'solar'));
  const lines: string[] = [];
  for (const m of MODULES) {
    const w = results.filter((r) => r.state.loadout.includes(m.id));
    const wo = results.filter((r) => !r.state.loadout.includes(m.id));
    if (w.length < 30 || wo.length < 30) continue;
    const delta = w.filter(good).length / w.length - wo.filter(good).length / wo.length;
    lines.push(`${m.id} ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}`);
  }
  console.log(`模块对最佳结局率的影响（百分点，基线 ${(base * 100).toFixed(1)}%）：` + lines.join(' | '));
}

const t0 = Date.now();
const heur = Array.from({ length: RUNS }, (_, i) => autoplay(CHAPTERS, i + 1, heuristicPolicy));
const rand = Array.from({ length: RUNS }, (_, i) => autoplay(CHAPTERS, i + 1, randomPolicy));
const novice = Array.from({ length: RUNS }, (_, i) => autoplay(CHAPTERS, i + 1, novicePolicy));
report('新手策略（首局玩家近似：35% 凭直觉）★ 平衡目标', novice);
report('启发式策略（认真玩家）', heur);
report('随机策略', rand);
console.log(`\n耗时 ${((Date.now() - t0) / 1000).toFixed(1)} s`);
