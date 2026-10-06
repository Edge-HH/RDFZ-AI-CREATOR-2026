import routes from "../data/routes.json";
// Local scene coordinates are schematic, not a geographic projection.
export const LOCATIONS = Object.fromEntries(
  routes.map((route) => [route.id, { ...route }]),
) as Record<string, (typeof routes)[number]>;
LOCATIONS.psr = { ...LOCATIONS.tower, id: "psr" };
LOCATIONS.ridge = { ...LOCATIONS.south, id: "ridge" };
export function heightAt(x: number, z: number): number {
  return (
    4.4 * Math.sin(x * 0.18) +
    3.1 * Math.cos(z * 0.15) +
    12 * Math.exp(-((x + 20) ** 2 + (z + 18) ** 2) / 95) -
    7 * Math.exp(-((x - 10) ** 2 + (z + 8) ** 2) / 60) +
    12
  );
}
export function slopeAt(x: number, z: number): number {
  const step = 0.25;
  const dx = (heightAt(x + step, z) - heightAt(x - step, z)) / (2 * step),
    dz = (heightAt(x, z + step) - heightAt(x, z - step)) / (2 * step);
  return (Math.atan(Math.hypot(dx, dz) * 0.12) * 180) / Math.PI;
}
export function lightWindow(id: string): boolean[] {
  const route = LOCATIONS[id];
  return Array.from(
    { length: 12 },
    (_, index) => !!route && (index + (route.id === "west" ? 3 : 0)) % 5 !== 0,
  );
}
export function routeBetween(
  a: string,
  b: string,
): { km: number; maxSlope: number } {
  const from = LOCATIONS[a],
    to = LOCATIONS[b];
  if (!from || !to) throw new Error("Unknown route");
  const km = Math.hypot(to.x - from.x, to.z - from.z);
  return {
    km: Number(km.toFixed(2)),
    maxSlope: Math.max(
      from.slope,
      to.slope,
      ...Array.from({ length: 20 }, (_, i) =>
        slopeAt(
          from.x + ((to.x - from.x) * i) / 19,
          from.z + ((to.z - from.z) * i) / 19,
        ),
      ),
    ),
  };
}
