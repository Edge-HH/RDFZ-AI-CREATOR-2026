import { ENDINGS, getNode, ROUTES } from "./catalog";
import { stream } from "./rng";
import events from "../data/events.json";
import type {
  Allocation,
  CrewId,
  Decision,
  DecisionCheck,
  DialogueLine,
  DialogueNode,
  Effect,
  EndingResult,
  GameState,
  ResourceKey,
  ResourceState,
} from "./types";
export { ENDINGS } from "./catalog";
export const MISSION_MINUTES = 1080;
export const CREW_SPEC: Record<CrewId, { name: string; role: string }> = {
  lin: { name: "林岑", role: "现场系统工程师" },
  pei: { name: "裴衡", role: "驾驶 / 地形判断" },
  shen: { name: "沈葵", role: "冷却 / 校准" },
  "a-ruan": { name: "阿阮", role: "医疗 / 通信" },
  zhou: { name: "周砾", role: "机械 / 塔区维护" },
};
export const INITIAL_RESOURCES: ResourceState = {
  time: 1080,
  energy: 100,
  supplies: 80,
  safety: 80,
  engineStability: 42,
  trust: 60,
  progress: 0,
};
export const RESOURCE_LABELS: Record<ResourceKey, string> = {
  time: "时间",
  energy: "能源",
  supplies: "物资",
  safety: "安全",
  engineStability: "发动机稳定度",
  trust: "团队信任",
  progress: "进度",
};
export const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
export const clampResource = (key: ResourceKey, value: number) =>
  clamp(
    value,
    0,
    key === "time"
      ? 1080
      : key === "energy"
        ? 120
        : key === "supplies"
          ? 80
          : 100,
  );
export const crewAvailableCount = (state: Pick<GameState, "crew">) =>
  Object.values(state.crew).filter(
    (member) => member.available && member.health >= 25,
  ).length;
