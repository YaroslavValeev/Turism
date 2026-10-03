import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/prisma";
import { deliverSubscriptionOnce } from "./delivery";
vi.mock("../../lib/prisma", () => ({ prisma: { subscriptionDelivery: { createMany: vi.fn(), update: vi.fn() } } }));

describe("subscription delivery claim", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(prisma.subscriptionDelivery.createMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.subscriptionDelivery.update).mockResolvedValue({} as any); });
  it("records a successful send once", async () => {
    const send = vi.fn().mockResolvedValue(true);
    expect(await deliverSubscriptionOnce("sub", "program", "email", send)).toBe("sent");
    expect(send).toHaveBeenCalledOnce();
    expect(prisma.subscriptionDelivery.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "sent", completedAt: expect.any(Date) } }));
  });
  it("does not send on unique conflict or database failure", async () => {
    const send = vi.fn();
    vi.mocked(prisma.subscriptionDelivery.createMany).mockResolvedValue({ count: 0 });
    expect(await deliverSubscriptionOnce("sub", "program", "telegram", send)).toBe("skipped");
    vi.mocked(prisma.subscriptionDelivery.createMany).mockRejectedValue(new Error("db unavailable"));
    await expect(deliverSubscriptionOnce("sub", "program", "telegram", send)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it("records ambiguity instead of blindly resending after failure/timeout", async () => {
    for (const send of [vi.fn().mockResolvedValue(false), vi.fn().mockRejectedValue(new Error("timeout"))]) {
      expect(await deliverSubscriptionOnce("sub", "program", "telegram", send)).toBe("uncertain");
    }
    expect(prisma.subscriptionDelivery.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { status: "uncertain", completedAt: expect.any(Date) } }));
  });
});
