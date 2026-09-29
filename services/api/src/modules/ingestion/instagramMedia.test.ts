import { describe, expect, it } from "vitest";
import { extractInstagramEdgeMedia } from "./instagramMedia";

describe("extractInstagramEdgeMedia", () => {
  it("returns the single photo of a regular post", () => {
    expect(extractInstagramEdgeMedia({ display_url: "https://scontent.cdninstagram.com/a.jpg", is_video: false })).toEqual([
      { url: "https://scontent.cdninstagram.com/a.jpg", mediaType: "image" },
    ]);
  });

  it("returns every carousel slide in order instead of only the first", () => {
    const edge = {
      display_url: "https://cdn/cover.jpg",
      edge_sidecar_to_children: {
        edges: [
          { node: { display_url: "https://cdn/1.jpg", is_video: false } },
          { node: { display_url: "https://cdn/2.jpg", is_video: true, video_url: "https://cdn/2.mp4" } },
          { node: { display_url: "https://cdn/3.jpg", is_video: false } },
        ],
      },
    };
    expect(extractInstagramEdgeMedia(edge)).toEqual([
      { url: "https://cdn/1.jpg", mediaType: "image" },
      { url: "https://cdn/2.jpg", mediaType: "image" },
      { url: "https://cdn/2.mp4", mediaType: "video" },
      { url: "https://cdn/3.jpg", mediaType: "image" },
    ]);
  });

  it("keeps a reel poster as image and the clip as video", () => {
    expect(
      extractInstagramEdgeMedia({ display_url: "//cdn/poster.jpg", is_video: true, video_url: "https://cdn/reel.mp4?x=1" }),
    ).toEqual([
      { url: "https://cdn/poster.jpg", mediaType: "image" },
      { url: "https://cdn/reel.mp4?x=1", mediaType: "video" },
    ]);
  });

  it("falls back to thumbnails, dedupes and caps at 10 items", () => {
    const edges = Array.from({ length: 14 }, (_, i) => ({ node: { thumbnail_src: `https://cdn/${i % 12}.jpg` } }));
    const result = extractInstagramEdgeMedia({ edge_sidecar_to_children: { edges } });
    expect(result).toHaveLength(10);
    expect(new Set(result.map((item) => item.url)).size).toBe(10);
  });

  it("returns nothing for a node without media", () => {
    expect(extractInstagramEdgeMedia({ shortcode: "abc" })).toEqual([]);
  });
});
