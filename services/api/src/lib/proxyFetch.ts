/**
 * fetch + SOCKS proxy (Tourism -> EU -> Telegram).
 * Uses node https + SocksProxyAgent (undici+socks breaks in container).
 */
import * as http from "node:http";
import * as https from "node:https";
import { SocksProxyAgent } from "socks-proxy-agent";

function normalizeProxyUrl(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("socks5h://")) return `socks5://${raw.slice(10)}`;
  return raw;
}

export async function proxyAwareFetch(
  url: string,
  init: RequestInit | undefined,
  proxyUrl: string | null | undefined,
): Promise<Response> {
  const proxy = normalizeProxyUrl(proxyUrl);
  if (!proxy) return fetch(url, init);
  if (!proxy.startsWith("socks5://") && !proxy.startsWith("socks4://")) {
    throw new Error(`Unsupported proxy scheme: ${proxy.split(":", 1)[0]}`);
  }
  const agent = new SocksProxyAgent(proxy);
  const method = (init?.method ?? "GET").toUpperCase();
  const rawBody = init?.body;
  const body: string | Uint8Array | undefined =
    rawBody == null ? undefined : rawBody instanceof Uint8Array ? rawBody : String(rawBody);
  const headers = (init?.headers ?? {}) as http.OutgoingHttpHeaders;
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("http://") ? http : https;
    const req = lib.request(url, { method, headers, agent, timeout: 30000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 502 }));
      });
    });
    req.on("timeout", () => req.destroy(new Error("SOCKS fetch timeout")));
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}
