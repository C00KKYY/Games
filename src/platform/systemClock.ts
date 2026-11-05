import type { Clock } from '../sim/clock';
/** the real wall clock (the only place outside tests that feeds Date into the sim) */
export const systemClock: Clock = { now: () => Date.now(), tzOffsetMin: (ms: number) => -new Date(ms).getTimezoneOffset() };
