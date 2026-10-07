import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
const folder = path.resolve("releases/gray-ring-ignition-offline");
// Rebuild only this generated directory so old hashed bundles never enter the ZIP.
await rm(folder, { recursive: true, force: true });
await mkdir(folder, { recursive: true });
await cp("dist", path.join(folder, "dist"), { recursive: true });
for (const [name, source] of [
  ["serve.mjs", "scripts/serve.mjs"],
  ["start-local.bat", "scripts/start-local.bat"],
  ["README.md", "README.md"],
])
  await cp(source, path.join(folder, name));
await cp("docs", path.join(folder, "docs"), { recursive: true });
const manifest = {
  version: "0.1.0",
  builtAt: new Date().toISOString(),
  entry: "dist/index.html",
  command: "node serve.mjs",
};
await writeFile(
  path.join(folder, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
// Python's standard library creates a ZIP without a network dependency.
execFileSync("python", [
  "-c",
  'import shutil,sys;shutil.make_archive(sys.argv[1],"zip",sys.argv[2])',
  path.resolve("releases/gray-ring-ignition-offline"),
  folder,
]);
console.log("离线包：releases/gray-ring-ignition-offline.zip");
