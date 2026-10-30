import { HttpException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { config } from "./config";

/** Client HTTP du moteur de simulation (service indépendant, Python/FastAPI). */
@Injectable()
export class EngineClient {
  private readonly log = new Logger("Engine");

  async call<T = any>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown, timeoutMs = 60_000): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(config.engineUrl + path, {
        method,
        headers: { "content-type": "application/json", ...(config.engineToken ? { "x-engine-token": config.engineToken } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (err) {
      this.log.error(`Moteur injoignable (${path}) : ${(err as Error).message}`);
      throw new ServiceUnavailableException("Le moteur de simulation est injoignable.");
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const detail = typeof data?.detail === "string" ? data.detail : `Erreur moteur ${res.status}`;
      throw new HttpException(detail, res.status >= 500 ? 502 : res.status);
    }
    return data as T;
  }

  post<T = any>(path: string, body: unknown, timeoutMs?: number) {
    return this.call<T>("POST", path, body, timeoutMs);
  }

  get<T = any>(path: string) {
    return this.call<T>("GET", path);
  }
}
