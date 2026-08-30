/**
 * API entry. Sprint 1: env/config, auth (admin only), organizers CRUD, audit log.
 * No public auth. No revenue UI.
 */
import "./env/loadProcessEnv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { loadEnv } from "@mywave/config";
import { authRoutes } from "./modules/auth/routes";
import { organizersRoutes } from "./modules/organizers/routes";
import { programsRoutes } from "./modules/programs/routes";
import { bookingsRoutes } from "./modules/bookings/routes";
import { incidentsRoutes } from "./modules/incidents/routes";
import { reviewsRoutes } from "./modules/reviews/routes";
import { commissionsRoutes } from "./modules/commissions/routes";
import { metricsRoutes } from "./modules/metrics/routes";
import { paymentsRoutes } from "./modules/payments/routes";
import { refundsRoutes } from "./modules/refunds/routes";
import { billingRoutes } from "./modules/billing/routes";
import { publicOrganizerIntakeRoutes } from "./modules/public-intake/routes";
import { sourcesRoutes } from "./modules/sources/routes";
import { rawItemsRoutes } from "./modules/raw-items/routes";
import { eventCandidatesRoutes } from "./modules/event-candidates/routes";
import { jobsRoutes } from "./modules/jobs/routes";
import { startIngestionScheduler } from "./modules/ingestion/scheduler";
import { startSourceProposalDigestScheduler } from "./modules/sources/sourceProposalDigestScheduler";
import { startAnalyticsOpsScheduler } from "./modules/analytics/opsScheduler";
import { internalAnalyticsRoutes } from "./modules/analytics/routes";
import { publicSubscriptionsRoutes } from "./modules/subscriptions/routes";
import { publicBlogRoutes } from "./modules/public-blog/routes";
import { publicCollectionsRoutes } from "./modules/public-collections/routes";
import { publicExploreRoutes } from "./modules/public-explore/routes";
import { telegramContentPipelineRoutes } from "./modules/telegram/telegramContentRoutes";
import { telegramUnifiedWebhookRoutes } from "./modules/telegram/webhookRoutes";
import { contentPipelineRoutes } from "./modules/content-pipeline/routes";
import { internalContentPipelineRoutes } from "./modules/content-pipeline/internalMarketing.routes";
import { organizerOutreachRoutes } from "./modules/organizer-outreach/routes";
import { aiPilotRoutes } from "./modules/ai-pilot/routes";
import { campFeedRoutes } from "./modules/camp-feed/routes";
import { createAuthRateLimiter, createPublicRateLimiter, isOriginAllowed } from "./middleware/security";
import { safeError } from "./lib/safeLogger";
import { assertPublicBaseUrlsForProduction } from "./lib/publicBaseUrlCheck";
import { getReleaseIdentity } from "./lib/releaseIdentity";

const env = loadEnv();
assertPublicBaseUrlsForProduction(env);
const app = express();
app.disable("x-powered-by");
// Trust forwarded client IPs only when the immediate peer is a local/private
// reverse proxy (the production nginx container). Direct public peers cannot
// spoof X-Forwarded-For for rate-limit keys.
app.set("trust proxy", "loopback, linklocal, uniquelocal");
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      callback(null, isOriginAllowed(origin, env));
    },
  }),
);
app.use(express.json({ limit: "100kb" }));
const publicRateLimiter = createPublicRateLimiter(env);
const authRateLimiter = createAuthRateLimiter();
const releaseIdentity = getReleaseIdentity();

// Корень (в т.ч. после nginx `location /api/ → proxy_pass …/`): не «Cannot GET /»
app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "mywave-api",
    release: releaseIdentity,
    healthPath: "/health",
    hint: "Проверка: GET /health на том же хосте и префиксе, что и этот запрос.",
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "mywave-api", release: releaseIdentity });
});

app.use("/auth", authRateLimiter, authRoutes(env));
app.use("/organizers", organizersRoutes(env));
app.use("/programs", programsRoutes(env));
app.use("/bookings", bookingsRoutes(env));
app.use("/incidents", incidentsRoutes(env));
app.use("/reviews", reviewsRoutes(env));
app.use("/commissions", commissionsRoutes(env));
app.use("/metrics", metricsRoutes(env));
app.use("/payments", paymentsRoutes(env));
app.use("/refunds", refundsRoutes(env));
app.use("/billing", billingRoutes(env));
app.use("/sources", sourcesRoutes(env));
app.use("/raw-items", rawItemsRoutes(env));
app.use("/event-candidates", eventCandidatesRoutes(env));
app.use("/jobs", jobsRoutes(env));
app.use("/internal/analytics", internalAnalyticsRoutes(env));
app.use("/internal/content-pipeline", internalContentPipelineRoutes(env));
app.use("/api/sources", sourcesRoutes(env));
app.use("/api/raw-items", rawItemsRoutes(env));
app.use("/api/event-candidates", eventCandidatesRoutes(env));
app.use("/api/jobs", jobsRoutes(env));
app.use("/content-pipeline", contentPipelineRoutes(env));
app.use("/api/content-pipeline", contentPipelineRoutes(env));
app.use("/organizer-outreach", organizerOutreachRoutes(env));
app.use("/api/organizer-outreach", organizerOutreachRoutes(env));
const aiPilot = aiPilotRoutes(env);
app.use("/ai-pilot", aiPilot);
app.use("/api/ai-pilot", aiPilot);
app.use(campFeedRoutes(env));
// Apply the public limiter exactly once per /public request. Mounting it with
// every sub-router would consume the quota multiple times while Express walks
// routers that do not match the final endpoint.
app.use("/public", publicRateLimiter);
app.use("/public/organizer-intake", publicOrganizerIntakeRoutes());
app.use("/public/subscriptions", publicSubscriptionsRoutes(env));
app.use("/public", publicCollectionsRoutes(env));
app.use("/public", publicExploreRoutes(env));
app.use("/public", publicBlogRoutes(env));
app.use("/public/telegram", telegramUnifiedWebhookRoutes(env));
app.use("/public/telegram", telegramContentPipelineRoutes(env));

// Minimal observability: log unhandled errors (no PII in logs)
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  safeError("API error", err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT ?? 3001;
app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`API listening on ${PORT}`);
});

startIngestionScheduler(env);
startSourceProposalDigestScheduler(env);
startAnalyticsOpsScheduler(env);
