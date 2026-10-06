import type { GameState } from "../core/types";
import { formatTime } from "./format";
export interface HeaderHandlers {
  onPause: () => void;
  onHelp: () => void;
  onSound: () => void;
  muted: boolean;
}
export function renderMissionHeader(
  root: HTMLElement,
  state: GameState,
  handlers: HeaderHandlers,
): void {
  root.innerHTML = `<header class="mission-header"><div class="mission-title"><h1>灰环点火</h1><p>环弧—7 救援协议</p></div><div class="header-metrics"><div class="header-metric"><small>任务窗口</small><strong>${formatTime(state.resources.time)}</strong></div><div class="header-metric"><small>完成进度</small><strong>${Math.round(state.resources.progress)}%</strong></div><span class="status-pill ${state.commsConfidence < 45 ? "warning" : ""}">${state.commsConfidence < 45 ? "通信盲区" : "链路稳定"}</span><button class="icon-button" data-action="sound" aria-label="${handlers.muted ? "开启声音" : "静音"}">${handlers.muted ? "音关" : "音开"}</button><button class="icon-button" data-action="help" aria-label="玩法说明">帮助</button><button class="icon-button" data-action="pause" aria-label="${state.paused ? "继续任务" : "暂停任务"}">${state.paused ? "继续" : "暂停"}</button></div></header>`;
  root
    .querySelector('[data-action="pause"]')
    ?.addEventListener("click", handlers.onPause);
  root
    .querySelector('[data-action="help"]')
    ?.addEventListener("click", handlers.onHelp);
  root
    .querySelector('[data-action="sound"]')
    ?.addEventListener("click", handlers.onSound);
}
