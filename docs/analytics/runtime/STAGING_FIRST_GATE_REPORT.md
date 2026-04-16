# HTTPS staging gate — sign-off (parity, Telegram, review, prod Phase A)

Документ фиксирует **обязательный gate** перед controlled prod rollout.  
**Локальный / staging-like parity** (например `localhost:3001`) — хороший промежуточный результат, но **не заменяет** этот gate: ниже — канонический порядок для **настоящего HTTPS staging**.

Env-нормализация и локальный web proxy E2E считаются закрытыми и **не** являются блокером для прохождения gate (см. только переменные шага 1).

---

## Порядок действий (зафиксировано)

### 1. На машине, с которой гоняете проверки (CI / ноутбук владельца)

Задать **только для сеанса** (или в защищённом secret store), **не** коммитить:

| Переменная | Назначение |
|------------|------------|
| `TARGET_BASE_URL` | HTTPS base API staging, например `https://api.staging.example.com` |
| `TARGET_ADMIN_TOKEN` | JWT после admin login **на staging** |
| `TARGET_INTERNAL_TOKEN` | Тот же секрет, что `INTERNAL_ANALYTICS_TOKEN` на **staging API** |

Опционально для сравнения с local: `LOCAL_BASE_URL`, `LOCAL_ADMIN_TOKEN`, `LOCAL_INTERNAL_TOKEN`.

### 2. Parity-check на staging

```bash
pnpm --filter @mywave/config build
node scripts/check_analytics_parity.mjs
```

Проверить по **target** (staging):

| Шаг | Критерий GREEN |
|-----|----------------|
| health | `GET …/health` → 200 |
| DQ / founder / billing | дашборды в ответе — `live` (или явно задокументированный допуск WARNING) |
| refresh | `POST …/internal/analytics/refresh` → 200, `ok: true` |
| scores/recalculate | `POST …/internal/analytics/scores/recalculate` → 200, `ok: true` |
| alerts/run | `POST …/internal/analytics/alerts/run` → 200, `ok: true` |

### 3. Telegram — фактическая доставка

Конфига на API **недостаточно**. Нужно одно из:

- **A)** Реальный прогон с **непустым `fired`** после `alerts/run`, сообщение **видно** в целевом чате; или  
- **B)** **Controlled test-send** (тот же bot + chat_id, тот же `TELEGRAM_BOT_API_BASE_URL` контур), задокументированный одноразовый вызов вне прод-спама.

`pnpm run check:telegram-alerts` остаётся smoke пути; **sign-off** = A или B выполнено.

### 4. Manual review checklist на staging

По образцу `REVIEW_FLOW_MANUAL_VALIDATION_STAGE.md`:

| # | Сценарий | GREEN |
|---|------------|-------|
| 1 | `completed` → auto `review_requests`, статус `queued` | да |
| 2 | `POST /reviews/requests/process` → доставка / статусы ожидаемы | да |
| 3 | `POST /reviews/request/:token/submit` → одна review, корректный финальный статус запроса | да |
| 4 | Повторный submit → **409**, вторая review не создаётся | да |
| 5 | Напоминания **bounded**, без дублирующего спама при повторном process | да |
| 6 | После review — **no extra send** при process | да |

### 5. Итоговый staging gate report (заполняет исполнитель после шагов 1–4)

Скопируйте блок в тикет / статус релиза и заполните.

```text
Дата: YYYY-MM-DD
Staging API host: <из TARGET_BASE_URL, без секретов>

Общий статус gate: GREEN | WARNING | CRITICAL

Parity (staging target):
  - health: OK / FAIL
  - dashboards (dq / founder / billing): OK / PARTIAL / FAIL
  - refresh: OK / FAIL
  - scores/recalculate: OK / FAIL
  - alerts/run: OK / FAIL

Telegram delivery:
  - метод: fired-alert | controlled-test-send
  - результат: подтверждено в чате ДА / НЕТ
  - примечание: <кратко>

Review checklist (1–6):
  - все пункты: PASS / FAIL (указать номер при FAIL)

Рекомендация prod Phase A:
  - МОЖНО — при GREEN и подтверждённой доставке Telegram + PASS по review.
  - НЕЛЬЗЯ — при CRITICAL по parity или FAIL по review или отсутствии подтверждения доставки.
  - WARNING — только узкий Phase A (record-only / когорта) с явным перечнем рисков и сроком повторного gate.
```

---

## Prod после sign-off

См. `AUTO_REVIEW_PROD_ROLLOUT_PLAN.md`: Phase A → B → C, rollback switches.

---

## Команды (staging / ops)

| Цель | Команда |
|------|---------|
| Parity на staging | `node scripts/check_analytics_parity.mjs` (с `TARGET_*` на HTTPS) |
| Smoke пути alerts | `pnpm run check:telegram-alerts` |

---

## Annex — reference: staging-like local (не HTTPS sign-off)

Зафиксировано ранее на **localhost** как промежуточный GREEN: parity target (health, dashboards live, refresh/scores/alerts ok), Telegram config присутствует; `fired: []` → отправка в чат не вызывалась. Это **не** подпись под HTTPS staging.
