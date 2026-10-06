import { getNode } from "../core/catalog";
import { requirementPassed } from "../core/rules";
import type { DialogueNode, GameState } from "../core/types";
import { escapeHtml } from "./format";
function message(speaker: string, text: string, player = false): string {
  return `<article class="dialogue-message ${player ? "player" : ""}"><div class="message-meta"><span class="speaker-dot ${player ? "" : "crew"}"></span><strong>${escapeHtml(speaker)}</strong></div><div class="message-bubble">${escapeHtml(text)}</div></article>`;
}
export function renderDialogueStream(
  root: HTMLElement,
  state: GameState,
  node?: DialogueNode,
): void {
  const history = state.decisions
    .map((record) => {
      const old = getNode(record.sceneId);
      return (
        message(old?.speaker ?? "现场", old?.text ?? "") +
        message("林岑", record.label, true) +
        (record.response ? message(record.speaker, record.response) : "")
      );
    })
    .join("");
  const showCurrent = state.phase !== "feedback";
  root.innerHTML =
    history +
    (showCurrent && node
      ? `<p class="scene-divider">${escapeHtml(node.title)}</p>` +
        message(node.speaker, node.text) +
        (node.lines ?? [])
          .filter((line) =>
            (line.requires ?? []).every((rule) =>
              requirementPassed(state, rule),
            ),
          )
          .map((line) => message(line.speaker, line.text))
          .join("")
      : "");
  root.scrollTop = root.scrollHeight;
}
export function renderDialogueHeading(
  root: HTMLElement,
  node?: DialogueNode,
): void {
  const heading = root.querySelector<HTMLElement>("[data-dialogue-heading]");
  if (heading)
    heading.textContent = node
      ? `第${node.act || "零"}幕 · ${node.channel}`
      : "通信频道";
}
