import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { heightAt } from "../world/terrain";
import {
  AssetLoader,
  disposeObject3D,
  createPlaceholderModel,
} from "./AssetLoader";

export interface SceneRouteNode {
  id: string;
  label?: string;
  x?: number;
  z?: number;
  distance?: number;
  slope?: number;
  temperature?: number;
  wind?: number;
  terrainRisk?: number;
  commsConfidence?: number;
}

export interface SceneViewportModel {
  selectedNode?: string;
  routes?: SceneRouteNode[];
  vehiclePosition?: { x: number; z: number };
  riskZones?: string[];
  metrics?: Record<string, number>;
  action?: string;
}

export interface TerrainViewOptions {
  routes?: SceneRouteNode[];
  onNodeSelect?: (id: string) => void;
  seed?: number;
}

const WORLD_SIZE = 72;
const TERRAIN_SEGMENTS = 44;
const DEFAULT_NODE_POSITIONS: Record<string, [number, number]> = {
  core: [0, 0],
  psr: [19, -16],
  ridge: [-21, -13],
  relay: [24, 17],
  vent: [-19, 18],
  tower: [4, 25],
};

function hashNoise(x: number, z: number, seed: number): number {
  const value = Math.sin(x * 127.1 + z * 311.7 + seed * 74.3) * 43758.5453;
  return value - Math.floor(value);
}

function terrainHeight(x: number, z: number, _seed: number): number {
  return heightAt(x, z) * 0.2;
}

function positionForNode(node: SceneRouteNode): [number, number] {
  const fallback = DEFAULT_NODE_POSITIONS[node.id] ?? [0, 0];
  return [
    typeof node.x === "number" ? node.x : fallback[0],
    typeof node.z === "number" ? node.z : fallback[1],
  ];
}

