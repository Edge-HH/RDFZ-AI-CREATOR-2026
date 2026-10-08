import { expect, test } from '@playwright/test';
import { reachDialogue, step, topbarButton } from './helpers';

test('从标题开始，完整通关到结局，并能再次挑战', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=20351&fast=1');
  await page.getByRole('button', { name: '开始任务' }).click();
  let result: string = 'idle';
  for (let i = 0; i < 600 && result !== 'ending'; i++) {
    result = await step(page);
    if (result === 'idle') await page.waitForTimeout(60);
  }
  expect(result).toBe('ending');
  await expect(page.locator('.ending-hero .grade')).toHaveText(/[SABCD]/);
  await expect(page.locator('.chart')).toBeVisible();
  // 结局页不应产生横向滚动
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: '再次挑战' }).click();
  await expect(page.locator('.chapter-card')).toBeVisible();
  expect(errors).toEqual([]);
});

test('中途刷新后可以从存档继续', async ({ page }) => {
  await page.goto('/?seed=7&fast=1');
  await page.getByRole('button', { name: '开始任务' }).click();
  for (let i = 0; i < 12; i++) { if ((await step(page)) === 'idle') await page.waitForTimeout(60); }
  await page.reload();
  await expect(page.getByRole('button', { name: '继续任务' })).toBeVisible();
  await page.getByRole('button', { name: '继续任务' }).click();
  // 恢复点可能正好是配载等全屏面板，先推进到对话框可操作
  await reachDialogue(page);
  await page.locator('.dialogue').getByRole('button', { name: '通信记录' }).click();
  await expect(page.locator('.overlay.backlog')).toContainText('从存档恢复');
});

test('不发出任何外部网络请求', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url()); });
  await page.goto('/?seed=1&fast=1');
  await page.getByRole('button', { name: '开始任务' }).click();
  for (let i = 0; i < 30; i++) { if ((await step(page)) === 'idle') await page.waitForTimeout(60); }
  expect(external).toEqual([]);
});

test('从标题页打开说明、档案、设置后再开始任务，标题页完全消失', async ({ page }) => {
  await page.goto('/?seed=3&fast=1');
  for (const name of ['玩法与依据', '知识档案集', '设置']) {
    await page.locator('.title-screen').getByRole('button', { name }).click();
    await page.locator('.overlay .sheet-foot button.primary').click();
  }
  await page.getByRole('button', { name: '开始任务' }).click();
  await expect(page.locator('.title-screen')).toHaveCount(0);
  for (let i = 0; i < 8; i++) { if ((await step(page)) === 'idle') await page.waitForTimeout(60); }
  // 存档后回到标题，再从设置返回并继续任务
  await page.reload();
  await page.locator('.title-screen').getByRole('button', { name: '设置' }).click();
  await page.locator('.overlay .sheet-foot button.primary').click();
  await page.getByRole('button', { name: '继续任务' }).click();
  await expect(page.locator('.title-screen')).toHaveCount(0);
});

test('标题页与顶栏提供项目仓库链接', async ({ page }) => {
  await page.goto('/?fast=1');
  const link = page.locator('.title-screen').getByRole('link', { name: /项目仓库/ });
  await expect(link).toHaveAttribute('href', 'https://github.com/Edge-HH/RDFZ-AI-CREATOR-2026');
  await expect(link).toHaveAttribute('target', '_blank');
  await page.getByRole('button', { name: '开始任务' }).click();
  // 手机端链接收在“≡”菜单里，这里只判断存在
  const top = page.locator('.topbar a[href="https://github.com/Edge-HH/RDFZ-AI-CREATOR-2026"]');
  await expect(top).toHaveCount(1);
  await expect(top).toHaveAttribute('aria-label', /项目仓库/);
});

