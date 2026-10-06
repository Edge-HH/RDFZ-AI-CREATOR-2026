import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 在线版：部署到 GitHub Pages（相对路径，兼容任意仓库名）
// 离线版：`--mode offline` 打包为单个 HTML，双击即可在浏览器中运行（file:// 协议）
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'offline' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'offline' ? 'dist-offline' : 'dist',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 60000,
  },
}));
