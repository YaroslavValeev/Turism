import assert from "node:assert/strict";
import test from "node:test";

import { handleMediaRequest } from "./handler";
import type { LookupAll } from "./security";

const publicLookup: LookupAll = async () => [{ address: "93.184.216.34", family: 4 }];

function requestFor(remoteUrl: string): { nextUrl: URL } {
  return { nextUrl: new URL(`/api/media?url=${encodeURIComponent(remoteUrl)}`, "https://mywavetour.ru") };
}

function mockFetch(implementation: () => Promise<Response>): typeof fetch {
  return implementation as unknown as typeof fetch;
}

test("handler returns a safe image with fixed response headers", async () => {
  const response = await handleMediaRequest(requestFor("https://images.example.test/photo.webp"), {
    lookup: publicLookup,
    fetchImpl: mockFetch(async () => new Response(new Uint8Array([1, 2, 3]), {
      headers: {
        "cache-control": "private, no-store",
        "content-type": "image/webp",
      },
    })),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]));
});

test("handler returns 403 when DNS resolves to a private address", async () => {
  const privateLookup: LookupAll = async () => [{ address: "192.168.1.20", family: 4 }];
  const response = await handleMediaRequest(requestFor("https://nas.example.test/photo.jpg"), {
    lookup: privateLookup,
    fetchImpl: mockFetch(async () => {
      throw new Error("fetch must not be called");
    }),
  });

  assert.equal(response.status, 403);
  assert.equal(await response.text(), "Forbidden");
});

test("handler replaces upstream HTML with the generated image placeholder", async () => {
  const response = await handleMediaRequest(requestFor("https://images.example.test/page"), {
    lookup: publicLookup,
    fetchImpl: mockFetch(async () => new Response("<h1>active content</h1>", {
      headers: { "content-type": "text/html" },
    })),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/svg+xml; charset=utf-8");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; sandbox");
  assert.doesNotMatch(await response.text(), /active content/);
});