test('解锁新知识时弹出档案卡，并收入知识档案集', async ({ page }) => {
  await page.goto('/?seed=11&fast=1');
  await page.getByRole('button', { name: '开始任务' }).click();
  let card = false;
  for (let i = 0; i < 40 && !card; i++) {
    card = await page.locator('.discovery').isVisible();
    if (!card && (await step(page, { keepDiscovery: true })) === 'idle') await page.waitForTimeout(60);
  }
  expect(card).toBe(true);
  await expect(page.locator('.discovery h3')).toHaveText('光速延迟');
  await expect(page.locator('.discovery a[target="_blank"]').first()).toBeVisible();
  await page.locator('.discovery').getByRole('button', { name: '收入知识档案集' }).click();
  await (await topbarButton(page, '知识档案集')).click();
  await expect(page.locator('.overlay .arch:not(.locked) h4', { hasText: '光速延迟' })).toBeVisible();
});

test('对话框文字完整可见，选项面板不遮挡对话框', async ({ page }) => {
  await page.goto('/?seed=5&fast=1');
  await page.getByRole('button', { name: '开始任务' }).click();
  let checked = 0;
  for (let i = 0; i < 200 && checked < 12; i++) {
    const cont = page.locator('.dialogue').getByRole('button', { name: '继续', exact: true });
    const opts = page.locator('.choices button.opt');
    if (!(await page.locator('.overlay').isVisible()) && ((await cont.isVisible()) || (await opts.first().isVisible()))) {
      const m = await page.evaluate(() => {
        const dlg = document.querySelector('.dialogue')!.getBoundingClientRect();
        const text = document.querySelector<HTMLElement>('.dialogue .text')!;
        const ch = document.querySelector('.choices')!;
        return {
          overflow: text.scrollHeight - text.clientHeight,
          choicesBottom: ch.children.length ? ch.getBoundingClientRect().bottom : -Infinity,
          dlgTop: dlg.top, dlgBottom: dlg.bottom, dlgLeft: dlg.left, dlgRight: dlg.right,
          vw: window.innerWidth, vh: window.innerHeight,
        };
      });
      expect(m.overflow).toBeLessThanOrEqual(1);
      expect(m.choicesBottom).toBeLessThanOrEqual(m.dlgTop);
      expect(m.dlgTop).toBeGreaterThanOrEqual(0);
      expect(m.dlgLeft).toBeGreaterThanOrEqual(0);
      expect(m.dlgBottom).toBeLessThanOrEqual(m.vh);
      expect(m.dlgRight).toBeLessThanOrEqual(m.vw);
      checked++;
    }
    if ((await step(page)) === 'idle') await page.waitForTimeout(60);
  }
  expect(checked).toBeGreaterThanOrEqual(12);
});

test('通信记录收录了已显示的台词', async ({ page }) => {
  await page.goto('/?seed=9&fast=1');
  await page.getByRole('button', { name: '开始任务' }).click();
  for (let i = 0; i < 10; i++) { if ((await step(page)) === 'idle') await page.waitForTimeout(60); }
  await reachDialogue(page);
  const current = (await page.locator('.dialogue .text').textContent())!.trim();
  await page.locator('.dialogue').getByRole('button', { name: '通信记录' }).click();
  const log = page.locator('.overlay.backlog');
  await expect(log).toBeVisible();
  expect(await log.locator('.msg:not(.divider)').count()).toBeGreaterThanOrEqual(5);
  await expect(log.locator('.msg:not(.divider) .text').last()).toHaveText(current);
  await page.keyboard.press('Escape');
  await expect(log).toHaveCount(0);
});

test('遥测抽屉：点击状态条打开，Esc 关闭，T 键再次打开', async ({ page }) => {
  await page.goto('/?seed=4&fast=1');
  await page.getByRole('button', { name: '开始任务' }).click();
  await page.getByRole('button', { name: '开始', exact: true }).click();
  const drawer = page.locator('.drawer');
  await expect(drawer).toBeHidden();
  await page.locator('.topbar .gauges').click();
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('乘员');
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await page.keyboard.press('t');
  await expect(drawer).toBeVisible();
  await page.keyboard.press('t');
  await expect(drawer).toBeHidden();
});

test('游戏进行中没有横向滚动', async ({ page }) => {
  await page.goto('/?seed=6&fast=1');
  await page.getByRole('button', { name: '开始任务' }).click();
  for (let i = 0; i < 40; i++) {
    if (await page.locator('.choices button.opt').first().isVisible()) break;
    if ((await step(page)) === 'idle') await page.waitForTimeout(60);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
