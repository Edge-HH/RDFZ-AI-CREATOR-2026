// 配音：HTMLAudioElement 在 file:// 下可用。文件缺失时静默跳过
let current: HTMLAudioElement | null = null;
const missing = new Set<string>();

export function playVoice(id: string): Promise<void> | null {
  if (missing.has(id)) return null;
  stopVoice();
  const audio = new Audio(`voice/${id}.mp3`);
  current = audio;
  return new Promise<void>((resolve) => {
    const done = () => resolve();
    audio.addEventListener('ended', done, { once: true });
    audio.addEventListener('error', () => { missing.add(id); done(); }, { once: true });
    audio.play().catch(() => done());
  });
}

export function stopVoice(): void {
  if (current) {
    current.pause();
    current = null;
  }
}
