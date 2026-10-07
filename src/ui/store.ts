// 本地存储：任何读写都可能失败（隐私模式、禁用存储），失败时静默降级
const PREFIX = 'lightgap:';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* 存储不可用 */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* 存储不可用 */
  }
}

export interface Settings {
  voice: boolean;
  sfx: boolean;
  speed: 'slow' | 'normal' | 'fast' | 'instant';
  quality: 'auto' | 'high' | 'medium' | 'low' | 'off';
}

export const DEFAULT_SETTINGS: Settings = { voice: true, sfx: true, speed: 'normal', quality: 'auto' };
export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...load<Partial<Settings>>('settings', {}) });
export const saveSettings = (s: Settings) => save('settings', s);
