import { test } from '@playwright/test';
import { step } from './helpers';

// 仅在 CAPTURE=1 时运行：沿通关路线截取每个场景，供人工检查画面
test.skip(!process.env.CAPTURE, '设置 CAPTURE=1 以截图');

test('截取各场景画面', async ({ page }, info) => {
  test.setTimeout(600_000);
  await page.goto('/?seed=20351&fast=1');
  await page.getByRole('button', { name: /开始/ }).first().click();
  const seen = new Set<string>();
  for (let i = 0; i < 600; i++) {
    const caption = (await page.locator('.scene-caption b').textContent().catch(() => '')) ?? '';
    if (caption && !seen.has(caption) && !(await page.locator('.overlay').isVisible())) {
      seen.add(caption);
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `test-results/shots/${info.project.name}-${String(seen.size).padStart(2, '0')}.png` });
    }
    const r = await step(page);
    if (r === 'ending') {
      await page.waitForTimeout(800);
      await page.screenshot({ path: `test-results/shots/${info.project.name}-ending.png`, fullPage: true });
      break;
    }
    if (r === 'idle') await page.waitForTimeout(60);
  }
});
