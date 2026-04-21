/**
 * API entry. Sprint 1: env/config, auth (admin only), organizers CRUD, audit log.
 * No public auth. No revenue UI.
 */
import "./env/loadProcessEnv";
import express from "express";
import cors from "cors";
import { isLaunchMode, loadEnv } from "@mywave/config";
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
import { notificationPublicRoutes } from "./modules/notifications/publicRoutes";
import { startNotificationSystem } from "./modules/notifications/notificationSystem";
import { organizerIntakesRoutes } from "./modules/organizer-intakes/routes";
import { domainStatusEventsRoutes } from "./modules/domain-status-events/routes";
import { getProgramPublishHintsJson } from "./modules/programs/publishGate";
import { sourcesRoutes } from "./modules/sources/routes";
import { rawItemsRoutes } from "./modules/raw-items/routes";
import { eventCandidatesRoutes } from "./modules/event-candidates/routes";
import { jobsRoutes } from "./modules/jobs/routes";
import { startIngestionScheduler } from "./modules/ingestion/scheduler";
import { startAnalyticsOpsScheduler } from "./modules/analytics/opsScheduler";
import { internalAnalyticsRoutes } from "./modules/analytics/routes";
import { ugcPublicRoutes } from "./modules/ugc/publicRoutes";
import { ugcAdminRoutes } from "./modules/ugc/adminRoutes";
import { publicReferralRoutes, adminReferralRoutes } from "./modules/ugc/referralRoutes";
import { economicsRoutes } from "./modules/economics/routes";
import { adminAlertsRoutes } from "./modules/alerts/adminAlertsRoutes";
import { startGovernanceAlertScheduler } from "./modules/economics/governanceAlerts/governanceScheduler";
import { prisma } from "./lib/prisma";
import { startConversionFunnelScheduler } from "./modules/conversion-funnel/scheduler";
import { startConversionOwnerNotifyAlertScheduler } from "./modules/conversion-funnel/drafts/ownerNotifyAlertScheduler";
import { conversionFunnelPublicRoutes } from "./modules/conversion-funnel/publicRoutes";
import { conversionGovernanceWebhookRoutes } from "./modules/conversion-funnel/drafts/governanceWebhookRoutes";
import { conversionDraftAdminRoutes } from "./modules/conversion-funnel/drafts/adminRoutes";

const env = loadEnv();
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

/** Публичный снимок режима платформы (без секретов) — для UI copy / Launch Mode. */
app.get("/public/platform", (_req, res) => {
  res.json({
    platformMode: env.PLATFORM_MODE,
    launchMode: isLaunchMode(env.PLATFORM_MODE),
  });
});

app.use("/auth", authRoutes(env));
app.use("/organizers", organizersRoutes(env));
app.use("/programs", programsRoutes(env));
app.use("/bookings", bookingsRoutes(env));
app.use("/admin/organizer-intakes", organizerIntakesRoutes(env));
app.use("/admin/domain-status-events", domainStatusEventsRoutes(env));
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
app.use("/api/sources", sourcesRoutes(env));
app.use("/api/raw-items", rawItemsRoutes(env));
app.use("/api/event-candidates", eventCandidatesRoutes(env));
app.use("/api/jobs", jobsRoutes(env));
app.use("/public/organizer-intake", publicOrganizerIntakeRoutes());
app.use("/public", notificationPublicRoutes(env));
app.use("/public", conversionFunnelPublicRoutes(env));
app.use("/public/conversion-funnel/governance", conversionGovernanceWebhookRoutes(env));
app.use("/admin/conversion-drafts", conversionDraftAdminRoutes(env));
app.use("/public", ugcPublicRoutes(env));
app.use("/public", publicReferralRoutes(env));
app.use("/admin/ugc", ugcAdminRoutes(env));
app.use("/admin/referrals", adminReferralRoutes(env));
app.use("/admin/economics", economicsRoutes(env));
app.use("/admin/alerts", adminAlertsRoutes(env));

app.get("/public/program-publish-hints", (_req, res) => {
  res.json(getProgramPublishHintsJson());
});

// Minimal observability: log unhandled errors (no PII in logs)
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("API error", err.message);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`API listening on ${PORT}`);
});

startIngestionScheduler(env);
startAnalyticsOpsScheduler(env);
startConversionFunnelScheduler(env);
startConversionOwnerNotifyAlertScheduler(env);
startNotificationSystem(env);
startGovernanceAlertScheduler(env, prisma);
