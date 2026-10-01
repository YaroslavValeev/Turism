import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { buildCampWhere, collectCampListPage, parseCampListQuery } from "./routes";

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

  describe("collectCampListPage", () => {
    // 12 строк БД, маппер отбрасывает каждую третью (i % 3 === 0) → 8 валидных кемпов.
    const rows = Array.from({ length: 12 }, (_, i) => i);
    const map = (i: number) => (i % 3 === 0 ? null : ({ id: `tour_${i}` } as never));
    const fetchBatch = (skip: number, take: number) => Promise.resolve(rows.slice(skip, skip + take));
    const ids = (page: { items: { id: string }[] }) => page.items.map((c) => c.id);

    it("fills limit with valid camps even when the mapper drops rows", async () => {
      const page = await collectCampListPage(fetchBatch, map, { limit: 5, offset: 0 }, 4);
      expect(ids(page)).toEqual(["tour_1", "tour_2", "tour_4", "tour_5", "tour_7"]);
      expect(page.next_offset).toBe(5);
    });

    it("applies offset to camps, not to raw rows, and stops at the end", async () => {
      const page = await collectCampListPage(fetchBatch, map, { limit: 5, offset: 5 }, 4);
      expect(ids(page)).toEqual(["tour_8", "tour_10", "tour_11"]);
      expect(page.next_offset).toBeNull();
    });

    it("pages are consecutive and never repeat ids", async () => {
      const seen: string[] = [];
      let offset: number | null = 0;
      while (offset !== null) {
        const page = await collectCampListPage(fetchBatch, map, { limit: 3, offset }, 5);
        seen.push(...ids(page));
        offset = page.next_offset;
      }
      expect(seen).toEqual(["tour_1", "tour_2", "tour_4", "tour_5", "tour_7", "tour_8", "tour_10", "tour_11"]);
      expect(new Set(seen).size).toBe(seen.length);
    });

    it("limit=0 returns an empty page", async () => {
      expect(await collectCampListPage(fetchBatch, map, { limit: 0, offset: 10 })).toEqual({ items: [], next_offset: null });
    });
  });
});
