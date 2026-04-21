# UGC growth loop — hardening (self-use, duplicate, rate-limit, rewards)

Статус: MVP-стабилизация. Блокирующий слой перед масштабированием.
Связанные документы: [UGC after completed](./UGC_AFTER_COMPLETED.md), [UGC growth loop](./UGC_GROWTH_LOOP.md).

Что добавили:

1. **Self-use guard** — владелец кода не может применить его к собственному booking.
2. **Duplicate protection** — один email = один booking по одному коду.
3. **Rate-limit** — не более N booking на код за 24 часа (`REFERRAL_MAX_BOOKINGS_PER_DAY`).
4. **Reward-сущность** — таблица `user_rewards` c `valueType/value` (percent | amount).
5. **Reward application** — при booking активный reward для email/userId автоматически
   помечается `used` и привязывается к booking через `booking.appliedRewardId`.
6. **Attribution priority** — body > cookie > nothing (был порядок «body || cookie»; теперь
   явный приоритет body).
7. **Abuse-журнал** — таблица `referral_abuse_events` + счётчики в admin overview.

## 1. Self-use guard

Файл: `services/api/src/modules/ugc/abuseService.ts`, функция `canUseReferralCode`.

Правило:

```ts
if (booking.email === ref.ownerEmail) reject("self_use_blocked");
if (booking.userId === ref.ownerUserId) reject("self_use_blocked");
```

Email сравнивается case-insensitive. `userId` сравнивается только если оба заполнены.

Срабатывает до `prisma.booking.create`: при блоке код не попадает в
`booking.referralCode`, счётчик `referral_codes.bookings` не растёт, но booking
всё равно создаётся — гость получает нормальный assisted flow, просто без привязки.

## 2. Duplicate protection

Тот же `canUseReferralCode`, шаг 2:

```ts
const dup = await prisma.booking.findFirst({
  where: {
    referralCode: code,
    guestContact: { contains: email, mode: "insensitive" },
  },
});
if (dup) reject("duplicate_use_blocked");
```

Email вытаскивается из `guestContact` через `extractEmailFromGuestContact`
(уже используется в UGC). Один email × один код = один booking.

**Ограничение MVP:** проверка работает только если гость указал email в контакте.
Для Telegram-only контактов duplicate не детектируется — это известный gap, см.
«Остаются ограничения» ниже.

## 3. Rate-limit

```ts
const since = now - 24h;
const count = await prisma.booking.count({
  where: { referralCode: code, createdAt: { gte: since } },
});
if (count >= env.REFERRAL_MAX_BOOKINGS_PER_DAY) reject("rate_limited");
```

Дефолт: `REFERRAL_MAX_BOOKINGS_PER_DAY=20`. На MVP-стадии это сильно выше реального
трафика — triggers будут срабатывать только на бот-нагрузку.

## 4. Abuse-журнал

Таблица `referral_abuse_events` (миграция `20260421090000_ugc_reward_hardening`):

| Поле | Описание |
|------|----------|
| `id` | PK |
| `code` | referralCode, nullable |
| `reason` | `self_use_blocked` / `duplicate_use_blocked` / `rate_limited` |
| `email`, `userId`, `programId`, `bookingId` | контекст |
| `detail` | строка (например `source=cookie; email_already_used_code`) |
| `createdAt` | UTC timestamp |

Запись через `recordReferralAbuse(prisma, {...})` (best-effort — не валит booking
при ошибке логирования). Срабатывает внутри `POST /bookings` сразу после решения
`canUseReferralCode({ ok: false, ... })`.

## 5. Reward — конкретика

Файлы: `services/api/prisma/migrations/20260421090000_ugc_reward_hardening`,
`services/api/src/modules/ugc/rewardService.ts`.

### Таблица `user_rewards`

