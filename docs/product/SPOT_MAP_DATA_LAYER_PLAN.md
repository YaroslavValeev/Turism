# Spot Map v1.1 — data layer plan (шаг 2 канона)

Статус: проект, ждёт решений владельца (раздел 6)  
Основа: `SPOT_MAP_V1_1_INTEGRATION_CANON.md`, `services/api/src/modules/spots/ratingEngine.ts` (PR #100)

## 1. Что уже есть

- Движок рейтинга `evaluateSpotRating` / `evaluateRemoteGateRemediation`: веса, 8 гейтов, блокеры, ROUND_HALF_UP, 12 месяцев. Без БД и UI.
- Роли людей в системе: `User.role` = `admin | organizer | user`. Ролей «эксперт» и «редактор» нет.
- Медиа: общий volume `/ingestion-media` — **публичный** (отдаётся web без авторизации).

## 2. Принципы схемы

1. Единица рейтинга — `SpotServiceUnit` (услуга + спот + протестированная конфигурация инструмента), не спот и не организатор.
2. Опубликованный `SpotRatingSnapshot` неизменяем: новая оценка = новая строка; «текущий» рейтинг = последний опубликованный неотозванный снимок.
3. Снимок хранит результат движка целиком (score, band, blockers, 4 версии, expiresAt) + входные данные (JSON), чтобы расчёт был воспроизводим.
4. Отзывы, OSINT, спонсорство, оплата — в этих таблицах отсутствуют by design (канон: они не влияют на официальный score).
5. Spot Map не пишет в таблицы Travel (`programs`, `organizer_score_snapshots`); связь с организатором — необязательный `organizerId`.

## 3. Таблицы (Prisma, snake_case map)

| Модель | Назначение | Ключевые поля |
|---|---|---|
| `Spot` | место | name, region, lat/lng, waterBodyType, organizerId?, relatedToMyWave, discoveryStatus (`candidate`/`listed`/`archived`) |
| `SpotServiceUnit` | единица рейтинга | spotId, discipline (`wakesurf` в MVP), serviceName, equipmentConfig (JSON: лодка/модель/балласт) |
| `SpotReviewer` | эксперт/редактор | displayName, role (`expert`/`editor`), isExternal, userId?, disciplines[] |
| `SpotAudit` | проф. тест | unitId, testedAt, protocolVersion, criteriaVersion, methodologyVersion, status (`draft`/`submitted`/`signed`/`void`), expertId, expertSignedAt, externalExpertConfirmed, independentEditorId? |
| `SpotAuditCategoryScore` | 6 категорий | auditId, category, score (Decimal 3,1), unique(auditId, category) |
| `SpotAuditGateResult` | 8 гейтов | auditId, gateId (G01–G08), status (`pass`/`fail`/`unknown`), unique(auditId, gateId) |
| `SpotEvidence` | доказательства | auditId, criterion/gateId?, kind (`photo`/`video`/`document`), storageKey, sha256, capturedAt, isGenerated=false, integrityConfirmedBy/At |
| `SpotGateRemediation` | исключение G05 | auditId, gateId (только G05 — CHECK), evidenceId, moderatorId, rationale, verifiedWorkingHotWater, decision, decidedAt |
| `SpotRatingSnapshot` | неизменяемый результат | unitId, auditId, 4 версии, officialScore?, band?, publishable, blockers (JSON), inputJson, expiresAt, publishedAt?, publishedBy?, revokedAt?, revokeReason? |
| `SpotAppeal` | апелляция | snapshotId, submittedBy, reason, status, resolution, resolvedBy/At |

Неизменяемость снимка: API не имеет UPDATE для `officialScore/band/inputJson`; дополнительно — триггер Postgres, запрещающий изменение этих колонок после `publishedAt IS NOT NULL` (разрешены только `revokedAt/revokeReason`).

## 4. Поток публикации

draft audit → оценки + гейты + evidence → подпись эксперта → (G05-ремедиация при необходимости) → `evaluateSpotRating` → снимок `publishable=false|true` → публикация редактором (только если `publishable`) → публичный API читает последний опубликованный неотозванный и не истёкший снимок.

## 5. Порядок реализации (по PR)

1. Миграция + модели + репозиторий сборки `SpotRatingInput` из аудита + тесты (без роутов).
2. Admin API (CRUD спотов/единиц/аудитов, подпись, снимок, публикация, отзыв) + аудит-лог.
3. Admin UI.
4. Public API `/spots`, `/spots/:id`, `/spots/compare`, `/spots/methodology` — без чисел, пока нет опубликованных снимков.
5. Web `/spots`.
6. Импорт реестра кандидатов как `discoveryStatus=candidate` без рейтинга.
7. Пилотные аудиты; публикация рейтингов только после них.

## 6. Решения владельца (блокируют шаг 1)

1. **Где хранить доказательства?** Текущий `/ingestion-media` публичный. Предложение: отдельный приватный volume `spot_evidence`, отдача только через admin API. Публично — только выбранные фото спота.
2. **Эксперты/редакторы — отдельная сущность `SpotReviewer`** (могут не иметь входа в админку) или только пользователи админки?
3. **Координаты и карта:** хранить lat/lng сразу (да/нет) и какой провайдер карты на web (Яндекс/OSM) — влияет на шаг 5, не на схему.
4. **Связь с организаторами Travel:** необязательный `organizerId` у `Spot` — ок?
