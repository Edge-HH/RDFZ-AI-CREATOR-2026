import { describe, expect, it } from "vitest";
import {
  DECISIONS,
  getDecision,
  getNode,
  NODES,
  ROUTES,
} from "../src/core/catalog";
import { gameReducer } from "../src/core/reducer";
import {
  applyEffects,
  createInitialState,
  decisionCheck,
  evaluateEnding,
  terminalFailure,
} from "../src/core/rules";
import type { GameState } from "../src/core/types";
const start = (seed = 17062026) =>
  gameReducer(createInitialState(seed), { type: "DIALOGUE_ADVANCE" });
function act(s: GameState, id: string): GameState {
  const d = getDecision(id)!;
  expect(
    decisionCheck(s, d).allowed,
    `${id}: ${decisionCheck(s, d).missing}`,
  ).toBe(true);
  s = gameReducer(s, { type: "DECISION_CONFIRM", decision: d });
  return gameReducer(s, { type: "EXECUTION_COMPLETE" });
}
function walk(ids: string[], route = "south", seed = 17062026): GameState {
  let s = start(seed);
  for (const id of ids) {
    if (s.phase === "feedback")
      s = gameReducer(s, { type: "DIALOGUE_ADVANCE" });
    if (s.sceneId === "route")
      s = gameReducer(s, { type: "MAP_SELECT", nodeId: route });
    s = act(s, id);
  }
  return s;
}
const safe = [
  "prologue-scan",
  "loadout-cooling",
  "route-select-south",
  "ice-drone-scan",
  "relay-build",
  "relay-calibrate-stop",
  "mount-purge-safe",
  "ignition-all-cooling",
];
describe("mission state machine", () => {
  it("only starts and advances feedback, never skips a decision", () => {
    let s = start();
    expect(
      gameReducer(s, { type: "DIALOGUE_ADVANCE", nextScene: "ignition" }),
    ).toBe(s);
    expect(s.resources.progress).toBe(0);
  });
  it("locks all decision, map and completion actions during execution", () => {
    let s = start();
    const d = getDecision("prologue-scan")!;
    s = gameReducer(s, { type: "DECISION_CONFIRM", decision: d });
    expect(s.resources.time).toBe(1072);
    expect(
      gameReducer(s, {
        type: "DECISION_CONFIRM",
        decision: getDecision("prologue-depart")!,
      }),
    ).toBe(s);
    expect(gameReducer(s, { type: "MAP_SELECT", nodeId: "west" })).toBe(s);
    s = gameReducer(s, { type: "EXECUTION_COMPLETE" });
    expect(gameReducer(s, { type: "EXECUTION_COMPLETE" })).toBe(s);
  });
  it("rejects wrong-scene and fabricated effects", () => {
    let s = start();
    expect(
      gameReducer(s, {
        type: "DECISION_CONFIRM",
        decision: getDecision("ignition-all-cooling")!,
      }),
    ).toBe(s);
    s = gameReducer(s, {
      type: "DECISION_CONFIRM",
      decision: {
        ...getDecision("prologue-scan")!,
        effects: [{ key: "energy", amount: 999 }],
      },
    });
    expect(s.resources.energy).toBe(100);
    expect(s.resources.time).toBe(1072);
  });
  it("shows resource shortfalls including safeguard allocation", () => {
    let s = start();
    s = applyEffects(s, [{ key: "energy", amount: -99 }]);
    s = gameReducer(s, { type: "ALLOCATE", allocation: { supportEnergy: 8 } });
    expect(
      decisionCheck(s, getDecision("prologue-scan")!).missing.join(""),
    ).toContain("能源不足");
  });
  it("safeguards and specialist affect state and fatigue", () => {
    let s = start();
    s = gameReducer(s, {
      type: "ALLOCATE",
      allocation: { supportEnergy: 4, specialist: "a-ruan" },
    });
    s = act(s, "prologue-scan");
    expect(s.resources.energy).toBe(96);
    expect(s.resources.safety).toBe(82);
    expect(s.crew["a-ruan"].fatigue).toBe(8);
    expect(s.commsConfidence).toBe(86);
  });
  it("pauses and restarts without applying stale completion", () => {
    let s = start();
    s = gameReducer(s, {
      type: "DECISION_CONFIRM",
      decision: getDecision("prologue-scan")!,
    });
    s = gameReducer(s, { type: "PAUSE" });
    expect(gameReducer(s, { type: "EXECUTION_COMPLETE" })).toBe(s);
    s = gameReducer(s, { type: "RETRY" });
    expect(s).toEqual(createInitialState());
    expect(gameReducer(s, { type: "EXECUTION_COMPLETE" })).toBe(s);
  });
  it("requires a map choice and keeps routes materially different", () => {
    let s = walk(safe.slice(0, 2));
    s = gameReducer(s, { type: "DIALOGUE_ADVANCE" });
    expect(decisionCheck(s, getDecision("route-select-south")!).allowed).toBe(
      false,
    );
    const a = act(
        gameReducer(s, { type: "MAP_SELECT", nodeId: "south" }),
        "route-select-south",
      ),
      b = act(
        gameReducer(s, { type: "MAP_SELECT", nodeId: "west" }),
        "route-select-west",
      );
    expect(a.sceneId).toBe("ice-event");
    expect(b.sceneId).toBe("steam-event");
    expect(a.resources).not.toEqual(b.resources);
  });
  it("replays an entire mission identically for the same seed", () => {
    expect(walk(safe)).toEqual(walk(safe));
    expect(walk(safe).phase).toBe("ending");
    expect(walk(safe).decisions).toHaveLength(8);
    expect(walk(safe).resources.progress).toBe(100);
  });
  it("never calls a repair without ignition a successful ending", () => {
    let s = walk(safe.slice(0, 7));
    s = gameReducer(s, { type: "ABORT" });
    expect(evaluateEnding(s)?.id).toBe("silent-lamp");
  });
  it("validates crew and resource zero as terminal failures", () => {
    for (const key of ["time", "energy", "safety"] as const) {
      const s = applyEffects(start(), [{ key, amount: -99999 }]);
      expect(terminalFailure(s)).toBe(true);
    }
    let s = start();
    for (const target of ["pei", "shen", "zhou"] as const)
      s = applyEffects(s, [{ key: "crewHealth", target, amount: -100 }]);
    expect(terminalFailure(s)).toBe(true);
  });
});
describe("content integrity and reachable outcomes", () => {
  it("resolves every reference and restricts requirements to route/content", () => {
    for (const n of NODES) {
      expect(n.goal).toBeTruthy();
      expect(n.conflict).toBeTruthy();
      expect(n.disaster).toBeTruthy();
      for (const d of n.choices) {
        expect(d.sceneId).toBe(n.id);
        expect(d.next === "ending" || getNode(d.next)).toBeTruthy();
      }
    }
    for (const d of DECISIONS)
      expect(NODES.some((n) => n.choices.some((c) => c.id === d.id))).toBe(
        true,
      );
    for (const id of ["core", "south", "west", "relay", "tower"])
      expect(ROUTES.some((r) => r.id === id)).toBe(true);
  });
  it("reaches all four endings using legal decisions, without editing state", () => {
    const endings = new Set<string>();
    let terminalCount = 0;
    function explore(state: GameState, depth = 0): void {
      if (state.phase === "ending") {
        endings.add(state.endingId!);
        terminalCount++;
        return;
      }
      expect(depth).toBeLessThan(10);
      const s =
        state.phase === "feedback"
          ? gameReducer(state, { type: "DIALOGUE_ADVANCE" })
          : state;
      for (const d of getNode(s.sceneId)!.choices) {
        let candidate = s;
        if (s.sceneId === "route")
          candidate = gameReducer(s, {
            type: "MAP_SELECT",
            nodeId: d.id.includes("south") ? "south" : "west",
          });
        if (!decisionCheck(candidate, d).allowed) continue;
        const executing = gameReducer(candidate, {
          type: "DECISION_CONFIRM",
          decision: d,
        });
        explore(
          gameReducer(executing, { type: "EXECUTION_COMPLETE" }),
          depth + 1,
        );
      }
    }
    explore(start());
    expect(terminalCount).toBeGreaterThan(100);
    expect([...endings].sort()).toEqual([
      "cold-start-success",
      "scarred-continuation",
      "silent-lamp",
      "steady-migration",
    ]);
  });
});
