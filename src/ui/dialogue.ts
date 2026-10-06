import { SPEAKERS, type Line } from '../story/story';
import { esc } from './format';

/**
 * 视觉小说式对话框：逐字显示，点击 / 空格 / 回车 继续，可跳过整段。
 * 每句开始时回调 onLine，由 App 负责切换镜头、高亮地点与界面元素。
 */
export class Dialogue {
  private queue: Line[] = [];
  private current: Line | null = null;
  private shown = 0;
  private timer = 0;
  private autoTimer = 0;
  private done: (() => void) | null = null;
  private textEl: HTMLElement;

  constructor(
    private root: HTMLElement,
    private onLine: (l: Line | null) => void,
  ) {
    root.innerHTML = `
      <div class="dlg__portrait" aria-hidden="true"></div>
      <div class="dlg__main">
        <div class="dlg__who"><b class="dlg__name"></b><span class="dlg__role"></span></div>
        <p class="dlg__text" aria-live="polite"></p>
      </div>
      <div class="dlg__ctrl">
        <button type="button" class="dlg__skip" data-dlg="skip">跳过 ⏭</button>
        <span class="dlg__next" aria-hidden="true">▼</span>
      </div>`;
    this.textEl = root.querySelector('.dlg__text')!;
    root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-dlg="skip"]')) return this.skip();
      this.advance();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea')) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        this.advance();
      } else if (e.key === 'Escape') this.skip();
    });
  }

  get active(): boolean {
    return this.current !== null;
  }

  play(lines: Line[]): Promise<void> {
    if (!lines.length) return Promise.resolve();
    // 正在播放时追加到队尾
    if (this.active) {
      this.queue.push(...lines);
      return new Promise((resolve) => {
        const prev = this.done;
        this.done = () => {
          prev?.();
          resolve();
        };
      });
    }
    this.queue = [...lines];
    return new Promise((resolve) => {
      this.done = resolve;
      this.root.hidden = false;
      document.body.classList.add('is-talking');
      this.show(this.queue.shift()!);
    });
  }

  private show(l: Line) {
    this.current = l;
    this.shown = 0;
    const sp = SPEAKERS[l.who];
    this.root.dataset.who = l.who;
    this.root.querySelector('.dlg__name')!.textContent = sp.name;
    this.root.querySelector('.dlg__role')!.textContent = sp.role;
    this.root.querySelector('.dlg__portrait')!.innerHTML = portrait(l.who);
    this.textEl.textContent = '';
    this.root.classList.remove('is-ready');
    this.onLine(l);
    clearInterval(this.timer);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return this.finishTyping();
    this.timer = window.setInterval(() => {
      this.shown += 1;
      this.textEl.textContent = l.text.slice(0, this.shown);
      if (this.shown >= l.text.length) this.finishTyping();
    }, 26);
  }

  private finishTyping() {
    clearInterval(this.timer);
    clearTimeout(this.autoTimer);
    if (this.current) this.textEl.innerHTML = esc(this.current.text);
    this.shown = this.current?.text.length ?? 0;
    this.root.classList.add('is-ready');
    this.autoTimer = window.setTimeout(() => this.advance(), 1650);
  }

  advance() {
    if (!this.current) return;
    clearTimeout(this.autoTimer);
    if (this.shown < this.current.text.length) return this.finishTyping();
    const next = this.queue.shift();
    if (next) this.show(next);
    else this.end();
  }

  skip() {
    if (!this.current) return;
    clearTimeout(this.autoTimer);
    // 跳过时仍执行剩余台词的镜头/焦点，保证画面停在剧情应有的位置
    const rest = this.queue.filter((l) => l.shot || l.focus !== undefined);
    const last = rest[rest.length - 1];
    if (last) this.onLine({ ...last, hl: undefined });
    this.queue = [];
    this.end();
  }

  private end() {
    clearInterval(this.timer);
    clearTimeout(this.autoTimer);
    this.current = null;
    this.root.hidden = true;
    document.body.classList.remove('is-talking');
    this.onLine(null);
    const d = this.done;
    this.done = null;
    d?.();
  }
}

export function portrait(who: Line['who']): string {
  switch (who) {
    case 'luna':
      return `<svg viewBox="0 0 64 64"><defs><radialGradient id="pl" cx="40%" cy="35%"><stop offset="0" stop-color="#f4f0ff"/><stop offset=".45" stop-color="#b9a3ff"/><stop offset="1" stop-color="#3a2a7a"/></radialGradient></defs><circle cx="32" cy="32" r="30" fill="#140f2a"/><circle cx="32" cy="32" r="17" fill="url(#pl)"/><circle cx="32" cy="32" r="24" fill="none" stroke="#b9a3ff" stroke-opacity=".5" stroke-dasharray="3 5"/></svg>`;
    case 'lin':
      return helmet('#ffb066', '林');
    case 'su':
      return helmet('#6be3a4', '苏');
    case 'ground':
      return `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#0f1a2a"/><circle cx="32" cy="34" r="13" fill="#2f6fd0"/><path d="M22 30c4-3 8 2 11-1s7 1 9 4M24 40c3-2 6 1 9-1" stroke="#6bd38a" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M14 18a24 24 0 0 1 36 0M19 22a17 17 0 0 1 26 0" stroke="#7fd8ff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
    default:
      return '';
  }
}

function helmet(color: string, ch: string): string {
  return `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#141b2b"/><circle cx="32" cy="30" r="19" fill="#e8e4dc"/><rect x="18" y="22" width="28" height="15" rx="7.5" fill="#1b2438"/><rect x="20" y="24" width="10" height="4" rx="2" fill="${color}" opacity=".7"/><path d="M14 54c4-8 11-11 18-11s14 3 18 11" fill="#e8e4dc"/><circle cx="32" cy="50" r="5" fill="${color}"/><text x="32" y="53" font-size="7" text-anchor="middle" fill="#111" font-weight="700">${ch}</text><circle cx="32" cy="32" r="30" fill="none" stroke="${color}" stroke-width="2"/></svg>`;
}
