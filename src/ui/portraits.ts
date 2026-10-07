import type { Speaker } from '../core/content';
import { CAST } from '../content/cast';

// AI 头像放到 src/assets/portraits/<speaker>.webp（或 .png/.jpg）即可自动替换程序头像
const files = import.meta.glob('../assets/portraits/*.{webp,png,jpg}', { eager: true, import: 'default' }) as Record<string, string>;
const custom: Partial<Record<Speaker, string>> = {};
for (const [path, url] of Object.entries(files)) {
  const id = path.split('/').pop()!.split('.')[0] as Speaker;
  custom[id] = url;
}

const cache = new Map<Speaker, string>();

function badge(id: Speaker): string {
  const c = CAST[id];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.color}" stop-opacity="0.95"/><stop offset="1" stop-color="#0b111b"/></linearGradient></defs>
<rect width="64" height="64" rx="12" fill="url(#g)"/>
<circle cx="32" cy="32" r="24" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="1.5"/>
<path d="M8 50 Q32 38 56 50" stroke="#ffffff" stroke-opacity="0.12" fill="none"/>
<text x="32" y="41" text-anchor="middle" font-size="26" font-weight="700" font-family="PingFang SC,Microsoft YaHei,sans-serif" fill="#ffffff">${c.glyph}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function portraitUrl(id: Speaker): string {
  if (custom[id]) return custom[id]!;
  if (!cache.has(id)) cache.set(id, badge(id));
  return cache.get(id)!;
}

export function portrait(id: Speaker, cls = ''): HTMLImageElement {
  const img = document.createElement('img');
  img.className = `portrait ${cls}`;
  img.src = portraitUrl(id);
  img.alt = CAST[id].name;
  img.width = 34;
  img.height = 34;
  return img;
}
