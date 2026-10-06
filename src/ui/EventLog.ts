import type { GameState } from "../core/types";
import { escapeHtml } from "./format";
export function renderEventLog(root: HTMLElement, state: GameState): void {
  root.innerHTML =
    state.eventLog
      .slice(-8)
      .reverse()
      .map((line) => `<div class="event-line">${escapeHtml(line)}</div>`)
      .join("") || '<div class="event-line">等待第一个决定。</div>';
}
