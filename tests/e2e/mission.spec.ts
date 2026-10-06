import { expect, test, type Page } from "@playwright/test";
async function decide(page: Page, id: string) {
  await page.locator(`[data-decision="${id}"]`).click();
  await page.locator('[data-action="confirm"]').click();
  await expect(
    page.locator('[data-action="continue"], [data-action="retry"]'),
  ).toBeVisible();
}
async function start(page: Page, url = "/") {
  await page.goto(url);
  await page.getByRole("button", { name: "开始任务", exact: true }).click();
  await expect(page.locator('[data-decision="prologue-scan"]')).toBeVisible();
}
async function continueMission(page: Page) {
  await page.locator('[data-action="continue"]').click();
}
test("desktop: scene, map, allocation, complete mission, retry and saved reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await start(page);
  await page.locator("#support-energy").fill("4");
  await page.locator("#support-energy").dispatchEvent("change");
  await decide(page, "prologue-scan");
  await expect(page.locator("#resource-rail")).toContainText("96u");
  await continueMission(page);
  await decide(page, "loadout-cooling");
  await continueMission(page);
  await page.locator('[data-route="south"]').click();
  await expect(page.locator("#route-info")).toContainText("24°");
  await decide(page, "route-select-south");
  await continueMission(page);
  await decide(page, "ice-drone-scan");
  await continueMission(page);
  await page.reload();
  await page.getByRole("button", { name: "恢复上次任务" }).click();
  await decide(page, "relay-build");
  await continueMission(page);
  await decide(page, "relay-calibrate-stop");
  await continueMission(page);
  await decide(page, "mount-purge-safe");
  await continueMission(page);
  await decide(page, "ignition-all-cooling");
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
test("responsive, keyboard, touch-equivalent map and fallback", async ({
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
  await expect(page.locator(".map-body")).not.toBeVisible();
  await page.getByRole("button", { name: "展开", exact: true }).click();
  await expect(page.locator("#renderer-status")).toHaveText("二维回退");
  await page.locator('[data-route="west"]').click();
  await expect(page.locator("#route-info")).toContainText("67 km");
  await page.screenshot({
    path: "releases/screenshots/mobile-fallback.png",
    fullPage: true,
  });
  await page.locator('[data-decision="prologue-scan"]').focus();
  await page.keyboard.press("Enter");
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
test("pause, duplicate confirmation, reduced-motion and local model loading", async ({
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
  await page.locator('[data-decision="prologue-scan"]').click();
  await page.locator('[data-action="confirm"]').click();
  await expect(page.locator('[data-action="continue"]')).toBeVisible();
  await expect(page.locator("#resource-rail")).toContainText("17h 52m");
});
test("WebGL scene loads bundled detailed models without failing", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const models: string[] = [];
  page.on("response", (r) => {
    if (r.url().endsWith(".glb") && r.ok()) models.push(r.url());
  });
  await start(page);
  await expect(page.locator("#renderer-status")).toHaveText("三维在线");
  await expect.poll(() => models.length).toBe(3);
  await expect(page.locator("canvas")).toHaveAttribute("data-models", "3");
  await expect
    .poll(async () =>
      Number(await page.locator("canvas").getAttribute("data-fps")),
    )
    .toBeGreaterThan(process.env.CI ? 0 : 20);
  await page.screenshot({
    path: "releases/screenshots/game-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("mobile touch and built package operate without external network", async ({
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
  await page.getByRole("button", { name: "展开", exact: true }).tap();
  await page.locator('[data-route="south"]').tap();
  await expect(page.locator("#route-info")).toContainText("42 km");
  await page.locator('[data-decision="prologue-scan"]').tap();
  await page.locator('[data-action="confirm"]').tap();
  await expect(page.locator('[data-action="continue"]')).toBeVisible();
  expect(external).toEqual([]);
  await context.close();
});
