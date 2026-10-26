import express from "express";
import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@mywave/config";

const mocks = vi.hoisted(() => ({ program: vi.fn(), audits: vi.fn(), enrichment: vi.fn() }));
vi.mock("../../lib/prisma", () => ({ prisma: { program: { findUnique: mocks.program }, auditLog: { findMany: mocks.audits }, programEnrichment: { findMany: mocks.enrichment } } }));
vi.mock("../fx/cbrRates", () => ({ getCbrRates: async () => null, priceInRub: () => null }));
import { programsRoutes } from "./routes";

const day = 86400000;
const end = new Date(Date.now() - 2 * day);
const program = { id: "past-trip", title: "Завершённая поездка", publishStatus: "archived", startDate: new Date(end.getTime() - day), endDate: end, sourceUrl: "https://t.me/past_trips/1", media: [{ url: "/ingestion-media/original.jpg" }], organizer: { displayName: "Организатор поездок", verificationStatus: "verified" } };
const audit = { changedBy: "system:expired-program-archiver", oldValue: "published", newValue: "archived", reason: "AUTO_ARCHIVED: program endDate is in the past", createdAt: new Date(Date.now() - day) };

async function get() {
  const app = express(); app.use("/programs", programsRoutes({ ADMIN_JWT_SECRET: "unit-only" } as Env));
  app.use((_e: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: "internal" }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  try { const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/programs/past-trip`); return { status: res.status, cache: res.headers.get("cache-control"), data: await res.json() }; }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}

describe("completed program detail HTTP", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.program.mockResolvedValue(program); mocks.audits.mockResolvedValue([audit]); mocks.enrichment.mockResolvedValue([]); });
  it("reads automatic archives with media and a completed marker without caching", async () => {
    const r = await get(); expect(r.status).toBe(200); expect(r.cache).toBe("no-store"); expect(r.data.publicView).toBe("completed"); expect(r.data.media).toEqual(program.media);
    expect(mocks.audits).toHaveBeenCalledWith(expect.objectContaining({ where: { entityType: "program", entityId: program.id, changedField: "publish_status_change" }, take: 2 }));
  });
  it("serves expired published records before the archiver runs", async () => {
    mocks.program.mockResolvedValue({ ...program, publishStatus: "published" }); expect((await get()).status).toBe(200); expect(mocks.audits).not.toHaveBeenCalled();
  });
  it("keeps current published details backward compatible", async () => {
    mocks.program.mockResolvedValue({ ...program, publishStatus: "published", startDate: new Date(), endDate: new Date(Date.now() + day) });
    const r = await get(); expect(r.status).toBe(200); expect(r.data.publicView).toBeUndefined(); expect(mocks.audits).not.toHaveBeenCalled();
  });
  it("hides an archived merge duplicate without automatic completion evidence", async () => { mocks.audits.mockResolvedValue([]); expect((await get()).status).toBe(404); });
  it("hides a later manual withdrawal despite the older archive proof", async () => { mocks.audits.mockResolvedValue([{ ...audit, changedBy: "operator", createdAt: new Date() }, audit]); expect((await get()).status).toBe(404); });
  it("hides synthetic, unreviewed and organizer-withdrawn archive records", async () => {
    for (const patch of [{ title: "Demo fixture" }, { autoPublished: true, reviewStatus: "auto_pending" }, { organizer: { ...program.organizer, verificationStatus: "paused" } }]) {
      mocks.program.mockResolvedValue({ ...program, ...patch }); expect((await get()).status).toBe(404);
    }
  });
  it("fails closed through the normal error handler when evidence is unavailable", async () => { mocks.audits.mockRejectedValue(new Error("unavailable")); const r = await get(); expect(r.status).toBe(500); expect(r.cache).toBe("no-store"); expect(r.data).toEqual({ error: "internal" }); });
});
