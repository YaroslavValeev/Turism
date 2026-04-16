import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseIngestionEvent, scanValueForPii } from "./validators";
import { resetApiEnvCacheForTests } from "./runtimeEnv";

const prismaMock = vi.hoisted(() => ({
  analyticsEvent: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  analyticsEventError: {
    create: vi.fn(),
  },
}));

vi.mock("../../lib/prisma", () => ({
  prisma: prismaMock,
}));

describe("analytics validators", () => {
  it("blocks obvious PII in strings", () => {
    expect(scanValueForPii("test@mail.com", "x")).toBeTruthy();
  });

  it("rejects contract_view_block without session_id", () => {
    const parsed = parseIngestionEvent({
      event_name: "contract_view_block",
      event_version: 1,
      event_source: "frontend",
      event_time: "2026-04-15T12:00:00.000Z",
      idempotency_key: "k_contract",
      contract_version: "v1",
      user_role: "organizer",
      properties_json: {
        area: "organizers",
        page: "program",
        file_type: "none",
        component: "ContractDownloadBlock",
      },
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issue.message).toContain("session_id");
    }
  });

  it("accepts contract instrumentation with required fields", () => {
    const parsed = parseIngestionEvent({
      event_name: "contract_download_pdf",
      event_version: 1,
      event_source: "frontend",
      event_time: "2026-04-15T12:00:00.000Z",
      idempotency_key: "k_contract_pdf",
      session_id: "sess_x",
      user_role: "organizer",
      contract_version: "v1",
      properties_json: {
        area: "organizers",
        page: "program",
        file_type: "pdf",
        component: "ContractDownloadBlock",
      },
    });
    expect(parsed.ok).toBe(true);
  });

  it("parses a minimal valid event", () => {
    const parsed = parseIngestionEvent({
      event_name: "page_view",
      event_version: 1,
      event_source: "frontend",
      event_time: "2026-04-15T12:00:00.000Z",
      idempotency_key: "k1",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.eventName).toBe("page_view");
    }
  });
});

describe("analytics ingestion (unit, prisma mocked)", () => {
  beforeEach(() => {
    vi.resetModules();
    resetApiEnvCacheForTests();
    prismaMock.analyticsEvent.findUnique.mockReset();
    prismaMock.analyticsEvent.create.mockReset();
    prismaMock.analyticsEventError.create.mockReset();
  });

  it("accepts new event", async () => {
    prismaMock.analyticsEvent.findUnique.mockResolvedValueOnce(null);
    prismaMock.analyticsEvent.create.mockResolvedValueOnce({ id: "evt_1" });

    process.env.APP_ENV = "test";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";
    process.env.JWT_SECRET = "x".repeat(32);
    process.env.ADMIN_JWT_SECRET = "y".repeat(32);
    process.env.ANALYTICS_ENABLED = "1";
    process.env.INTERNAL_ANALYTICS_TOKEN = "token";

    const { ingestSingleEvent } = await import("./service");
    const { loadEnv } = await import("@mywave/config");
    const env = loadEnv();

    const res = await ingestSingleEvent(env, {
      event_name: "page_view",
      event_version: 1,
      event_source: "frontend",
      event_time: "2026-04-15T12:00:00.000Z",
      idempotency_key: "k_new",
      session_id: "sess",
    });

    expect(res.status).toBe("accepted");
    expect(prismaMock.analyticsEvent.create).toHaveBeenCalledTimes(1);
  });

  it("dedups identical idempotency payload", async () => {
    prismaMock.analyticsEvent.findUnique.mockResolvedValueOnce({
      id: "evt_dup",
      eventName: "page_view",
      eventVersion: 1,
      eventSource: "frontend",
      eventTime: new Date("2026-04-15T12:00:00.000Z"),
      traceId: null,
      sessionId: "sess",
      userIdHash: null,
      userRole: null,
      pageType: null,
      programId: null,
      organizerId: null,
      discipline: null,
      region: null,
      verifiedStatus: null,
      trafficSource: null,
      leadId: null,
      bookingId: null,
      statementId: null,
      paymentId: null,
      refundId: null,
      commissionId: null,
      contractVersion: null,
      paymentStatus: null,
      grossAmount: null,
      netAmount: null,
      refundAmount: null,
      commissionRate: null,
      commissionAmount: null,
      propertiesJson: null,
    });

    process.env.APP_ENV = "test";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";
    process.env.JWT_SECRET = "x".repeat(32);
    process.env.ADMIN_JWT_SECRET = "y".repeat(32);
    process.env.ANALYTICS_ENABLED = "1";
    process.env.INTERNAL_ANALYTICS_TOKEN = "token";

    const { ingestSingleEvent } = await import("./service");
    const { loadEnv } = await import("@mywave/config");
    const env = loadEnv();

    const res = await ingestSingleEvent(env, {
      event_name: "page_view",
      event_version: 1,
      event_source: "frontend",
      event_time: "2026-04-15T12:00:00.000Z",
      idempotency_key: "k_dup",
      session_id: "sess",
    });

    expect(res.status).toBe("duplicate");
    expect(prismaMock.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it("accepts contract_download_docx with required contract fields", async () => {
    prismaMock.analyticsEvent.findUnique.mockResolvedValueOnce(null);
    prismaMock.analyticsEvent.create.mockResolvedValueOnce({ id: "evt_contract" });

    process.env.APP_ENV = "test";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";
    process.env.JWT_SECRET = "x".repeat(32);
    process.env.ADMIN_JWT_SECRET = "y".repeat(32);
    process.env.ANALYTICS_ENABLED = "1";
    process.env.INTERNAL_ANALYTICS_TOKEN = "token";

    const { ingestSingleEvent } = await import("./service");
    const { loadEnv } = await import("@mywave/config");
    const env = loadEnv();

    const res = await ingestSingleEvent(env, {
      event_name: "contract_download_docx",
      event_version: 1,
      event_source: "frontend",
      event_time: "2026-04-15T12:00:00.000Z",
      idempotency_key: "fe:contract_download_docx:uuid-1",
      session_id: "sess_x",
      user_role: "organizer",
      contract_version: "v1",
      properties_json: {
        area: "organizers",
        page: "verification",
        file_type: "docx",
        component: "ContractDownloadBlock",
      },
    });

    expect(res.status).toBe("accepted");
    expect(prismaMock.analyticsEvent.create).toHaveBeenCalledTimes(1);
  });
});
