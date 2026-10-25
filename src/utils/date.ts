/**
 * Yerel saat dilimine göre tarih yardımcıları.
 * `toISOString()` UTC kullandığı için Türkiye'de (UTC+3) 00:00–03:00 arası
 * girilen kayıtlar önceki güne düşerdi; burada bu hata engellenir.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

/** YYYY-MM-DD → yerel gece yarısı Date */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(key: string, days: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function isValidDateKey(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && toDateKey(parseDateKey(key)) === key;
}

export function formatDateLabel(key: string): string {
  const today = todayKey();
  if (key === today) return 'Bugün';
  if (key === addDays(today, -1)) return 'Dün';
  if (key === addDays(today, 1)) return 'Yarın';
  return parseDateKey(key).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });
}

export function shortDayLabel(key: string): string {
  return parseDateKey(key).toLocaleDateString('tr-TR', { weekday: 'short' });
}
