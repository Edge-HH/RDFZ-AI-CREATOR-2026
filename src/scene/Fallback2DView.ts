import type { SceneRouteNode, SceneViewportModel } from "./TerrainView";

export interface Fallback2DViewOptions {
  routes?: SceneRouteNode[];
  onNodeSelect?: (id: string) => void;
}

const POSITIONS: Record<string, [number, number]> = {
  core: [50, 50],
  psr: [76, 28],
  ridge: [22, 31],
  relay: [82, 73],
  vent: [22, 74],
  tower: [53, 86],
};

/** Data-equivalent SVG map used when WebGL cannot be created. */
export class Fallback2DView {
  readonly element: SVGSVGElement;
  private readonly onNodeSelect?: (id: string) => void;
  private routes: SceneRouteNode[] = [];
  private selectedNode?: string;
  private disposed = false;
  private vehiclePosition = { x: -4, z: -4 };
  private riskZones: string[] = [];

  constructor(container: HTMLElement, options: Fallback2DViewOptions = {}) {
    this.onNodeSelect = options.onNodeSelect;
    this.element = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    this.element.classList.add("terrain-view__fallback");
    this.element.setAttribute("width", "100%");
    this.element.setAttribute("height", "100%");
    this.element.style.display = "block";
    this.element.style.position = "absolute";
    this.element.style.inset = "0";
    this.element.setAttribute("viewBox", "0 0 100 100");
    this.element.setAttribute("preserveAspectRatio", "xMidYMid slice");
    this.element.setAttribute("role", "group");
    this.element.setAttribute("aria-label", "二维路线态势图（WebGL 回退）");
    container.appendChild(this.element);
    this.setRoutes(options.routes ?? []);
  }

  setRoutes(routes: SceneRouteNode[]): void {
    this.routes = routes;
    this.render();
  }

  setViewportModel(model: SceneViewportModel): void {
    if (model.routes) this.routes = model.routes;
    this.selectedNode = model.selectedNode;
    if (model.vehiclePosition) this.vehiclePosition = model.vehiclePosition;
    if (model.riskZones) this.riskZones = model.riskZones;
    this.render();
  }

  setSelectedNode(id?: string): void {
    this.selectedNode = id;
    this.render();
  }

  getSelectedNode(): string | undefined {
    return this.selectedNode;
  }

  start(): void {
    // SVG is event-driven; method exists for parity with TerrainView.
  }

  stop(): void {
    // SVG is event-driven; method exists for parity with TerrainView.
  }

  setVisible(visible: boolean): void {
    this.element.style.display = visible ? "" : "none";
  }

  resize(): void {
    // viewBox keeps this renderer responsive without a manual resize pass.
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.element.remove();
  }