/** Three.js scene for terrain, route nodes, vehicle and engine status markers. */
export class TerrainView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private readonly container: HTMLElement;
  private controls!: OrbitControls;
  private assetLoader = new AssetLoader();
  private roverLod?: THREE.LOD;
  private drone?: THREE.Object3D;
  private relayRing?: THREE.Mesh;
  private activity = "";
  private lastFrame = 0;
  private frameCount = 0;
  private frameStart = 0;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly nodeGroup = new THREE.Group();
  private readonly routeGroup = new THREE.Group();
  private readonly routeGlowGroup = new THREE.Group();
  private readonly dynamicGroup = new THREE.Group();
  private readonly nodeMeshes = new Map<string, THREE.Mesh>();
  private readonly seed: number;
  private readonly reducedMotion: boolean;
  private readonly onNodeSelect?: (id: string) => void;
  private routes: SceneRouteNode[] = [];
  private riskZones = new Set<string>();
  private selectedNode?: string;
  private vehicle?: THREE.Object3D;
  private vehicleTarget?: THREE.Vector3;
  private engine?: THREE.Object3D;
  private resizeObserver?: ResizeObserver;
  private raf = 0;
  private running = false;
  private disposed = false;
  private pointerDownAt?: { x: number; y: number };
  private keyboardIndex = 0;
  private readonly onPointerDown = (event: PointerEvent) => {
    this.pointerDownAt = { x: event.clientX, y: event.clientY };
  };
  private readonly onPointerUp = (event: PointerEvent) => {
    if (!this.pointerDownAt) return;
    const distance = Math.hypot(
      event.clientX - this.pointerDownAt.x,
      event.clientY - this.pointerDownAt.y,
    );
    this.pointerDownAt = undefined;
    if (distance > 10) return;
    this.pick(event.clientX, event.clientY);
  };
  private readonly onKeyDown = (event: KeyboardEvent) => {
    const ids = [...this.nodeMeshes.keys()];
    if (!ids.length) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      this.keyboardIndex = (this.keyboardIndex + 1) % ids.length;
      this.setSelectedNode(ids[this.keyboardIndex]);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      this.keyboardIndex = (this.keyboardIndex - 1 + ids.length) % ids.length;
      this.setSelectedNode(ids[this.keyboardIndex]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const id = ids[this.keyboardIndex];
      this.setSelectedNode(id);
      this.onNodeSelect?.(id);
    }
  };

  constructor(container: HTMLElement, options: TerrainViewOptions = {}) {
    this.container = container;
    this.seed = options.seed ?? 7;
    this.reducedMotion =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;
    this.onNodeSelect = options.onNodeSelect;
    this.routes = options.routes ?? [];
    this.canvas = document.createElement("canvas");
    this.canvas.className = "terrain-view__canvas";
    this.canvas.setAttribute("aria-label", "三维路线态势图");
    this.canvas.setAttribute("role", "img");
    this.canvas.tabIndex = 0;
    container.appendChild(this.canvas);

    this.camera = new THREE.OrthographicCamera(-42, 42, 30, -30, 0.1, 250);
    this.camera.position.set(0, 48, 42);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, innerWidth < 768 ? 1.5 : 2),
    );
    this.renderer.setClearColor(0x050510, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.minZoom = 0.8;
    this.controls.maxZoom = 3;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.enablePan = false;
    this.controls.target.set(0, 0, 0);
    this.scene.fog = new THREE.Fog(0x050510, 55, 130);
    this.scene.add(
      this.nodeGroup,
      this.routeGroup,
      this.routeGlowGroup,
      this.dynamicGroup,
    );
    this.buildLighting();
    this.buildTerrain();
    this.buildRoutes(this.routes);
    this.buildDynamicObjects();
    void this.loadDetailedModels();
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("keydown", this.onKeyDown);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.start();
  }

  setRoutes(routes: SceneRouteNode[]): void {
    this.routes = routes;
    this.buildRoutes(routes);
  }

  setViewportModel(model: SceneViewportModel): void {
    if (model.routes && model.routes !== this.routes)
      this.setRoutes(model.routes);
    this.activity = model.action ?? "";
    if (this.relayRing)
      this.relayRing.visible = (model.metrics?.comms ?? 0) > 0;
    if (model.riskZones) {
      this.riskZones = new Set(model.riskZones);
      this.refreshNodeStyles();
    }
    this.setSelectedNode(model.selectedNode);
    if (model.vehiclePosition && this.vehicle) {
      const { x, z } = model.vehiclePosition;
      this.vehicleTarget = new THREE.Vector3(
        x,
        terrainHeight(x, z, this.seed) + 0.9,
        z,
      );
      if (this.reducedMotion) this.vehicle.position.copy(this.vehicleTarget);
    }
    const engineStability =
      model.metrics?.engineStability ?? model.metrics?.engine;
    if (typeof engineStability === "number" && this.engine) {
      const intensity = Math.max(0.25, Math.min(1, engineStability / 100));
      this.engine.traverse((object) => {
        const mesh = object as THREE.Mesh;
        const material = mesh.material as THREE.MeshStandardMaterial;
        if (material?.emissive) material.emissiveIntensity = intensity;
      });
    }
  }

  setSelectedNode(id?: string): void {
    if (this.selectedNode === id) return;
    this.selectedNode = id;
    this.refreshNodeStyles();
    this.clearGroup(this.routeGlowGroup);
    if (id) this.drawSelectedRoute(id);
  }

  private refreshNodeStyles(): void {
    for (const [nodeId, mesh] of this.nodeMeshes) {
      const material = mesh.material as THREE.MeshBasicMaterial;
      const selected = nodeId === this.selectedNode;
      material.color.setHex(
        selected ? 0xff00ff : this.riskZones.has(nodeId) ? 0xef4444 : 0x00ffff,
      );
      mesh.scale.setScalar(selected ? 1.45 : 1);
    }
  }

  getSelectedNode(): string | undefined {
    return this.selectedNode;
  }

  resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth || 640);
    const height = Math.max(1, this.container.clientHeight || 420);
    const aspect = width / height;
    const span = 30;
    this.camera.left = -span * aspect;
    this.camera.right = span * aspect;
    this.camera.top = span;
    this.camera.bottom = -span;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    const animate = (time: number) => {
      if (!this.running || this.disposed) return;
      this.raf = window.requestAnimationFrame(animate);
      const frameTime = innerWidth < 768 ? 1000 / 30 : 1000 / 60;
      if (time - this.lastFrame < frameTime - 0.75) return;
      this.lastFrame = time;
      this.controls.update();
      this.roverLod?.update(this.camera);
      if (this.drone) {
        this.drone.visible = /drone|scan|remote/.test(this.activity);
        if (!this.reducedMotion) this.drone.rotation.y = time * 0.001;
      }
      if (this.vehicle && this.vehicleTarget) {
        this.vehicle.position.lerp(this.vehicleTarget, 0.065);
      }
      // Highlight geometry stays anchored to the route; only brightness changes.
      this.routeGlowGroup.children.forEach((child) => {
        const material = (child as THREE.Line)
          .material as THREE.LineBasicMaterial;
        if (material)
          material.opacity = this.reducedMotion
            ? 0.9
            : 0.75 + Math.sin(time * 0.003) * 0.15;
      });
      this.renderer.render(this.scene, this.camera);
      this.frameCount++;
      if (time - this.frameStart >= 1000) {
        this.canvas.dataset.fps = String(
          Math.round((this.frameCount * 1000) / (time - this.frameStart)),
        );
        this.frameCount = 0;
        this.frameStart = time;
      }
    };
    this.raf = window.requestAnimationFrame(animate);
  }

  stop(): void {
    this.running = false;
    if (this.raf) window.cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  setVisible(visible: boolean): void {
    if (visible) this.start();
    else this.stop();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("keydown", this.onKeyDown);
    disposeObject3D(this.scene);
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = mesh.material
        ? Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]
        : [];
      materials.forEach((material) => material.dispose());
    });
    this.controls.dispose();
    this.assetLoader.clear();
    this.renderer.dispose();
    this.canvas.remove();
  }

  resetView(): void {
    this.camera.position.set(0, 48, 42);
    this.camera.zoom = 1;
    this.controls.target.set(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  topView(): void {
    this.camera.position.set(0, 75, 0.1);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }
  followVehicle(): void {
    if (!this.vehicle) return;
    this.controls.target.copy(this.vehicle.position);
    this.camera.position
      .copy(this.vehicle.position)
      .add(new THREE.Vector3(0, 35, 30));
    this.controls.update();
  }
  private normalizeModel(model: THREE.Object3D, size: number): THREE.Object3D {
    const box = new THREE.Box3().setFromObject(model);
    const dimensions = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const group = new THREE.Group();
    group.add(model);
    group.scale.setScalar(
      size / Math.max(dimensions.x, dimensions.y, dimensions.z),
    );
    return group;
  }
  private async loadDetailedModels(): Promise<void> {
    const [rover, engine, drone] = await Promise.all(
      ["rover.glb", "engine.glb", "drone.glb"].map((name) =>
        this.assetLoader.loadOptionalModel(
          `${import.meta.env.BASE_URL}assets/models/${name}`,
        ),
      ),
    );
    this.canvas.dataset.models = String(
      [rover, engine, drone].filter(Boolean).length,
    );
    if (this.disposed) {
      [rover, engine, drone].forEach((model) => {
        if (model) disposeObject3D(model);
      });
      return;
    }
    if (rover && this.vehicle) {
      const lod = new THREE.LOD();
      lod.addLevel(this.normalizeModel(rover, 5), 0);
      lod.addLevel(createPlaceholderModel("vehicle"), 85);
      this.clearGroup(this.vehicle as THREE.Group);
      this.vehicle.add(lod);
      this.roverLod = lod;
    }
    if (engine && this.engine) {
      this.clearGroup(this.engine as THREE.Group);
      const lod = new THREE.LOD();
      lod.addLevel(this.normalizeModel(engine, 15), 0);
      lod.addLevel(createPlaceholderModel("engine"), 100);
      this.engine.add(lod);
    }
    if (drone) {
      this.drone = this.normalizeModel(drone, 3);
      this.drone.position.set(0, 12, 0);
      this.dynamicGroup.add(this.drone);
      this.drone.visible = false;
    }
    this.relayRing = new THREE.Mesh(
      new THREE.RingGeometry(8, 8.2, 64),
      new THREE.MeshBasicMaterial({
        color: 0x69e3ff,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      }),
    );
    this.relayRing.rotation.x = -Math.PI / 2;
    this.relayRing.position.set(21, 7, 16);
    this.relayRing.visible = false;
    this.dynamicGroup.add(this.relayRing);
  }
  private buildLighting(): void {
    this.scene.add(new THREE.HemisphereLight(0x8aa9ff, 0x090b12, 1.5));
    const key = new THREE.DirectionalLight(0xd7e7ff, 1.4);
    key.position.set(-18, 34, 12);
    this.scene.add(key);
  }

  private buildTerrain(): void {
    const geometry = new THREE.PlaneGeometry(
      WORLD_SIZE,
      WORLD_SIZE,
      TERRAIN_SEGMENTS,
      TERRAIN_SEGMENTS,
    );
    const position = geometry.attributes.position;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const z = -position.getY(index);
      position.setZ(index, terrainHeight(x, z, this.seed));
    }
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: 0x34455c,
      roughness: 0.94,
      metalness: 0.08,
      flatShading: true,
      transparent: true,
      opacity: 0.98,
    });
    const terrain = new THREE.Mesh(geometry, material);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.y = -0.18;
    this.scene.add(terrain);

    const grid = new THREE.GridHelper(WORLD_SIZE, 18, 0x365275, 0x1b2d44);
    grid.position.y = 0.02;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.28;
    this.scene.add(grid);
  }

  private buildRoutes(routes: SceneRouteNode[]): void {
    this.clearGroup(this.routeGroup);
    this.clearGroup(this.nodeGroup);
    this.nodeMeshes.clear();
    this.keyboardIndex = 0;
    if (!routes.length) return;

    const origin = routes.find((node) => node.id === "core") ?? routes[0];
    const [originX, originZ] = positionForNode(origin);
    for (const node of routes) {
      const [x, z] = positionForNode(node);
      const y = terrainHeight(x, z, this.seed) + 0.36;
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.68, 16, 10),
        new THREE.MeshBasicMaterial({ color: 0x00ffff }),
      );
      marker.position.set(x, y, z);
      marker.userData.routeId = node.id;
      this.nodeGroup.add(marker);
      this.nodeMeshes.set(node.id, marker);

      const [startX, startZ] =
        node.id === origin.id ? [x, z] : [originX, originZ];
      const points = this.routeCurve(startX, startZ, x, z);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: 0x3b638e,
          transparent: true,
          opacity: 0.8,
        }),
      );
      this.routeGroup.add(line);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.92, 1.02, 24),
        new THREE.MeshBasicMaterial({
          color: 0x00ffff,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.52,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, y - 0.2, z);
      this.nodeGroup.add(ring);
    }
    this.setSelectedNode(this.selectedNode);
  }

  private drawSelectedRoute(id: string): void {
    const node = this.routes.find((item) => item.id === id);
    const origin =
      this.routes.find((item) => item.id === "core") ?? this.routes[0];
    if (!node || !origin || node.id === origin.id) return;
    const [startX, startZ] = positionForNode(origin);
    const [endX, endZ] = positionForNode(node);
    const glow = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        this.routeCurve(startX, startZ, endX, endZ, 0.5),
      ),
      new THREE.LineBasicMaterial({
        color: 0xff00ff,
        transparent: true,
        opacity: 0.9,
      }),
    );
    this.routeGlowGroup.add(glow);
  }

  private routeCurve(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    yOffset = 0.2,
  ): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    for (let index = 0; index <= 20; index += 1) {
      const t = index / 20;
      const x = THREE.MathUtils.lerp(x1, x2, t);
      const z = THREE.MathUtils.lerp(z1, z2, t);
      const arc = Math.sin(t * Math.PI) * 1.2;
      points.push(
        new THREE.Vector3(x, terrainHeight(x, z, this.seed) + yOffset + arc, z),
      );
    }
    return points;
  }

  private buildDynamicObjects(): void {
    this.vehicle = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 0.82, 1.55),
      new THREE.MeshStandardMaterial({
        color: 0x5b6f8a,
        metalness: 0.52,
        roughness: 0.42,
      }),
    );
    body.position.y = 0.7;
    this.vehicle.add(body);
    this.vehicle.position.set(0, terrainHeight(0, 0, this.seed) + 0.8, 0);
    this.dynamicGroup.add(this.vehicle);

    this.engine = new THREE.Group();
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(2.8, 3.2, 7, 18),
      new THREE.MeshStandardMaterial({
        color: 0x344d71,
        metalness: 0.62,
        roughness: 0.34,
      }),
    );
    const target = this.routes.find((node) => node.id === "tower");
    const tx = target?.x ?? 3,
      tz = target?.z ?? 33;
    this.engine.position.set(tx, terrainHeight(tx, tz, this.seed) + 5, tz);
    tower.position.set(0, 0, 0);
    this.engine.add(tower);
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(1.12, 1.35, 7.2, 18),
      new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.36,
      }),
    );
    core.position.copy(tower.position);
    this.engine.add(core);
    this.dynamicGroup.add(this.engine);
  }

  private clearGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = mesh.material
          ? Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]
          : [];
        materials.forEach((material) => material.dispose());
      });
    }
  }

  private pick(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(
      [...this.nodeMeshes.values()],
      false,
    );
    const routeId = intersections[0]?.object.userData.routeId;
    if (typeof routeId !== "string") return;
    this.setSelectedNode(routeId);
    this.onNodeSelect?.(routeId);
  }
}

export function createTerrainView(
  container: HTMLElement,
  options?: TerrainViewOptions,
): TerrainView {
  return new TerrainView(container, options);
}
