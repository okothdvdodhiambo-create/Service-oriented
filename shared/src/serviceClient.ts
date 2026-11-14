export interface ServiceClientOptions {
  baseUrl: string;
  serviceName: string;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export class ServiceUnavailableError extends Error {
  constructor(serviceName: string) {
    super(`${serviceName} is temporarily unavailable`);
    this.name = "ServiceUnavailableError";
  }
}

export class ServiceClient {
  private failures = 0;
  private openUntil = 0;

  constructor(private readonly options: ServiceClientOptions) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (Date.now() < this.openUntil) throw new ServiceUnavailableError(this.options.serviceName);

    const timeoutMs = this.options.timeoutMs ?? 2500;
    const retries = this.options.retries ?? 1;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(new URL(path, this.options.baseUrl), {
          ...init,
          headers: { ...this.options.headers, ...init.headers },
          signal: controller.signal
        });
        if (!response.ok) throw new ServiceUnavailableError(this.options.serviceName);
        const body = await response.json() as T;
        this.failures = 0;
        this.openUntil = 0;
        return body;
      } catch (error) {
        this.failures += 1;
        if (this.failures >= 3) this.openUntil = Date.now() + 10_000;
        if (attempt === retries) throw new ServiceUnavailableError(this.options.serviceName);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new ServiceUnavailableError(this.options.serviceName);
  }
}
