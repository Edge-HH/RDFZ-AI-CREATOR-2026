import { expect, test, type Page } from '@playwright/test';

// 自动通关：每一步点击当前可见的、优先级最高的控件
async function step(page: Page): Promise<'ending' | 'acted' | 'idle'> {
  if (await page.getByRole('button', { name: '再次挑战' }).isVisible()) return 'ending';
  const overlay = page.locator('.overlay');
  if (await overlay.isVisible()) {
    if (await overlay.locator('.mod').first().isVisible()) {
      for (const name of ['裂变电源', '大型太阳能阵列', 'MOXIE-X 制氧机', '密闭温室', '水墙屏蔽舱', '备件包']) {
        await overlay.locator('.mod', { hasText: name }).click();
      }
      await overlay.getByRole('button', { name: '确认配载' }).click();
      return 'acted';
    }
    if (await overlay.locator('.site').first().isVisible()) {
      await overlay.locator('.site').first().click();
      await overlay.getByRole('button', { name: '锁定着陆点' }).click();
      return 'acted';
    }
    if (await overlay.locator('.preset').first().isVisible()) {
      const cards = overlay.locator('.preset');
      for (let i = 0; i < 3; i++) await cards.nth(i).click();
      await overlay.getByRole('button', { name: '写入预案并上传' }).click();
      return 'acted';
    }
    if (await overlay.locator('.auto-opt').first().isVisible()) {
      await overlay.locator('.auto-opt').nth(2).click();
      await overlay.getByRole('button', { name: '确认授权' }).click();
      return 'acted';
    }
    for (const name of ['开始', '继续']) {
      const b = overlay.getByRole('button', { name, exact: true });
      if (await b.isVisible()) { await b.click(); return 'acted'; }
    }
  }
  const area = page.locator('.action-area');
  const opt = area.locator('button.opt:not([disabled])').first();
  if (await opt.isVisible()) { await opt.click(); return 'acted'; }
  const send = area.getByRole('button', { name: /发送自检指令/ });
  if (await send.isVisible()) { await send.click(); return 'acted'; }
  const cont = area.getByRole('button', { name: '继续', exact: true });
  if (await cont.isVisible()) { await cont.click(); return 'acted'; }
  return 'idle';
}

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
