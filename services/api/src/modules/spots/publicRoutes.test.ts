import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn() }));

vi.mock("../../lib/prisma", () => ({
  prisma: { spot: { findMany: mocks.findMany, findFirst: mocks.findFirst } },
}));

import { publicSpotsRoutes } from "./publicRoutes";

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use("/public", publicSpotsRoutes());
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");
  base = `http://127.0.0.1:${address.port}/public`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

beforeEach(() => vi.clearAllMocks());

describe("public spots routes", () => {
  it("lists only listed spots and filters snapshots to current published ones", async () => {
    mocks.findMany.mockResolvedValue([]);
    const res = await fetch(`${base}/spots?region=Москва`);
    expect(res.status).toBe(200);
    const args = mocks.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ discoveryStatus: "listed", region: "Москва" });
    expect(args.include.serviceUnits.include.snapshots.where).toMatchObject({
      publishedAt: { not: null },
      revokedAt: null,
      expiresAt: { gt: expect.any(Date) },
    });
  });

  it("returns 404 for spots that are not listed", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const res = await fetch(`${base}/spots/candidate-1`);
    expect(res.status).toBe(404);
    expect(mocks.findFirst.mock.calls[0][0].where).toEqual({ id: "candidate-1", discoveryStatus: "listed" });
  });

  it("serves methodology without touching the database", async () => {
    const res = await fetch(`${base}/spots/methodology`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { methodology: { methodologyVersion: string } };
    expect(body.methodology.methodologyVersion).toBe("v1.1");
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});
