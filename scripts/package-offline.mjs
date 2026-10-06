// 将单文件离线版打包为 release/astra-offline.zip（无需网络、无需服务器，双击 index.html 即可运行）
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const src = join(root, 'dist-offline', 'index.html');
if (!existsSync(src)) {
  console.error('未找到 dist-offline/index.html，请先运行 npm run build:offline');
  process.exit(1);
}

const stage = join(root, 'release', 'astra-offline');
rmSync(join(root, 'release'), { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
copyFileSync(src, join(stage, 'index.html'));
writeFileSync(
  join(stage, '使用说明.txt'),
  [
    '《Astra:群星计划》离线版',
    '',
    '1. 解压后双击 index.html，用 Chrome / Edge / Firefox / Safari 打开即可游玩。',
    '2. 全部代码、数据和样式已内联在 index.html 中，不需要网络、服务器或任何账号。',
    '3. 需要浏览器支持 WebGL；若不支持，三维场景会关闭，但规则与决策功能仍可完整使用。',
    '4. 本作不收集任何个人信息。',
    '',
  ].join('\r\n'),
  'utf8',
);

const zip = join(root, 'release', 'astra-offline.zip');
if (process.platform === 'win32') {
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${stage}\*' -DestinationPath '${zip}' -Force`], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-r', '-q', zip, '.'], { cwd: stage, stdio: 'inherit' });
}
console.log(`离线包已生成：${zip}`);
