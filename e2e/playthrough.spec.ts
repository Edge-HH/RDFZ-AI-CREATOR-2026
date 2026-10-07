import { expect, test } from '@playwright/test';
import { step } from './helpers';

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
  await expect(page.locator('.feed')).toContainText('从存档恢复');
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
  await expect(page.locator('.topbar').getByRole('link', { name: /项目仓库/ })).toHaveCount(1);
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
  await page.locator('.topbar').getByRole('button', { name: '知识档案集' }).click();
  await expect(page.locator('.overlay .arch:not(.locked) h4', { hasText: '光速延迟' })).toBeVisible();
});

test('通信频道最新一条消息不会被底部按钮遮挡', async ({ page }) => {
  await page.goto('/?seed=5&fast=1');
  await page.getByRole('button', { name: '开始任务' }).click();
  let checked = 0;
  for (let i = 0; i < 160 && checked < 12; i++) {
    const cont = page.locator('.action-area').getByRole('button', { name: '继续', exact: true });
    const opts = page.locator('.action-area button.opt');
    if (!(await page.locator('.overlay').isVisible()) && ((await cont.isVisible()) || (await opts.first().isVisible()))) {
      await page.waitForTimeout(120);
      const gap = await page.evaluate(() => {
        const feed = document.querySelector('.feed')!;
        const last = [...feed.querySelectorAll('.msg')].at(-1)!;
        return last.getBoundingClientRect().bottom - feed.getBoundingClientRect().bottom;
      });
      expect(gap).toBeLessThanOrEqual(2);
      checked++;
    }
    if ((await step(page)) === 'idle') await page.waitForTimeout(60);
  }
  expect(checked).toBeGreaterThanOrEqual(12);
});
