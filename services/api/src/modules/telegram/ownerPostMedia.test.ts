import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({ prisma: {} }));

import { OwnerAlbumRegistry, photoExtensionFromFilePath, pickLargestPhoto } from "./ownerPostMedia";

describe("pickLargestPhoto", () => {
  it("returns null without photo", () => {
    expect(pickLargestPhoto(undefined)).toBeNull();
    expect(pickLargestPhoto([])).toBeNull();
  });

  it("picks the biggest resolution regardless of order", () => {
    const sizes = [
      { file_id: "m", file_unique_id: "m", width: 320, height: 240 },
      { file_id: "l", file_unique_id: "l", width: 1280, height: 960 },
      { file_id: "s", file_unique_id: "s", width: 90, height: 67 },
    ];
    expect(pickLargestPhoto(sizes)?.file_id).toBe("l");
  });
});

describe("photoExtensionFromFilePath", () => {
  it.each([
    ["photos/file_1.jpg", "jpg"],
    ["photos/file_2.JPEG", "jpg"],
    ["photos/file_3.png", "png"],
    ["photos/file_4.webp", "webp"],
  ])("accepts %s", (filePath, ext) => {
    expect(photoExtensionFromFilePath(filePath)).toBe(ext);
  });

  it.each(["documents/file.svg", "documents/file.html", "photos/file"])("rejects %s", (filePath) => {
    expect(photoExtensionFromFilePath(filePath)).toBeNull();
  });
});

describe("OwnerAlbumRegistry", () => {
  it("hands photos that arrived before the caption to the program", () => {
    const registry = new OwnerAlbumRegistry();
    expect(registry.addPhoto("g1", "/ingestion-media/a.jpg")).toBeNull();
    expect(registry.addPhoto("g1", "/ingestion-media/b.jpg")).toBeNull();
    expect(registry.bindProgram("g1", "p1")).toEqual(["/ingestion-media/a.jpg", "/ingestion-media/b.jpg"]);
  });

  it("returns the program for photos that arrive after the caption", () => {
    const registry = new OwnerAlbumRegistry();
    expect(registry.bindProgram("g1", "p1")).toEqual([]);
    expect(registry.addPhoto("g1", "/ingestion-media/c.jpg")).toBe("p1");
  });

  it("keeps albums separate and forgets stale ones", () => {
    let now = 0;
    const registry = new OwnerAlbumRegistry(() => now);
    registry.bindProgram("g1", "p1");
    expect(registry.addPhoto("g2", "/ingestion-media/x.jpg")).toBeNull();
    now = 11 * 60 * 1000;
    expect(registry.addPhoto("g1", "/ingestion-media/late.jpg")).toBeNull();
  });
});