  private render(): void {
    if (this.disposed) return;
    while (this.element.firstChild)
      this.element.removeChild(this.element.firstChild);
    const defs = document.createElementNS(this.element.namespaceURI, "defs");
    const gradient = document.createElementNS(
      this.element.namespaceURI,
      "linearGradient",
    ) as SVGLinearGradientElement;
    gradient.id = "fallback-terrain-gradient";
    gradient.setAttribute("x1", "0");
    gradient.setAttribute("y1", "0");
    gradient.setAttribute("x2", "1");
    gradient.setAttribute("y2", "1");
    this.stopGradient(gradient, "0%", "#132137");
    this.stopGradient(gradient, "100%", "#071018");
    defs.appendChild(gradient);
    this.element.appendChild(defs);

    const background = document.createElementNS(
      this.element.namespaceURI,
      "rect",
    );
    background.setAttribute("width", "100");
    background.setAttribute("height", "100");
    background.setAttribute("fill", "url(#fallback-terrain-gradient)");
    this.element.appendChild(background);

    for (let index = 0; index < 8; index += 1) {
      const line = document.createElementNS(this.element.namespaceURI, "path");
      const offset = index * 12 - 8;
      line.setAttribute(
        "d",
        `M ${offset} 100 C 28 ${38 + index * 2}, 68 ${58 - index}, 108 ${offset}`,
      );
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", "#233d5d");
      line.setAttribute("stroke-width", "0.35");
      line.setAttribute("opacity", "0.6");
      this.element.appendChild(line);
    }

    const origin =
      this.routes.find((node) => node.id === "core") ?? this.routes[0];
    if (!origin) return;
    const [originX, originY] = this.position(origin);
    for (const node of this.routes) {
      const [x, y] = this.position(node);
      if (node.id !== origin.id) {
        const route = document.createElementNS(
          this.element.namespaceURI,
          "path",
        );
        const selected = node.id === this.selectedNode;
        route.setAttribute(
          "d",
          `M ${originX} ${originY} Q ${(originX + x) / 2} ${(originY + y) / 2 - 8} ${x} ${y}`,
        );
        route.setAttribute("fill", "none");
        route.setAttribute("stroke", selected ? "#ff00ff" : "#3b638e");
        route.setAttribute("stroke-width", selected ? "1.25" : "0.75");
        route.setAttribute("stroke-dasharray", selected ? "0" : "2 1.2");
        this.element.appendChild(route);
      }
      const marker = document.createElementNS(
        this.element.namespaceURI,
        "circle",
      );
      marker.setAttribute("cx", `${x}`);
      marker.setAttribute("cy", `${y}`);
      marker.setAttribute("r", node.id === this.selectedNode ? "3" : "2");
      marker.setAttribute(
        "fill",
        node.id === this.selectedNode
          ? "#ff00ff"
          : this.riskZones.includes(node.id)
            ? "#ef4444"
            : "#00ffff",
      );
      marker.setAttribute("stroke", "#050510");
      marker.setAttribute("stroke-width", "0.8");
      marker.setAttribute("tabindex", "0");
      marker.setAttribute("role", "button");
      marker.setAttribute("aria-label", `${node.label ?? node.id} 路线节点`);
      marker.addEventListener("click", () => this.select(node.id));
      marker.addEventListener("keydown", (event: Event) => {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          event.preventDefault();
          this.select(node.id);
        }
      });
      this.element.appendChild(marker);

      const label = document.createElementNS(this.element.namespaceURI, "text");
      label.setAttribute("x", `${x + 3.3}`);
      label.setAttribute("y", `${y + 1.2}`);
      label.setAttribute("fill", "#d5e3ff");
      label.setAttribute("font-size", "2.8");
      label.textContent = node.label ?? node.id;
      this.element.appendChild(label);
    }
    const vehicle = document.createElementNS(this.element.namespaceURI, "rect");
    vehicle.setAttribute("x", String(48 + this.vehiclePosition.x));
    vehicle.setAttribute("y", String(48 + this.vehiclePosition.z));
    vehicle.setAttribute("width", "4");
    vehicle.setAttribute("height", "3");
    vehicle.setAttribute("fill", "#ffd078");
    vehicle.setAttribute("aria-label", "车队当前位置");
    this.element.appendChild(vehicle);
  }

  private select(id: string): void {
    this.selectedNode = id;
    this.render();
    this.onNodeSelect?.(id);
  }

  private position(node: SceneRouteNode): [number, number] {
    const fallback = POSITIONS[node.id] ?? [50, 50];
    return [
      typeof node.x === "number" ? 50 + node.x : fallback[0],
      typeof node.z === "number" ? 50 + node.z : fallback[1],
    ];
  }

  private stopGradient(
    gradient: SVGLinearGradientElement,
    offset: string,
    color: string,
  ): void {
    const stop = document.createElementNS(this.element.namespaceURI, "stop");
    stop.setAttribute("offset", offset);
    stop.setAttribute("stop-color", color);
    gradient.appendChild(stop);
  }
}

export function createFallback2DView(
  container: HTMLElement,
  options?: Fallback2DViewOptions,
): Fallback2DView {
  return new Fallback2DView(container, options);
}
