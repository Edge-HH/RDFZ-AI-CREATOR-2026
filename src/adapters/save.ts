import { getNode, getDecision } from "../core/catalog";
import type { GameState } from "../core/types";
const KEY = "gray-ring-ignition:v1";
export function saveMission(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, state }));
  } catch {
    /* Disabled storage does not block a mission. */
  }
}
export function loadMission(): GameState | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (
      saved?.version !== 1 ||
      !saved.state?.resources ||
      !Array.isArray(saved.state.decisions)
    )
      return;
    const s = saved.state as GameState;
    if (
      !s.allocation ||
      !s.crew?.lin ||
      ![
        "briefing",
        "conversation",
        "tactical",
        "execution",
        "feedback",
        "ending",
      ].includes(s.phase)
    )
      return;
    if (s.phase !== "ending" && !getNode(s.sceneId)) return;
    if (
      !Object.values(s.resources).every(
        (value) => typeof value === "number" && Number.isFinite(value),
      )
    )
      return;
    if (
      !s.eventLog?.every((line) => typeof line === "string") ||
      !s.flags ||
      !["lin", "pei", "shen", "a-ruan", "zhou"].every((id) => id in s.crew)
    )
      return;
    if (s.phase === "execution") {
      if (!s.pendingDecision) return;
      const canonical = getDecision(s.pendingDecision.id);
      if (!canonical || canonical.sceneId !== s.sceneId) return;
      s.pendingDecision = canonical;
    }
    return s;
  } catch {
    return;
  }
}
export function clearMission(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* No persistence available. */
  }
}
