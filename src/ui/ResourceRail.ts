import type { GameState } from "../core/types";

interface ResourceMeta {
  label: string;
  max: number;
  unit: string;
  tone?: string;
}
const meta: Array<[keyof GameState["resources"], ResourceMeta]> = [
  ["time", { label: "时间窗口", max: 1080, unit: "min", tone: "cyan" }],
  ["energy", { label: "车队能源", max: 120, unit: "u", tone: "cyan" }],
  ["supplies", { label: "维修物资", max: 80, unit: "u", tone: "violet" }],
  ["safety", { label: "安全裕度", max: 100, unit: "%", tone: "warning" }],
  [
    "engineStability",
    { label: "发动机稳定度", max: 100, unit: "%", tone: "success" },
  ],
  ["trust", { label: "团队信任", max: 100, unit: "%", tone: "violet" }],
];

function toneFor(value: number, key: string): string {
  if (key === "safety" && value < 35) return "danger";
  if (key === "energy" && value < 20) return "danger";
  if (key === "time" && value < 180) return "danger";
  if (value < 30) return "warning";
  return "";
}

export function renderResourceRail(root: HTMLElement, state: GameState): void {
  root.innerHTML =
    meta
      .map(([key, item]) => {
        const value = Math.max(0, Math.round(state.resources[key]));
        const percent = Math.max(0, Math.min(100, (value / item.max) * 100));
        const tone = toneFor(value, key);
        const display =
          key === "time"
            ? `${Math.floor(value / 60)}h ${String(value % 60).padStart(2, "0")}m`
            : `${value}${item.unit}`;
        return `<div class="resource-card">
      <div class="resource-top"><span class="resource-label">${item.label}</span><strong class="resource-value">${display}</strong></div>
      <div class="resource-bar" role="progressbar" aria-label="${item.label}" aria-valuemin="0" aria-valuemax="${item.max}" aria-valuenow="${value}"><div class="resource-fill ${tone}" style="width:${percent}%"></div></div>
    </div>`;
      })
      .join("") +
    `<div class="resource-card"><div class="resource-top"><span class="resource-label">可用成员</span><strong class="resource-value">${Object.values(state.crew).filter((member) => member.available).length}/5</strong></div><div class="resource-delta">${Object.values(
      state.crew,
    )
      .map(
        (member) =>
          `${member.name} ${member.health < 60 ? "受伤" : member.health < 85 ? "轻伤" : "正常"} · 疲劳${member.fatigue}`,
      )
      .join("<br>")}</div></div>`;
}
