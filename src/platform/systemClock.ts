import type { Clock } from '../sim/clock';
export const systemClock: Clock = { now: () => Date.now() };
