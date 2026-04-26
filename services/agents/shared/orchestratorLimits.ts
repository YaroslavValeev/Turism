function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Пороги сигналов + лимиты прогона (env, без хардкода). */
export type OrchestratorLimits = {
  strongThreshold: number;
  weakThreshold: number;
  maxStrongSignals: number;
  maxActionsPerRun: number;
};

export function loadOrchestratorLimits(): OrchestratorLimits {
  return {
    strongThreshold: intEnv("ORCHESTRATOR_STRONG_THRESHOLD", 5),
    weakThreshold: intEnv("ORCHESTRATOR_WEAK_THRESHOLD", 1),
    maxStrongSignals: intEnv("ORCHESTRATOR_MAX_STRONG_SIGNALS", 5),
    maxActionsPerRun: intEnv("ORCHESTRATOR_MAX_ACTIONS_PER_RUN", 3),
  };
}
