/**
 * Короткие описания и теги для карточек программ.
 * Fallback: поля API — audienceFit, cta.
 */

export type ProgramTeaser = {
  shortDescription: string;
  /** Контентные теги на карточке (Wakesurf, Progress, …) */
  tags: string[];
  /** Доп. бейджи поверх основных карточек — опционально */
  extraBadges: string[];
};

const byTitlePattern: { pattern: RegExp; teaser: ProgramTeaser }[] = [
  {
    pattern: /WaveLine/i,
    teaser: {
      shortDescription:
        "Трёхдневный формат для тех, кто хочет собрать технику, увидеть понятный прогресс и пройти уикенд с сопровождением без перегрузки логистикой.",
      tags: ["Wakesurf", "Progress", "3 дня", "Средний уровень"],
      extraBadges: [],
    },
  },
  {
    pattern: /SouthCrew/i,
    teaser: {
      shortDescription:
        "Программа-перезагрузка для райдеров, которым нужен фокус на технике, устойчивости и аккуратной корректировке привычных ошибок.",
      tags: ["Wakesurf", "Technique Reset", "Средний уровень", "Short camp"],
      extraBadges: [],
    },
  },
  {
    pattern: /Kuban Wake|Family Days/i,
    teaser: {
      shortDescription:
        "Более мягкий формат для тех, кто хочет совместить катание, комфортный ритм и семейную атмосферу без агрессивного спортивного давления.",
      tags: ["Wakesurf", "Family format", "3 дня", "Спокойный темп"],
      extraBadges: [],
    },
  },
];

export function getPilotProgramTeaser(
  title: string,
  fallback: { audienceFit?: string | null; cta?: string | null }
): ProgramTeaser {
  for (const { pattern, teaser } of byTitlePattern) {
    if (pattern.test(title)) {
      return teaser;
    }
  }
  const bits = [fallback.audienceFit, fallback.cta].filter(Boolean);
  return {
    shortDescription: bits.length ? bits.join(" · ") : "Программа MyWave с понятным форматом участия и сопровождением.",
    tags: [],
    extraBadges: [],
  };
}
