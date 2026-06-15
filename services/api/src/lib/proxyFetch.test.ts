import { describe, expect, it } from "vitest";
import { redactSensitiveUrls, resolveProxyUrl } from "./proxyFetch";

describe("proxyFetch helpers", () => {
  it("ignores blank proxy values", () => {
    expect(resolveProxyUrl(undefined)).toBeUndefined();
    expect(resolveProxyUrl("   ")).toBeUndefined();
  });

  it("redacts proxy passwords in error text", () => {
    const input = `failed via ${"socks5"}://${"project2"}:${"placeholder"}@proxy.example:1080`;
    const redacted = redactSensitiveUrls(input);
    expect(redacted).toContain("project2:[redacted]@proxy.example:1080");
    expect(redacted).not.toContain("placeholder");
  });
});
