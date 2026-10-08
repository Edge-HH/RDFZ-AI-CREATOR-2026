// 配音：HTMLAudioElement 在 file:// 下可用。文件缺失时静默跳过
// 三档语速各有一套录音：public/voice/<slow|mid|fast>/<编号>.mp3
let current: HTMLAudioElement | null = null;
const missing = new Set<string>();

export type VoiceSpeed = 'slow' | 'mid' | 'fast';

export function playVoice(id: string, speed: VoiceSpeed = 'mid'): Promise<void> | null {
  const key = `${speed}/${id}`;
  if (missing.has(key)) return null;
  stopVoice();
  const audio = new Audio(`voice/${key}.mp3`);
  current = audio;
  return new Promise<void>((resolve) => {
    const done = () => resolve();
    audio.addEventListener('ended', done, { once: true });
    audio.addEventListener('error', () => { missing.add(key); done(); }, { once: true });
    audio.play().catch(() => done());
  });
}

export function stopVoice(): void {
  if (current) {
    current.pause();
    current = null;
  }
}
