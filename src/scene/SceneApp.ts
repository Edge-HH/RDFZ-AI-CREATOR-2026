import { Fallback2DView } from "./Fallback2DView";
import {
  TerrainView,
  type SceneRouteNode,
  type SceneViewportModel,
} from "./TerrainView";

export interface SceneAppOptions {
  container: HTMLElement;
  routes?: SceneRouteNode[];
  seed?: number;
  forceFallback?: boolean;
  onNodeSelect?: (id: string) => void;
}

/**
 * Renderer adapter used by the game shell. Core state is passed in as a
 * viewport model; this class never changes resources or advances the reducer.
 */
export class SceneApp {
  readonly container: HTMLElement;
  readonly isFallback: boolean;
  readonly terrain?: TerrainView;
  readonly fallback?: Fallback2DView;
  private disposed = false;
  private intersection?: IntersectionObserver;
  private requestedVisible = true;
  private onScreen = true;
  private readonly onNodeSelect?: (id: string) => void;
  private readonly onVisibilityChange = () => {
    this.applyVisibility();
  };

  constructor(options: SceneAppOptions) {
    this.container = options.container;
    this.onNodeSelect = options.onNodeSelect;
    this.container.classList.add("scene-app");
    this.container.setAttribute("data-renderer", "pending");
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.intersection = new IntersectionObserver((entries) => {
      this.onScreen = entries[0]?.isIntersecting ?? false;
      this.applyVisibility();
    });
    this.intersection.observe(this.container);

    const useFallback = options.forceFallback || !SceneApp.webglAvailable();
    if (useFallback) {
      this.isFallback = true;
      this.fallback = new Fallback2DView(this.container, {
        routes: options.routes,
        onNodeSelect: this.onNodeSelect,
      });
      this.container.setAttribute("data-renderer", "2d");
      return;
    }

    try {
      this.terrain = new TerrainView(this.container, {
        routes: options.routes,
        seed: options.seed,
        onNodeSelect: this.onNodeSelect,
      });
      this.isFallback = false;
      this.container.setAttribute("data-renderer", "webgl");
    } catch {
      // WebGL contexts can fail despite feature detection (privacy mode,
      // driver limits, or a headless test runner), so keep the 2D path usable.
      this.isFallback = true;
      this.container
        .querySelectorAll(".terrain-view__canvas")
        .forEach((canvas) => canvas.remove());
      this.fallback = new Fallback2DView(this.container, {
        routes: options.routes,
        onNodeSelect: this.onNodeSelect,
      });
      this.container.setAttribute("data-renderer", "2d");
    }
  }

  setRoutes(routes: SceneRouteNode[]): void {
    if (this.disposed) return;
    this.terrain?.setRoutes(routes);
    this.fallback?.setRoutes(routes);
  }

  setViewportModel(model: SceneViewportModel): void {
    if (this.disposed) return;
    this.terrain?.setViewportModel(model);
    this.fallback?.setViewportModel(model);
  }

  setSelectedNode(id?: string): void {
    if (this.disposed) return;
    this.terrain?.setSelectedNode(id);
    this.fallback?.setSelectedNode(id);
  }

  getSelectedNode(): string | undefined {
    return this.terrain?.getSelectedNode() ?? this.fallback?.getSelectedNode();
  }

  setVisible(visible: boolean): void {
    if (this.disposed) return;
    this.requestedVisible = visible;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    if (this.disposed) return;
    const visible = this.requestedVisible && this.onScreen && !document.hidden;
    this.terrain?.setVisible(visible);
    // Static SVG stays present while paused, just like the frozen WebGL canvas.
    this.container.dataset.renderActive = String(visible);
  }

  resize(): void {
    if (this.disposed) return;
    this.terrain?.resize();
    this.fallback?.resize();
  }

  resetView(): void {
    this.terrain?.resetView();
  }
  topView(): void {
    this.terrain?.topView();
  }
  followVehicle(): void {
    this.terrain?.followVehicle();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.intersection?.disconnect();
    this.terrain?.dispose();
    this.fallback?.dispose();
    this.container.removeAttribute("data-renderer");
  }

  static webglAvailable(): boolean {
    if (typeof document === "undefined") return false;
    try {
      const canvas = document.createElement("canvas");
      return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch {
      return false;
    }
  }
}

export function createSceneApp(options: SceneAppOptions): SceneApp {
  return new SceneApp(options);
}

export type { SceneRouteNode, SceneViewportModel };
