import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { buildCampListResponse, buildCampWhere, collectCampListPage, parseCampListQuery } from "./routes";

function req(query: Record<string, string | undefined>): Request {
  return { query } as unknown as Request;
}

describe("camp feed routes helpers", () => {
  it("parses the requested sync query", () => {
    const parsed = parseCampListQuery(req({
      status: "published",
      sports: "wakesurf,wakeboard",
      audience: "ru",
      updated_since: "2026-07-01T00:00:00Z",
      limit: "100",
      offset: "0",
    }));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.query.status).toBe("published");
      expect(parsed.query.sports).toEqual(["wakesurf", "wakeboard"]);
      expect(parsed.query.updatedSince?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
      expect(parsed.query.limit).toBe(100);
      expect(parsed.query.offset).toBe(0);
    }
  });

  it("rejects unsupported audience and sports", () => {
    expect(parseCampListQuery(req({ audience: "en" })).ok).toBe(false);
    expect(parseCampListQuery(req({ sports: "skiing" })).ok).toBe(false);
  });

  it("builds Program filters for published wake camps updated since date", () => {
    const parsed = parseCampListQuery(req({
      status: "published",
      sports: "wakesurf",
      audience: "ru",
      updated_since: "2026-07-01T00:00:00Z",
    }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const where = buildCampWhere(parsed.query);
    expect(where).toMatchObject({
      AND: expect.arrayContaining([
        { publishStatus: { in: ["published"] } },
        {
          OR: [
            { updatedAt: { gte: new Date("2026-07-01T00:00:00.000Z") } },
            { updatedFromSourceAt: { gte: new Date("2026-07-01T00:00:00.000Z") } },
          ],
        },
      ]),
    });
  });

  it("wraps list responses in the canonical items envelope", () => {
    const one = { id: "tour_1" };
    const two = { id: "tour_2" };
    const three = { id: "tour_3" };

    expect(buildCampListResponse([one, two] as never, { limit: 2, offset: 0 })).toEqual({
      items: [one, two],
      next_offset: null,
    });

    expect(buildCampListResponse([one, two, three] as never, { limit: 2, offset: 10 })).toEqual({
      items: [one, two],
      next_offset: 12,
    });
  });

  it("applies limit after rows rejected by the Camp mapper", async () => {
    const one = { id: "tour_1" };
    const two = { id: "tour_2" };
    const three = { id: "tour_3" };
    const candidates = [null, null, one, null, two, three];

    const page = await collectCampListPage(
      { limit: 2, offset: 0 },
      async (skip, take) => candidates.slice(skip, skip + take),
      (candidate) => candidate as never,
      2,
    );

    expect(page).toEqual({
      items: [one, two],
      next_offset: 2,
    });
  });

  it("applies offset to mapped Camps instead of raw Program rows", async () => {
    const one = { id: "tour_1" };
    const two = { id: "tour_2" };
    const three = { id: "tour_3" };
    const candidates = [null, one, null, two, three];

    const page = await collectCampListPage(
      { limit: 1, offset: 1 },
      async (skip, take) => candidates.slice(skip, skip + take),
      (candidate) => candidate as never,
      2,
    );

    expect(page).toEqual({
      items: [two],
      next_offset: 2,
    });
  });
});
