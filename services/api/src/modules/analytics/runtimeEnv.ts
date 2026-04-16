import { loadEnv, type Env } from "@mywave/config";

let cached: Env | undefined;

export function getApiEnv(): Env {
  if (!cached) {
    cached = loadEnv();
  }
  return cached;
}

export function resetApiEnvCacheForTests() {
  cached = undefined;
}
