/** Injectable wall clock (Brief §5 "Testbarkeit"). The sim never reads real time itself; offline/daily systems get a Clock. */
export interface Clock { now(): number }
export class FakeClock implements Clock { constructor(public t = 0) {} now() { return this.t; } advance(ms: number) { this.t += ms; } }
