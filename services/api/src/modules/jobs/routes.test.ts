import type { Env } from "@mywave/config";
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  runDailySyncJob: vi.fn(),
}));

vi.mock("express", () => ({
  Router: () => ({
    get: mocks.get,
    post: mocks.post,
  }),
}));
vi.mock("../../middleware/auth", () => ({ requireAdmin: vi.fn(() => vi.fn()) }));
vi.mock("../ingestion/service", () => ({
  getJobDashboard: vi.fn(),
  runDailySyncJob: mocks.runDailySyncJob,
  runDedupJob: vi.fn(),
  runIngestionJob: vi.fn(),
  runNormalizationJob: vi.fn(),
}));
vi.mock("../content-pipeline/draft.service", () => ({ runContentDraftGenerationJob: vi.fn() }));
vi.mock("../content-pipeline/approval.service", () => ({ sendDraftToOwner: vi.fn() }));
vi.mock("../reviews/reviewRequests", () => ({ processReviewRequestQueue: vi.fn() }));
vi.mock("../../lib/safeLogger", () => ({ safeError: vi.fn() }));
vi.mock("../organizer-outreach/service", () => ({
  generateOrganizerOutreachCampaigns: vi.fn(),
  sendOutreachEmailForCampaign: vi.fn(),
}));
vi.mock("../content-pipeline/pipeline.runner", () => ({ runContentPipeline: vi.fn() }));

import { jobsRoutes } from "./routes";

describe("jobsRoutes daily sync safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runDailySyncJob.mockResolvedValue({ scope: "sources:1" });
  });

  it("forwards the configured daily source limit for an Admin-triggered sync", async () => {
    const env = {
      INGESTION_AUTOPUBLISH_ENABLED: false,
      INGESTION_DEFAULT_FALLBACK_IMAGE_URL: undefined,
      INGESTION_DAILY_SOURCE_LIMIT: 1,
    } as Env;
    jobsRoutes(env);

    const registration = mocks.post.mock.calls.find(([path]) => path === "/run-daily-sync");
    expect(registration).toBeDefined();
    const handler = registration?.at(-1) as (req: Request, res: Response) => Promise<void>;
    const req = { adminUserId: "admin-test" } as Request;
    const res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;

    await handler(req, res);

    expect(mocks.runDailySyncJob).toHaveBeenCalledWith("admin-test", {
      autoPublishEnabled: false,
      fallbackImageUrl: undefined,
      sourceLimit: 1,
    });
    expect(res.json).toHaveBeenCalledWith({ scope: "sources:1" });
  });
});
