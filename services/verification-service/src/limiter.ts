export class FailureSlowdown {
  private readonly failures = new Map<string, number[]>();
  private readonly blockedUntil = new Map<string, number>();

  check(ip: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const until = this.blockedUntil.get(ip) ?? 0;
    if (until > now) return { allowed: false, retryAfterSeconds: Math.ceil((until - now) / 1000) };
    return { allowed: true, retryAfterSeconds: 0 };
  }

  recordFailure(ip: string, now = Date.now()): void {
    const recent = (this.failures.get(ip) ?? []).filter((time) => now - time < 5 * 60_000);
    recent.push(now);
    this.failures.set(ip, recent);
    if (recent.length >= 10) {
      const delay = Math.min(60_000, 5_000 * (recent.length - 9));
      this.blockedUntil.set(ip, now + delay);
    }
  }

  recordSuccess(ip: string): void {
    this.failures.delete(ip);
    this.blockedUntil.delete(ip);
  }
}

export class SuspiciousActivityDetector {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly threshold = 10,
    private readonly windowMs = 60_000
  ) {}

  observe(actor: string, now = Date.now()): boolean {
    const recent = (this.failures.get(actor) ?? []).filter((time) => now - time < this.windowMs);
    recent.push(now);
    this.failures.set(actor, recent);
    return recent.length >= this.threshold;
  }
}
