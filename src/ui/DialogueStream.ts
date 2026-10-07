import { getDecision, getNode } from "../core/catalog";
import { dialogueLines } from "../core/rules";
import type { DialogueNode, GameState } from "../core/types";
import { escapeHtml } from "./format";
function message(speaker: string, text: string, current = false): string {
  const player = speaker === "林岑";
  return `<article class="dialogue-message ${player ? "player" : ""} ${current ? "current-message" : "previous-message"}"><div class="message-meta"><span class="speaker-avatar" aria-hidden="true">${escapeHtml(speaker.slice(0, 1))}</span><strong>${escapeHtml(speaker)}</strong><span>${player ? "现场工程师 · 你" : "任务通信"}</span></div><p class="message-bubble" ${current ? 'data-current-dialogue="true"' : ""}>${escapeHtml(text)}</p></article>`;
}
/** Only two recent lines stay on stage. The full transcript lives in the log. */
export function renderDialogueStream(
  root: HTMLElement,
  state: GameState,
  node: DialogueNode,
): void {
  if (state.phase === "feedback" || state.phase === "execution") {
    const record = state.decisions.at(-1)!;
    const decision = getDecision(record.id);
    root.innerHTML =
      message(
        "林岑",
        decision?.reply ?? record.label,
        state.phase === "execution",
      ) +
      (record.response ? message(record.speaker, record.response, true) : "");
    return;
  }
  const lines = dialogueLines(state, node);
  const cursor = Math.min(state.dialogueCursor, lines.length - 1);
  root.dataset.cursor = String(cursor);
  root.innerHTML = lines
    .slice(Math.max(0, cursor - 1), cursor + 1)
    .map((line, index, visible) =>
      message(line.speaker, line.text, index === visible.length - 1),
    )
    .join("");
}
export function renderDialogueHistory(
  root: HTMLElement,
  state: GameState,
): void {
  root.innerHTML =
    state.decisions
      .map((record) => {
        const node = getNode(record.sceneId);
        const decision = getDecision(record.id);
        return (
          `<section class="history-chapter"><h3>${escapeHtml(node?.title ?? "现场任务")}</h3>` +
          (node
            ? dialogueLines(state, node)
                .map((line) => message(line.speaker, line.text))
                .join("")
            : "") +
          message("林岑", decision?.reply ?? record.label) +
          (record.response ? message(record.speaker, record.response) : "") +
          "</section>"
        );
      })
      .join("") ||
    '<p class="muted">完成第一项行动后，通信记录会保存在这里。</p>';
}
