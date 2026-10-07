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
  onCancel: () => void;
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
      if (selected && selected.id !== decision.id) return "";
      const route = decision.id.startsWith("route-select-")
        ? decision.id.endsWith("south")
          ? "south"
          : "west"
        : undefined;
      const check = decisionCheck(
        route ? { ...state, selectedRoute: route } : state,
        decision,
      );
      return `<button class="decision-card ${selected?.id === decision.id ? "selected" : ""}" data-decision="${decision.id}" aria-pressed="${selected?.id === decision.id}" ${locked ? "disabled" : ""}>
  <span class="choice-number" aria-hidden="true">${index + 1}</span><span class="decision-title">${escapeHtml(decision.reply ?? decision.label)}</span>${check.allowed ? "" : `<span class="decision-missing">${escapeHtml(check.missing.join("；"))}</span>`}</button>`;
    })
    .join("");
  const check = selected ? decisionCheck(state, selected) : undefined;
  const preview = selected
    ? decisionPreview(state, selected)
        .filter((effect) => effect.key !== "progress")
        .map(effectLabel)
        .filter(Boolean)
        .join(" · ")
    : "";
  const risk =
    selected &&
    ["ice-event", "steam-event", "mount", "ignition"].includes(state.sceneId)
      ? Math.round(
          resolveEvent(
            applyEffects(state, decisionPreview(state, selected)),
            selected,
          ).risk * 100,
        )
      : undefined;
  const allocationOpen = root.querySelector<HTMLDetailsElement>(
    ".allocation-details",
  )?.open;
  root.innerHTML = `<div class="decision-body"><p class="response-prompt">${selected ? "即将下达的回应" : "你如何回应？"}</p><div class="decision-grid">${cards}</div>
 ${
   selected
     ? `<section class="choice-review"><p>${escapeHtml(selected.preview)}</p><div class="selected-preview" role="status">${escapeHtml(preview)}${risk !== undefined ? `<br><span>事件风险约 ${risk}%</span>` : ""}${check && !check.allowed ? `<br><span class="decision-missing">${escapeHtml(check.missing.join("；"))}</span>` : ""}</div>
 <details class="allocation-details" ${allocationOpen ? "open" : ""}><summary>调整保障与负责人 <span>${state.allocation.supportEnergy ? `保障 ${state.allocation.supportEnergy} 能源 · ` : ""}${state.crew[state.allocation.specialist].name}</span></summary><div class="allocation"><label for="support-energy">保障能源 <output>${state.allocation.supportEnergy} 单位</output><input id="support-energy" type="range" min="0" max="8" step="4" value="${state.allocation.supportEnergy}" ${locked ? "disabled" : ""}></label><p>每投入 4 能源：安全 +2，降低事件风险 5 个百分点。</p>
 <label for="specialist">本次负责人<select id="specialist" ${locked ? "disabled" : ""}>${Object.values(
   state.crew,
 )
   .map(
     (member) =>
       `<option value="${member.id}" ${member.id === state.allocation.specialist ? "selected" : ""} ${member.available ? "" : "disabled"}>${member.name} · ${member.role}（疲劳 ${member.fatigue}）</option>`,
   )
   .join("")}</select></label></div></details>
 <div class="confirm-row"><button class="action-button" data-action="confirm" ${check?.allowed && !locked ? "" : "disabled"}>确认回应并行动</button><button class="text-button" data-action="change-reply">重新选择</button></div></section>`
     : ""
 }</div>`;
  root
    .querySelector('[data-action="change-reply"]')
    ?.addEventListener("click", handlers.onCancel);
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
