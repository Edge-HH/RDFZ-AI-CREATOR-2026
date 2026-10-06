import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Small, local-only asset loader. The game does not require models to boot;
 * callers can use `loadOptionalModel` and keep the procedural placeholder when
 * an asset is missing or WebGL is unavailable.
 */
export class AssetLoader {
  private readonly loader: GLTFLoader;
  private readonly cache = new Map<string, Promise<THREE.Object3D>>();

  constructor(manager?: THREE.LoadingManager) {
    this.loader = new GLTFLoader(manager);
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }

  loadModel(url: string): Promise<THREE.Object3D> {
    if (/^(https?:)?\/\//.test(url))
      return Promise.reject(new Error("Models must be bundled local assets"));
    const existing = this.cache.get(url);
    if (existing) return existing;

    const request = new Promise<THREE.Object3D>((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => resolve(gltf.scene),
        undefined,
        (error) => reject(error),
      );
    });
    this.cache.set(url, request);
    return request;
  }

  /** Resolve to null on an unavailable optional asset instead of breaking the mission. */
  async loadOptionalModel(
    url: string,
    timeoutMs = 8000,
  ): Promise<THREE.Object3D | null> {
    try {
      return await Promise.race([
        this.loadModel(url),
        new Promise<null>((resolve) =>
          globalThis.setTimeout(() => resolve(null), timeoutMs),
        ),
      ]);
    } catch {
      return null;
    }
  }

  clear(url?: string): void {
    if (url) {
      this.cache.delete(url);
      return;
    }
    this.cache.clear();
  }
}

/** Remove geometries, materials and textures owned by an object tree. */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();

    const material = mesh.material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const item of materials) {
      for (const value of Object.values(item)) {
        if (value && typeof value === "object" && "isTexture" in value) {
          (value as THREE.Texture).dispose();
        }
      }
      item.dispose();
    }
  });
}

/** A deliberately simple model used while optional local glTF assets load. */
export function createPlaceholderModel(
  kind: "vehicle" | "engine" | "drone" = "vehicle",
): THREE.Group {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: kind === "engine" ? 0x7b61ff : 0x263a55,
    metalness: 0.55,
    roughness: 0.42,
  });

  if (kind === "engine") {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.8, 3.6, 16),
      bodyMaterial,
    );
    body.rotation.x = Math.PI / 2;
    group.add(body);
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.9, 3.72, 16),
      new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.82,
      }),
    );
    core.rotation.x = Math.PI / 2;
    group.add(core);
  } else {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.85, 1.7),
      bodyMaterial,
    );
    body.position.y = 0.75;
    group.add(body);
    for (const x of [-0.95, 0.95]) {
      for (const z of [-0.62, 0.62]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.28, 0.18, 12),
          new THREE.MeshStandardMaterial({ color: 0x0b111c, roughness: 0.9 }),
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.35, z);
        group.add(wheel);
      }
    }
    if (kind === "drone") {
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(3.8, 0.08, 0.34),
        bodyMaterial,
      );
      wing.position.y = 1.5;
      group.add(wing);
    }
  }
  return group;
}
