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

// 550A-Preview：黑色面板上的一只红色“眼睛”
const EYE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><radialGradient id="e"><stop offset="0" stop-color="#ffe3dc"/><stop offset="0.3" stop-color="#ff3b2f"/><stop offset="1" stop-color="#4a0805"/></radialGradient></defs>
<rect width="64" height="64" rx="12" fill="#07090d"/>
<circle cx="32" cy="32" r="21" fill="#140403" stroke="#3a3f48" stroke-width="3"/>
<circle cx="32" cy="32" r="13" fill="url(#e)"/>
</svg>`;

function badge(id: Speaker): string {
  if (id === 'ai') return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(EYE)}`;
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
