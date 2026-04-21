# Чеклист перед merge (MyWave Travel)

Короткий проход **перед** merge в `main` (или релизной ветке). Дополняет ручной/AI прогон по [`docs/development/PROMPT_QA_AUDIT.md`](../development/PROMPT_QA_AUDIT.md).

---

## Обязательно

- [ ] **Канон:** изменения не противоречат `docs/PROJECT_SOURCEBOOK.md` (посредник, не туроператор; комиссия со сделки; assisted booking).
- [ ] **Сущности/статусы:** новые переходы согласованы с `canonical_status_models.md` / контрактами или зафиксированы в ADR.
- [ ] **Секреты:** нет новых секретов в коде; при новых переменных — строка в `.env.example` (корень и/или `services/api`).
- [ ] **Prisma:** при смене схемы — миграция в `services/api/prisma/`, приложение стартует с чистой логикой миграций (по возможности проверено локально).

## Если менялся UI (web / admin)

- [ ] Пройдены маршруты из [`BROWSER_CHECK_ROUTES.md`](./BROWSER_CHECK_ROUTES.md) для затронутых экранов.
- [ ] Trust-обещания в UI (verified, страховка и т.д.) соответствуют данным с API.

## Если менялся layout / responsive / мобильные экраны

- [ ] Выборочно пройдены маршруты из [`MOBILE_CHECK_ROUTES.md`](./MOBILE_CHECK_ROUTES.md) для затронутых страниц.

## Если менялся API / бронирования / деньги

- [ ] Валидация входа на границе маршрута; осмысленные коды ошибок.
- [ ] Критичные пути: идемпотентность / дедуп / аудит — по [`docs/architecture/IDEMPOTENCY_DELIVERY_AND_SYNC.md`](../architecture/IDEMPOTENCY_DELIVERY_AND_SYNC.md), если изменение в зоне доставки или синка.

## Если менялся ингест / публикация

- [ ] Соответствие [`docs/INGESTION_POLICY.md`](../INGESTION_POLICY.md); нет «тихой» публикации в каталог без гейта.

## Последний шаг

- [ ] В отдельном чате (по желанию): прогон **QA-промпта** → вердикт `PASS` / `PASS с замечаниями` / `BLOCK merge`.

## После деплоя на staging / prod

- [ ] Короткий smoke по [`POST_MERGE_SMOKE.md`](./POST_MERGE_SMOKE.md).