| Поле | Описание |
|------|----------|
| `id` | PK |
| `userId` | FK → User, nullable |
| `email` | email автора UGC, nullable |
| `source` | `ugc` (на будущее можно расширять) |
| `sourceRefId` | `program_ugc.id` — привязка к origin |
| `valueType` | `percent` \| `amount` |
| `value` | integer: процент (например 5) или сумма в минимальных единицах валюты |
| `currency` | код валюты для `amount` (например `RUB`) |
| `status` | `available` \| `used` \| `expired` |
| `usedBookingId` | id booking, где reward был применён |
| `createdAt`, `usedAt`, `expiresAt` | lifecycle timestamps |

### Создание

В `maybeGrantRewardForApprovedUgc` после создания `referralCode`:

```ts
const existing = await prisma.userReward.findFirst({
  where: { source: "ugc", sourceRefId: ugc.id },
});
if (!existing) {
  await prisma.userReward.create({
    data: {
      userId: ugc.userId,
      email: ugc.contactEmail,
      source: "ugc",
      sourceRefId: ugc.id,
      valueType: env.REFERRAL_REWARD_VALUE_TYPE,     // percent | amount
      value: env.REFERRAL_REWARD_VALUE,              // 5 по умолчанию
      currency: valueType === "amount" ? env.REFERRAL_REWARD_CURRENCY : null,
      status: "available",
    },
  });
}
```

Идемпотентно: повторный approve (теоретически невозможный) не создаст второй reward.

## 6. Применение reward

Файл: `services/api/src/modules/ugc/rewardService.ts`, функция `applyAvailableReward`.

Вызывается из `POST /bookings` после `prisma.booking.create`. Шаги:

1. Если у booking уже есть `appliedRewardId` — пропускаем (идемпотентность).
2. Ищем активный reward по `(userId)` **или** `(email)`, статус `available`,
   `expiresAt IS NULL OR expiresAt > now`. Сортируем по `createdAt ASC` (FIFO).
3. Атомарный `updateMany { id, status: 'available' } → { status: 'used', usedAt, usedBookingId }`:
   если `count === 0` — reward уже кем-то забран, пропускаем.
4. `booking.appliedRewardId = reward.id`.
5. Audit-log `appliedRewardId`.

Это важно: автор UGC **может** применить собственный reward к собственному booking
(это сознательный reward-бонус). `self_use_blocked` относится именно к referralCode,
а не к reward.

## 7. Attribution priority

В `POST /bookings`:

```ts
const bodyRef  = String(body.referralCode ?? "").trim();
const cookieRef = parseCookie("mw_ref");
const rawRef = bodyRef || cookieRef;         // body строго выше cookie
const source = bodyRef ? "body" : cookieRef ? "cookie" : null;
```

Если body содержит код — cookie игнорируется (даже если он другой). Если body
пустой — пробуем cookie. Источник пишется в `detail` abuse-лога.

**"booking уже имеет referralCode → не перезаписывать":** для нового booking это
несущественно (код выставляется только при создании). Для retry-пути
`maybeRetryDeliveryForNewBooking` мы не трогаем `referralCode` существующего booking — это уже
гарантировано кодом.

## 8. Admin visibility

`GET /admin/ugc/overview` теперь включает:

```json
{
  "reward": { "granted": N, "issued": N, "used": N },
  "abuse": {
    "self_use_blocked": N,
    "duplicate_use_blocked": N,
    "rate_limited": N
  }
}
```

`GET /admin/referrals/overview` — полные счётчики growth-loop + abuse + rewards + funnel:

```json
{
  "ugc": { "approved": N, "granted": N, "pending": N, "rejected": N },
  "referrals": { "total": N, "visits": N, "bookings": N },
  "rewards": { "issued": N, "used": N, "available": N, "expired": N },
  "abuse": { "self_use_blocked": N, "duplicate_use_blocked": N, "rate_limited": N },
  "funnel": { "approved_to_granted_pct": X, "granted_to_visit_pct": X, "visit_to_booking_pct": X }
}
```

## 9. Env-переменные (packages/config/src/env.ts)

| Переменная | Тип | Default | Назначение |
|------------|-----|---------|------------|
| `REFERRAL_REWARD_VALUE` | number | `5` | значение reward |
| `REFERRAL_REWARD_VALUE_TYPE` | string | `percent` | `percent` \| `amount` |
| `REFERRAL_REWARD_CURRENCY` | string? | — | код валюты для `amount` (RUB, USD, …) |
| `REFERRAL_MAX_BOOKINGS_PER_DAY` | number | `20` | rate-limit по одному коду за 24 ч |

