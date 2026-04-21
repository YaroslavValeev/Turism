# RATING_POLICY

Версия: 1.0  
Дата: 2026-04-17  
Статус: draft for implementation

## 1. Что обнаружено
- Review flow уже привязан к `Booking.completed`.
- Есть модерация и score snapshots, но нет единого policy документа fair rating.

## 2. Почему это важно
- Без policy source-of-truth формулы и freeze правила начнут расходиться между API, UI и ops.

## 3. Какое решение предлагается
- Зафиксировать MVP политику справедливого рейтинга:
  - только completed bookings;
  - bayesian smoothing;
  - recency decay;
  - incident-aware freeze;
  - explainability для пользователя и ops.

## 4. Какие файлы/модули/папки затрагиваются
- `services/api/src/modules/reviews/routes.ts`
- `services/api/src/modules/incidents/routes.ts`
- `services/api/src/modules/analytics/scoreEngine.ts`
- `services/api/src/modules/programs/routes.ts`
- `apps/admin/src/app/reviews/page.tsx`
- `apps/admin/src/app/incidents/page.tsx`

## 5. Что переносим как есть
- Completed-only review trigger.
- Moderation queue и audit trail.

## 6. Что рефакторим
- Формализуем параметры рейтинга и их owner.
- Добавляем freeze behavior при открытом критичном incident.

## 7. Что откладываем
- V2 многомерную модель тегов и advanced anti-fraud как strict gate.

## 8. Риски
- Неконсистентные веса между окружениями.
- Обновление публичного рейтинга при активном incident.

## 9. Критерий готовности
- Все параметры формулы берутся из shared policy contracts.
- Любое изменение политики проходит через PR `trust/rating`.

## MVP Formula
`weightedScore = ((v / (v + m)) * rAvg) + ((m / (v + m)) * rGlobal)`

Где:
- `v` = count подтвержденных отзывов;
- `rAvg` = средняя оценка организатора;
- `m` = минимальный порог стабильности (default: `3`);
- `rGlobal` = средний рейтинг платформы (default: `4.5`).

## Recency weights
- `0-12 months`: `1.0`
- `12-24 months`: `0.6`
- `24+ months`: `0.3`

## Public catalog rank (MVP)
`rank = verification*0.4 + rating*0.3 + completionRate*0.2 + recency*0.1`

## Moderation and freeze rules
- Отзыв доступен только после `Booking.status == completed`.
- Публикация review ограничена окном `30 дней` после `completedAt` (иначе ops ticket).
- При открытом incident высокого уровня новые reviews получают `pending_review`.
- В режиме freeze публичный рейтинг не обновляется до закрытия incident case.

## Critical actions requiring approval
- Code writes, git commit/push, deploy/release/prod changes.
- File writes вне sandbox/tmp.
- External API actions.
- Telegram production sends от имени системного бота.
- PII, financial/legal/public actions.
- Destructive operations.
