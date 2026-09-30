# Spot Map v1.1 — data layer plan (шаг 2 канона)

Статус: шаг 1 реализован (миграция `20260929150000_spot_map_data_layer`, `spots/ratingInput.ts`); решения владельца — раздел 6  
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
| `SpotAudit` | проф. тест | unitId, testedAt, protocolVersion, criteriaVersion, methodologyVersion, status (`draft`/`submitted`/`signed`/`void`), expertUserId → `User`, expertSignedAt, externalExpertConfirmed, externalExpertName?, independentEditorUserId? → `User` |
| `SpotAuditCategoryScore` | 6 категорий | auditId, category, score (Decimal 3,1), unique(auditId, category) |
| `SpotAuditGateResult` | 8 гейтов | auditId, gateId (G01–G08), status (`pass`/`fail`/`unknown`), unique(auditId, gateId) |
| `SpotEvidence` | доказательства | auditId, criterion/gateId?, kind (`photo`/`video`/`document`), storageKey, sha256, capturedAt, isGenerated=false, integrityConfirmedBy/At |
| `SpotGateRemediation` | исключение G05 | auditId, gateId (только G05 — CHECK), evidenceId, moderatorId, rationale, verifiedWorkingHotWater, decision, decidedAt |
| `SpotRatingSnapshot` | неизменяемый результат | unitId, auditId, 4 версии, officialScore?, band?, publishable, blockers (JSON), inputJson, expiresAt, publishedAt?, publishedBy?, revokedAt?, revokeReason? |
| `SpotAppeal` | апелляция | snapshotId, submittedBy, reason, status, resolution, resolvedBy/At |

Ограничения в БД (миграция):

- CHECK `spot_gate_remediations.gateId = 'G05'`; CHECK статусов аудита и гейтов; CHECK `score` 0–10; CHECK «опубликовать можно только `publishable=true`».
- Триггер `spot_rating_snapshots_guard`: вычисленные поля (версии, score, band, blockers, inputJson, expiresAt, computedAt/By) неизменяемы всегда; `publishedAt/publishedByUserId` ставятся один раз; `revokedAt/revokeReason` ставятся один раз; отозванный неопубликованный снимок нельзя опубликовать; опубликованный снимок нельзя удалить.
- FK на аудит/доказательства/снимки — `RESTRICT`: историю нельзя стереть каскадом.

Сборка входа движка — `buildSpotRatingInput(audit, options)`: отсутствующий гейт = `unknown`; G05 = `pass` только при принятой ремедиации на несгенерированном доказательстве; доказательства по каждой из 6 категорий; целостность — у всех доказательств; редактор ≠ эксперт; неполные оценки категорий → ошибка `category_scores_incomplete` (без догадок).

## 4. Поток публикации

draft audit → оценки + гейты + evidence → подпись эксперта → (G05-ремедиация при необходимости) → `evaluateSpotRating` → снимок `publishable=false|true` → публикация редактором (только если `publishable`) → публичный API читает последний опубликованный неотозванный и не истёкший снимок.

## 5. Порядок реализации (по PR)

1. Миграция + модели + репозиторий сборки `SpotRatingInput` из аудита + тесты (без роутов).
2. Admin API (CRUD спотов/единиц/аудитов, подпись, снимок, публикация, отзыв) + аудит-лог. **Сделано:** `spots/adminRoutes.ts`, всё под `/spots` только для admin:
   - `GET|POST /spots`, `GET|PATCH /spots/:id`, `POST /spots/:id/units`, `GET|PATCH /spots/units/:unitId`;
   - `POST /spots/units/:unitId/audits`, `GET|PATCH /spots/audits/:id` (правка только в `draft`), `PUT .../scores`, `PUT .../gates`;
   - статусы: `POST .../submit|reopen|sign|void` (подпись = текущий админ; submit/sign требуют все 6 оценок);
   - доказательства: `POST /spots/audits/:id/evidence` (сырое тело до 25 МБ, тип по сигнатуре: jpg/png/webp/mp4/webm/pdf; `?criterion=&capturedAt=&generated=1`; только до подписи), `GET /spots/evidence/:id/file` (с проверкой sha256), `POST /spots/evidence/:id/confirm-integrity`;
   - `POST /spots/audits/:id/remediations/g05`, `POST /spots/audits/:id/snapshots`, `POST /spots/snapshots/:id/publish|revoke`.
   - Хранилище: `SPOT_EVIDENCE_DIR` (прод: volume `spot_evidence` → `/var/lib/mywave/spot-evidence`, смонтирован только в api).
3. Admin UI. **Сделано:** `/spots` (реестр + создание, координаты в формате Яндекс Карт), `/spots/[id]` (данные спота, услуги с конфигурацией лодки, аудиты, снимки), `/spots/audits/[auditId]` (чек-лист готовности, оценки, гейты, эксперт/редактор, доказательства с просмотром и подтверждением целостности, G05, расчёт/публикация/отзыв снимка). Независимый редактор пока вводится как ID пользователя-админа.
4. Public API `/spots`, `/spots/:id`, `/spots/compare`, `/spots/methodology` — без чисел, пока нет опубликованных снимков. **Сделано** (без `compare`): `GET /public/spots`, `/public/spots/:id` — только `discoveryStatus=listed`, наружу только действующий снимок (опубликован, не отозван, не истёк); блокеры, доказательства и эксперты не публикуются; из конфигурации лодки — только boat/model/ballast. `GET /public/spots/methodology`.
5. Web `/spots`. **Сделано без карты:** `/spots` (noindex, пока реестр пуст), `/spots/[id]` (с раскрытием связи с MyWave), `/spots/methodology`, ссылки «Открыть в Яндекс Картах»; sitemap. **Карта:** виджет Яндекс Карт в iframe (`yandex.ru/map-widget/v1`) на `/spots` (нумерованные метки = номера карточек, до 99) и на `/spots/[id]`. Ключ не нужен; JS API v3 не используем, потому что он требует `'unsafe-eval'` в CSP. В CSP добавлен только `frame-src https://yandex.ru`.
6. Импорт реестра кандидатов как `discoveryStatus=candidate` без рейтинга. **Инструмент готов:** `POST /spots/import` (до 500 строк, `dryRun`, статус всегда `candidate`, дубли по нормализованным «название + регион» пропускаются, при любой ошибочной строке не создаётся ничего, каждое создание — в аудит-лог с `reason=candidate_import`); в админке `/spots` блок «Импорт кандидатов» (вставка из Google Sheets/Excel, `;` или JSON). Ждём сам реестр от владельца.
7. Пилотные аудиты; публикация рейтингов только после них.

## 6. Решения владельца (приняты 2026-09-29)

1. **Доказательства** — отдельный приватный volume `spot_evidence` (не `/ingestion-media`), отдача только через admin API; `SpotEvidence.storageKey` — путь внутри него. Публично — только выбранные фото спота. Volume добавляется в compose на шаге 2 (Admin API).
2. **Эксперт и редактор** — пользователи админки (`User`, роль `admin`); отдельной сущности `SpotReviewer` нет. Внешний эксперт для связанных с MyWave спотов фиксируется флагом `externalExpertConfirmed` + `externalExpertName`.
3. **Координаты** — `latitude/longitude` (Decimal 9,6) храним сразу; карта на web — Яндекс Карты (шаг 5).
4. **Организатор** — необязательный `Spot.organizerId` (`ON DELETE SET NULL`), пока нет более достоверного канала связи.
