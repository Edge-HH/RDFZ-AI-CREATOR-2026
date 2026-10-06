import { getDecision, ROUTES } from "./catalog";
import { normalizeSeed } from "./rng";
import {
  allocationEffects,
  applyEffects,
  createInitialState,
  decisionCheck,
  evaluateEnding,
  resolveEvent,
  terminalFailure,
} from "./rules";
import type { GameAction, GameState } from "./types";
export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === "RETRY")
    return createInitialState(normalizeSeed(action.seed ?? state.seed));
  if (
    action.type === "PAUSE" &&
    state.phase !== "ending" &&
    state.phase !== "briefing"
  )
    return { ...state, paused: action.paused ?? !state.paused };
  if (state.paused || state.phase === "ending") return state;
  if (action.type === "DIALOGUE_ADVANCE") {
    if (state.phase !== "briefing" && state.phase !== "feedback") return state;
    return {
      ...state,
      phase: "conversation",
      pendingDecision: undefined,
      allocation: { ...state.allocation, supportEnergy: 0 },
    };
  }
  if (action.type === "EXECUTION_COMPLETE") {
    if (state.phase !== "execution" || !state.pendingDecision) return state;
    const pending = state.pendingDecision;
    const event = resolveEvent(state, pending);
    let next = applyEffects(state, event.effects);
    const ending = pending.next === "ending" || terminalFailure(next);
    const record = next.decisions[next.decisions.length - 1];
    next = {
      ...next,
      phase: ending ? "ending" : "feedback",
      sceneId: pending.next === "ending" ? state.sceneId : pending.next,
      pendingDecision: undefined,
      decisions: [
        ...next.decisions.slice(0, -1),
        {
          ...record,
          effects: [...record.effects, ...event.effects],
          after: { ...next.resources },
          response: event.message,
          speaker: event.speaker,
        },
      ],
      eventLog: [...next.eventLog, event.message],
    };
    if (ending) {
      next.endingId = evaluateEnding(next)?.id;
      next.resources = {
        ...next.resources,
        progress: pending.next === "ending" ? 100 : next.resources.progress,
      };
    }
    return next;
  }
  if (action.type === "ABORT" && state.phase === "feedback")
    return {
      ...state,
      phase: "ending",
      endingId: "silent-lamp",
      eventLog: [
        ...state.eventLog,
        "车队主动终止任务，保留点火芯和全部维修记录。",
      ],
    };
  if (!["conversation", "tactical"].includes(state.phase)) return state;
  switch (action.type) {
    case "MAP_SELECT":
      if (!ROUTES.some((route) => route.id === action.nodeId)) return state;
      return { ...state, phase: "tactical", selectedRoute: action.nodeId };
    case "ALLOCATE": {
      const supportEnergy =
        action.allocation.supportEnergy ?? state.allocation.supportEnergy;
      const specialist =
        action.allocation.specialist ?? state.allocation.specialist;
      if (
        ![0, 4, 8].includes(supportEnergy) ||
        !state.crew[specialist]?.available
      )
        return state;
      return { ...state, allocation: { supportEnergy, specialist } };
    }
    case "DECISION_PREVIEW": {
      const decision = getDecision(action.decision.id);
      if (!decision || decision.sceneId !== state.sceneId) return state;
      return { ...state, phase: "tactical", pendingDecision: decision };
    }
    case "DECISION_CONFIRM": {
      const decision = getDecision(action.decision.id);
      if (!decision || !decisionCheck(state, decision).allowed) return state;
      const effects = [...decision.effects, ...allocationEffects(state)];
      const next = applyEffects(state, effects);
      return {
        ...next,
        phase: "execution",
        pendingDecision: decision,
        decisions: [
          ...state.decisions,
          {
            id: decision.id,
            sceneId: state.sceneId,
            label: decision.label,
            effects,
            committedAt: state.decisions.length,
            next: decision.next,
            eventId: decision.eventId,
            allocation: { ...state.allocation },
            before: { ...state.resources },
            after: { ...next.resources },
            response: "",
            speaker: "",
          },
        ],
      };
    }
    case "VIEW_RESET":
      return { ...state, selectedRoute: undefined };
    case "ABORT":
      return {
        ...state,
        phase: "ending",
        endingId: "silent-lamp",
        eventLog: [
          ...state.eventLog,
          "车队主动终止任务，保留点火芯和全部维修记录。",
        ],
      };
    default:
      return state;
  }
}
export const canConfirmDecision = (
  state: GameState,
  decision: import("./types").Decision,
) => decisionCheck(state, decision).allowed;
export const missingForDecision = (
  state: GameState,
  decision: import("./types").Decision,
) => decisionCheck(state, decision).missing;