## 10. Acceptance Criteria — проверка

- ✅ Пользователь не может использовать свой код:
  `canUseReferralCode` → `self_use_blocked` + `ReferralAbuseEvent`.
- ✅ Один email не может спамить один код:
  `duplicate_use_blocked` при повторе.
- ✅ Reward реально применяется: `UserReward` создаётся на approve, применяется
  в `POST /bookings`, `booking.appliedRewardId` + `status=used`.
- ✅ Базовая защита от abuse: rate-limit, 3 класса abuse-событий, отдельная таблица.
- ✅ Есть метрики отказов: `/admin/referrals/overview.abuse`,
  `/admin/ugc/overview.abuse`.

## 11. Что остаётся ограниченным (сознательно)

- **Нет реальной скидки в деньгах.** Reward хранится как
  `{ valueType, value }`, но billing/commissions пока этот `appliedRewardId`
  не читают. Это следующий шаг (интеграция с `services/api/src/modules/billing`).
- **Duplicate gap для Telegram-only контакта** — мы матчим по email в guestContact;
  для чистого Telegram duplicate не ловится. Чинится через `travelerKeyHash`.
- **Rate-limit по окну 24 часа rolling**, без sliding-bucket histograms;
  достаточно для MVP, но не подходит под реальный fraud-stream.
- **Нет ограничения «один userId/email может иметь один active reward»** —
  FIFO по `createdAt`, если в будущем выдадим несколько reward, тратиться они
  будут по одному за раз.
- **Нет self-referral-chain detection**: два разных аккаунта одного человека
  могут обменяться кодами. Нужен travelerKey / device fingerprint.
- **Нет expiry-логики** (`expiresAt` поле есть, но job-а истечения нет).
  Поле уже учитывается при применении reward — можно добавить ops-скрипт позднее.
- **Нет UI-кошелька и страницы «мои награды»** — сознательно, MVP без wallet.
- **Attribution однокасательная (last-click)**, без UTM и multi-touch.

## 12. Runbook

### Проверить self-use
```
Автор UGC → /admin/ugc/:id/approve
  → reward granted + referralCode=MW-X
  → в том же email-домене создать booking
  → GET /admin/referrals/overview.abuse.self_use_blocked должен стать +1
  → booking создан без referralCode
```

### Проверить duplicate
```
Один и тот же email дважды использует один и тот же код →
второй booking пишется без referralCode, abuse.duplicate_use_blocked += 1
```

### Проверить reward
```
1. POST /admin/ugc/:id/approve → UserReward.status=available для автора
2. Автор (со своим email) делает новый booking
3. После create: booking.appliedRewardId != null,
   UserReward.status=used, UserReward.usedBookingId=<booking.id>
4. Audit log: appliedRewardId + reason 'reward applied type=percent value=5'
```

### Отключить reward (emergency switch)
- Задать `REFERRAL_REWARD_VALUE=0` — создание UserReward всё равно будет
  (`value >= 1` enforced в коде, default 5), но можно отключать генерацию
  referralCode на уровне approve: выставить `REFERRAL_MAX_BOOKINGS_PER_DAY=0`
  → все попытки атрибуции станут `rate_limited`. Это грубый kill-switch,
  полноценный toggle — следующий шаг.

## 13. Next steps (не в этом шаге)

- Фактическая скидка в billing/commissions: читать `booking.appliedRewardId`
  → `user_rewards.value/valueType`, применять в расчёт commission или финальной суммы.
- Lifecycle reward: job истечения (`expiresAt`), re-issue политика.
- Self-referral-chain detection через `travelerKeyHash`.
- Duplicate guard по Telegram chatId (расширение `extractEmailFromGuestContact`).
- Страница автора `/my/rewards` (требует auth).
- Feature-flag для reward (`REFERRAL_REWARD_ENABLED=true/false`) + graceful degrade.
