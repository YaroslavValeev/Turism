export type RatingPolicyMode = "dry-run" | "warn-only" | "enforce";

export interface BayesianConfig {
  m: number;
  rGlobal: number;
}

export interface RecencyDecayWeights {
  lt12Months: number;
  lt24Months: number;
  gte24Months: number;
}

export interface CatalogRankWeights {
  verification: number;
  rating: number;
  completionRate: number;
  recency: number;
}

export interface RatingPolicyConfig {
  mode: RatingPolicyMode;
  bayesian: BayesianConfig;
  recencyDecay: RecencyDecayWeights;
  rankWeights: CatalogRankWeights;
  reviewWindowDays: number;
  freezeOnOpenCriticalIncident: boolean;
}

export const DEFAULT_RATING_POLICY_CONFIG: RatingPolicyConfig = {
  mode: "dry-run",
  bayesian: {
    m: 3,
    rGlobal: 4.5
  },
  recencyDecay: {
    lt12Months: 1.0,
    lt24Months: 0.6,
    gte24Months: 0.3
  },
  rankWeights: {
    verification: 0.4,
    rating: 0.3,
    completionRate: 0.2,
    recency: 0.1
  },
  reviewWindowDays: 30,
  freezeOnOpenCriticalIncident: true
};

export function computeBayesianScore(v: number, rAvg: number, cfg: BayesianConfig): number {
  const denominator = v + cfg.m;
  if (denominator <= 0) return cfg.rGlobal;
  return (v / denominator) * rAvg + (cfg.m / denominator) * cfg.rGlobal;
}
