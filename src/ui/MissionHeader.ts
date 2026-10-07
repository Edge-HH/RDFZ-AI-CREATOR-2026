import type { GameState } from "../core/types";
import { formatTime } from "./format";
export interface HeaderHandlers {
  onPause: () => void;
  onHelp: () => void;
  onSound: () => void;
  onAbort: () => void;
  muted: boolean;
}
export function renderMissionHeader(
  root: HTMLElement,
  state: GameState,
  handlers: HeaderHandlers,
): void {
  root.innerHTML = `<header class="mission-header"><div class="mission-title"><h1>灰环点火</h1><p>环弧—7 · 救援通信</p></div><div class="header-metrics"><span class="compact-metric"><small>剩余窗口</small><strong>${formatTime(state.resources.time)}</strong></span><span class="compact-metric"><small>能源</small><strong>${state.resources.energy}u</strong></span><button class="icon-button" data-action="pause" aria-label="${state.paused ? "继续任务" : "暂停任务"}">${state.paused ? "继续" : "暂停"}</button><details class="mission-menu"><summary>菜单</summary><div class="menu-options"><button data-action="help">玩法与科学说明</button><button data-action="sound">${handlers.muted ? "开启声音" : "静音"}</button><button data-action="abort">撤离并结算</button></div></details></div></header>`;
  for (const [action, handler] of Object.entries({
    pause: handlers.onPause,
    help: handlers.onHelp,
    sound: handlers.onSound,
    abort: handlers.onAbort,
  }))
    root
      .querySelector(`[data-action="${action}"]`)
      ?.addEventListener("click", () => {
        const menu = root.querySelector<HTMLDetailsElement>(".mission-menu");
        if (menu) menu.open = false;
        handler();
      });
}
