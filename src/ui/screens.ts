import type { Chapter } from '../core/content';
import { DOSE_LIMIT, rateMission, SCI_HIGH, type EndingId } from '../core/endings';
import type { HistoryEntry, MissionState, Mode } from '../core/types';
import { ARCHIVE, type ArchiveCard } from '../content/archive';
import { ENDINGS } from '../content/endings';
import { SERIES, historyChart } from './charts';
import { h, ICON, svg } from './dom';

export const REPO_URL = 'https://github.com/Edge-HH/RDFZ-AI-CREATOR-2026';

export const repoLink = (cls: string, withText: boolean) =>
  h(`a.${cls}`, { href: REPO_URL, target: '_blank', rel: 'noopener noreferrer', 'aria-label': '项目仓库（GitHub，新窗口打开）', title: '项目仓库' },
    svg(ICON.github), withText ? '项目仓库' : null);

const linkList = (a: ArchiveCard) => (a.links?.length
  ? h('div.links', {}, a.links.map((l) => h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, svg(ICON.link), l.label)))
  : null);

const archCard = (a: ArchiveCard, cls = '') =>
  h('div.arch', { class: cls }, h('h4', {}, a.title), h('p', {}, a.body), h('div.g', {}, `游戏中：${a.game}`), h('div.s', {}, `来源：${a.source}`), linkList(a));
import type { Settings } from './store';

function overlay(cls: string, ...children: HTMLElement[]): HTMLElement {
  const o = h(`div.${cls}`, { role: 'dialog', 'aria-modal': 'true' }, ...children);
  document.body.append(o);
  const first = o.querySelector<HTMLElement>('button');
  first?.focus({ preventScroll: true });
  return o;
}

export function titleScreen(opts: { hasSave: boolean; onNew: (mode: Mode) => void; onContinue: () => void; onArchive: () => void; onRules: () => void; onSettings: () => void }): HTMLElement {
  let mode: Mode = 'standard';
  const std = h('button.btn', { type: 'button', 'aria-pressed': 'true' }, '标准模式');
  const story = h('button.btn', { type: 'button', 'aria-pressed': 'false' }, '叙事模式');
  const setMode = (m: Mode) => { mode = m; std.setAttribute('aria-pressed', String(m === 'standard')); story.setAttribute('aria-pressed', String(m === 'story')); };
  std.addEventListener('click', () => setMode('standard'));
  story.addEventListener('click', () => setMode('story'));
  const o = overlay('title-screen', h('div.title-box', {},
    h('h1', {}, '光速之隔'),
    h('div.en', {}, 'THE LIGHT-MINUTE GAP · 火星首航'),
    h('p.pitch', {}, '2035 年，人类第一次载人火星任务。你是地球上的飞控总师。', h('br'), '火星上的每一句话，传到你耳边都要', h('em', {}, '十几分钟'), '。', h('br'), '你看到的一切，都是过去。'),
    h('div.menu', {},
      opts.hasSave ? h('button.btn.primary', { type: 'button', onclick: () => { o.remove(); opts.onContinue(); } }, svg(ICON.play), '继续任务') : null,
      h('div.mode-pick', {}, std, story),
      h('button.btn' + (opts.hasSave ? '' : '.primary'), { type: 'button', onclick: () => { o.remove(); opts.onNew(mode); } }, svg(ICON.play), opts.hasSave ? '开始新任务' : '开始任务'),
      h('div.hint', {}, '叙事模式：资源消耗与负面影响减半，适合想专注剧情的玩家。'),
      h('div.mode-pick', {},
        h('button.btn.ghost', { type: 'button', onclick: opts.onRules }, svg(ICON.info), '玩法与依据'),
        h('button.btn.ghost', { type: 'button', onclick: opts.onArchive }, svg(ICON.book), '知识档案集')),
      h('div.mode-pick', {},
        h('button.btn.ghost', { type: 'button', onclick: opts.onSettings }, svg(ICON.gear), '设置'),
        repoLink('btn.ghost', true))),
    h('p.foot-note', {}, '无需注册登录 · 不收集任何个人信息 · 完全离线运行', h('br'), '故事与人物为虚构；科学数据来自公开文献，详见“玩法与依据”。')));
  return o;
}

export function chapterCard(ch: Chapter, onGo: () => void): void {
  const o = overlay('overlay', h('div.chapter-card', {},
    h('div.k', {}, `CHAPTER ${ch.id}`),
    h('h2', {}, ch.title.replace(/^.*?·\s*/, '')),
    h('div.sub', {}, ch.subtitle),
    h('div.teach', {}, svg(ICON.info), ch.teach),
    h('div', {}, h('button.btn.primary', { type: 'button', onclick: () => { o.remove(); onGo(); } }, svg(ICON.next), '开始'))));
}

const diffCell = (label: string, a: number, b: number, unit = '', higherIsBetter = true) => {
  const d = b - a;
  const cls = Math.abs(d) < 0.5 ? '' : (d > 0) === higherIsBetter ? 'tag-ok' : 'tag-danger';
  return h('div.card', {}, h('div.k', {}, label), h('div.v', {}, `${Math.round(b)}${unit}`), h('div.hint', { class: cls }, `${d >= 0 ? '+' : ''}${Math.round(d)}${unit}`));
};

