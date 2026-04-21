# UGC growth loop: reward + referral (MVP)

Статус: MVP. Слой поверх [UGC after completed](./UGC_AFTER_COMPLETED.md).
Цель: превратить UGC из контента в механизм роста.

```
approved UGC
  → rewardStatus=granted + referralCode (MW-XXXXXXXX)
  → placeholder email ("спасибо, бонус на следующую программу + ваш код")
  → GET /public/referral/:code (увеличивает visits, кладёт cookie mw_ref)
  → POST /bookings (webapp читает cookie → передаёт referralCode → attribution)
  → admin analytics: UGC → reward → visits → bookings
```

Реализация намеренно минимальна: **никакого кошелька, денег, multi-level,
fraud-detection** — это placeholder-reward и простейшее attribution.

## 1. Схема (миграция 20260420090000_ugc_reward_referral)

### `program_ugc` — новые поля
- `rewardStatus` — `none | pending | granted` (default `none`).
- `rewardGrantedAt` — `timestamp`, выставляется при grant.
- `referralCode` — `string`, unique, нулевой до grant.

### `referral_codes` (новая таблица)
| Поле | Описание |
|------|----------|
| `code` | PK, формат `MW-XXXXXXXX` (8 символов без похожих глифов) |
| `ownerUserId` | FK → `User.id`, nullable |
| `ownerEmail` | Email автора UGC, nullable |
| `ownerUgcId` | FK → `program_ugc.id`, unique, nullable |
| `visits` | Счётчик заходов по публичной ссылке |
| `bookings` | Счётчик привязанных бронирований |
| `lastVisitAt` | Последний зарегистрированный заход |
| `createdAt` | Время генерации |

### `bookings` — новое поле
- `referralCode` — FK → `referral_codes.code`, nullable, индекс.

## 2. Reward trigger

Файл: `services/api/src/modules/ugc/rewardService.ts`.

Правило в `maybeGrantRewardForApprovedUgc`:
- `moderationStatus = approved`
- `rewardStatus = none` (идемпотентность)
- есть `textReview` **или** `mediaUrls.length > 0`

Если условия выполнены:
1. Генерируется уникальный `referralCode` (`MW-<8 symbols>`, с ретраями по `P2002`).
2. Создаётся запись в `referral_codes` (owner = UGC + email + userId).
3. `program_ugc.rewardStatus = granted`, `rewardGrantedAt = now`, `referralCode = code`.
4. Если у UGC есть `contactEmail` — отправляется placeholder-email через
   `sendNotificationEmail` (Resend / SMTP, общая для всех notifications).
5. Все операции логируются в `audit_log` при approve-пути.

Точка вызова: `POST /admin/ugc/:id/approve` после успешной модерации
(см. `services/api/src/modules/ugc/adminRoutes.ts`). В ответе API возвращает
`{ ok, ugc, reward }` c полями `granted`, `referralCode`, `emailSent`.

Rejection не создаёт reward: `maybeGrantRewardForApprovedUgc` возвращает
`{ granted: false, reason: "not_approved" }`.

## 3. Public referral endpoint

Файл: `services/api/src/modules/ugc/referralRoutes.ts` (`publicReferralRoutes`).

### `GET /public/referral/:code`
- Валидирует формат (`/^[A-Z0-9-]{4,40}$/`), приводит к upper-case.
- Если код существует → `visits += 1`, `lastVisitAt = now`.
- Ставит cookie `mw_ref=<code>; Max-Age=7776000; Path=/; SameSite=Lax`
  (90 дней, не `Secure` специально, чтобы ловить локальные тесты; на прод проставить
  `Secure` в reverse-proxy / через будущий toggle).
- Делает 302 на `${NOTIFICATIONS_SITE_BASE_URL}/?ref=<code>` (или корень, если код невалиден).

Если кода нет — редирект на главную без куки, без counter bump. Это защищает от
случайного засорения таблицы «пустыми» visits.

## 4. Booking attribution

Файл: `services/api/src/modules/bookings/routes.ts` (`POST /bookings`).

Порядок:
1. Читаем `body.referralCode`; если пусто — парсим cookie `mw_ref`.
2. Нормализуем (upper-case, regex-проверка).
3. Делаем `referralCode.findUnique` — если код есть, сохраняем как
   `booking.referralCode`. Неизвестные коды молча игнорируем (не ломаем booking).
4. После `prisma.booking.create` инкрементим `referralCode.bookings`.
5. Код летит в `domain_status_events.payloadJson.referralCode` для audit-трейла.

