import { describe, expect, it } from "vitest";
import { normalizeProposedSourceUrl, sourceUrlMatchesProposal } from "./sourceProposal";

describe("source proposal duplicate matching", () => {
  it("matches a legacy Telegram post URL with its canonical channel proposal URL", () => {
    const proposal = normalizeProposedSourceUrl("https://t.me/s/RusKiteNews/460");

    expect(proposal).toEqual({
      normalizedUrl: "https://t.me/RusKiteNews",
      detectedType: "telegram",
    });
    expect(
      sourceUrlMatchesProposal("telegram", "https://t.me/s/RusKiteNews/460", proposal.normalizedUrl),
    ).toBe(true);
  });

  it("does not match a different Telegram channel", () => {
    expect(
      sourceUrlMatchesProposal("telegram", "https://t.me/s/AnotherKiteNews/460", "https://t.me/RusKiteNews"),
    ).toBe(false);
  });
});
