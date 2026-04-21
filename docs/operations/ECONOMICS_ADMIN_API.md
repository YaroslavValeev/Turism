# Economics admin API (guardrails & overrides)

Базовый префикс: **`/admin/economics`**. Все маршруты требуют **admin JWT** (`Authorization: Bearer …`).

См. также обзор в админке: **`/admin/economics`** (Next.js apps/admin).

**Ритм owner, пороги и когда вмешиваться:** [`OWNER_ECONOMICS_RHYTHM.md`](./OWNER_ECONOMICS_RHYTHM.md).

---

## Preview (dry-run, без audit)

Строгое тело JSON: лишние поля → **400** `invalid_body` (Zod `strict`).

### Program — `POST /admin/economics/programs/:id/override/preview`

```json
{
  "mode": "force_soft",
  "reason": "опционально для подписи в UI",
  "until": "2026-05-01T12:00:00.000Z",
  "indefinite": false
}
```

Бессрочный override:

```json
{
  "mode": "force_full",
  "indefinite": true
}
```

### Referral — `POST /admin/economics/referrals/:code/override/preview`

```json
{
  "mode": "force_low_quality",
  "until": "2026-06-01T08:00:00.000Z",
  "indefinite": false
}
```

---

## Effective (read-only)

- `GET /admin/economics/programs/:id/effective`
- `GET /admin/economics/referrals/:code/effective`

Ответ содержит `raw_auto`, `manual_override`, `effective`, `why`, `applied_rule`, `source_of_truth`, `grant_or_apply_blocked` (и множитель bps для программы).

---

## Set override

### Program — `POST /admin/economics/programs/:id/override`

`reason` **обязателен** (строка непустая).

```json
{
  "mode": "force_hard",
  "reason": "Согласовано с ops: временное снижение до фикса контента",
  "until": "2026-04-30T23:59:59.000Z",
  "indefinite": false
}
```

### Referral — `POST /admin/economics/referrals/:code/override`

```json
{
  "mode": "force_normal",
  "reason": "Восстановление после ошибочного low_quality",
  "indefinite": true
}
```

---

## Clear override + immediate recompute

- `DELETE /admin/economics/programs/:id/override`
- `DELETE /admin/economics/referrals/:code/override`

Ответ включает `old_effective`, `new_effective`; для программы дополнительно `recomputed` (payload авто-пересчёта). Audit: `manual_override_cleared_recomputed` / для TTL при expire — `manual_override_expired_recomputed` (см. backend).

---

## Dashboard / guardrails

- `GET /admin/economics/guardrails` — пороги, списки override, early warning, programs_limited.
- `POST /admin/economics/guardrails/run` — периодический job (в т.ч. expiry TTL + пересчёты по политике job).

---

## Ошибки валидации

Ответ **400**:

```json
{
  "error": "invalid_body",
  "issues": {
    "fieldErrors": {},
    "formErrors": []
  }
}
```

---

## Сценарии оператора (UI `/admin/economics`)

### 1. Временно приглушить программу (множитель reward)

1. `/programs` → ссылка **Economics / guardrails** у нужной программы (или `/admin/economics/programs/<id>`).
2. Выбрать режим, например `force_hard` или `force_soft`, указать **reason**, дату **до** (или согласованный **indefinite**).
3. **Предпросмотр** → проверить множитель bps и grant/apply blocked.
4. **Применить override** → убедиться, что блок «Текущее effective» обновился.

### 2. Снять override и проверить immediate recompute

1. На странице программы или реферала: **Снять override** (подтверждение).
2. В ответе и на экране — блок recompute (old/new effective); повторная загрузка effective уже без ручного ожидания job.

### 3. Пометить referral как low_quality (ручной override)

1. `/admin/economics` → ввести код в **Реферальный код** → **Открыть economics**, либо перейти с таблицы override/EW.
2. Режим `force_low_quality`, reason, срок или indefinite → предпросмотр → применить.
3. Для снятия: **Снять override** и проверить low_quality / recompute.

**CI:** в репозитории workflow `.github/workflows/ci.yml` — `pnpm --filter api exec tsc --noEmit`, `pnpm db:generate`, `pnpm --filter admin build` (blocking merge при падении).
