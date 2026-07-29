import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({ prisma: {} }));
vi.mock("../../lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../ingestion/service", () => ({
  runDedupJob: vi.fn(),
  runNormalizationJob: vi.fn(),
  runSourceCollection: vi.fn(),
}));
vi.mock("../analytics/service", () => ({ emitBackendAnalyticsEventBestEffort: vi.fn() }));
vi.mock("./telegramApi", () => ({ callTelegramJson: vi.fn() }));
import { isTelegramOperator, parseOperatorCallback } from "./operatorMenu";

const env = {
  TELEGRAM_CONTENT_OWNER_CHAT_ID: "-1003491522243",
  TELEGRAM_SOURCE_PROPOSAL_USER_IDS: "510686579",
} as unknown as import("@mywave/config").Env;

describe("telegram operator menu contract", () => {
  it("accepts only an allowlisted user in the configured owner chat", () => {
    expect(isTelegramOperator(env, -1003491522243, 510686579)).toBe(true);
    expect(isTelegramOperator(env, -1003491522243, 1)).toBe(false);
    expect(isTelegramOperator(env, 1, 510686579)).toBe(false);
  });

  it("parses source run and status controls without a publish callback", () => {
    expect(parseOperatorCallback("mw:run:cmabc123")).toEqual({ kind: "source_run", sourceId: "cmabc123" });
    expect(parseOperatorCallback("mw:os:cmabc123:v")).toEqual({
      kind: "organizer_status",
      organizerId: "cmabc123",
      status: "verified",
    });
    expect(parseOperatorCallback("mw:ps:cmabc123:a")).toEqual({
      kind: "program_status",
      programId: "cmabc123",
      status: "approved",
    });
    expect(parseOperatorCallback("mw:ps:cmabc123:z")).toBeNull();
    expect(parseOperatorCallback("mw:ps:cmabc123:published")).toBeNull();
  });
});
