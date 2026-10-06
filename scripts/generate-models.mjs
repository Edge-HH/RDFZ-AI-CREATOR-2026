import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { writeFile, mkdir } from "node:fs/promises";
// A small FileReader adapter for the browser-oriented GLTF exporter in Node.
globalThis.FileReader = class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
  async readAsDataURL(blob) {
    this.result =
      "data:" +
      blob.type +
      ";base64," +
      Buffer.from(await blob.arrayBuffer()).toString("base64");
    this.onloadend?.();
  }
};
await mkdir("public/assets/models", { recursive: true });
const steel = new THREE.MeshStandardMaterial({
  color: 0x394a60,
  metalness: 0.75,
  roughness: 0.4,
});
const bright = new THREE.MeshStandardMaterial({
  color: 0x7bc6de,
  metalness: 0.3,
  roughness: 0.3,
  emissive: 0x12364a,
});
const dark = new THREE.MeshStandardMaterial({
  color: 0x141e2c,
  metalness: 0.4,
  roughness: 0.6,
});
function cylinder(group, radius, height, x, y, z, material = steel) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 48),
    material,
  );
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}
const engine = new THREE.Group();
engine.name = "Gray Ring original segmented thrust tower";
cylinder(engine, 3, 1, 0, 0.5, 0, dark);
cylinder(engine, 2.1, 9, 0, 5, 0, steel);
cylinder(engine, 1.05, 11, 0, 6, 0, bright);
for (let j = 0; j < 9; j++) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.35, 0.16, 12, 64),
    j % 3 === 0 ? bright : steel,
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.2 + j;
  engine.add(ring);
}
for (let j = 0; j < 8; j++) {
  const angle = (j * Math.PI) / 4;
  const x = Math.cos(angle) * 2.7,
    z = Math.sin(angle) * 2.7;
  cylinder(engine, 0.14, 8.5, x, 4.5, z);
  cylinder(engine, 0.36, 0.7, x, 0.8, z, dark);
  for (let k = 0; k < 5; k++) {
    const valve = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.3), steel);
    valve.position.set(x, 1.4 + k * 1.6, z);
    valve.rotation.y = -angle;
    engine.add(valve);
  }
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 1.8), dark);
  fin.position.set(Math.cos(angle) * 2.2, 3, Math.sin(angle) * 2.2);
  fin.rotation.y = -angle;
  engine.add(fin);
}
const drone = new THREE.Group();
drone.name = "Gray Ring original inspection drone";
const body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 24, 16), steel);
body.scale.set(1, 0.4, 1);
drone.add(body);
for (let i = 0; i < 4; i++) {
  const a = Math.PI / 4 + (i * Math.PI) / 2;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 0.18), steel);
  arm.position.set(Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8);
  arm.rotation.y = -a;
  drone.add(arm);
  const rotor = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.06, 8, 32),
    bright,
  );
  rotor.rotation.x = Math.PI / 2;
  rotor.position.set(Math.cos(a) * 1.65, 0.15, Math.sin(a) * 1.65);
  drone.add(rotor);
}
const exporter = new GLTFExporter();
for (const [name, model] of [
  ["engine", engine],
  ["drone", drone],
]) {
  const data = await exporter.parseAsync(model, { binary: true });
  await writeFile(`public/assets/models/${name}.glb`, Buffer.from(data));
  console.log(name, Buffer.byteLength(data));
}
