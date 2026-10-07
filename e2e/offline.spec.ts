import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { step } from './helpers';

// 离线包：双击 dist/index.html（file:// 协议）即可完整游玩。需先运行 npm run build
const file = resolve('dist/index.html');

test('离线包通过 file:// 直接打开并完整通关', async ({ page }) => {
  test.skip(!existsSync(file), '请先运行 npm run build');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('voice/')) errors.push(m.text()); });
  await page.goto(`${pathToFileURL(file).href}?seed=99&fast=1`);
  await page.getByRole('button', { name: '开始任务' }).click();
  let result = 'idle';
  for (let i = 0; i < 600 && result !== 'ending'; i++) {
    result = await step(page);
    if (result === 'idle') await page.waitForTimeout(60);
  }
  expect(result).toBe('ending');
  await expect(page.locator('#scene canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});
