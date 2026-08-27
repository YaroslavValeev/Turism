import { describe, expect, it } from "vitest";
import { getReleaseIdentity } from "./releaseIdentity";

describe("getReleaseIdentity", () => {
  it("uses RELEASE_SHA as the canonical runtime identity", () => {
    expect(
      getReleaseIdentity({
        RELEASE_SHA: "ba6bb7f80e4c163b02b271ddb20d329d9167eb22",
        GITHUB_SHA: "ignored",
        SOURCE_VERSION: "ignored",
        RELEASE_BUILT_AT: "2026-08-26T22:12:00Z",
        GITHUB_RUN_ID: "33018733273",
      }),
    ).toEqual({
      releaseSha: "ba6bb7f80e4c163b02b271ddb20d329d9167eb22",
      releaseShaShort: "ba6bb7f80e4c",
      builtAt: "2026-08-26T22:12:00Z",
      githubRunId: "33018733273",
    });
  });

  it("falls back to GITHUB_SHA and SOURCE_VERSION before unknown", () => {
    expect(getReleaseIdentity({ GITHUB_SHA: "github-sha" }).releaseSha).toBe("github-sha");
    expect(getReleaseIdentity({ SOURCE_VERSION: "source-version" }).releaseSha).toBe("source-version");
    expect(getReleaseIdentity({}).releaseSha).toBe("unknown");
  });

  it("trims blank values and does not emit misleading short sha for unknown", () => {
    expect(getReleaseIdentity({ RELEASE_SHA: "   ", GITHUB_SHA: "  abcdef1234567890  " })).toMatchObject({
      releaseSha: "abcdef1234567890",
      releaseShaShort: "abcdef123456",
    });
    expect(getReleaseIdentity({ RELEASE_SHA: " " }).releaseShaShort).toBe("unknown");
  });
});
