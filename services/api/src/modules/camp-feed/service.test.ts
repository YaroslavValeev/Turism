import { describe, expect, it } from "vitest";

import { listCamps } from "./service";

describe("camp feed service", () => {
  it("returns an empty paged payload by default", async () => {
    const result = await listCamps({
      status: "published",
      sports: ["wakesurf", "wakeboard"],
      audience: "ru",
      limit: 5,
      offset: 0,
      updatedSince: null,
    });

    expect(result).toEqual({ items: [], nextOffset: null });
  });
});
