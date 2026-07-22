import type { EventCandidateStatus } from "./constants";

export const EXPLICIT_CANCELLATION_ROUTING_REASON = "explicit_cancellation_notice" as const;

type CandidateRoutingInput = {
  finalScore: number;
  futureEventScore: number;
  eventLikelihoodScore: number;
  explicitCancellationNotice: boolean;
};

const EXPLICIT_CANCELLATION_PATTERNS = [
  /^отмена\s+(?:гонки|соревнования|этапа|турнира|мероприятия)(?=$|[^\p{L}\p{N}])/iu,
  /^(?:отменена|отменено|отменён|отменены)\s+(?:гонка|гонки|соревнование|соревнования|этап|этапы|турнир|турниры|мероприятие|мероприятия)(?=$|[^\p{L}\p{N}])/iu,
  /^(?:гонка|гонки|соревнование|соревнования|этап|этапы|турнир|турниры|мероприятие|мероприятия)\s+(?:отменена|отменено|отменён|отменены|не\s+состоится)(?=$|[^\p{L}\p{N}])/iu,
] as const;

function normalizeNoticeText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/^[^\p{L}\p{N}]+/u, "");
}

/**
 * Detects only explicit event-level cancellation notices at the beginning of a title or message.
 * Reschedules, venue/schedule changes, cancellation policies and registration cancellations are not terminal events.
 */
export function isExplicitCancellationNotice(
  title: string | null | undefined,
  descriptionFull: string | null | undefined,
): boolean {
  return [title, descriptionFull]
    .map(normalizeNoticeText)
    .filter(Boolean)
    .some((text) => EXPLICIT_CANCELLATION_PATTERNS.some((pattern) => pattern.test(text)));
}

export function routeCandidateStatus(input: CandidateRoutingInput): EventCandidateStatus {
  if (input.explicitCancellationNotice) {
    return "archived";
  }

  return input.finalScore >= 0.42 && input.futureEventScore >= 0.2 && input.eventLikelihoodScore >= 0.3
    ? "needs_review"
    : "archived";
}
