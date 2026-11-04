import { TICKS_PER_DAY, TICKS_PER_HOUR, DAY_TICK_MS, NIGHT_TICK_MS } from './types';
import { TIME } from '../content/balance';
export const dayOf = (t: number) => Math.floor(t / TICKS_PER_DAY);
export const hourOf = (t: number) => (t % TICKS_PER_DAY) / TICKS_PER_HOUR;
export const isNightHour = (h: number) => h >= TIME.nightStartHour || h < TIME.dayStartHour;
export const isNight = (t: number) => isNightHour(hourOf(t));
export const tickMs = (t: number) => (isNight(t) ? NIGHT_TICK_MS : DAY_TICK_MS);
export const inMeal = (h: number) => TIME.meals.some(([a, b]) => h >= a && h < b);
export const inActivity = (h: number) => h >= TIME.activityHours[0] && h < TIME.activityHours[1];
export const hoursToTicks = (h: number) => Math.round(h * TICKS_PER_HOUR);
/** next tick >= t at which hourOf == hour */
export function nextHourTick(t: number, hour: number) {
  const d = dayOf(t); let c = d * TICKS_PER_DAY + hour * TICKS_PER_HOUR;
  if (c <= t) c += TICKS_PER_DAY;
  return c;
}
