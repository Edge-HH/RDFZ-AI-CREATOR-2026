import { test } from "vitest";
import {
  lightWindow,
  heightAt,
  slopeAt,
  LOCATIONS,
  routeBetween,
} from "../src/world/terrain";
test("probe", () => {
  for (const id of ["core", "psr", "ridge", "relay"] as const) {
    const l = LOCATIONS[id];
    const w = lightWindow(id);
    console.log(
      id,
      heightAt(l.x, l.z).toFixed(1),
      slopeAt(l.x, l.z).toFixed(1),
      w.map((b) => (b ? "#" : ".")).join(""),
      w.filter(Boolean).length,
    );
  }
  for (const [a, b] of [
    ["core", "psr"],
    ["core", "ridge"],
    ["core", "relay"],
    ["ridge", "psr"],
  ] as const) {
    const r = routeBetween(a, b);
    console.log(a, b, r.km.toFixed(2), r.maxSlope.toFixed(1));
  }
});
