import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/components.css";
import { getNode, ROUTES } from "./core/catalog";
import {
  createInitialState,
  ENDINGS,
  decisionCheck,
  crewAvailableCount,
} from "./core/rules";
import { gameReducer } from "./core/reducer";
import type { Decision, GameAction, GameState } from "./core/types";
import { SceneApp } from "./scene/SceneApp";
import { renderDecisionDock } from "./ui/DecisionDock";
import {
  renderDialogueHeading,
  renderDialogueStream,
} from "./ui/DialogueStream";
import { renderEventLog } from "./ui/EventLog";
import { renderImpactReport } from "./ui/ImpactReport";
import { renderMissionHeader } from "./ui/MissionHeader";
import { renderResourceRail } from "./ui/ResourceRail";
import { escapeHtml, formatTime } from "./ui/format";
import { clearMission, loadMission, saveMission } from "./adapters/save";
import { Sound } from "./adapters/Sound";

const app = document.querySelector<HTMLElement>("#app")!;
const sound = new Sound();
let saved = loadMission();
let state = createInitialState();
let scene: SceneApp | undefined;
let mounted = false;
let selected: Decision | undefined;
let executionElapsed = 0;
let lastTime = performance.now();
let modal: "help" | "pause" | undefined;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function dispatch(action: GameAction): void {
  const previous = state;
  state = gameReducer(state, action);
  if (state === previous) return;
  selected = state.pendingDecision;
  if (action.type === "DECISION_CONFIRM") {
    executionElapsed = 0;
    sound.play("confirm");
  }
  if (action.type === "EXECUTION_COMPLETE")
    sound.play(state.phase === "ending" ? "ending" : "feedback");
  if (action.type === "RETRY") saved = undefined;
  saveMission(state);
  render();
  const focusSelector =
    action.type === "DECISION_PREVIEW"
      ? `[data-decision="${state.pendingDecision?.id}"]`
      : action.type === "ALLOCATE"
        ? action.allocation.supportEnergy !== undefined
          ? "#support-energy"
          : "#specialist"
        : action.type === "EXECUTION_COMPLETE"
          ? '[data-action="continue"]'
          : undefined;
  if (focusSelector)
    document
      .querySelector<HTMLElement>(focusSelector)
      ?.focus({ preventScroll: true });
}
function shellMarkup(): string {
  return `<div class="app-shell"><div id="mission-header"></div>
 <main class="main-grid" aria-label="灰环点火任务控制台">
 <section class="panel dialogue-panel"><div class="panel-heading"><span data-dialogue-heading>通信频道</span><span id="scene-name"></span></div><div id="dialogue-stream" class="dialogue-stream" role="log" aria-live="polite" aria-relevant="additions"></div></section>
 <section class="panel viewport-panel"><div class="panel-heading"><span>态势与路线</span><button class="icon-button mobile-toggle" data-action="map-toggle" aria-expanded="false">展开</button><span id="renderer-status"></span></div>
 <div class="map-body"><div id="viewport" class="viewport-canvas"></div><div class="map-toolbar"><button data-action="reset-view">重置视角</button><button data-action="top-view">俯视</button><button data-action="follow">跟随车队</button></div><div id="route-pickers" class="route-pickers"></div><div id="route-info" class="route-info" role="status"></div></div></section>
 <aside class="panel resource-panel"><div class="panel-heading"><span>遥测资源</span><span>任务模型</span></div><div id="resource-rail" class="resource-list"></div><details class="log-details"><summary>因果日志</summary><div id="event-log" class="event-log"></div></details></aside>
 </main><section id="decision-dock" class="panel decision-panel" aria-label="行动选择"></section><div id="impact-report" class="impact-report" role="status"></div><div class="mission-footer"><span>本局种子 ${state.seed} · 数据仅保存在此浏览器</span><button data-action="abort">终止任务并撤离</button></div><div id="modal-layer"></div></div>`;
}
function mountShell(): void {
  if (mounted) return;
  scene?.dispose();
  app.innerHTML = shellMarkup();
  mounted = true;
  scene = new SceneApp({
    container: document.querySelector<HTMLElement>("#viewport")!,
    routes: ROUTES,
    seed: state.seed,
    forceFallback: new URLSearchParams(location.search).has("fallback"),
    onNodeSelect: (id) => dispatch({ type: "MAP_SELECT", nodeId: id }),
  });
  document
    .querySelector('[data-action="reset-view"]')
    ?.addEventListener("click", () => scene?.resetView());
  document
    .querySelector('[data-action="top-view"]')
    ?.addEventListener("click", () => scene?.topView());
  document
    .querySelector('[data-action="follow"]')
    ?.addEventListener("click", () => scene?.followVehicle());
  document
    .querySelector('[data-action="map-toggle"]')
    ?.addEventListener("click", (event) => {
      const panel = document.querySelector(".viewport-panel")!;
      const open = panel.classList.toggle("map-expanded");
      const b = event.currentTarget as HTMLButtonElement;
      b.textContent = open ? "收起" : "展开";
      b.setAttribute("aria-expanded", String(open));
      scene?.resize();
    });
  document
    .querySelector('[data-action="abort"]')
    ?.addEventListener("click", () => {
      dispatch({ type: "ABORT" });
    });
}
function briefing(): void {
  scene?.dispose();
  scene = undefined;
  mounted = false;
  app.innerHTML = `<div class="app-shell briefing"><section class="briefing-card"><span class="briefing-kicker">现场救援协议 · 07</span><h1>灰环点火</h1><h2>把一座塔救回来，把五个人带回去。</h2><p>白弧盆地的推力塔进入冷停机。你是现场系统工程师林岑。车里有五个人、一枚未经完整校准的脉冲点火芯，以及十八小时的窗口。</p><p>通过通信选择行动，在态势窗核验路线，把能源分给保障系统。决定会被队友记住，也会写进维修记录。</p><div class="briefing-facts"><div class="briefing-fact"><strong>18 小时</strong><span>游戏内任务窗口</span></div><div class="briefing-fact"><strong>5 人</strong><span>健康与疲劳共同影响作业</span></div><div class="briefing-fact"><strong>4 结局</strong><span>由资源和实际点火结果决定</span></div></div><div class="briefing-actions"><button class="action-button" data-action="start">开始任务</button>${saved && saved.phase !== "briefing" ? '<button class="action-button secondary" data-action="resume-save">恢复上次任务</button>' : ""}<button class="action-button secondary" data-action="help">玩法与科学说明</button></div><p class="muted fine-print">原创未来任务；行星级推进与点火芯为虚构技术。地形、热管理、视距和资源分配采用公开科学概念的简化模型。</p></section><div id="modal-layer"></div></div>`;
  app.querySelector('[data-action="start"]')?.addEventListener("click", () => {
    clearMission();
    saved = undefined;
    dispatch({ type: "DIALOGUE_ADVANCE" });
  });
  app
    .querySelector('[data-action="resume-save"]')
    ?.addEventListener("click", () => {
      if (saved) {
        state = { ...saved, paused: false };
        selected = state.pendingDecision;
        render();
      }
    });
  app.querySelector('[data-action="help"]')?.addEventListener("click", () => {
    modal = "help";
    renderModal();
  });
  renderModal();
}
function ending(): void {
  scene?.dispose();
  scene = undefined;
  mounted = false;
  const result = ENDINGS[state.endingId ?? "silent-lamp"];
  const chart = (key: "energy" | "safety") =>
    state.decisions
      .map(
        (record, index) =>
          `${((index + 1) * 100) / Math.max(1, state.decisions.length)},${100 - record.after[key]}`,
      )
      .join(" ");
  app.innerHTML = `<div class="app-shell ending"><section class="ending-card"><span class="briefing-kicker">最终维修报告</span><h1>${result.title}</h1><p>${result.summary}</p><div class="ending-stats"><div class="ending-stat"><strong>${Math.round(state.resources.engineStability)}%</strong><span>发动机稳定度</span></div><div class="ending-stat"><strong>${crewAvailableCount(state)}/5</strong><span>可用成员</span></div><div class="ending-stat"><strong>${formatTime(state.resources.time)}</strong><span>剩余窗口</span></div></div><div class="debrief-curves"><span>能源（青） / 安全（紫） · 按决定顺序</span><svg viewBox="0 0 110 105" role="img" aria-label="能源与安全决策趋势"><polyline points="0,${100 - 100} ${chart("energy")}" stroke="#69e3ff"/><polyline points="0,20 ${chart("safety")}" stroke="#9b89ff"/></svg></div><ol class="debrief-log">${state.decisions.map((r) => `<li><strong>${escapeHtml(r.label)}</strong><p>${escapeHtml(r.response)}<br>能源 ${r.before.energy} → ${r.after.energy} · 安全 ${r.before.safety} → ${r.after.safety} · 负责人 ${state.crew[r.allocation.specialist].name}</p></li>`).join("")}</ol><p>署名：林岑，现场系统工程师。所有代价已随维修记录提交。</p><div class="briefing-actions"><button class="action-button" data-action="retry">同种子重新挑战</button><button class="action-button secondary" data-action="new-seed">新参数挑战</button><button class="action-button secondary" data-action="export">下载维修记录</button></div></section></div>`;
  app
    .querySelector('[data-action="retry"]')
    ?.addEventListener("click", () =>
      dispatch({ type: "RETRY", seed: state.seed }),
    );
  app
    .querySelector('[data-action="new-seed"]')
    ?.addEventListener("click", () =>
      dispatch({
        type: "RETRY",
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
      }),
    );
  app.querySelector('[data-action="export"]')?.addEventListener("click", () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            title: result.title,
            seed: state.seed,
            resources: state.resources,
            crew: state.crew,
            decisions: state.decisions,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `灰环点火-${state.seed}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });
}
function renderModal(): void {
  const layer = document.querySelector<HTMLElement>("#modal-layer");
  if (!layer) return;
  const type = state.paused ? "pause" : modal;
  if (!type) {
    layer.innerHTML = "";
    return;
  }
  layer.innerHTML = `<dialog class="help-dialog" aria-label="${type === "pause" ? "任务暂停" : "玩法说明"}"><h2>${type === "pause" ? "任务已暂停" : "玩法与科学说明"}</h2>${type === "pause" ? "<p>资源和执行动画保持冻结，继续后回到当前频道。</p>" : "<p>① 读通信；② 在态势窗点路线；③ 选行动，分配 0 / 4 / 8 能源给保障，并指定负责人；④ 核对预估与缺口后执行；⑤ 读队员反馈。</p><p>负责人会积累疲劳；适配专业可改善校准、地形或通信。保障能源能提高安全，但与驱动和点火共用电池。风险由路线、安全、疲劳、准备与种子共同决定。</p><p>这不是知识问答。结局需要真实点火，任务窗口、能源、人员或安全耗尽会迫使撤离。手机上点“展开”查看态势。</p><p>科学依据：NASA 热管理、生命保障和车辆地形移动；ESA 视距与中继通信。地球迁移、行星推力塔和点火芯为原创未来假设，单位为缩放参数。</p><p>键盘：Tab 切换，Enter 确认；1–4 选择方案；Esc 暂停；R 重置视角。三维画布方向键选择节点、Enter 确认。缩放/旋转可用拖动和滚轮，也有俯视与路线按钮。</p>"}<button class="action-button" data-action="close-modal">${type === "pause" ? "继续任务" : "返回任务"}</button></dialog>`;
  const dialog = layer.querySelector("dialog")!;
  dialog.showModal();
  dialog.querySelector("button")?.focus();
  const close = () => {
    modal = undefined;
    if (state.paused) dispatch({ type: "PAUSE", paused: false });
    else renderModal();
  };
  dialog
    .querySelector('[data-action="close-modal"]')
    ?.addEventListener("click", close);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
}
function render(): void {
  if (state.phase === "briefing") {
    briefing();
    return;
  }
  if (state.phase === "ending") {
    ending();
    return;
  }
  mountShell();
  const node = getNode(state.sceneId);
  if (!node) {
    app.textContent = "任务数据无法读取，请刷新重新开始。";
    return;
  }
  renderMissionHeader(document.querySelector("#mission-header")!, state, {
    onPause: () => dispatch({ type: "PAUSE" }),
    onHelp: () => {
      modal = "help";
      renderModal();
    },
    onSound: () => {
      sound.toggle();
      render();
    },
    muted: sound.muted,
  });
  renderDialogueStream(
    document.querySelector("#dialogue-stream")!,
    state,
    node,
  );
  renderDialogueHeading(document.querySelector(".dialogue-panel")!, node);
  document.querySelector("#scene-name")!.textContent = node.title;
  renderResourceRail(document.querySelector("#resource-rail")!, state);
  renderEventLog(document.querySelector("#event-log")!, state);
  const last = state.decisions.at(-1);
  renderImpactReport(
    document.querySelector("#impact-report")!,
    last?.response ?? "",
  );
  document.querySelector("#renderer-status")!.textContent = scene?.isFallback
    ? "二维回退"
    : "三维在线";
  const target = state.flags.routeWest
    ? "west"
    : state.flags.routeSouth
      ? "south"
      : "core";
  const vehicle =
    ROUTES.find(
      (r) =>
        r.id ===
        (["mount", "ignition"].includes(state.sceneId)
          ? "tower"
          : ["relay", "calibration"].includes(state.sceneId)
            ? "relay"
            : target),
    ) ?? ROUTES[0];
  scene?.setViewportModel({
    routes: ROUTES,
    selectedNode: state.selectedRoute,
    vehiclePosition: { x: vehicle.x, z: vehicle.z },
    riskZones: state.resources.safety < 45 ? [target] : [],
    metrics: {
      safety: state.resources.safety,
      engineStability: state.resources.engineStability,
      comms: state.flags.relayActive ? state.commsConfidence : 0,
    },
    action: state.phase === "execution" ? state.pendingDecision?.id : "",
  });
  scene?.setVisible(!state.paused && !document.hidden);
  const picker = document.querySelector("#route-pickers")!;
  picker.innerHTML = ROUTES.map(
    (route) =>
      `<button data-route="${route.id}" aria-pressed="${state.selectedRoute === route.id}" ${!["conversation", "tactical"].includes(state.phase) ? "disabled" : ""}>${escapeHtml(route.label)}</button>`,
  ).join("");
  picker
    .querySelectorAll<HTMLButtonElement>("[data-route]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        dispatch({ type: "MAP_SELECT", nodeId: button.dataset.route! }),
      ),
    );
  const route = ROUTES.find((r) => r.id === state.selectedRoute);
  document.querySelector("#route-info")!.innerHTML = route
    ? `<strong>${route.label}</strong><p>${route.distance} km · 坡度 ${route.slope}° · ${route.temperature}℃ · 横风 ${route.wind} km/h<br>风险 ${route.terrainRisk}/100 · 通信置信度 ${route.commsConfidence}%</p><span>${route.description}</span>`
    : "点选南坡或西沟，核验距离、坡度和环境。此处为虚构局部地形，不使用现实中国地图。";
  const dock = document.querySelector<HTMLElement>("#decision-dock")!;
  if (state.phase === "feedback") {
    dock.innerHTML = `<div class="panel-heading"><span>现场结果</span><span>已记入维修报告</span></div><div class="decision-body"><p>${escapeHtml(last?.response ?? "执行已完成。")}</p><button class="action-button" data-action="continue">继续通信 · ${escapeHtml(node.title)}</button></div>`;
    dock
      .querySelector('[data-action="continue"]')
      ?.addEventListener("click", () => dispatch({ type: "DIALOGUE_ADVANCE" }));
  } else
    renderDecisionDock(dock, state, node.choices, selected, {
      onPreview: (decision) => dispatch({ type: "DECISION_PREVIEW", decision }),
      onConfirm: (decision) => {
        if (decisionCheck(state, decision).allowed)
          dispatch({ type: "DECISION_CONFIRM", decision });
      },
      onAllocate: (allocation) => dispatch({ type: "ALLOCATE", allocation }),
    });
  renderModal();
}
// Execution time pauses while hidden or suspended. No stale timeout survives restart.
setInterval(() => {
  const now = performance.now();
  const delta = Math.min(100, now - lastTime);
  lastTime = now;
  if (state.phase !== "execution" || state.paused || modal || document.hidden)
    return;
  executionElapsed += delta;
  if (executionElapsed >= (reducedMotion ? 100 : 1200))
    dispatch({ type: "EXECUTION_COMPLETE" });
}, 50);
document.addEventListener("visibilitychange", () => {
  lastTime = performance.now();
  scene?.setVisible(!document.hidden && !state.paused);
});
document.addEventListener("keydown", (event) => {
  if (
    ["INPUT", "SELECT", "TEXTAREA"].includes(
      (event.target as HTMLElement)?.tagName,
    )
  )
    return;
  if (
    event.key === "Escape" &&
    state.phase !== "briefing" &&
    state.phase !== "ending" &&
    !modal
  ) {
    event.preventDefault();
    dispatch({ type: "PAUSE" });
  }
  if (event.key.toLowerCase() === "r") scene?.resetView();
  if (
    /^[1-4]$/.test(event.key) &&
    ["conversation", "tactical"].includes(state.phase)
  ) {
    const d = getNode(state.sceneId)?.choices[Number(event.key) - 1];
    if (d) dispatch({ type: "DECISION_PREVIEW", decision: d });
  }
});
render();
