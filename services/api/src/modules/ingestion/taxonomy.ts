export type IngestionTaxonomy = {
  eventType: string | null;
  discipline: string | null;
};

const ENDURO_RACE_ANNOUNCEMENTS_SOURCE = "анонсы эндуро гонок";

const ENDURO_DISCIPLINE_SIGNAL =
  /(?:super\s*enduro|hard\s*enduro|enduro|супер\s*эндуро|хард\s*эндуро|эндуро|мотокросс|мото(?:циклетн(?:ая|ые|ой)|рная)\s+гонк(?:а|и|е|у|ой))/iu;

const RACE_EVENT_SIGNAL =
  /(?:\brace\b|\bracing\b|\bcompetition\b|\bchampionship\b|\bgrand\s+prix\b|\bsprint\b|гонк(?:а|и|е|у|ой)|соревнован(?:ие|ия|ий|ии|иях)|чемпионат(?:а|е|ы|ом)?|кубок(?:а|е|ом)?|гран(?:д)?[-\s]?при|этап(?:а|е|ы|ом)?|заезд(?:а|е|ы|ом)?|пролог(?:а|е|и|ом)?)/iu;

const SCHEDULED_ANNOUNCEMENT_SIGNAL =
  /^\s*\d{1,2}(?:\s*[-–—]\s*\d{1,2})?\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|january|february|march|april|may|june|july|august|september|october|november|december)\s+20\d{2}\b/iu;

function normalizeTaxonomyText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The source is a curated calendar of motorcycle enduro races. Its scheduled
 * rows often contain only a date, event name and location, so generic keyword
 * detection cannot infer taxonomy from the row itself. Keep this inference
 * source-scoped to avoid treating unrelated uses of "race" or "этап" as tours.
 */
export function applyEnduroRaceTaxonomy(
  sourceName: string,
  text: string,
  current: IngestionTaxonomy,
): IngestionTaxonomy {
  if (normalizeTaxonomyText(sourceName) !== ENDURO_RACE_ANNOUNCEMENTS_SOURCE) return current;

  const normalizedText = normalizeTaxonomyText(text);
  const hasEnduroSignal = ENDURO_DISCIPLINE_SIGNAL.test(normalizedText);
  const hasRaceSignal = RACE_EVENT_SIGNAL.test(normalizedText);
  const isScheduledAnnouncement = SCHEDULED_ANNOUNCEMENT_SIGNAL.test(normalizedText);

  if (!hasEnduroSignal && !hasRaceSignal && !isScheduledAnnouncement) return current;

  return {
    eventType: "race",
    discipline: "enduro",
  };
}
