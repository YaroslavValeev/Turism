import { describe, expect, it } from "vitest";
import {
  EXPLICIT_CANCELLATION_ROUTING_REASON,
  isExplicitCancellationNotice,
  routeCandidateStatus,
} from "./candidateRouting";

const HIGH_EVENT_SCORES = {
  finalScore: 0.8,
  futureEventScore: 0.9,
  eventLikelihoodScore: 0.85,
} as const;

describe("explicit cancellation detection", () => {
  it.each([
    "❗️ ОТМЕНА ГОНКИ ❗️ 15 августа 2026 – Чёртова гонка",
    "Гонка отменена организатором",
    "Соревнование не состоится из-за погодных условий",
    "Отменён этап чемпионата",
  ])("detects an event-level cancellation notice: %s", (title) => {
    expect(isExplicitCancellationNotice(title, null)).toBe(true);
  });

  it("uses the message when the title is not an explicit cancellation notice", () => {
    expect(isExplicitCancellationNotice("Анонсы эндуро гонок", "❗ ОТМЕНА ГОНКИ 15 августа 2026")).toBe(true);
  });

  it.each([
    "МЕСТО ГОНКИ ИЗМЕНЕНО",
    "ГОНКА ПЕРЕНЕСЕНА НА 22 АВГУСТА",
    "Изменено расписание гонки",
    "Условия отмены участия в гонке",
    "Отмена регистрации возможна за 14 дней",
    "Условия: гонка отменена при отказе менее чем за 14 дней",
    "Правила: соревнование не состоится при отсутствии оплаты",
    "15 августа состоится эндуро-гонка",
  ])("does not treat a non-terminal event update as cancellation: %s", (title) => {
    expect(isExplicitCancellationNotice(title, null)).toBe(false);
  });
});

describe("candidate status routing", () => {
  it("archives an explicit cancellation even when event scores are high", () => {
    expect(
      routeCandidateStatus({
        ...HIGH_EVENT_SCORES,
        explicitCancellationNotice: true,
      }),
    ).toBe("archived");
  });

  it.each(["МЕСТО ГОНКИ ИЗМЕНЕНО", "ГОНКА ПЕРЕНЕСЕНА НА 22 АВГУСТА"])(
    "keeps a high-score non-terminal update in review: %s",
    (title) => {
      expect(
        routeCandidateStatus({
          ...HIGH_EVENT_SCORES,
          explicitCancellationNotice: isExplicitCancellationNotice(title, null),
        }),
      ).toBe("needs_review");
    },
  );

  it("preserves the existing low-score archive threshold", () => {
    expect(
      routeCandidateStatus({
        finalScore: 0.41,
        futureEventScore: 0.9,
        eventLikelihoodScore: 0.85,
        explicitCancellationNotice: false,
      }),
    ).toBe("archived");
  });
});
