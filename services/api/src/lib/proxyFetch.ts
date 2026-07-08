import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { SocksProxyAgent } from "socks-proxy-agent";

type SupportedProxyBody = string | Buffer | ArrayBuffer | ArrayBufferView | URLSearchParams | null | undefined;

export function resolveProxyUrl(raw: string | undefined | null): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  return value;
}

export function redactSensitiveUrls(input: string): string {
  return input.replace(/(socks5h?|https?):\/\/([^:\s/@]+):([^@\s]+)@/gi, "$1://$2:[redacted]@");
}

function headersToRecord(headers?: RequestInit["headers"]): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;
  const h = new Headers(headers);
  h.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function responseHeadersToHeaders(headers: Record<string, string | string[] | undefined>): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const v of value) result.append(key, v);
    } else if (value !== undefined) {
      result.set(key, value);
    }
  }
  return result;
}

function bodyToBuffer(body: SupportedProxyBody): Buffer | undefined {
  if (body == null) return undefined;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof URLSearchParams) return Buffer.from(body.toString());
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  throw new TypeError("proxyFetch only supports string, Buffer, ArrayBuffer, typed array, and URLSearchParams bodies");
}

export async function proxyFetch(
  url: string | URL,
  init: RequestInit & { body?: SupportedProxyBody } = {},
  proxyUrl?: string | null,
): Promise<Response> {
  const proxy = resolveProxyUrl(proxyUrl);
  if (!proxy) {
    return fetch(url, init as RequestInit);
  }

  const parsed = new URL(String(url));
  const requestFn = parsed.protocol === "https:" ? httpsRequest : httpRequest;
  const headers = headersToRecord(init.headers);
  const body = bodyToBuffer(init.body);
  if (body && !Object.keys(headers).some((h) => h.toLowerCase() === "content-length")) {
    headers["content-length"] = String(body.length);
  }

  return new Promise<Response>((resolve, reject) => {
    const req = requestFn(
      parsed,
      {
        method: init.method ?? "GET",
        headers,
        agent: new SocksProxyAgent(proxy),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 0,
              statusText: res.statusMessage,
              headers: responseHeadersToHeaders(res.headers),
            }),
          );
        });
      },
    );

    req.on("error", (err) => {
      reject(new Error(redactSensitiveUrls(err.message)));
    });

    if (init.signal) {
      if (init.signal.aborted) {
        req.destroy(new Error("Aborted"));
      } else {
        init.signal.addEventListener(
          "abort",
          () => {
            req.destroy(new Error("Aborted"));
          },
          { once: true },
        );
      }
    }

    if (body) req.write(body);
    req.end();
  });
}
