import { describe, expect, it } from "vitest";
import { buildRawItemContentIdentityWhere } from "./service";

describe("raw item revision identity", () => {
  it("uses content hash, not external item id, as the collection idempotency key", () => {
    expect(buildRawItemContentIdentityWhere("source-1", "hash-new")).toEqual({
      sourceId: "source-1",
      contentHash: "hash-new",
    });
  });
});
