import {
  applyEffects,
  decisionCheck,
  decisionPreview,
  effectLabel,
  resolveEvent,
} from "../core/rules";
import type { Allocation, Decision, GameState } from "../core/types";
import { escapeHtml } from "./format";
export interface DecisionHandlers {
  onPreview: (decision: Decision) => void;
  onConfirm: (decision: Decision) => void;
  onAllocate: (allocation: Partial<Allocation>) => void;
}
export function renderDecisionDock(
  root: HTMLElement,
  state: GameState,
  decisions: Decision[],
  selected: Decision | undefined,
  handlers: DecisionHandlers,
): void {
  const locked = state.phase === "execution" || state.paused;
  const cards = decisions
    .map((decision, index) => {
      const check = decisionCheck(state, decision);
      return `<button class="decision-card ${selected?.id === decision.id ? "selected" : ""}" data-decision="${decision.id}" aria-pressed="${selected?.id === decision.id}" ${locked ? "disabled" : ""}>
  <span class="decision-title"><span class="muted">0${index + 1} · </span>${escapeHtml(decision.label)}</span><span class="decision-intent">${escapeHtml(decision.intent)}</span>
  <span class="decision-preview">${escapeHtml(decision.preview)}</span>${check.allowed ? "" : `<span class="decision-missing">${escapeHtml(check.missing.join("；"))}</span>`}</button>`;
    })
    .join("");
  const check = selected ? decisionCheck(state, selected) : undefined;
  const preview = selected
    ? decisionPreview(state, selected)
        .map(effectLabel)
        .filter(Boolean)
        .join(" · ")
    : "阅读通信、选择行动，再分配保障能源与负责人。";
  const risk = selected
    ? Math.round(
        resolveEvent(
          applyEffects(state, decisionPreview(state, selected)),
          selected,
        ).risk * 100,
      )
    : 0;
  root.innerHTML = `<div class="panel-heading"><span>${locked ? "执行中 · 方案已锁定" : "现场行动"}</span><span>选择 → 预览 → 确认</span></div><div class="decision-body"><div class="decision-grid">${cards}</div>
 <div class="allocation"><label for="support-energy">保障能源 <output>${state.allocation.supportEnergy} 单位</output><input id="support-energy" type="range" min="0" max="8" step="4" value="${state.allocation.supportEnergy}" ${locked ? "disabled" : ""}></label><p>每投入 4 能源：安全 +2，降低事件风险 5 个百分点。</p>
 <label for="specialist">本次负责人<select id="specialist" ${locked ? "disabled" : ""}>${Object.values(
   state.crew,
 )
   .map(
     (member) =>
       `<option value="${member.id}" ${member.id === state.allocation.specialist ? "selected" : ""} ${member.available ? "" : "disabled"}>${member.name} · ${member.role}（疲劳 ${member.fatigue}）</option>`,
   )
   .join("")}</select></label></div>
 <div class="decision-footer"><div class="selected-preview" role="status">${escapeHtml(preview)}${selected ? `<br><span>事件风险约 ${risk}%；参数随路线、准备和疲劳变化。</span>` : ""}${check && !check.allowed ? `<br><span class="decision-missing">${escapeHtml(check.missing.join("；"))}</span>` : ""}</div><button class="action-button" data-action="confirm" ${check?.allowed && !locked ? "" : "disabled"}>${locked ? "正在执行…" : "确认执行"}</button></div></div>`;
  root
    .querySelectorAll<HTMLButtonElement>("[data-decision]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        const decision = decisions.find(
          (item) => item.id === button.dataset.decision,
        );
        if (decision) handlers.onPreview(decision);
      }),
    );
  root
    .querySelector<HTMLButtonElement>('[data-action="confirm"]')
    ?.addEventListener("click", () => {
      if (selected && check?.allowed && !locked) handlers.onConfirm(selected);
    });
  root
    .querySelector<HTMLInputElement>("#support-energy")
    ?.addEventListener("change", (event) =>
      handlers.onAllocate({
        supportEnergy: Number((event.target as HTMLInputElement).value),
      }),
    );
  root
    .querySelector<HTMLSelectElement>("#specialist")
    ?.addEventListener("change", (event) =>
      handlers.onAllocate({
        specialist: (event.target as HTMLSelectElement)
          .value as Allocation["specialist"],
      }),
    );
}
