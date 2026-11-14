interface WindowState {
  count: number;
  resetAt: number;
}

export class FixedWindowLimiter {
  private readonly windows = new Map<string, WindowState>();

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  consume(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const current = this.windows.get(key);
    const state = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + this.windowMs }
      : current;
    state.count += 1;
    this.windows.set(key, state);
    return {
      allowed: state.count <= this.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - now) / 1000))
    };
  }
}
