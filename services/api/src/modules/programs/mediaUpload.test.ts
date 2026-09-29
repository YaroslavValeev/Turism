import { describe, expect, it } from "vitest";
import { detectUploadedMedia } from "./mediaUpload";

function withTail(head: number[] | Buffer): Buffer {
  return Buffer.concat([Buffer.from(head), Buffer.alloc(32)]);
}

describe("detectUploadedMedia", () => {
  it("recognizes images by signature", () => {
    expect(detectUploadedMedia(withTail([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ extension: "jpg", mediaType: "image" });
    expect(detectUploadedMedia(withTail([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({
      extension: "png",
      mediaType: "image",
    });
    expect(detectUploadedMedia(withTail(Buffer.from("RIFF\x00\x00\x00\x00WEBPVP8 ", "latin1")))).toEqual({
      extension: "webp",
      mediaType: "image",
    });
  });

  it("recognizes videos by signature", () => {
    expect(detectUploadedMedia(withTail(Buffer.from("\x00\x00\x00\x18ftypmp42", "latin1")))).toEqual({
      extension: "mp4",
      mediaType: "video",
    });
    expect(detectUploadedMedia(withTail([0x1a, 0x45, 0xdf, 0xa3]))).toEqual({ extension: "webm", mediaType: "video" });
  });

  it.each([
    ["svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ["html", Buffer.from("<!doctype html><html><body>hi</body></html>")],
    ["empty", Buffer.alloc(0)],
    ["too short", Buffer.from([0xff, 0xd8, 0xff])],
  ])("rejects %s", (_name, buf) => {
    expect(detectUploadedMedia(buf)).toBeNull();
  });
});
