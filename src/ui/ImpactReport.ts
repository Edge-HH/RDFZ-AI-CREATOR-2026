import { escapeHtml } from "./format";
export function renderImpactReport(
  root: HTMLElement,
  message = "",
  visible = Boolean(message),
): void {
  root.innerHTML = message
    ? `<strong>现场回传</strong><p>${escapeHtml(message)}</p>`
    : "";
  root.classList.toggle("visible", visible && Boolean(message));
}
