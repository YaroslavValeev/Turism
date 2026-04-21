# UGC after completed (MVP)

Социальное доказательство на карточке программы: участник завершил поездку → система просит
оставить отзыв и медиа → модерация → публикация в блоке «Реальные участники».

Связка с существующими слоями:

- Базируется на canonical `Booking.bookingStatus === "completed"` (см. `canonical_status_models`).
- Не смешивается с сущностью `Review` (оперативный 1..5 рейтинг + текст): UGC — отдельный объект
  с медиа, согласием и модерацией для публичного показа.
- Для submit-токена использует секреты уведомлений (`NOTIFICATIONS_TOKEN_SECRET` / `JWT_SECRET`).

## Сущности

### `program_ugc_requests` (очередь писем)

| поле | назначение |
|------|------------|
| `id` | PK |
| `bookingId` (unique) | на какое бронирование ссылается запрос |
| `programId`, `organizerId` | денорм для аналитики |
| `recipientEmail` | извлечённый из `booking.guestContact` email (regex) |
| `status` | `queued | sent | delivery_failed | skipped_no_email | submitted` |
| `requestToken` | 48-hex для обратной совместимости / админ-ссылок |
| `firstSentAt` / `lastSentAt` / `lastAttemptAt` | телеметрия отправки |
| `lastError` | причина последней неудачи |
| `bookingCompletedAt` | момент завершения |
| `submittedUgcId` | ссылка на созданный UGC, если `submitted` |

### `program_ugc` (контент)

| поле | назначение |
|------|------------|
| `id` | PK |
| `programId`, `organizerId`, `bookingId` (unique) | связка |
| `userId` | nullable (гость или зарегистрированный) |
| `authorName` | подпись на карточке |
| `contactEmail` | опц. для связи по модерации |
| `textReview` | обязательный текст |
| `rating` | опц. 1..5 |
| `mediaUrls` | JSON массив URL (http/https, до 6) |
| `consentToPublish` | обязательно `true` для submit |
| `moderationStatus` | `pending | approved | rejected` |
| `moderationNotes` | заметка админа |
| `source` | `post_trip_request | manual` |
| `createdAt`, `reviewedAt` | таймстемпы |

## Триггер (MVP-правило)

`ensureUgcRequestForCompletedBooking()` вызывается из `applyBookingStatusTransition()` при
переходе booking в `completed`. Создаёт ровно один `ProgramUgcRequest` на booking (unique).

Запрос создаётся только если:

- `booking.bookingStatus === "completed"`;
- `program.publishStatus === "published"`;
- присутствует email (извлекается из `booking.guestContact` по regex `[\w.+-]+@[\w-]+\.[\w.-]+`).

Иначе — `status = 'skipped_no_email'` (запись создаётся для трассировки, письмо не уходит).

Идемпотентно: повторный вызов на уже существующий `bookingId` ничего не делает.

## Обработка очереди

`processUgcRequestQueue(prisma, env, limit)`:

- берёт до `limit` записей со `status = 'queued'`;
- повторно проверяет `program.publishStatus` и наличие email;
- отправляет email через `sendNotificationEmail` (Resend, тот же провайдер, что у notifications);
- на успех → `status = 'sent'`, обновляет `firstSentAt` / `lastSentAt`;
- на неуспех → `status = 'delivery_failed'` с `lastError`.

MVP: только одно письмо. Без повторных попыток/ретраев. Админ может поставить `status = 'queued'`
руками, чтобы пересослать.

## Submit flow

Из письма пользователь попадает на фронт-страницу `apps/web`:

```
/program/:id/ugc?token=<JWT>
```

JWT `signUgcSubmitToken(secret, { requestId, bookingId, programId })`:

- `purpose = "ugc_submit"`, expires 365d;
- подписан `NOTIFICATIONS_TOKEN_SECRET || JWT_SECRET`.

### `POST /public/program-ugc`

