# Rating Baseline Freeze (GM)

Дата: 2026-04-17  
Статус: frozen baseline before integration changes

## 1. Что обнаружено
- В системе уже работает цепочка `Booking.completed -> ReviewRequest -> Review moderation`.
- Ревью привязано к `bookingId` и проходит `pending/approved/rejected` модерацию.
- Есть `OrganizerScoreSnapshot` и `ProgramScoreSnapshot` как read-side агрегаты.
- Каталог сейчас не использует единый ranking read-model справедливого рейтинга.
- Incident flow существует отдельно и не связан жестким policy-gate с публичным рейтингом.

## 2. Почему это важно
- Без frozen baseline невозможно безопасно мигрировать в unified fair rating без скрытых regressions.
- Раздельные контуры review/incidents/sorting порождают конфликтные решения в ops и каталоге.

## 3. Какое решение предлагается
- До любых кодовых изменений принимается baseline ниже как контрольная точка.
- Все изменения fair rating вводятся additive-first через feature-flag и warn-only этап.
- Единый ranking policy вводится поверх существующих write-потоков без немедленного удаления legacy.

## 4. Какие файлы/модули/папки затрагиваются
- `services/api/prisma/schema.prisma`
- `services/api/src/modules/bookings/routes.ts`
- `services/api/src/modules/reviews/routes.ts`
- `services/api/src/modules/reviews/reviewRequests.ts`
- `services/api/src/modules/incidents/routes.ts`
- `services/api/src/modules/analytics/scoreEngine.ts`
- `services/api/src/modules/programs/routes.ts`
- `apps/admin/src/app/reviews/page.tsx`
- `apps/admin/src/app/incidents/page.tsx`

## 5. Что переносим как есть
- Review trigger только после `completed`.
- Уникальность review на booking.
- Snapshot-агрегации score.
- Админские очереди модерации и аудитный подход.

## 6. Что рефакторим
- Ввод `shared-schema` и `shared-policy` как контрактного слоя.
- Единый `catalog_rank` read-model c прозрачной формулой.
- Incident-aware freeze/hold правила для публичного рейтинга.

## 7. Что откладываем
- Полный anti-fraud automation как hard blocker.
- Многомерный публичный рейтинг V2+.
- Полную конверсию старых подсистем без compatibility layer.

## 8. Риски
- Дублирование источников правды по score/rating.
- Конфликт approve-policy между review и incident цепочками.
- Отставание snapshot пересчетов от фактических событий.
- Смешение public UX и internal governance логики.

## 9. Критерий готовности
- Baseline зафиксирован, опубликован в репозитории и используется как ссылка для всех PR `trust/rating`.
- Все последующие изменения содержат указание rollback point относительно этого baseline.