Фронтенд (`apps/web/src/app/program/[id]/page.tsx`):
читает cookie `mw_ref` через `document.cookie` и добавляет `referralCode` в
тело запроса на `/bookings`. Никаких UI-элементов для пользователя — чтобы
привлечение работало «прозрачно» из письма / ссылки.

## 5. Admin analytics

### `GET /admin/ugc/overview`
Расширена полем:
```json
"reward": { "granted": <int> }
```

### `GET /admin/referrals/overview`
Возвращает:
```json
{
  "ugc": { "approved": N, "granted": N, "pending": N, "rejected": N },
  "referrals": { "total": N, "visits": N, "bookings": N },
  "funnel": {
    "approved_to_granted_pct": 100.0,
    "granted_to_visit_pct": 40.0,
    "visit_to_booking_pct": 15.0
  }
}
```

### `GET /admin/referrals`
Пагинированный список кодов (сортировка по `bookings DESC, visits DESC, createdAt DESC`)
c вложенным `ownerUgc`. Для операционного обзора того, какие отзывы реально работают.

## 6. Ограничения MVP

Не реализовано (сознательно):
- финансовый расчёт бонусов, хранение баланса, payouts, transaction log;
- фактическая скидка на следующую программу (письмо говорит «placeholder-бонус»);
- multi-level / tiered referrals; один уровень: автор UGC → приглашённый;
- fraud-detection (один email = один код = один booking), reuse-limits;
- atribution по нескольким источникам (last-click cookie 90d, без UTM-стэка);
- UI-кошелька и страницы «мои коды»;
- smart notifications автору UGC, когда его код сработал;
- AI-moderation reward-писем, persona-aware tone.

## 7. Метрики, которые уже можно считать

По SQL напрямую или через `/admin/referrals/overview`:

| Метрика | Источник |
|---------|----------|
| UGC → reward grant rate | `approved_to_granted_pct` |
| Reward → referral visit rate | `granted_to_visit_pct` |
| Visit → booking conversion | `visit_to_booking_pct` |
| Активные коды (≥1 visit) | `referral_codes where visits > 0` |
| Коды, приведшие booking | `referral_codes where bookings > 0` |
| Lead-time от grant до первого визита | `referral_codes.createdAt → lastVisitAt` |
| Attribution per program | `bookings where referralCode is not null` |

## 8. Acceptance Criteria (проверка)

- ✅ После approved UGC пользователь получает reward trigger
  (`rewardStatus=granted` + placeholder email).
- ✅ Генерируется `referralCode` и кладётся в `program_ugc` + `referral_codes`.
- ✅ Код можно использовать: `GET /public/referral/:code` ставит cookie и
  инкрементит `visits`.
- ✅ Код сохраняется при booking: `bookings.referralCode`, `referral_codes.bookings += 1`.
- ✅ Есть базовая связка UGC → referral → booking: overview funnel + список кодов.

## 9. Runbook

### Проверить, что reward работает end-to-end
```bash
# 1. Завершить booking (admin PATCH /bookings/:id → completed)
# 2. Вручную прогнать очередь писем: POST /admin/ugc/run-requests
# 3. Пользователь получает письмо → открывает /program/:id/ugc?token=... → отправляет
# 4. Модератор: POST /admin/ugc/:id/approve
#    Ответ содержит reward.granted=true и referralCode
# 5. Проверить письмо автору: placeholder reward + код MW-XXXXXXXX
# 6. Открыть /public/referral/MW-XXXXXXXX → cookie ставится, visits=1
# 7. Сделать booking (форма /program/:id) → referralCode попадает в booking
# 8. GET /admin/referrals/overview → увидеть funnel
```

### Отладка: почему reward не сгенерирован
- `rewardStatus != 'none'` → уже обработан (идемпотентность).
- `moderationStatus != 'approved'` → сначала approve.
- пустые `textReview` и `mediaUrls` → `empty_content`, это by-design.
- `referralCode` unique violation → system пытается ещё раз (до 5 раз).
  Если и это не помогло — `failed_to_generate_unique_referral_code`,
  смотреть логи и кардинальность таблицы.

## 10. Next steps (не в этом шаге)

- Превратить placeholder-reward в реальный скидочный код, интегрировать с
  billing/commissions. Нужна policy: сколько, от чего, на кого.
- Ограничение self-use (автор UGC не может применить собственный код к своему booking).
- Ограничение reuse: один email / travelerKeyHash = один booking по коду.
- Fraud-сигналы: `referral_codes.visits` без `bookings` >> N часов → warning в ops.
- Страница автора: `/my/referrals` (требует auth) со счётчиками.
- Telegram-уведомление автору, когда его код сработал.