```
{
  "token": "<JWT>",
  "authorName": "Иван",
  "textReview": "...",
  "rating": 5,                  // опц. 1..5
  "mediaUrls": ["https://..."], // до 6, только http/https
  "consentToPublish": true,     // обязательно true
  "contactEmail": "..."         // опц.
}
```

Валидация:

- токен обязан проходить verify и ссылаться на существующий `ProgramUgcRequest`;
- `booking.bookingStatus === "completed"`;
- `consentToPublish === true`;
- уникальность: если на этот `bookingId` уже есть UGC → ответ `{ state: "already_submitted" }`,
  повторный submit запрещён.

На успех:

- создаётся запись в `program_ugc` со `moderationStatus = "pending"`;
- `program_ugc_requests.status = "submitted"`, `submittedUgcId` привязывается.

### `GET /public/program-ugc?programId=...`

Возвращает только `moderationStatus = 'approved'`. Поля: `id`, `authorName`, `textReview`,
`rating`, `mediaUrls`, `createdAt`.

## Moderation (admin)

Все маршруты требуют админ-токен.

- `GET /admin/ugc/overview` — сводка: `ugc.{pending, approved, rejected, total}`,
  `requests.{queued, sent, submitted, delivery_failed}`, `by_program[]` (топ программ по pending).
- `GET /admin/ugc?status=pending|approved|rejected&programId=...&limit&offset` — список с
  программой и организатором.
- `POST /admin/ugc/:id/approve` `{ notes? }` — ставит `approved`, `reviewedAt`, пишет audit log.
  Требует `consentToPublish = true` — иначе `400 consent_missing`.
- `POST /admin/ugc/:id/reject` `{ notes? }` — ставит `rejected`, audit log.
- `POST /admin/ugc/run-requests` — ручной прогон очереди (аналог `/jobs/run-review-reminders`).

## Карточка программы

`apps/web/src/app/program/[id]/page.tsx` добавляет блок **Реальные участники** перед «Отзывы
гостей». Показываются только `approved` UGC: имя, рейтинг (если есть), текст, превью медиа
(image inline; прочее — как безопасная ссылка «Медиафайл»).

## Ограничения шага

Сознательно НЕ реализовано:

- reward / referral system;
- авто-постинг UGC в соцсети;
- AI-moderation;
- upload pipeline / video processing (принимаем только URL, которые дал автор);
- частотные напоминания по запросу (одно письмо; админ → `status=queued` для повторной отправки);
- персонализация выдачи и A/B тесты.

## Что остаётся до reward / referral layer

- Reward: связать `ProgramUgc.approved` с кредитом/бонусом для автора (требует кошелька / купонов).
- Referral: привязать approved UGC к реферальному коду + атрибуция нового booking.
- Анти-абьюз: rate limit по IP / по бронированию; weak-email check; captcha; media sanity.
- Нативный upload: направленный S3-like endpoint + антивирус + нормализация.
- Полноценная UI модерация (сейчас API + runbook).

## Переменные окружения

| переменная | назначение |
|------------|------------|
| `NOTIFICATIONS_TOKEN_SECRET` (или `JWT_SECRET`) | подпись submit-JWT |
| `NOTIFICATIONS_SITE_BASE_URL` | базовый URL фронта для ссылки `/program/:id/ugc?token=...` |
| `EMAIL_PROVIDER_KEY` | Resend API key |
| `NOTIFICATIONS_EMAIL_FROM` | адрес отправителя |

## Быстрые запросы (SQL)

```sql
-- Очередь писем
SELECT status, count(*) FROM program_ugc_requests GROUP BY status;

-- Распределение по программам (pending → priority for moderation)
SELECT p.title, count(*) AS pending
FROM program_ugc u
JOIN programs p ON p.id = u."programId"
WHERE u."moderationStatus" = 'pending'
GROUP BY p.title ORDER BY pending DESC LIMIT 20;

-- Недавние approved на карточке
SELECT "authorName", rating, "createdAt"
FROM program_ugc
WHERE "programId" = $1 AND "moderationStatus" = 'approved'
ORDER BY "createdAt" DESC LIMIT 20;
```
