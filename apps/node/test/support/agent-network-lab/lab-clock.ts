/** Phase 60F deterministic wall/monotonic clock; tests advance it explicitly. */
export class AgentNetworkLabClock {
  constructor(private currentMs = Date.parse("2030-01-01T00:00:00.000Z")) {}

  now(): Date {
    return new Date(this.currentMs);
  }

  nowMs(): number {
    return this.currentMs;
  }

  advanceBy(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) throw new Error("lab clock advance must be finite and >= 0");
    this.currentMs += ms;
  }
}
