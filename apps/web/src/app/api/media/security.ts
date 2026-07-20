import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SAFE_IMAGE_CONTENT_TYPES = new Set([
  "image/apng",
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const BLOCKED_METADATA_HOSTS = new Set([
  "instance-data",
  "instance-data.ec2.internal",
  "metadata",
  "metadata.azure.internal",
  "metadata.google",
  "metadata.google.internal",
]);

export type MediaProxyErrorCode =
  | "INVALID_URL"
  | "FORBIDDEN_TARGET"
  | "UPSTREAM_ERROR"
  | "TOO_MANY_REDIRECTS"
  | "UNSAFE_CONTENT_TYPE"
  | "RESPONSE_TOO_LARGE"
  | "TIMEOUT";

export class MediaProxyError extends Error {
  constructor(
    readonly code: MediaProxyErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "MediaProxyError";
  }
}

export type LookupAddress = { address: string; family: number };
export type LookupAll = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<LookupAddress[]>;

export type SafeImageFetchOptions = {
  fetchImpl?: typeof fetch;
  lookup?: LookupAll;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
};

export type SafeImage = {
  body: ArrayBuffer;
  contentType: string;
  finalUrl: URL;
};

function normalizeHostname(hostname: string): string {
  const withoutBrackets = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  return withoutBrackets.replace(/\.$/, "").toLowerCase();
}

function ipv4ToNumber(address: string): number | null {
  if (isIP(address) !== 4) return null;
  const octets = address.split(".").map(Number);
  return (
    (((octets[0] << 24) >>> 0) |
      (octets[1] << 16) |
      (octets[2] << 8) |
      octets[3]) >>>
    0
  );
}

function ipv4InCidr(address: number, network: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) === (network & mask);
}

function isForbiddenIpv4(address: string): boolean {
  const value = ipv4ToNumber(address);
  if (value === null) return true;

  const blockedCidrs: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.31.196.0", 24],
    ["192.52.193.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["192.175.48.0", 24],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];

  return blockedCidrs.some(([network, prefix]) => {
    const networkValue = ipv4ToNumber(network);
    return networkValue !== null && ipv4InCidr(value, networkValue, prefix);
  });
}

function parseIpv6(address: string): bigint | null {
  let input = normalizeHostname(address);
  const zoneIndex = input.indexOf("%");
  if (zoneIndex !== -1) return null;

  const ipv4Match = /(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(input);
  if (ipv4Match) {
    const ipv4 = ipv4ToNumber(ipv4Match[1]);
    if (ipv4 === null) return null;
    input = `${input.slice(0, -ipv4Match[1].length)}${((ipv4 >>> 16) & 0xffff).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const halves = input.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;

  const groups = halves.length === 2
    ? [...left, ...Array.from({ length: missing }, () => "0"), ...right]
    : left;
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return null;

  return groups.reduce(
    (value, group) => (value << BigInt(16)) | BigInt(`0x${group}`),
    BigInt(0),
  );
}

function ipv6InCidr(address: bigint, network: bigint, prefix: number): boolean {
  if (prefix === 0) return true;
  const shift = BigInt(128 - prefix);
  return address >> shift === network >> shift;
}

function ipv6Network(value: string): bigint {
  const parsed = parseIpv6(value);
  if (parsed === null) throw new Error(`Invalid internal IPv6 network: ${value}`);
  return parsed;
}

function embeddedIpv4(value: bigint): string {
  const ipv4 = Number(value & BigInt("0xffffffff"));
  return [24, 16, 8, 0].map((shift) => (ipv4 >>> shift) & 0xff).join(".");
}

function isForbiddenIpv6(address: string): boolean {
  const value = parseIpv6(address);
  if (value === null) return true;

  const mappedPrefix = ipv6Network("::ffff:0:0");
  if (ipv6InCidr(value, mappedPrefix, 96)) {
    return isForbiddenIpv4(embeddedIpv4(value));
  }

  const nat64Prefix = ipv6Network("64:ff9b::");
  if (ipv6InCidr(value, nat64Prefix, 96)) {
    return isForbiddenIpv4(embeddedIpv4(value));
  }

  const blockedCidrs: Array<[string, number]> = [
    ["::", 96],
    ["64:ff9b:1::", 48],
    ["100::", 64],
    ["2001::", 23],
    ["2001:db8::", 32],
    ["2002::", 16],
    ["2620:4f:8000::", 48],
    ["3fff::", 20],
    ["5f00::", 16],
    ["fc00::", 7],
    ["fe80::", 10],
    ["fec0::", 10],
    ["ff00::", 8],
  ];

  return blockedCidrs.some(([network, prefix]) => ipv6InCidr(value, ipv6Network(network), prefix));
}

export function isForbiddenIp(address: string): boolean {
  const normalized = normalizeHostname(address);
  const family = isIP(normalized);
  if (family === 4) return isForbiddenIpv4(normalized);
  if (family === 6) return isForbiddenIpv6(normalized);
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    BLOCKED_METADATA_HOSTS.has(host) ||
    host.endsWith(".metadata.google.internal")
  );
}

function parseHttpUrl(input: string | URL): URL {
  let parsed: URL;
  try {
    parsed = input instanceof URL ? new URL(input.toString()) : new URL(input);
  } catch (error) {
    throw new MediaProxyError("INVALID_URL", "The media URL is invalid", { cause: error });
  }

  if (!(["http:", "https:"] as const).includes(parsed.protocol as "http:" | "https:")) {
    throw new MediaProxyError("FORBIDDEN_TARGET", "Only HTTP and HTTPS media URLs are allowed");
  }
  if (parsed.username || parsed.password || !parsed.hostname) {
    throw new MediaProxyError("FORBIDDEN_TARGET", "Credentials and empty hostnames are not allowed");
  }
  return parsed;
}

async function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

async function assertPublicTarget(url: URL, lookup: LookupAll, signal: AbortSignal): Promise<void> {
  const hostname = normalizeHostname(url.hostname);
  if (isBlockedHostname(hostname)) {
    throw new MediaProxyError("FORBIDDEN_TARGET", "The media host is not publicly routable");
  }

  const literalFamily = isIP(hostname);
  if (literalFamily !== 0) {
    if (isForbiddenIp(hostname)) {
      throw new MediaProxyError("FORBIDDEN_TARGET", "The media address is not publicly routable");
    }
    return;
  }

  let addresses: LookupAddress[];
  try {
    addresses = await raceWithAbort(lookup(hostname, { all: true, verbatim: true }), signal);
  } catch (error) {
    if (signal.aborted) {
      throw new MediaProxyError("TIMEOUT", "The media host lookup timed out", { cause: error });
    }
    throw new MediaProxyError("UPSTREAM_ERROR", "The media host could not be resolved", { cause: error });
  }

  if (addresses.length === 0) {
    throw new MediaProxyError("UPSTREAM_ERROR", "The media host did not resolve to an address");
  }
  if (addresses.some(({ address }) => isForbiddenIp(address))) {
    throw new MediaProxyError("FORBIDDEN_TARGET", "The media host resolved to a non-public address");
  }
}

function refererFor(url: URL): string {
  const hostname = normalizeHostname(url.hostname);
  if (hostname === "images.unsplash.com" || hostname.endsWith(".unsplash.com")) {
    return "https://unsplash.com/";
  }
  if (hostname.includes("instagram.com") || hostname.includes("cdninstagram.com") || hostname.endsWith("fbcdn.net")) {
    return "https://www.instagram.com/";
  }
  if (hostname.includes("telesco.pe") || hostname.includes("telegram.org")) {
    return "https://t.me/";
  }
  return `${url.protocol}//${url.host}/`;
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The connection is already closed; there is nothing else to release.
  }
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<ArrayBuffer> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await cancelBody(response);
      throw new MediaProxyError("RESPONSE_TOO_LARGE", "The upstream image is too large");
    }
  }

  if (!response.body) return new ArrayBuffer(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new MediaProxyError("RESPONSE_TOO_LARGE", "The upstream image is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

function normalizedContentType(response: Response): string {
  return (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
}

const defaultLookup: LookupAll = (hostname, options) => dnsLookup(hostname, options);

export async function fetchSafeImage(
  input: string | URL,
  options: SafeImageFetchOptions = {},
): Promise<SafeImage> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const lookup = options.lookup ?? defaultLookup;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("timeoutMs must be positive");
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0) throw new Error("maxResponseBytes must be positive");
  if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0) throw new Error("maxRedirects cannot be negative");

  let currentUrl = parseHttpUrl(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (let redirectCount = 0; ; redirectCount += 1) {
      await assertPublicTarget(currentUrl, lookup, controller.signal);

      let response: Response;
      try {
        response = await fetchImpl(currentUrl, {
          cache: "no-store",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9",
            referer: refererFor(currentUrl),
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135 Safari/537.36",
          },
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new MediaProxyError("TIMEOUT", "The upstream image request timed out", { cause: error });
        }
        throw new MediaProxyError("UPSTREAM_ERROR", "The upstream image request failed", { cause: error });
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        if (redirectCount >= maxRedirects) {
          await cancelBody(response);
          throw new MediaProxyError("TOO_MANY_REDIRECTS", "The upstream image redirected too many times");
        }
        const location = response.headers.get("location");
        await cancelBody(response);
        if (!location) {
          throw new MediaProxyError("UPSTREAM_ERROR", "The upstream redirect has no location");
        }
        try {
          currentUrl = parseHttpUrl(new URL(location, currentUrl));
        } catch (error) {
          if (error instanceof MediaProxyError) throw error;
          throw new MediaProxyError("UPSTREAM_ERROR", "The upstream redirect is invalid", { cause: error });
        }
        continue;
      }

      if (!response.ok) {
        await cancelBody(response);
        throw new MediaProxyError("UPSTREAM_ERROR", `The upstream image returned HTTP ${response.status}`);
      }

      const contentType = normalizedContentType(response);
      if (!SAFE_IMAGE_CONTENT_TYPES.has(contentType)) {
        await cancelBody(response);
        throw new MediaProxyError("UNSAFE_CONTENT_TYPE", "The upstream response is not a safe image type");
      }

      let body: ArrayBuffer;
      try {
        body = await readBoundedBody(response, maxResponseBytes);
      } catch (error) {
        if (controller.signal.aborted) {
          await cancelBody(response);
          throw new MediaProxyError("TIMEOUT", "The upstream image response timed out", { cause: error });
        }
        throw error;
      }
      return { body, contentType, finalUrl: currentUrl };
    }
  } finally {
    clearTimeout(timeout);
  }
}
