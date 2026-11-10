/** Pure continuous-visibility clock. A delivered result is not yet an exposure. */
export class VisibilityQualifier {
  #start: number | undefined; #minimum = 1; #done = false;
  get qualified(): boolean { return this.#done; }
  sample(now: number, ratio: number, active: boolean): { visibleRatio: number; continuousVisibleMs: number; documentActive: true } | undefined {
    if (this.#done) return;
    if (!Number.isFinite(now) || !Number.isFinite(ratio) || ratio < 0.5 || ratio > 1 || !active) { this.#start = undefined; this.#minimum = 1; return; }
    if (this.#start === undefined || now < this.#start) this.#start = now;
    this.#minimum = Math.min(this.#minimum, ratio);
    if (now - this.#start < 1000) return;
    this.#done = true;
    return { visibleRatio: this.#minimum, continuousVisibleMs: Math.min(300000, Math.floor(now - this.#start)), documentActive: true };
  }
}
