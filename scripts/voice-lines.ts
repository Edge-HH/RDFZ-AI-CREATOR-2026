// 导出需要配音的台词：npx tsx scripts/voice-lines.ts > docs/voice-lines.json
// 生成的音频放在 public/voice/<id>.mp3，构建时会复制到 dist/voice/
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAST } from '../src/content/cast';
import type { Speaker } from '../src/core/content';

const dir = 'src/content/chapters';
const re = /L\('(\w+)',\s*'([^']+)'(?:\s*\+\s*[^,]+)?,\s*\{[^}]*voice:\s*'(\w+)'/g;
const lines: { id: string; speaker: string; name: string; text: string }[] = [];
for (const f of readdirSync(dir).sort()) {
  const src = readFileSync(join(dir, f), 'utf8');
  for (const m of src.matchAll(re)) {
    const speaker = m[1] as Speaker;
    lines.push({ id: m[3], speaker, name: CAST[speaker]?.name ?? speaker, text: m[2] });
  }
}
console.log(JSON.stringify(lines, null, 2));
console.error(`共 ${lines.length} 句`);
