import { describe, expect, it } from "vitest";
import { isAllowedMediaContentType, resolvePublicMediaTarget } from "./publicMediaPolicy";

describe("resolvePublicMediaTarget", () => {
  it.each([
    "https://cdn4.telesco.pe/file/abc.jpg",
    "https://cdn1.cdn-telegram.org/file/abc.jpg",
    "//cdn4.telesco.pe/file/abc.jpg",
    "https://scontent-arn2-1.cdninstagram.com/v/t51/abc.jpg?stp=1",
    "https://scontent.fbcdn.net/v/abc.mp4",
  ])("allows media CDN %s", (url) => {
    expect(resolvePublicMediaTarget(url).ok).toBe(true);
  });

  it.each([
    ["", 400],
    ["not a url", 400],
    ["http://cdn4.telesco.pe/file/abc.jpg", 403],
    ["https://example.com/a.jpg", 403],
    ["https://127.0.0.1/a.jpg", 403],
    ["https://169.254.169.254/latest/meta-data", 403],
    ["https://[::1]/a.jpg", 403],
    ["https://api.telegram.org/bot123/getMe", 403],
    ["https://www.instagram.com/da.wake/", 403],
    ["https://evil-telesco.pe/a.jpg", 403],
    ["https://telesco.pe.evil.com/a.jpg", 403],
    ["https://user:pass@cdn4.telesco.pe/a.jpg", 403],
    ["https://cdn4.telesco.pe:8443/a.jpg", 403],
    ["file:///etc/passwd", 403],
  ] as const)("rejects %s with %i", (url, status) => {
    const target = resolvePublicMediaTarget(url);
    expect(target.ok).toBe(false);
    if (!target.ok) expect(target.status).toBe(status);
  });
});

describe("isAllowedMediaContentType", () => {
  it.each(["image/jpeg", "image/webp; charset=binary", "video/mp4"])("accepts %s", (type) => {
    expect(isAllowedMediaContentType(type)).toBe(true);
  });

  it.each(["image/svg+xml", "text/html", "application/octet-stream", "", null])("rejects %s", (type) => {
    expect(isAllowedMediaContentType(type)).toBe(false);
  });
});
