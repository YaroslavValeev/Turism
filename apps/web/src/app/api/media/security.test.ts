import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchSafeImage,
  isForbiddenIp,
  MediaProxyError,
  type LookupAll,
} from "./security";

const publicLookup: LookupAll = async () => [{ address: "93.184.216.34", family: 4 }];

function mockFetch(implementation: (input: URL, init?: RequestInit) => Promise<Response>): typeof fetch {
  return implementation as unknown as typeof fetch;
}

function assertProxyError(error: unknown, code: MediaProxyError["code"]): boolean {
  assert.ok(error instanceof MediaProxyError);
  assert.equal(error.code, code);
  return true;
}

test("rejects a hostname that resolves to a private address before fetch", async () => {
  let fetchCalls = 0;
  const lookup: LookupAll = async () => [{ address: "10.20.30.40", family: 4 }];
  const fetchImpl = mockFetch(async () => {
    fetchCalls += 1;
    return new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } });
  });

  await assert.rejects(
    fetchSafeImage("https://images.example.test/photo.png", { lookup, fetchImpl }),
    (error) => assertProxyError(error, "FORBIDDEN_TARGET"),
  );
  assert.equal(fetchCalls, 0);
});

test("revalidates DNS after a redirect and rejects a private redirect target", async () => {
  const fetchedHosts: string[] = [];
  const lookup: LookupAll = async (hostname) => [
    { address: hostname === "internal.example.test" ? "169.254.169.254" : "93.184.216.34", family: 4 },
  ];
  const fetchImpl = mockFetch(async (input) => {
    fetchedHosts.push(input.hostname);
    return new Response(null, {
      status: 302,
      headers: { location: "http://internal.example.test/latest/meta-data" },
    });
  });

  await assert.rejects(
    fetchSafeImage("https://images.example.test/photo.jpg", { lookup, fetchImpl }),
    (error) => assertProxyError(error, "FORBIDDEN_TARGET"),
  );
  assert.deepEqual(fetchedHosts, ["images.example.test"]);
});

test("rejects HTML even when the upstream request succeeds", async () => {
  const fetchImpl = mockFetch(async () => new Response("<script>alert(1)</script>", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  }));

  await assert.rejects(
    fetchSafeImage("https://images.example.test/not-an-image", { lookup: publicLookup, fetchImpl }),
    (error) => assertProxyError(error, "UNSAFE_CONTENT_TYPE"),
  );
});

test("stops streaming when the response exceeds the byte limit", async () => {
  const fetchImpl = mockFetch(async () => new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]));
        controller.enqueue(new Uint8Array([5, 6, 7, 8]));
        controller.close();
      },
    }),
    { headers: { "content-type": "image/png" } },
  ));

  await assert.rejects(
    fetchSafeImage("https://images.example.test/large.png", {
      lookup: publicLookup,
      fetchImpl,
      maxResponseBytes: 6,
    }),
    (error) => assertProxyError(error, "RESPONSE_TOO_LARGE"),
  );
});

test("maps an aborted upstream request to a timeout error", async () => {
  const fetchImpl = mockFetch(async (_input, init) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    const rejectAsAborted = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal?.aborted) rejectAsAborted();
    else signal?.addEventListener("abort", rejectAsAborted, { once: true });
  }));

  await assert.rejects(
    fetchSafeImage("https://images.example.test/slow.jpg", {
      lookup: publicLookup,
      fetchImpl,
      timeoutMs: 10,
    }),
    (error) => assertProxyError(error, "TIMEOUT"),
  );
});

test("applies the timeout while DNS resolution is pending", async () => {
  const lookup: LookupAll = async () => new Promise(() => undefined);
  const fetchImpl = mockFetch(async () => {
    throw new Error("fetch must not be called");
  });

  await assert.rejects(
    fetchSafeImage("https://images.example.test/dns-stall.jpg", {
      lookup,
      fetchImpl,
      timeoutMs: 10,
    }),
    (error) => assertProxyError(error, "TIMEOUT"),
  );
});

test("maps a fetch failure to a generic upstream error", async () => {
  const fetchImpl = mockFetch(async () => {
    throw new Error("socket failed");
  });

  await assert.rejects(
    fetchSafeImage("https://images.example.test/error.jpg", { lookup: publicLookup, fetchImpl }),
    (error) => assertProxyError(error, "UPSTREAM_ERROR"),
  );
});

test("allows a bounded safe image from a public host", async () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const fetchImpl = mockFetch(async (_input, init) => {
    assert.equal(init?.redirect, "manual");
    return new Response(bytes, {
      headers: {
        "content-length": String(bytes.byteLength),
        "content-type": "image/png; charset=binary",
      },
    });
  });

  const image = await fetchSafeImage("https://images.example.test/photo.png", {
    lookup: publicLookup,
    fetchImpl,
  });

  assert.equal(image.contentType, "image/png");
  assert.deepEqual(new Uint8Array(image.body), bytes);
  assert.equal(image.finalUrl.toString(), "https://images.example.test/photo.png");
});

test("classifies private, link-local, metadata, mapped and multicast addresses as forbidden", () => {
  for (const address of [
    "127.0.0.1",
    "100.100.100.200",
    "169.254.169.254",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
  ]) {
    assert.equal(isForbiddenIp(address), true, address);
  }
  assert.equal(isForbiddenIp("93.184.216.34"), false);
  assert.equal(isForbiddenIp("2606:4700:4700::1111"), false);
});