export function chapterEnd(ch: Chapter, start: HistoryEntry | undefined, s: MissionState, decisions: HistoryEntry[], onNext: () => void): void {
  const now = s.history.at(-1)?.snapshot;
  const a = start?.snapshot ?? now;
  const o = overlay('overlay', h('div.sheet.narrow', {},
    h('div.sheet-head', {}, h('div', {}, h('h2', {}, `${ch.title} · 结束`), h('p', {}, `任务第 ${s.day} 天`))),
    a && now ? h('div.summary-grid', {},
      diffCell('物资（最低项）', a.supplies, now.supplies, ' 天'),
      diffCell('乘员健康', a.crew, now.crew),
      diffCell('系统完好度', a.safety, now.safety, '%'),
      diffCell('平均剂量', a.dose, now.dose, ' mSv', false),
      diffCell('科研产出', a.science, now.science)) : null,
    h('h4', {}, '本章决策'),
    h('ul.decisions', {}, decisions.map((d) => h('li', { class: d.key ? 'key' : '' }, d.label.replace(/^.*? · /, '')))),
    h('div.sheet-foot', {}, h('span.spacer'), h('button.btn.primary', { type: 'button', onclick: () => { o.remove(); onNext(); } }, svg(ICON.next), '继续'))));
}

export function endingScreen(s: MissionState, ending: EndingId, newArchive: string[], onRetry: () => void, onTitle: () => void): void {
  const e = ENDINGS[ending];
  const rating = rateMission(s, ending);
  const chart = historyChart(s.history);
  const keys = s.history.filter((x) => x.key);
  const avgDose = s.crew.reduce((a, c) => a + c.dose, 0) / s.crew.length;
  const o = overlay('overlay', h('div.sheet', {},
    h('div.ending-hero', { class: `tone-${e.tone}` },
      h('div.grade', { 'aria-label': `评级 ${rating.grade}` }, rating.grade),
      h('h2', {}, e.title), h('div.epi', {}, e.epigraph)),
    h('div.two-col', {},
      h('div', {},
        h('div.ending-body', {}, e.body(s).map((p) => h('p', {}, p))),
        h('h4', {}, '任务报告'),
        h('div.summary-grid', {},
          h('div.card', {}, h('div.k', {}, '综合评分'), h('div.v', {}, `${rating.score}`)),
          ...rating.parts.map((p) => h('div.card', {}, h('div.k', {}, p.label), h('div.v', {}, `${p.value} / ${p.max}`)))),
        h('div.hint', {}, `科研产出 ${Math.round(s.science)}（满载线 ${SCI_HIGH}）· 平均剂量 ${Math.round(avgDose)} mSv（上限 ${DOSE_LIMIT}）· 任务种子 ${s.seed}`)),
      h('div', {},
        h('h4', {}, '五维资源曲线'), chart.svg, chart.legend,
        h('h4', {}, '关键转折'),
        h('ul.decisions', {}, keys.slice(-8).map((k) => h('li.key', {}, `第 ${k.day} 天 · ${k.label}`))))),
    h('h4', {}, `本局解锁的知识档案（${s.archive.length}）`),
    h('div.archive-grid', {}, s.archive.map((id) => ARCHIVE.find((a) => a.id === id)).filter(Boolean).map((a) => archCard(a!, newArchive.includes(a!.id) ? 'new' : ''))),
    h('div.sheet-foot', {},
      h('span.hint', {}, '换一个着陆点、能源路线或授权方式，故事会走向不同的结局。共 7 个结局。'), h('span.spacer'),
      h('button.btn', { type: 'button', onclick: () => { o.remove(); onTitle(); } }, '回到标题'),
      h('button.btn.primary', { type: 'button', onclick: () => { o.remove(); onRetry(); } }, svg(ICON.play), '再次挑战'))));
}

export function archiveScreen(unlocked: Set<string>, onClose: () => void): void {
  const o = overlay('overlay', h('div.sheet', {},
    h('div.sheet-head', {}, h('div', {}, h('h2', {}, `知识档案集 ${ARCHIVE.filter((a) => unlocked.has(a.id)).length} / ${ARCHIVE.length}`), h('p', {}, '在任务中做出相关决策、取得科研进展即可解锁。档案会跨局保存。'))),
    h('div.archive-grid', {}, ARCHIVE.map((a) => unlocked.has(a.id)
      ? archCard(a)
      : h('div.arch.locked', {}, h('h4', {}, '？？？'), h('p', {}, '尚未解锁')))),
    h('div.sheet-foot', {}, h('span.spacer'), h('button.btn.primary', { type: 'button', onclick: () => { o.remove(); onClose(); } }, '关闭'))));
}

