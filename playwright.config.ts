import { defineConfig, devices } from '@playwright/test';

// E2E_STATIC=1：针对构建产物（vite preview）运行，不受开发时热更新整页刷新的干扰（需先 npm run build）
const isStatic = !!process.env.E2E_STATIC;
const port = isStatic ? 5178 : 5174;

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  webServer: { command: `npx vite ${isStatic ? 'preview ' : ''}--port ${port} --strictPort`, url: `http://localhost:${port}`, reuseExistingServer: true, timeout: 60_000 },
  projects: [
    // 使用系统已安装的 Chrome，无需额外下载 Playwright 浏览器
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
});
