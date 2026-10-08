import { test } from '@playwright/test';
import { step } from './helpers';

// 仅在 CAPTURE=1 时运行：沿通关路线截取每个场景，供人工检查画面
test.skip(!process.env.CAPTURE, '设置 CAPTURE=1 以截图');
test.use({ launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] } });

test('截取各场景画面', async ({ page }, info) => {
  test.setTimeout(600_000);
  await page.goto('/?seed=20351&fast=1');
  await page.getByRole('button', { name: /开始/ }).first().click();
  const seen = new Set<string>();
  for (let i = 0; i < 600; i++) {
    // CAPTURE_ALL=1 时按“场景 + 段落”截图（每个机位一张），否则每个场景一张
    const caption = await page.evaluate((all) => (all ? document.querySelector('.frame-cam')?.textContent : document.querySelector('.frame-cam b')?.textContent) ?? '', !!process.env.CAPTURE_ALL);
    if (caption && !seen.has(caption) && !(await page.locator('.overlay').isVisible())) {
      seen.add(caption);
      await page.waitForTimeout(1800);
      await page.screenshot({ timeout: 20_000, path: `test-results/shots/${info.project.name}-${String(seen.size).padStart(2, '0')}.png` });
      // 面数预算：单场景高档不超过 30 万三角形、400 次绘制
      const stats = await page.evaluate(() => (window as unknown as { __stage?: { info: { triangles: number; calls: number } } }).__stage?.info);
      console.log(`${String(seen.size).padStart(2, '0')} ${caption} · 三角形 ${stats?.triangles ?? '-'} · 绘制 ${stats?.calls ?? '-'}`);
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