// 新知识弹窗：取得科研进展或做出相关决策时展示
export function discoveryCard(a: ArchiveCard, index: number, total: number, onClose: () => void): void {
  const o = overlay('overlay', h('div.sheet.narrow.discovery', { 'aria-labelledby': 'disc-title' },
    h('div.disc-k', {}, svg(ICON.book), total > 1 ? `新知识 ${index}/${total}` : '新知识'),
    h('h3#disc-title', {}, a.title),
    h('p.disc-body', {}, a.body),
    h('div.g', {}, `游戏中：${a.game}`),
    h('div.s', {}, `来源：${a.source}`),
    linkList(a),
    h('div.sheet-foot', {}, h('span.hint', {}, '已同步收入「知识档案集」，可随时在顶栏查看。'), h('span.spacer'),
      h('button.btn.primary', { type: 'button', onclick: () => { o.remove(); onClose(); } }, svg(ICON.check), '收入知识档案集'))));
}

export function rulesScreen(onClose: () => void): void {
  const sec = (title: string, ...ps: (string | HTMLElement)[]) => h('section', {}, h('h4', {}, title), ...ps.map((p) => (typeof p === 'string' ? h('p', {}, p) : p)));
  const o = overlay('overlay', h('div.sheet.narrow', {},
    h('div.sheet-head', {}, h('div', {}, h('h2', {}, '玩法与依据'))),
    sec('你是谁', '你是北京航天飞控中心的总师，指挥 2035 年首次载人火星任务“祝融一号”。四名乘员的命运，取决于你在序章与五个章节里做出的二十多个决定。'),
    sec('五维资源', '时间（发射窗口、返程窗口、日凌）、能源（发电与储能）、物资（氧、水、食物、备件）、人员（健康、士气、信任）、安全（系统完好度与累计辐射剂量）。资源跨章延续：第一章的配载会影响到返程那一天。'),
    sec('光速之隔', '火星上的消息都标注了“火星时间 T−xx”。风险判断显示为一个区间：延迟越久、预警设备越少，区间越宽。'),
    sec('三个核心机制', h('ul', {},
      h('li', {}, '取舍：12 个配载槽位，永远装不下所有东西。'),
      h('li', {}, '预案卡：在通信盲区（着陆七分钟、日凌两周）之前写下“若……则……”。'),
      h('li', {}, '授权度：放手越多，乘组越果断，但也可能做出你不认同的决定。'))),
    sec('结局', '共 7 个结局，按“乘员状态 × 科研产出 × 是否返回”判定，另有 S–D 评级。每局结束后可以立即重新挑战。'),
    sec('科学依据', '轨道、延迟、日凌由圆轨道模型实时计算；辐射剂量率取自好奇号 RAD 实测；沙尘暴参照 2018 年全球沙尘暴；制氧、裂变电源、萨巴蒂尔反应等均有公开资料。每张知识档案都附有来源与链接，完整数据见项目仓库中的 docs/SCIENCE.md。', h('p', {}, repoLink('btn.ghost', true))),
    sec('声明', '人物与“远航一号”等情节为虚构。本游戏只使用火星地图，不涉及中国地图。无需注册登录，不收集任何个人信息，存档仅保存在你自己的浏览器里。'),
    h('div.sheet-foot', {}, h('span.spacer'), h('button.btn.primary', { type: 'button', onclick: () => { o.remove(); onClose(); } }, '知道了'))));
}

export function settingsScreen(settings: Settings, onChange: (s: Settings) => void, onClose: () => void): void {
  const s = { ...settings };
  const seg = <K extends keyof Settings>(key: K, items: [Settings[K], string][]) => {
    const btns = items.map(([v, label]) => {
      const b = h('button.btn', { type: 'button', 'aria-pressed': String(s[key] === v) }, label);
      b.addEventListener('click', () => { s[key] = v; btns.forEach((x, i) => x.setAttribute('aria-pressed', String(items[i][0] === v))); onChange({ ...s }); });
      return b;
    });
    return h('div.seg', {}, btns);
  };
  const o = overlay('overlay', h('div.sheet.narrow', {},
    h('div.sheet-head', {}, h('div', {}, h('h2', {}, '设置'))),
    h('div.settings', {},
      h('div', {}, h('div.hint', {}, '画质（低配设备请选“低”或“关闭 3D”）'), seg('quality', [['auto', '自动'], ['high', '高'], ['medium', '中'], ['low', '低'], ['off', '关闭 3D']])),
      h('div', {}, h('div.hint', {}, '对话速度'), seg('speed', [['slow', '慢'], ['normal', '正常'], ['fast', '快']])),
      h('div', {}, h('div.hint', {}, '配音'), seg('voice', [[true, '开'], [false, '关']])),
      h('div', {}, h('div.hint', {}, '音效与环境音'), seg('sfx', [[true, '开'], [false, '关']]))),
    h('div.sheet-foot', {}, h('span.spacer'), h('button.btn.primary', { type: 'button', onclick: () => { o.remove(); onClose(); } }, '完成'))));
}

export function toast(text: string): void {
  const t = h('div.toast', { role: 'status' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

export { SERIES };