export function createInitialState(seed = 17062026): GameState {
  return {
    phase: "briefing",
    sceneId: "prologue",
    dialogueCursor: 0,
    seed: seed >>> 0,
    resources: { ...INITIAL_RESOURCES },
    crew: Object.fromEntries(
      Object.entries(CREW_SPEC).map(([id, spec]) => [
        id,
        { id, ...spec, health: 100, fatigue: 0, available: true },
      ]),
    ) as GameState["crew"],
    flags: {},
    decisions: [],
    allocation: { supportEnergy: 0, specialist: "shen" },
    paused: false,
    eventLog: [],
    commsConfidence: 72,
  };
}
export function requirementPassed(state: GameState, rule: string): boolean {
  if (rule.startsWith("!flag:")) return !state.flags[rule.slice(6)];
  if (rule.startsWith("flag:")) return !!state.flags[rule.slice(5)];
  if (rule.startsWith("route:")) return state.selectedRoute === rule.slice(6);
  const match = rule.match(/^(\w+)(>=|<=|>|<|=)(-?\d+)$/);
  if (!match) return false;
  const actual =
    match[1] === "crew"
      ? crewAvailableCount(state)
      : match[1] === "comms"
        ? state.commsConfidence
        : state.resources[match[1] as ResourceKey];
  const target = Number(match[3]);
  return match[2] === ">="
    ? actual >= target
    : match[2] === "<="
      ? actual <= target
      : match[2] === ">"
        ? actual > target
        : match[2] === "<"
          ? actual < target
          : actual === target;
}
/** One shared transcript drives rendering, progress guards and save recovery. */
export function dialogueLines(
  state: GameState,
  node: DialogueNode | undefined = getNode(state.sceneId),
): DialogueLine[] {
  if (!node) return [];
  return [
    { speaker: node.speaker, text: node.text },
    ...(node.lines ?? []).filter((line) =>
      (line.requires ?? []).every((rule) => requirementPassed(state, rule)),
    ),
  ];
}
export function dialogueComplete(state: GameState): boolean {
  return state.dialogueCursor >= dialogueLines(state).length - 1;
}
function describeRequirement(rule: string): string {
  if (rule === "route:south") return "请选择南坡冰脊路线";
  if (rule === "route:west") return "请选择西侧地热沟路线";
  const flags: Record<string, string> = {
    loadAnchors: "需要装载医疗包与锚索",
    relayActive: "需要启用备用中继",
  };
  if (rule.startsWith("flag:")) return flags[rule.slice(5)] ?? "前置准备未完成";
  if (rule.startsWith("!flag:")) return "此准备已完成";
  return rule.replace(
    /^(time|energy|supplies|trust|safety|crew|comms)/,
    (key) =>
      ({
        time: "剩余分钟",
        energy: "能源",
        supplies: "物资",
        trust: "信任",
        safety: "安全裕度",
        crew: "可用成员",
        comms: "通信置信度",
      })[key] ?? key,
  );
}
export function allocationEffects(state: GameState): Effect[] {
  const { supportEnergy, specialist } = state.allocation;
  const effects: Effect[] = [];
  if (supportEnergy)
    effects.push(
      {
        key: "energy",
        amount: -supportEnergy,
        reason: `保障系统投入 ${supportEnergy} 能源。`,
      },
      {
        key: "safety",
        amount: supportEnergy / 2,
        reason: `监测与保温使安全裕度提高 ${supportEnergy / 2}。`,
      },
    );
  effects.push({
    key: "crewFatigue",
    target: specialist,
    amount: 8,
    reason: `${state.crew[specialist].name}负责本次作业，疲劳 +8。`,
  });
  if (
    specialist === "shen" &&
    ["calibration", "mount", "ignition"].includes(state.sceneId)
  )
    effects.push({
      key: "engineStability",
      amount: 3,
      reason: "沈葵校对相位读数，发动机稳定度 +3。",
    });
  if (
    specialist === "pei" &&
    ["route", "ice-event", "steam-event"].includes(state.sceneId)
  )
    effects.push({
      key: "safety",
      amount: 3,
      reason: "裴衡调整轮组与车速，安全裕度 +3。",
    });
  if (specialist === "a-ruan")
    effects.push({
      key: "commsConfidence",
      amount: 4,
      reason: "阿阮同步生命体征与链路，通信置信度 +4。",
    });
  if (specialist === "zhou" && state.sceneId === "mount")
    effects.push({
      key: "time",
      amount: 20,
      reason: "周砾定位检修口，比预计节省 20 分钟。",
    });
  return effects;
}
export function decisionCheck(
  state: GameState,
  decision: Decision,
): DecisionCheck {
  const missing: string[] = [];
  if (!dialogueComplete(state)) missing.push("先听完本段通信，再回应队员");
  if (state.paused) missing.push("任务已暂停");
  if (!["conversation", "tactical"].includes(state.phase))
    missing.push("当前阶段不能提交方案");
  if (
    decision.sceneId !== state.sceneId ||
    !getNode(state.sceneId)?.choices.some((item) => item.id === decision.id)
  )
    missing.push("方案不属于当前任务");
  if (state.decisions.some((item) => item.id === decision.id))
    missing.push("方案已执行");
  for (const rule of decision.requires ?? [])
    if (!requirementPassed(state, rule))
      missing.push(describeRequirement(rule));
  const specialist = state.crew[state.allocation.specialist];
  if (!specialist?.available || specialist.health < 25)
    missing.push("负责人暂时无法作业");
  for (const key of ["time", "energy", "supplies"] as const) {
    const delta = [...decision.effects, ...allocationEffects(state)]
      .filter((effect) => effect.key === key)
      .reduce((sum, effect) => sum + (effect.amount ?? 0), 0);
    if (state.resources[key] + delta < 0)
      missing.push(
        `${RESOURCE_LABELS[key]}不足（缺 ${Math.ceil(-state.resources[key] - delta)}）`,
      );
  }
  return { allowed: !missing.length, missing };
}
export const checkRequirements = (state: GameState, decision: Decision) => ({
  allowed: (decision.requires ?? []).every((rule) =>
    requirementPassed(state, rule),
  ),
  missing: (decision.requires ?? [])
    .filter((rule) => !requirementPassed(state, rule))
    .map(describeRequirement),
});
export function applyEffects(
  state: GameState,
  effects: readonly Effect[],
): GameState {
  const next = {
    ...state,
    resources: { ...state.resources },
    crew: Object.fromEntries(
      Object.entries(state.crew).map(([id, member]) => [id, { ...member }]),
    ) as GameState["crew"],
    flags: { ...state.flags },
    eventLog: [...state.eventLog],
  };
  for (const effect of effects) {
    const amount = effect.amount ?? 0;
    if (effect.key === "flag" && effect.flag)
      next.flags[effect.flag] = effect.value !== false;
    else if (effect.key === "commsConfidence")
      next.commsConfidence = clamp(next.commsConfidence + amount);
    else if (effect.key.startsWith("crew") && effect.target) {
      const member = next.crew[effect.target];
      if (effect.key === "crewHealth") {
        member.health = clamp(member.health + amount);
        member.available = member.health >= 25;
      }
      if (effect.key === "crewFatigue")
        member.fatigue = clamp(member.fatigue + amount);
      if (effect.key === "crewAvailable")
        member.available = effect.value !== false;
    } else if (effect.key in next.resources) {
      const key = effect.key as ResourceKey;
      next.resources[key] = clampResource(key, next.resources[key] + amount);
    }
    if (effect.reason) next.eventLog.push(effect.reason);
  }
  return next;
}
export function terminalFailure(state: GameState): boolean {
  return (
    state.resources.time <= 0 ||
    state.resources.energy <= 0 ||
    state.resources.safety <= 0 ||
    crewAvailableCount(state) < 3
  );
}
export function evaluateEnding(state: GameState): EndingResult | undefined {
  if (state.phase !== "ending") return undefined;
  const r = state.resources,
    fired =
      state.flags.fired || state.flags.firedPartial || state.flags.overdrive;
  if (terminalFailure(state) || !fired || r.engineStability < 60)
    return ENDINGS["silent-lamp"];
  if (r.engineStability >= 75 && r.safety < 35)
    return ENDINGS["cold-start-success"];
  if (
    r.engineStability >= 75 &&
    r.safety >= 45 &&
    crewAvailableCount(state) >= 4 &&
    Object.values(state.crew).every((member) => member.health >= 60)
  )
    return ENDINGS["steady-migration"];
  return ENDINGS["scarred-continuation"];
}
// An independent event stream prevents preview/reload from consuming randomness.
export function resolveEvent(
  state: GameState,
  decision: Decision,
): { effects: Effect[]; speaker: string; message: string; risk: number } {
  const route = ROUTES.find(
    (item) =>
      item.id ===
      (state.flags.routeSouth
        ? "south"
        : state.flags.routeWest
          ? "west"
          : state.selectedRoute),
  );
  const fatigue = state.crew[state.allocation.specialist].fatigue;
  const dangerous = [
    "ice-push-through",
    "steam-low-signal",
    "mount-bypass",
    "ignition-overdrive",
  ].includes(decision.id);
  const mitigated =
    state.flags.anchored || state.flags.droneRecon || state.flags.preCalibrated;
  const risk = clamp(
    (route?.terrainRisk ?? 40) / 200 +
      (100 - state.resources.safety) / 250 +
      fatigue / 400 +
      (dangerous ? 0.25 : -0.1) -
      state.allocation.supportEnergy / 80 -
      (mitigated ? 0.12 : 0),
    0.02,
    0.85,
  );
  const roll = stream(state.seed, `${state.sceneId}:${decision.id}`)();
  const effects: Effect[] = [];
  const eventDefinition = events.find((event) => event.id === decision.eventId);
  let message =
    decision.feedback?.text ??
    eventDefinition?.message ??
    "读数落在预估范围内。";
  if (
    ["ice-event", "steam-event", "mount", "ignition"].includes(state.sceneId) &&
    roll < risk
  ) {
    const severity = dangerous ? 34 : 12;
    effects.push(
      { key: "safety", amount: dangerous ? -10 : -4 },
      { key: "time", amount: -30 },
      {
        key: "crewHealth",
        target: state.allocation.specialist,
        amount: -severity,
        reason: `${state.crew[state.allocation.specialist].name}受到冲击，健康 -${severity}；现场处置耗时 30 分钟。`,
      },
    );
    if (state.flags.loadAnchors)
      effects.push({
        key: "crewHealth",
        target: state.allocation.specialist,
        amount: 8,
        reason: "随车医疗包减轻了伤势，健康恢复 8。",
      });
    message += dangerous
      ? "冲击超过保护阈值。人已经带出来了，锁扣和一段时间留在原地。"
      : "有一段读数越界。保障方案吸收了大部分冲击，我们仍然能继续。";
  }
  if (decision.id === "steam-low-signal" || decision.id === "relay-blind")
    message += "频道存在盲区，下一轮预估区间扩大。";
  if (decision.next === "ending")
    message +=
      state.flags.fired || state.flags.firedPartial || state.flags.overdrive
        ? "推力曲线已回传；请签署最终维修记录。"
        : "本次点火被取消，点火芯随车撤回。";
  return {
    effects,
    speaker: effects.length ? "阿阮" : (decision.feedback?.speaker ?? "沈葵"),
    message,
    risk,
  };
}
export function decisionPreview(
  state: GameState,
  decision: Decision,
): Effect[] {
  return [...decision.effects, ...allocationEffects(state)];
}
export function effectLabel(effect: Effect): string {
  const delta = effect.amount ?? 0;
  if (effect.key === "flag") return "";
  const label =
    effect.key === "commsConfidence"
      ? "通信"
      : effect.key === "crewHealth"
        ? `${CREW_SPEC[effect.target ?? "lin"].name}健康`
        : effect.key === "crewFatigue"
          ? "负责人疲劳"
          : (RESOURCE_LABELS[effect.key as ResourceKey] ?? effect.key);
  return `${label} ${delta >= 0 ? "+" : ""}${delta}${effect.key === "time" ? " 分钟" : ""}`;
}
