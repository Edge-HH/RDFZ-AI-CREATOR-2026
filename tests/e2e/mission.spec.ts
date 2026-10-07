import { expect, test, type Page } from "@playwright/test";
async function readDialogue(page: Page) {
  for (
    let i = 0;
    i < 8 && (await page.locator('[data-action="dialogue-next"]').count());
    i++
  )
    await page.locator('[data-action="dialogue-next"]').click();
}
async function decide(page: Page, id: string) {
  await readDialogue(page);
  await page.locator(`[data-decision="${id}"]`).click();
  await page.locator('[data-action="confirm"]').click();
  await expect(
    page.locator('[data-action="continue"], [data-action="retry"]'),
  ).toBeVisible();
}
async function start(page: Page, url = "/") {
  await page.goto(url);
  await page.getByRole("button", { name: "开始任务", exact: true }).click();
  await expect(page.locator('[data-action="dialogue-next"]')).toBeVisible();
  await expect(page.locator("[data-decision]")).toHaveCount(0);
}
async function continueMission(page: Page) {
  await page.locator('[data-action="continue"]').click();
}
const south = [
  "prologue-scan",
  "loadout-cooling",
  "route-select-south",
  "ice-drone-scan",
  "relay-build",
  "relay-calibrate-stop",
  "mount-purge-safe",
  "ignition-all-cooling",
];

test("reveals one line at a time, restores read progress and lets players reconsider", async ({
  page,
}) => {
  await start(page);
  await expect(page.locator("#mission-objective")).toContainText(
    "送达点火芯，重启环弧—7",
  );
  await expect(page.locator("[data-current-dialogue]")).toContainText(
    "十八小时",
  );
  await page.keyboard.press("1");
  await expect(page.locator('[data-action="confirm"]')).toHaveCount(0);
  await page.locator('[data-action="dialogue-next"]').click();
  await expect(page.locator("[data-current-dialogue]")).toContainText(
    "风已经换向",
  );
  await page.reload();
  await page.getByRole("button", { name: "恢复上次任务" }).click();
  await expect(page.locator("[data-current-dialogue]")).toContainText(
    "风已经换向",
  );
  await expect(page.locator("[data-decision]")).toHaveCount(0);
  await readDialogue(page);
  await expect(page.locator("[data-decision]")).toHaveCount(3);
  await expect(page.locator("[data-current-dialogue]")).toContainText("你来定");
  await page.locator('[data-decision="prologue-scan"]').click();
  await expect(page.locator("[data-decision]")).toHaveCount(1);
  await expect(page.locator('[data-action="confirm"]')).toBeVisible();
  await expect(page.locator(".selected-preview")).not.toContainText("事件风险");
  await page.reload();
  await page.getByRole("button", { name: "恢复上次任务" }).click();
  await expect(page.locator("[data-decision]")).toHaveCount(1);
  await expect(page.locator('[data-action="confirm"]')).toBeVisible();
  await page.locator('[data-action="change-reply"]').click();
  await expect(page.locator("[data-decision]")).toHaveCount(3);
  await expect(page.locator(".compact-metric")).toContainText([
    "18h 00m",
    "100u",
  ]);
  await page.locator(".mission-menu summary").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".mission-menu")).not.toHaveAttribute("open", "");
  await page.locator(".mission-menu summary").click();
  await page.locator('[data-action="help"]').click();
  await expect(page.getByRole("dialog", { name: "玩法说明" })).toBeVisible();
  await page.locator('[data-action="close-modal"]').click();
  await page.screenshot({
    path: "releases/screenshots/story-desktop.png",
    fullPage: true,
  });
});

