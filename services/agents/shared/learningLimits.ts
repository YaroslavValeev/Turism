function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function float01Env(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0.3 && n <= 0.99 ? n : fallback;
}

/** Лимиты self-learning, стоимости решений и калибровки confidence. */
export type LearningLimits = {
  maxNewTopicsPerDay: number;
  maxRepeatTopicWindowDays: number;
  /** Порог «сильной» уверенности LLM для downgrading trust при failure. */
  calibrationHighConfidence: number;
};

export function loadLearningLimits(): LearningLimits {
  return {
    maxNewTopicsPerDay: intEnv("ORCHESTRATOR_MAX_NEW_TOPICS_PER_DAY", 3),
    maxRepeatTopicWindowDays: intEnv("ORCHESTRATOR_MAX_REPEAT_TOPIC_WINDOW_DAYS", 7),
    calibrationHighConfidence: float01Env("ORCHESTRATOR_LEARNING_HIGH_CONF", 0.7),
  };
}
