# Gate 1 — Local Green Smoke (пилот)

Цель: **подтвердить пилот-флаги, API, дубликат брони, UI и отсутствие утечек KPI** на локальной машине. Репозиторий после выполнения шагов — **pilot checkpoint**.

## Чеклист (порядок)

1. **API:** в `services/api/.env` — `PILOT_MODE_ENABLED=1` (дублирование в корневом `.env` не обязательно, если `services/api/.env` существует).

2. **Web:** в `apps/web/.env.local` — `NEXT_PUBLIC_PILOT_MODE=1`.

3. **Admin:** в `apps/admin/.env.local` — `NEXT_PUBLIC_PILOT_MODE=1`.

4. **Терминал A:** из корня репозитория: `pnpm --filter api dev` (порт 3001).

5. **Терминал B:** `pnpm --filter api smoke:pilot-e2e`  
   Ожидание: `OK /health`; `OK POST /bookings 400 (omit legalConsent)`; `OK POST /bookings 400 (legalConsent false)`; `OK POST /bookings 201 (legalConsent true, legalConsentAt set)`; `OK POST /bookings duplicate 409`; `pilot-e2e-smoke: all checks passed`.  
   (Требуется: миграции применены, `SEED_DEMO_CATALOG=1` и `pnpm --filter api db:seed` — иначе «No published program».)

6. **Web + Admin:** `pnpm --filter web dev` (3000), `pnpm --filter admin dev` (3002) — **или** `pnpm run dev` по монорепе.

7. **UI:** на витрине — баннер пилота (`PilotModeBanner`); на PDP программы — чекбоксы согласий; в админке — раздел **«Пилот KPI (shadow)»** `/pilot-kpi` — цифры теневых агрегатов.

8. **`/metrics/pilot-kpi`:** **не** публичный — только `Authorization: Bearer <admin_jwt>`. В ответе: агрегаты (`count`/`sum`), **без** `guestContact` и PII; в JSON присутствует блок `privacy` (метка, что контактов заявок нет). Проверка: `curl` без токена → 401.

9. **Legal consent в БД:** после заявки с сайта в строке `bookings` заполнены `legalConsentAt`, `legalConsentPolicyVersion` (см. админка **Заявка** → поле «Согласие (legal)»). **Без** `legalConsent: true` в `POST /bookings` — **400** `legal_consent_required`.

10. **Аналитика / seed:** события с `source_channel: e2e_smoke` и демо-каталог (`SEED_DEMO_CATALOG`) **различимы** по `sourceChannel` / организаторам; пилот-KPI — **агрегаты** по всей БД. Для чистой аналитики пилота используйте отдельную БД/дамп, не мешайте с прод-данными.

## Связанные файлы

- `services/api/scripts/pilot-e2e-smoke.ts`  
- `docs/STATUS_10_10.md`  
- `docs/ANALYTICS_EVENT_TAXONOMY.md`  

**Готово, если** все 10 пунктов зелёные; зафиксируйте в `DEPLOY_EVIDENCE_*` (Gate 3) факт «Gate 1 passed locally».

---

## Gate 1 Full Local UI Pass — evidence (заполняется вручную)

После ручного прохода Web PDP + Admin вставьте сюда блок (или в отдельный `DEPLOY_EVIDENCE_*.md` день пилота):

```text
Gate 1 Full Local UI Pass — PASSED|FAILED
Date: YYYY-MM-DD
Commit: <git sha>
API smoke: OK (exit 0) / smoke:pilot-e2e
Web PDP legal flow: PASSED|FAILED / notes:
Admin legal consent block: PASSED|FAILED / notes:
Pilot KPI privacy (no PII): PASSED|FAILED / notes:
Known issues:
```

**Web PDP (краткий чеклист):** `NEXT_PUBLIC_PILOT_MODE=1` → баннер; PDP; чекбоксы legal; без согласия не отправляется; с согласием — успех; Network: `legalConsent: true` в `POST /bookings`; нет критических ошибок в консоли.

**Admin (краткий чеклист):** `NEXT_PUBLIC_PILOT_MODE=1` → баннер; меню **«Пилот KPI (shadow)»**; страница открывается; в блоке privacy — endpoint не публичный, нет контактов заявок; новая заявка в списке; в карточке — **«Согласие (legal)»** с датой и версией политики; в KPI/аналитике нет PII.

### Последний статус evidence

```text
Gate 1 Full Local UI Pass — PASSED
Date: 2026-05-06
Commit: 95e5ea566f791de2eda67b5e81b8e5e7768b6be2
API smoke: PASSED (smoke:pilot-e2e, exit 0; подтверждать на том же SHA перед деплоем)
Web PDP legal flow: PASSED
Admin legal consent block: PASSED
Pilot KPI privacy (no PII): PASSED
Known issues: —
```

**Связь с P1:** Gate 2 AI P0/P1 закрыты (см. `docs/gates/P1_CHECKPOINT.md`). После подстановки **одного** релиз-SHA в поле `Commit` выше и SQL-снимка в `docs/deployment/SOURCE_INVENTORY_2026-05-06.md` пакет считается согласованным с управленческим **GO WITH GUARDRAILS** → финальный GO.