test("desktop: dialogue choices, safeguards, route map, full mission, saved reload and retry", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await start(page);
  await readDialogue(page);
  await page.locator('[data-decision="prologue-scan"]').click();
  await page.locator(".allocation-details summary").click();
  await page.locator("#support-energy").fill("4");
  await page.locator("#support-energy").dispatchEvent("change");
  await page.locator('[data-action="confirm"]').click();
  await expect(page.locator('[data-action="continue"]')).toBeVisible();
  await expect(page.locator("[data-current-dialogue]")).toContainText(
    "复扫结束",
  );
  await expect(page.locator(".header-metrics")).toContainText("96u");
  await expect(page.locator(".result-chips")).toContainText("能源 -4");
  await continueMission(page);
  await decide(page, "loadout-cooling");
  await continueMission(page);
  await page.locator('[data-action="open-map"]').click();
  await page.locator('[data-route="south"]').click();
  await expect(page.locator("#route-info")).toContainText("24°");
  await page.locator('[data-action="close-support"]').click();
  await decide(page, "route-select-south");
  await continueMission(page);
  await decide(page, "ice-drone-scan");
  await continueMission(page);
  await page.reload();
  await page.getByRole("button", { name: "恢复上次任务" }).click();
  for (const id of south.slice(4)) {
    await decide(page, id);
    if (id !== south.at(-1)) await continueMission(page);
  }
  await expect(page.getByRole("heading", { name: "稳态迁移" })).toBeVisible();
  await expect(page.locator(".debrief-log li")).toHaveCount(8);
  await page.screenshot({
    path: "releases/screenshots/ending-desktop.png",
    fullPage: true,
  });
  await page.locator('[data-action="retry"]').click();
  await expect(
    page.getByRole("button", { name: "开始任务", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(
    requests.filter(
      (url) =>
        !url.startsWith(
          process.env.TEST_DIST
            ? "http://127.0.0.1:4173"
            : "http://127.0.0.1:5173",
        ) &&
        !url.startsWith("data:") &&
        !url.startsWith("blob:"),
    ),
  ).toEqual([]);
});

test("responsive dialogue, optional fallback sheet and keyboard choices", async ({
  page,
}) => {
  await start(page, "/?fallback=1");
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator("#support-dialog")).not.toBeVisible();
  await expect(page.locator(".viewport-canvas")).not.toBeVisible();
  await page.locator('[data-action="open-map"]').click();
  await expect(page.locator("#renderer-status")).toHaveText("二维回退");
  await page.locator('[data-route="west"]').click();
  await expect(page.locator("#route-info")).toContainText("67 km");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-action="open-map"]')).toBeFocused();
  await readDialogue(page);
  await page.locator('[data-decision="prologue-scan"]').focus();
  await page.keyboard.press("Enter");
  await page.screenshot({
    path: "releases/screenshots/story-mobile.png",
    fullPage: true,
  });
  await page.locator('[data-action="confirm"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-action="continue"]')).toBeVisible();
  await page.setViewportSize({ width: 812, height: 375 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("pause and reduced motion preserve read progress and actual costs", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page);
  await page.getByRole("button", { name: "暂停任务", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "任务暂停" })).toBeVisible();
  await page
    .getByRole("dialog", { name: "任务暂停" })
    .getByRole("button", { name: "继续任务", exact: true })
    .click();
  await expect(page.locator("[data-current-dialogue]")).toContainText(
    "十八小时",
  );
  await decide(page, "prologue-scan");
  await expect(page.locator(".header-metrics")).toContainText("17h 52m");
});

test("Three.js loads only when inspecting and stops when returning to dialogue", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const models: string[] = [];
  page.on("response", (r) => {
    if (r.url().endsWith(".glb") && r.ok()) models.push(r.url());
  });
  await start(page);
  expect(models).toHaveLength(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.locator('[data-action="open-map"]').click();
  await expect(page.locator("#renderer-status")).toHaveText("三维在线");
  await expect.poll(() => models.length).toBe(3);
  await expect(page.locator("canvas")).toHaveAttribute("data-models", "3");
  await expect
    .poll(async () =>
      Number(await page.locator("canvas").getAttribute("data-fps")),
    )
    .toBeGreaterThan(process.env.CI ? 0 : 20);
  await page.screenshot({
    path: "releases/screenshots/tactical-desktop.png",
    fullPage: true,
  });
  await page.locator('[data-action="close-support"]').click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-render-active",
    "false",
  );
  await expect(page.locator("[data-current-dialogue]")).toContainText(
    "十八小时",
  );
  expect(errors).toEqual([]);
});

test("mobile touch reveals dialogue and acts without external network", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const external: string[] = [];
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith("http://127.0.0.1:")) {
      external.push(url);
      return route.abort();
    }
    return route.continue();
  });
  await start(page, "/?fallback=1");
  while (await page.locator('[data-action="dialogue-next"]').count())
    await page.locator('[data-action="dialogue-next"]').tap();
  await page.locator('[data-decision="prologue-scan"]').tap();
  await page.locator('[data-action="confirm"]').tap();
  await expect(page.locator('[data-action="continue"]')).toBeVisible();
  expect(external).toEqual([]);
  await context.close();
});

test("west branch completes all eight tasks without WebGL or opening a map", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page, "/?fallback=1");
  const west = [
    "prologue-scan",
    "loadout-cooling",
    "route-select-west",
    "steam-relay",
    ...south.slice(4),
  ];
  for (const id of west) {
    await decide(page, id);
    if (id !== west.at(-1)) await continueMission(page);
  }
  await expect(page.getByRole("heading", { name: "稳态迁移" })).toBeVisible();
  await expect(page.locator(".debrief-log li")).toHaveCount(8);
  await expect(page.locator("canvas")).toHaveCount(0);
});
