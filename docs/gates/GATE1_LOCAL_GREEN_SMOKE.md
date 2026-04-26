# Gate 1 — Local Green Smoke (пилот)

Цель: **подтвердить пилот-флаги, API, дубликат брони, UI и отсутствие утечек KPI** на локальной машине. Репозиторий после выполнения шагов — **pilot checkpoint**.

## Чеклист (порядок)

1. **API:** в `services/api/.env` — `PILOT_MODE_ENABLED=1` (дублирование в корневом `.env` не обязательно, если `services/api/.env` существует).

2. **Web:** в `apps/web/.env.local` — `NEXT_PUBLIC_PILOT_MODE=1`.

3. **Admin:** в `apps/admin/.env.local` — `NEXT_PUBLIC_PILOT_MODE=1`.

4. **Терминал A:** из корня репозитория: `pnpm --filter api dev` (порт 3001).

5. **Терминал B:** `pnpm --filter api smoke:pilot-e2e`  
   Ожидание: `OK /health`, `OK POST /bookings 201`, `OK POST /bookings duplicate 409`, `pilot-e2e-smoke: all checks passed`.  
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
