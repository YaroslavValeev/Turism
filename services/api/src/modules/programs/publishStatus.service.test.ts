import { describe, expect, it, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
const auditCreate = vi.fn();
const notify = vi.fn();

vi.mock("../../lib/prisma", () => ({
  prisma: {
    program: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        program: { update: (...args: unknown[]) => update(...args) },
        publishedProgram: { updateMany: async () => ({ count: 0 }) },
      }),
  },
}));

vi.mock("../../lib/audit", () => ({
  writeAuditLog: (...args: unknown[]) => auditCreate(...args),
}));

vi.mock("../subscriptions/notifier", () => ({
  notifySubscribersOnProgramPublished: (...args: unknown[]) => notify(...args),
}));

vi.mock("./publishGate", () => ({
  programIncludeForPublishGate: { media: true, organizer: { select: { displayName: true } } },
  canPublish: (p: { title?: string }) =>
    p.title === "ok"
      ? { ok: true, missing: [] }
      : { ok: false, missing: ["title"] },
}));

import { setProgramPublishStatus } from "./publishStatus.service";

const env = {} as never;

describe("setProgramPublishStatus", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
    auditCreate.mockReset();
    notify.mockReset();
  });

  it("returns not_found", async () => {
    findUnique.mockResolvedValue(null);
    const r = await setProgramPublishStatus(env, {
      programId: "x",
      publishStatus: "published",
      actorId: "admin",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("not_found");
  });

  it("blocks publish when gate fails", async () => {
    findUnique.mockResolvedValue({
      id: "p1",
      title: "bad",
      publishStatus: "approved",
      media: [],
    });
    const r = await setProgramPublishStatus(env, {
      programId: "p1",
      publishStatus: "published",
      actorId: "admin",
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error === "gate") expect(r.missing).toContain("title");
    expect(update).not.toHaveBeenCalled();
  });

  it("publishes and notifies on transition to published", async () => {
    findUnique.mockResolvedValue({
      id: "p1",
      title: "ok",
      publishStatus: "approved",
      discipline: "ski",
      region: "Sochi",
      startDate: new Date("2026-12-01"),
      media: [{ id: "m1" }],
    });
    update.mockResolvedValue({
      id: "p1",
      title: "ok",
      publishStatus: "published",
      discipline: "ski",
      region: "Sochi",
      startDate: new Date("2026-12-01"),
      media: [],
    });
    const r = await setProgramPublishStatus(env, {
      programId: "p1",
      publishStatus: "published",
      actorId: "tg:1",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.notified).toBe(true);
      expect(r.alreadyPublished).toBe(false);
    }
    expect(notify).toHaveBeenCalledOnce();
    expect(auditCreate).toHaveBeenCalled();
  });

  it("does not re-notify when already published", async () => {
    findUnique.mockResolvedValue({
      id: "p1",
      title: "ok",
      publishStatus: "published",
      media: [],
    });
    update.mockResolvedValue({
      id: "p1",
      title: "ok",
      publishStatus: "published",
      media: [],
    });
    const r = await setProgramPublishStatus(env, {
      programId: "p1",
      publishStatus: "published",
      actorId: "admin",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.alreadyPublished).toBe(true);
      expect(r.notified).toBe(false);
    }
    expect(notify).not.toHaveBeenCalled();
  });
});
