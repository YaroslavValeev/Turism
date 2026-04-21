# «Мои бонусы» — read-only страница для пользователя

Статус: реализовано. Backend endpoint + минимальный фронт + ссылки в письмах
(reward grant, reward recovery).

## 1. Что сделано

| Слой | Файл |
|------|------|
| JWT (sign / verify, purpose `my_rewards`, TTL 7 дней) | `services/api/src/modules/ugc/ugcTokens.ts` |
| Публичный read-only endpoint | `services/api/src/modules/ugc/publicRoutes.ts` → `GET /public/my-rewards` |
| Ссылка в письме «спасибо за отзыв» | `services/api/src/modules/ugc/rewardService.ts` → `rewardEmailHtml` |
| Письмо «бонус восстановлен» + автоотправка | `rewardService.ts` → `sendRewardRecoveredEmail`, вызов из `recoveryService.ts` |
| Frontend-страница | `apps/web/src/app/my-rewards/page.tsx` (`/my-rewards?token=...`) |

## 2. Как генерируется token

```ts
signMyRewardsToken(secret, { email, userId })
//   payload = { e: email_lowered_or_null, u: userId_or_null, pr: "my_rewards" }
//   expiresIn: "7d" (по умолчанию)
//   secret: NOTIFICATIONS_TOKEN_SECRET ?? JWT_SECRET (тот же, что и UGC submit)
```

Требование: хотя бы одно из `email`/`userId` ненулевое (иначе `throw`).
Email нормализуется (`trim().toLowerCase()`) до подписи — гарантирует, что
запросы для `Alice@…` и `alice@…` идут в один и тот же набор reward.

## 3. Как защищён endpoint

- `GET /public/my-rewards?token=…` принимает **только** signed JWT.
- Без токена / при невалидной подписи / истёкшем TTL → `400 invalid_or_expired_token`.
- Выборка `userReward.findMany` строится **строго по полям из payload**:
  ```sql
  WHERE userId = :u OR email ILIKE :e
  ```
  Невозможно подменить email через query / cookie — данные приходят из
  криптографически подписанного payload.
- Ответ помечен `Cache-Control: no-store` — токен не должен застревать в CDN/прокси.
- Поля `usedBookingId`, `sourceRefId` **не отдаются** наружу: пользователю не нужны
  внутренние идентификаторы, и они открывают вектор для probing'а.
- `take: 50` — жёсткий лимит, чтобы один токен не мог стать DDoS-вектором.
- TTL 7 дней (короче, чем 365 дней у UGC submit) — ссылка из старого письма
  не превращается в долговременный канал доступа. Новое письмо MyWave
  (next reward, recovery, новый booking) пришлёт свежую ссылку.

## 4. Структура ответа

```json
{
  "owner": { "email": "alice@example.com", "userId": null },
  "rewards": [
    {
      "id": "clx…",
      "valueType": "percent",
      "value": 5,
      "currency": null,
      "status": "available",
      "source": "ugc",
      "createdAt": "2026-04-20T12:34:56.789Z",
      "usedAt": null,
      "recoveredAt": "2026-04-22T09:12:00.000Z",
      "recoveredCancellationKind": "organizer_cancelled",
      "expiresAt": null
    }
  ],
  "aggregates": {
    "available_count": 1,
    "available_total_percent": 5,
    "available_total_amount_rub": 0
  }
}
```

Поля специально подобраны под пользовательский UI:
- **status** + **recoveredAt** показывают полный путь reward («был использован,
  бронирование отменили, бонус снова доступен»);
- **aggregates** разделены по `percent`/`amount_rub` — не пытаемся складывать
  «5% + 1000 ₽» в одно псевдо-значение;
- **available_count** — главный сигнал в UI («у вас есть 1 бонус»).

## 5. Где пользователь получает ссылку

**1. После UGC reward grant** (письмо «спасибо за отзыв»):
- генерируется token для `(ugc.contactEmail, ugc.userId)`;
- встраивается в HTML: «Открыть страницу с вашими бонусами: …».

**2. После recovery** (письмо «ваш бонус восстановлен»):
- автоотправляется из `recoverRewardOnCancellation` после успешного возврата;
- в теле — причина (`cancellationKind`) и ссылка на `/my-rewards`.

Best-effort: ошибка отправки письма **не валит** recovery — это lifecycle-инвариант.

## 6. UI (минимально)

`apps/web/src/app/my-rewards/page.tsx` — `"use client"`-страница:
- читает `?token=…` из URL;
- делает `fetch` к `/public/my-rewards`;
- показывает: бейдж `available_count` + сумму, список reward с цветными статусами
  (зелёный available / серый used / красный expired);
- для recovered — отдельная зелёная подпись «Восстановлен: дата (kind)»;
- внизу — мягкое объяснение про TTL ссылки.

Никакого редактирования / wallet / баланса в деньгах. Соответствует §8 ТЗ.

## 7. Acceptance Criteria

- [x] открывается страница `/my-rewards?token=…` и показывает свои rewards;
- [x] recovery (`recoveredAt != null`) отображается отдельной строкой с указанием
  причины;
- [x] used reward — серый бейдж «Использован» + дата;
- [x] данные консистентны с booking (выборка идёт из той же таблицы `user_rewards`,
  которую обновляют `applyAvailableReward` и `recoverRewardOnCancellation`).

## 8. Не сделано сознательно (out of scope)

- редактирование reward (нет `PATCH`);
- wallet UI с историей транзакций / списанием в деньги;
- сложные фильтры / поиск / пагинация (хватает `take: 50` + `orderBy createdAt desc`);
- баланс с пересчётом «5%» в фиксированную сумму (это требует знания цены конкретной
  программы — не уровень read-only страницы);
- личный кабинет с авторизацией (нет user accounts в MVP).

## 9. Безопасность: что остаётся ограниченным

| Риск | Как защищено |
|------|--------------|
| Перебор chararata токена | HMAC SHA-256, TTL 7 дней, нет user enumeration |
| Подмена email в запросе | email вшит в подписанный payload, query-параметр игнорируется |
| Утечка ссылки | TTL короткий; следующее письмо принесёт свежую |
| Probing внутренних id | `usedBookingId`/`sourceRefId` не возвращаются |
| Race / kassa-flood | `take: 50` + `Cache-Control: no-store` (нет амплификации) |
| Cross-account leakage | выборка строго `userId == :u OR email ILIKE :e` из payload |

## 10. Связанные документы

- [`UGC_AFTER_COMPLETED.md`](./UGC_AFTER_COMPLETED.md) — UGC submit flow.
- [`UGC_REWARD_HARDENING.md`](./UGC_REWARD_HARDENING.md) — abuse-guard.
- [`UGC_REWARD_BILLING.md`](./UGC_REWARD_BILLING.md) — Model A discount.
- [`UGC_REWARD_RECOVERY.md`](./UGC_REWARD_RECOVERY.md) — cancel/refund lifecycle.
