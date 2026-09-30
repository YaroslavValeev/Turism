export type SpotRow = {
  id: string;
  name: string;
  region: string;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  waterBodyType: string | null;
  organizerId: string | null;
  relatedToMyWave: boolean;
  discoveryStatus: string;
  _count?: { serviceUnits: number };
};

export type SpotSnapshot = {
  id: string;
  unitId: string;
  auditId: string;
  ratingVersion: string;
  officialScore: string | null;
  band: string | null;
  publishable: boolean;
  blockers: string[];
  expiresAt: string;
  computedAt: string;
  publishedAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
};

export type SpotAuditSummary = { id: string; testedAt: string; status: string };

export type SpotUnit = {
  id: string;
  spotId: string;
  discipline: string;
  serviceName: string;
  equipmentConfig: Record<string, unknown>;
  isActive: boolean;
  audits: SpotAuditSummary[];
  snapshots: SpotSnapshot[];
};

export type SpotDetail = SpotRow & {
  organizer: { id: string; displayName: string } | null;
  serviceUnits: SpotUnit[];
};

export type SpotEvidenceItem = {
  id: string;
  criterion: string | null;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  capturedAt: string | null;
  isGenerated: boolean;
  integrityConfirmedAt: string | null;
  createdAt: string;
};

export type SpotAuditDetail = {
  id: string;
  unitId: string;
  testedAt: string;
  methodologyVersion: string;
  protocolVersion: string;
  criteriaVersion: string;
  status: string;
  expertUserId: string | null;
  expertSignedAt: string | null;
  externalExpertConfirmed: boolean;
  externalExpertName: string | null;
  independentEditorUserId: string | null;
  notes: string | null;
  unit: SpotUnit & { spot: SpotRow };
  categoryScores: Array<{ category: string; score: string }>;
  gateResults: Array<{ gateId: string; status: string }>;
  evidence: SpotEvidenceItem[];
  remediations: Array<{ id: string; gateId: string; accepted: boolean; reasons: string[]; rationale: string; decidedAt: string }>;
  snapshots: SpotSnapshot[];
};
