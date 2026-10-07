import type { Page } from '@playwright/test';

// 自动通关：每一步点击当前可见的、优先级最高的控件
export async function step(page: Page, opts: { keepDiscovery?: boolean } = {}): Promise<'ending' | 'acted' | 'idle'> {
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
    if (opts.keepDiscovery && (await overlay.locator('.discovery').isVisible())) return 'idle';
    for (const name of ['开始', '继续', '收入知识档案集']) {
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
