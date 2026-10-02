import express, { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import type { Env } from "@mywave/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { requireAdmin } from "../../middleware/auth";
import { evaluateRemoteGateRemediation, evaluateSpotRating } from "./ratingEngine";
import { buildSpotRatingInput } from "./ratingInput";
import { planCandidateImport } from "./candidateImport";
import {
  SPOT_EVIDENCE_MAX_BYTES,
  detectEvidence,
  readEvidenceFile,
  saveEvidenceFile,
} from "./evidenceStorage";
import {
  SPOT_CATEGORIES,
  SPOT_DISCOVERY_STATUSES,
  canTransitionAudit,
  parseAuditInput,
  parseCategoryScores,
  parseEvidenceCriterion,
  parseGateResults,
  parseSpotInput,
  parseUnitInput,
  type SpotAuditStatus,
} from "./validation";

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

function wrap(handler: AsyncHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

const auditInclude = {
  unit: { include: { spot: true } },
  categoryScores: true,
  gateResults: true,
  evidence: { orderBy: { createdAt: "asc" } },
  remediations: { orderBy: { decidedAt: "asc" } },
  snapshots: { orderBy: { computedAt: "desc" } },
} satisfies Prisma.SpotAssessmentInclude;

type AuditWithRelations = Prisma.SpotAssessmentGetPayload<{ include: typeof auditInclude }>;

async function loadAudit(id: string): Promise<AuditWithRelations | null> {
  return prisma.spotAssessment.findUnique({ where: { id }, include: auditInclude });
}

function actor(req: Request): string | null {
  return req.adminUserId ?? null;
}

async function isAdminUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role === "admin";
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function spotData(input: ReturnType<typeof parseSpotInput> & { ok: true }) {
  const { latitude, longitude, ...rest } = input.data;
  return {
    ...rest,
    ...(latitude !== undefined ? { latitude: latitude === null ? null : new Prisma.Decimal(latitude) } : {}),
    ...(longitude !== undefined ? { longitude: longitude === null ? null : new Prisma.Decimal(longitude) } : {}),
  };
}

export function spotsAdminRoutes(env: Env): Router {
  const router = Router();
  router.use(requireAdmin(env));

  router.get("/", wrap(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !(SPOT_DISCOVERY_STATUSES as readonly string[]).includes(status)) {
      res.status(400).json({ error: `status must be one of: ${SPOT_DISCOVERY_STATUSES.join(", ")}` });
      return;
    }
    const region = typeof req.query.region === "string" && req.query.region.trim() ? req.query.region.trim() : undefined;
    const spots = await prisma.spot.findMany({
      where: { ...(status ? { discoveryStatus: status } : {}), ...(region ? { region } : {}) },
      orderBy: [{ region: "asc" }, { name: "asc" }],
      include: { _count: { select: { serviceUnits: true } } },
      take: 500,
    });
    res.json({ items: spots });
  }));

  router.post("/", wrap(async (req, res) => {
    const parsed = parseSpotInput(req.body, "create");
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const spot = await prisma.spot.create({
      data: spotData(parsed) as Prisma.SpotUncheckedCreateInput,
    });
    await writeAuditLog({
      entityType: "spot", entityId: spot.id, changedField: "created",
      oldValue: null, newValue: spot.name, changedBy: actor(req),
    });
    res.status(201).json(spot);
  }));

  router.get("/reviewers", wrap(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { role: "admin" },
      select: { id: true, name: true, email: true },
      orderBy: { email: "asc" },
    });
    res.json({ items: users, currentUserId: actor(req) });
  }));

  router.post("/import", wrap(async (req, res) => {
    const existing = await prisma.spot.findMany({ select: { name: true, region: true } });
    const planned = planCandidateImport(req.body, existing);
    if (!planned.ok) { res.status(400).json({ error: planned.error }); return; }
    const plan = planned.data;
    const summary = {
      errors: plan.errors,
      duplicates: plan.duplicates,
      toCreate: plan.toCreate.map((c) => ({ index: c.index, name: c.data.name, region: c.data.region })),
    };
    if (plan.errors.length > 0) {
      res.status(400).json({ error: "import has invalid rows; nothing was created", ...summary });
      return;
    }
    const dryRun = typeof req.body === "object" && req.body !== null && (req.body as { dryRun?: unknown }).dryRun === true;
    if (dryRun || plan.toCreate.length === 0) {
      res.json({ dryRun, created: [], ...summary });
      return;
    }
    const created = await prisma.$transaction(
      plan.toCreate.map((c) =>
        prisma.spot.create({
          data: spotData({ ok: true, data: c.data }) as Prisma.SpotUncheckedCreateInput,
          select: { id: true, name: true, region: true },
        }),
      ),
    );
    for (const spot of created) {
      await writeAuditLog({
        entityType: "spot", entityId: spot.id, changedField: "created",
        oldValue: null, newValue: spot.name, changedBy: actor(req), reason: "candidate_import",
      });
    }
    res.status(201).json({ dryRun: false, created, ...summary });
  }));

  router.get("/:id", wrap(async (req, res) => {
    const spot = await prisma.spot.findUnique({
      where: { id: req.params.id },
      include: {
        organizer: { select: { id: true, displayName: true } },
        serviceUnits: {
          orderBy: { createdAt: "asc" },
          include: {
            audits: { orderBy: { testedAt: "desc" }, select: { id: true, testedAt: true, status: true } },
            snapshots: { orderBy: { computedAt: "desc" }, take: 5 },
          },
        },
      },
    });
    if (!spot) { res.status(404).json({ error: "Not found" }); return; }
    res.json(spot);
  }));

  router.patch("/:id", wrap(async (req, res) => {
    const existing = await prisma.spot.findUnique({ where: { id: req.params.id } });
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    const parsed = parseSpotInput(req.body, "patch");
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const spot = await prisma.spot.update({
      where: { id: existing.id },
      data: spotData(parsed) as Prisma.SpotUncheckedUpdateInput,
    });
    await writeAuditLog({
      entityType: "spot", entityId: spot.id, changedField: "updated",
      oldValue: null, newValue: Object.keys(parsed.data).join(","), changedBy: actor(req),
    });
    res.json(spot);
  }));

  router.post("/:id/units", wrap(async (req, res) => {
    const spot = await prisma.spot.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!spot) { res.status(404).json({ error: "Not found" }); return; }
    const parsed = parseUnitInput(req.body, "create");
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const unit = await prisma.spotEquipment.create({
      data: {
        spotId: spot.id,
        serviceName: parsed.data.serviceName!,
        equipmentConfig: toJsonValue(parsed.data.equipmentConfig),
        ...(parsed.data.discipline ? { discipline: parsed.data.discipline } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      },
    });
    await writeAuditLog({
      entityType: "spot_service_unit", entityId: unit.id, changedField: "created",
      oldValue: null, newValue: `${spot.id}:${unit.serviceName}`, changedBy: actor(req),
    });
    res.status(201).json(unit);
  }));

  router.get("/units/:unitId", wrap(async (req, res) => {
    const unit = await prisma.spotEquipment.findUnique({
      where: { id: req.params.unitId },
      include: {
        spot: true,
        audits: { orderBy: { testedAt: "desc" } },
        snapshots: { orderBy: { computedAt: "desc" } },
      },
    });
    if (!unit) { res.status(404).json({ error: "Not found" }); return; }
    res.json(unit);
  }));

  router.patch("/units/:unitId", wrap(async (req, res) => {
    const existing = await prisma.spotEquipment.findUnique({ where: { id: req.params.unitId } });
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    const parsed = parseUnitInput(req.body, "patch");
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const { equipmentConfig, ...rest } = parsed.data;
    const unit = await prisma.spotEquipment.update({
      where: { id: existing.id },
      data: { ...rest, ...(equipmentConfig ? { equipmentConfig: toJsonValue(equipmentConfig) } : {}) },
    });
    await writeAuditLog({
      entityType: "spot_service_unit", entityId: unit.id, changedField: "updated",
      oldValue: null, newValue: Object.keys(parsed.data).join(","), changedBy: actor(req),
    });
    res.json(unit);
  }));

  router.post("/units/:unitId/audits", wrap(async (req, res) => {
    const unit = await prisma.spotEquipment.findUnique({ where: { id: req.params.unitId }, select: { id: true } });
    if (!unit) { res.status(404).json({ error: "Not found" }); return; }
    const parsed = parseAuditInput(req.body, "create");
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    if (parsed.data.independentEditorUserId && !(await isAdminUser(parsed.data.independentEditorUserId))) {
      res.status(400).json({ error: "independentEditorUserId must be an admin user" });
      return;
    }
    const audit = await prisma.spotAssessment.create({
      data: {
        unitId: unit.id,
        testedAt: parsed.data.testedAt!,
        methodologyVersion: parsed.data.methodologyVersion!,
        protocolVersion: parsed.data.protocolVersion!,
        criteriaVersion: parsed.data.criteriaVersion!,
        externalExpertConfirmed: parsed.data.externalExpertConfirmed ?? false,
        externalExpertName: parsed.data.externalExpertName ?? null,
        independentEditorUserId: parsed.data.independentEditorUserId ?? null,
        notes: parsed.data.notes ?? null,
      },
    });
    await writeAuditLog({
      entityType: "spot_audit", entityId: audit.id, changedField: "created",
      oldValue: null, newValue: unit.id, changedBy: actor(req),
    });
    res.status(201).json(audit);
  }));

  router.get("/audits/:auditId", wrap(async (req, res) => {
    const audit = await loadAudit(req.params.auditId);
    if (!audit) { res.status(404).json({ error: "Not found" }); return; }
    res.json(audit);
  }));

  router.patch("/audits/:auditId", wrap(async (req, res) => {
    const audit = await loadAudit(req.params.auditId);
    if (!audit) { res.status(404).json({ error: "Not found" }); return; }
    if (audit.status !== "draft") { res.status(409).json({ error: "only draft audits can be edited" }); return; }
    const parsed = parseAuditInput(req.body, "patch");
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    if (parsed.data.independentEditorUserId && !(await isAdminUser(parsed.data.independentEditorUserId))) {
      res.status(400).json({ error: "independentEditorUserId must be an admin user" });
      return;
    }
    const updated = await prisma.spotAssessment.update({ where: { id: audit.id }, data: parsed.data });
    await writeAuditLog({
      entityType: "spot_audit", entityId: audit.id, changedField: "updated",
      oldValue: null, newValue: Object.keys(parsed.data).join(","), changedBy: actor(req),
    });
    res.json(updated);
  }));

  router.put("/audits/:auditId/scores", wrap(async (req, res) => {
    const audit = await loadAudit(req.params.auditId);
    if (!audit) { res.status(404).json({ error: "Not found" }); return; }
    if (audit.status !== "draft") { res.status(409).json({ error: "scores can only be changed in draft" }); return; }
    const parsed = parseCategoryScores(req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    await prisma.$transaction(
      Object.entries(parsed.data).map(([category, score]) =>
        prisma.spotCriterionResult.upsert({
          where: { auditId_category: { auditId: audit.id, category } },
          create: { auditId: audit.id, category, score: new Prisma.Decimal(score!) },
          update: { score: new Prisma.Decimal(score!) },
        }),
      ),
    );
    await writeAuditLog({
      entityType: "spot_audit", entityId: audit.id, changedField: "category_scores",
      oldValue: JSON.stringify(Object.fromEntries(audit.categoryScores.map((s) => [s.category, s.score.toString()]))),
      newValue: JSON.stringify(parsed.data), changedBy: actor(req),
    });
    res.json(await loadAudit(audit.id));
  }));

  router.put("/audits/:auditId/gates", wrap(async (req, res) => {
    const audit = await loadAudit(req.params.auditId);
    if (!audit) { res.status(404).json({ error: "Not found" }); return; }
    if (audit.status !== "draft") { res.status(409).json({ error: "gates can only be changed in draft" }); return; }
    const parsed = parseGateResults(req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    await prisma.$transaction(
      Object.entries(parsed.data).map(([gateId, status]) =>
        prisma.spotGateResult.upsert({
          where: { auditId_gateId: { auditId: audit.id, gateId } },
          create: { auditId: audit.id, gateId, status: status! },
          update: { status: status! },
        }),
      ),
    );
    await writeAuditLog({
      entityType: "spot_audit", entityId: audit.id, changedField: "gate_results",
      oldValue: JSON.stringify(Object.fromEntries(audit.gateResults.map((g) => [g.gateId, g.status]))),
      newValue: JSON.stringify(parsed.data), changedBy: actor(req),
    });
    res.json(await loadAudit(audit.id));
  }));

  const transitions: Array<{ path: string; to: SpotAuditStatus }> = [
    { path: "submit", to: "submitted" },
    { path: "reopen", to: "draft" },
    { path: "sign", to: "signed" },
    { path: "void", to: "void" },
  ];
  for (const { path, to } of transitions) {
    router.post(`/audits/:auditId/${path}`, wrap(async (req, res) => {
      const audit = await loadAudit(req.params.auditId);
      if (!audit) { res.status(404).json({ error: "Not found" }); return; }
      if (!canTransitionAudit(audit.status, to)) {
        res.status(409).json({ error: `cannot move audit from ${audit.status} to ${to}` });
        return;
      }
      if (to === "submitted" || to === "signed") {
        const missing = SPOT_CATEGORIES.filter((c) => !audit.categoryScores.some((s) => s.category === c));
        if (missing.length > 0) {
          res.status(409).json({ error: "all six category scores are required", missing });
          return;
        }
      }
      const data: Prisma.SpotAssessmentUncheckedUpdateInput = { status: to };
      if (to === "signed") {
        data.expertUserId = actor(req);
        data.expertSignedAt = new Date();
      }
      if (to === "draft") {
        data.expertUserId = null;
        data.expertSignedAt = null;
      }
      const updated = await prisma.spotAssessment.update({ where: { id: audit.id }, data });
      await writeAuditLog({
        entityType: "spot_audit", entityId: audit.id, changedField: "status",
        oldValue: audit.status, newValue: to, changedBy: actor(req),
        reason: typeof req.body?.reason === "string" ? req.body.reason.slice(0, 1000) : null,
      });
      res.json(updated);
    }));
  }

  router.post(
    "/audits/:auditId/evidence",
    express.raw({ type: () => true, limit: SPOT_EVIDENCE_MAX_BYTES }),
    wrap(async (req, res) => {
      const audit = await prisma.spotAssessment.findUnique({ where: { id: req.params.auditId }, select: { id: true, status: true } });
      if (!audit) { res.status(404).json({ error: "Not found" }); return; }
      if (audit.status !== "draft" && audit.status !== "submitted") {
        res.status(409).json({ error: "evidence can only be added before signing" });
        return;
      }
      const criterion = parseEvidenceCriterion(req.query.criterion);
      if (!criterion.ok) { res.status(400).json({ error: criterion.error }); return; }
      let capturedAt: Date | null = null;
      if (typeof req.query.capturedAt === "string" && req.query.capturedAt) {
        capturedAt = new Date(req.query.capturedAt);
        if (Number.isNaN(capturedAt.getTime())) { res.status(400).json({ error: "capturedAt must be an ISO date" }); return; }
      }
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const detected = detectEvidence(buf);
      if (!detected) {
        res.status(400).json({ error: "unsupported file: jpg, png, webp, mp4, webm or pdf expected" });
        return;
      }
      const stored = await saveEvidenceFile(buf, detected);
      const duplicate = await prisma.spotEvidence.findUnique({ where: { storageKey: stored.storageKey } });
      if (duplicate) {
        res.status(409).json({ error: "this file is already uploaded", evidenceId: duplicate.id, auditId: duplicate.auditId });
        return;
      }
      const evidence = await prisma.spotEvidence.create({
        data: {
          auditId: audit.id,
          criterion: criterion.data,
          kind: detected.kind,
          storageKey: stored.storageKey,
          sha256: stored.sha256,
          mimeType: detected.mimeType,
          sizeBytes: stored.sizeBytes,
          capturedAt,
          isGenerated: req.query.generated === "1",
          uploadedByUserId: actor(req),
        },
      });
      await writeAuditLog({
        entityType: "spot_evidence", entityId: evidence.id, changedField: "uploaded",
        oldValue: null, newValue: `${audit.id}:${evidence.sha256}`, changedBy: actor(req),
      });
      res.status(201).json(evidence);
    }),
  );

  router.get("/evidence/:id/file", wrap(async (req, res) => {
    const evidence = await prisma.spotEvidence.findUnique({ where: { id: req.params.id } });
    if (!evidence) { res.status(404).json({ error: "Not found" }); return; }
    const buf = await readEvidenceFile(evidence.storageKey, evidence.sha256);
    if (!buf) { res.status(404).json({ error: "file is missing in storage" }); return; }
    res.setHeader("Content-Type", evidence.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `inline; filename="${evidence.storageKey}"`);
    res.send(buf);
  }));

  router.post("/evidence/:id/confirm-integrity", wrap(async (req, res) => {
    const evidence = await prisma.spotEvidence.findUnique({ where: { id: req.params.id }, include: { audit: { select: { status: true } } } });
    if (!evidence) { res.status(404).json({ error: "Not found" }); return; }
    if (evidence.audit.status === "void") { res.status(409).json({ error: "audit is void" }); return; }
    if (evidence.isGenerated) { res.status(409).json({ error: "generated evidence cannot be confirmed" }); return; }
    if (evidence.integrityConfirmedAt) { res.status(409).json({ error: "integrity is already confirmed" }); return; }
    const buf = await readEvidenceFile(evidence.storageKey, evidence.sha256);
    if (!buf) { res.status(409).json({ error: "file is missing in storage" }); return; }
    const updated = await prisma.spotEvidence.update({
      where: { id: evidence.id },
      data: { integrityConfirmedAt: new Date(), integrityConfirmedByUserId: actor(req) },
    });
    await writeAuditLog({
      entityType: "spot_evidence", entityId: evidence.id, changedField: "integrity_confirmed",
      oldValue: null, newValue: evidence.sha256, changedBy: actor(req),
    });
    res.json(updated);
  }));

  router.post("/audits/:auditId/remediations/g05", wrap(async (req, res) => {
    const audit = await loadAudit(req.params.auditId);
    if (!audit) { res.status(404).json({ error: "Not found" }); return; }
    if (audit.status !== "signed") { res.status(409).json({ error: "remediation requires a signed audit" }); return; }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const evidenceId = typeof body.evidenceId === "string" ? body.evidenceId : null;
    const evidence = evidenceId ? audit.evidence.find((e) => e.id === evidenceId) : undefined;
    if (!evidence) { res.status(400).json({ error: "evidenceId must reference evidence of this audit" }); return; }
    if (evidence.isGenerated) { res.status(400).json({ error: "generated evidence cannot be used" }); return; }
    const rationale = typeof body.rationale === "string" ? body.rationale.trim().slice(0, 5000) : "";
    const verified = body.verifiedWorkingHotWater === true;
    const moderatorId = actor(req);
    const decision = evaluateRemoteGateRemediation({
      gateId: "G05",
      evidenceFileId: evidence.id,
      moderatorId,
      rationale,
      moderatorVerifiedWorkingHotWater: verified,
    });
    const remediation = await prisma.spotRemediation.create({
      data: {
        auditId: audit.id,
        gateId: "G05",
        evidenceId: evidence.id,
        moderatorUserId: moderatorId ?? "unknown",
        rationale,
        verifiedWorkingHotWater: verified,
        accepted: decision.accepted,
        reasons: decision.reasons,
      },
    });
    await writeAuditLog({
      entityType: "spot_audit", entityId: audit.id, changedField: "g05_remediation",
      oldValue: null, newValue: decision.accepted ? "accepted" : `rejected:${decision.reasons.join(",")}`,
      changedBy: moderatorId,
    });
    res.status(201).json(remediation);
  }));

  router.post("/audits/:auditId/snapshots", wrap(async (req, res) => {
    const audit = await loadAudit(req.params.auditId);
    if (!audit) { res.status(404).json({ error: "Not found" }); return; }
    if (audit.status !== "signed") { res.status(409).json({ error: "snapshot requires a signed audit" }); return; }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const ratingVersion = typeof body.ratingVersion === "string" ? body.ratingVersion.trim() : "";
    if (!ratingVersion) { res.status(400).json({ error: "ratingVersion is required" }); return; }
    if (typeof body.methodologyApprovedForPublication !== "boolean") {
      res.status(400).json({ error: "methodologyApprovedForPublication must be a boolean" });
      return;
    }
    const built = buildSpotRatingInput(audit, {
      relatedToMyWave: audit.unit.spot.relatedToMyWave,
      ratingVersion,
      methodologyApprovedForPublication: body.methodologyApprovedForPublication,
      asOf: new Date(),
    });
    if (!built.ok) {
      res.status(409).json({ error: "all six category scores are required", missing: built.missingCategories });
      return;
    }
    const result = evaluateSpotRating(built.input);
    const snapshot = await prisma.spotRatingSnapshot.create({
      data: {
        unitId: audit.unitId,
        auditId: audit.id,
        methodologyVersion: result.methodologyVersion,
        protocolVersion: result.protocolVersion,
        criteriaVersion: result.criteriaVersion,
        ratingVersion: result.ratingVersion,
        officialScore: result.officialScore == null ? null : new Prisma.Decimal(result.officialScore),
        band: result.band,
        publishable: result.publishable,
        blockers: result.blockers,
        inputJson: toJsonValue(built.input),
        expiresAt: result.expiresAt,
        computedByUserId: actor(req),
      },
    });
    await writeAuditLog({
      entityType: "spot_rating_snapshot", entityId: snapshot.id, changedField: "computed",
      oldValue: null,
      newValue: result.publishable ? `${result.officialScore} ${result.band}` : `blocked:${result.blockers.join(",")}`,
      changedBy: actor(req),
    });
    res.status(201).json(snapshot);
  }));

  router.post("/snapshots/:id/publish", wrap(async (req, res) => {
    const snapshot = await prisma.spotRatingSnapshot.findUnique({ where: { id: req.params.id } });
    if (!snapshot) { res.status(404).json({ error: "Not found" }); return; }
    if (!snapshot.publishable) { res.status(409).json({ error: "snapshot has blockers", blockers: snapshot.blockers }); return; }
    if (snapshot.publishedAt) { res.status(409).json({ error: "snapshot is already published" }); return; }
    if (snapshot.revokedAt) { res.status(409).json({ error: "snapshot is revoked" }); return; }
    if (snapshot.expiresAt.getTime() <= Date.now()) { res.status(409).json({ error: "test has expired; a new audit is required" }); return; }
    const updated = await prisma.spotRatingSnapshot.update({
      where: { id: snapshot.id },
      data: { publishedAt: new Date(), publishedByUserId: actor(req) },
    });
    await writeAuditLog({
      entityType: "spot_rating_snapshot", entityId: snapshot.id, changedField: "published",
      oldValue: null, newValue: `${snapshot.officialScore?.toString() ?? ""} ${snapshot.band ?? ""}`.trim(),
      changedBy: actor(req),
    });
    res.json(updated);
  }));

  router.post("/snapshots/:id/revoke", wrap(async (req, res) => {
    const snapshot = await prisma.spotRatingSnapshot.findUnique({ where: { id: req.params.id } });
    if (!snapshot) { res.status(404).json({ error: "Not found" }); return; }
    if (snapshot.revokedAt) { res.status(409).json({ error: "snapshot is already revoked" }); return; }
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 2000) : "";
    if (!reason) { res.status(400).json({ error: "reason is required" }); return; }
    const updated = await prisma.spotRatingSnapshot.update({
      where: { id: snapshot.id },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    await writeAuditLog({
      entityType: "spot_rating_snapshot", entityId: snapshot.id, changedField: "revoked",
      oldValue: snapshot.publishedAt ? "published" : "unpublished", newValue: reason, changedBy: actor(req),
    });
    res.json(updated);
  }));

  return router;
}
