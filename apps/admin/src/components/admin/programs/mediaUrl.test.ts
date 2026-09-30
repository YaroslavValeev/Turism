import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeMediaUrl } from "./mediaUrl";

describe("normalizeMediaUrl", () => {
  it("keeps valid links and local cached media", () => {
    assert.deepEqual(normalizeMediaUrl(" https://example.org/a.jpg "), { ok: true, url: "https://example.org/a.jpg" });
    assert.deepEqual(normalizeMediaUrl("/ingestion-media/a.mp4"), { ok: true, url: "/ingestion-media/a.mp4" });
  });

  it("adds the scheme to bare and protocol-relative links", () => {
    assert.deepEqual(normalizeMediaUrl("instagram.com/p/abc"), { ok: true, url: "https://instagram.com/p/abc" });
    assert.deepEqual(normalizeMediaUrl("//cdn.example.org/x.png"), { ok: true, url: "https://cdn.example.org/x.png" });
  });

  it("explains non-links in Russian", () => {
    for (const bad of ["C:\\Users\\me\\photo.jpg", "data:image/png;base64,AAA", "blob:https://x.ru/1", "file:///tmp/a.jpg", "фото", "javascript:alert(1)"]) {
      const r = normalizeMediaUrl(bad);
      assert.equal(r.ok, false, bad);
      if (!r.ok) assert.match(r.error, /Загрузите|Вставьте/);
    }
    assert.equal(normalizeMediaUrl("   ").ok, false);
  });
});
