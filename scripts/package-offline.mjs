// 生成离线包：release/光速之隔-离线版.zip
// 内容：index.html（单文件，已内联全部代码与贴图）、voice/（配音，可选）、运行说明
import { deflateRawSync } from 'node:zlib';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
const OUT_DIR = 'release';
const NAME = '光速之隔-离线版';

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('未找到 dist/index.html，请先运行 npm run build');
  process.exit(1);
}

const README = `《光速之隔》离线版
================

运行方式：双击 index.html，用 Chrome、Edge 或 Firefox 打开即可。
无需安装、无需联网、无需注册。

如果画面卡顿：进入游戏后点右上角“设置”，把画质调到“低”或“关闭 3D”。
存档保存在浏览器本地；换一个浏览器，存档不会同步过去。

项目仓库：https://github.com/Edge-HH/RDFZ-AI-CREATOR-2026
`;

const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push({ path: `${NAME}/${relative(DIST, p).replaceAll('\\', '/')}`, data: readFileSync(p) });
  }
}
walk(DIST);
files.push({ path: `${NAME}/运行说明.txt`, data: Buffer.from(README, 'utf8') });

// CRC32
const table = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunks = [];
const central = [];
let offset = 0;
for (const f of files) {
  const name = Buffer.from(f.path, 'utf8');
  const comp = deflateRawSync(f.data, { level: 9 });
  const crc = crc32(f.data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 文件名
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(f.data.length, 22);
  local.writeUInt16LE(name.length, 26);
  chunks.push(local, name, comp);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(20, 4);
  cen.writeUInt16LE(20, 6);
  cen.writeUInt16LE(0x0800, 8);
  cen.writeUInt16LE(8, 10);
  cen.writeUInt32LE(crc, 16);
  cen.writeUInt32LE(comp.length, 20);
  cen.writeUInt32LE(f.data.length, 24);
  cen.writeUInt16LE(name.length, 28);
  cen.writeUInt32LE(offset, 42);
  central.push(cen, name);
  offset += local.length + name.length + comp.length;
}
const cenBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cenBuf.length, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(OUT_DIR, { recursive: true });
const out = join(OUT_DIR, `${NAME}.zip`);
writeFileSync(out, Buffer.concat([...chunks, cenBuf, end]));
console.log(`已生成 ${out}（${files.length} 个文件，${(statSync(out).size / 1024).toFixed(0)} KB）`);
