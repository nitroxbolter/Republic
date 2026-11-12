import { BALANCE } from '../shared/balance';

/** Small display helpers shared by screens and HUD. */

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const;

/** "just now", "5 min ago", "3 h ago", "2 days ago", then a date. */
export function timeAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 45) return 'agora mesmo';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86_400) return `há ${Math.round(s / 3600)} h`;
  if (s < 7 * 86_400) return `há ${Math.round(s / 86_400)} dia${s < 1.5 * 86_400 ? '' : 's'}`;
  return new Date(at).toLocaleDateString('pt-BR');
}

/** In-game date of a city day count: "Mar, Y2". Same calendar as City.date. */
export function cityDate(day: number): string {
  const months = Math.floor(day / BALANCE.daysPerMonth);
  return `${MONTHS[months % 12]}, ano ${1 + Math.floor(months / 12)}`;
}

/** Short amounts for tight spaces: 950, 12.4k, 3.2M, 1.1B. Exact below 10,000. */
export function compactNumber(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (a < 10_000) return `${sign}${Math.round(a).toLocaleString()}`;
  const [div, unit] = a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : [1e3, 'k'];
  const v = a / div;
  return `${sign}${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}${unit}`;
}
