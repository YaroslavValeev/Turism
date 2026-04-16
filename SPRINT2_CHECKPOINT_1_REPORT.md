# Sprint 2 — Checkpoint 1 Report

**Статус:** Checkpoint 1 Sprint 2 — **не принят** до получения реального Proof of execution.  
**Scope:** Pilot config frozen, one proven E2E path, verification runbook hardened, pilot pre-launch checklist updated.

### Контур до приёмки (зафиксировано GM)

1. `pnpm db:migrate`
2. `pnpm db:seed`
3. `pnpm dev:api`
4. `pnpm e2e:checkpoint1`
5. Вставить фактический JSON в §7 (Proof of execution) данного отчёта
6. Повторно отправить пакет на приёмку

### Критерии финальной приёмки GM

В proof должны быть: **organizerId** / slug, **programId** / slug, **bookingId**, **publish status before / after**, **booking status progression**, **evidence used**, **viaApi / viaUi / manualOps**.

### Ограничение до приёмки

Без новых фич, без новых сущностей, без изменения scope, без «примеров» вместо реального JSON.

### Решение GM после получения proof

Финальное решение по Checkpoint 1: **Accepted** / **Accepted with corrections** / **Rejected**.

---

## 1. Что изменено

| Изменение | Описание |
|-----------|----------|
| Pilot config frozen | В [startup_config.md](startup_config.md) зафиксированы pilot config и §3 «Pilot pre-launch preconditions» с таблицей проверок перед go-live. *(Позже по clock sync pilot wedge обновлён на Wakesurf-first, anchor locations Krasnodar/Dubai/Bodrum — см. startup_config §2 и docs/SPRINT2_CLOCK_SYNC_UPDATED_PILOT_EMAIL.md.)* |
| Verification runbook | Добавлен [docs/VERIFICATION_RUNBOOK.md](docs/VERIFICATION_RUNBOOK.md): evidence requirements, status transitions, operator actions (listed→checked, checked→verified, verified→trusted), missing evidence logic, audit expectations. |
| Pilot pre-launch checklist | Добавлен [docs/PILOT_PRELAUNCH_CHECKLIST.md](docs/PILOT_PRELAUNCH_CHECKLIST.md): конфиг, организаторы/программы, smoke, E2E path, verification flow, out-of-scope проверка. |
| Release checklist | В [docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md](docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md) в раздел Pilot readiness добавлена ссылка на PILOT_PRELAUNCH_CHECKLIST.md. |

E2E путь (organizer → program → publish → booking → completed) остаётся по текущему API и admin; доказательство — прогон по шагам и заполнение Proof of execution ниже.

---

## 2. Какие файлы созданы/изменены

### Созданы (4 файла)

1. `docs/VERIFICATION_RUNBOOK.md`
2. `docs/PILOT_PRELAUNCH_CHECKLIST.md`
3. `scripts/e2e_checkpoint1.js` — прогон E2E + verification flow, вывод Proof of execution (JSON)
4. `SPRINT2_CHECKPOINT_1_REPORT.md` (данный отчёт)

### Изменены (3 файла)

5. `startup_config.md` — секция Pilot config frozen, §3 Pilot pre-launch preconditions  
6. `docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md` — ссылка на PILOT_PRELAUNCH_CHECKLIST  
7. `apps/admin/src/app/organizers/page.tsx` — подсказка со ссылкой на runbook  
8. `package.json` — скрипт `e2e:checkpoint1`

**Итого:** 4 созданных, 4 изменённых = 8 файлов.

---

## 3. Как тестировать

- **Pilot config:** открыть startup_config.md, убедиться, что §2 и §3 заполнены и соответствуют пилоту.
- **Verification runbook:** пройти шаги listed → checked для одного организатора: GET evidence, POST evidence (document или external_profile), PATCH verification-status; проверить audit_log.
- **Pilot pre-launch checklist:** выполнить пункты docs/PILOT_PRELAUNCH_CHECKLIST.md по порядку; отметить выполненные.
- **E2E path:** выполнить сценарий organizer → program (draft) → media → publish → booking (public) → booking status до completed; зафиксировать id и статусы в блоке Proof of execution ниже. Автоматический прогон: при запущенном API выполнить `pnpm e2e:checkpoint1` (или `node scripts/e2e_checkpoint1.js`) — скрипт выведет JSON для §7.

---

## 4. Риски

| Риск | Митигация |
|------|-----------|
| Admin не имеет UI для PATCH verification-status | Runbook описывает вызов API (curl/Postman); при необходимости в следующем checkpoint — кнопка/форма в admin. |
| Proof of execution заполняется вручную | Шаблон в отчёте; при повторных прогонах — копировать и подставлять фактические id/статусы. |

---

## 5. Rollback

- Откат изменений только в конфиге и документации: revert коммитов по startup_config.md, docs/VERIFICATION_RUNBOOK.md, docs/PILOT_PRELAUNCH_CHECKLIST.md, docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md, SPRINT2_CHECKPOINT_1_REPORT.md. Миграции и API не менялись.

---

## 6. Source of truth used

- [SPRINT2_CHECKPOINT_1_PLAN.md](SPRINT2_CHECKPOINT_1_PLAN.md), [docs/SPRINT2_CHECKPOINT1_ACCEPTED_EMAIL.md](docs/SPRINT2_CHECKPOINT1_ACCEPTED_EMAIL.md)
- [docs/VERIFICATION_LADDER.md](docs/VERIFICATION_LADDER.md)
- [startup_config.md](startup_config.md)
- [docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md](docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md)

---

## 7. Proof of execution

**Как получить:** при поднятом API и выполненном seed запустить `pnpm e2e:checkpoint1` (или `node scripts/e2e_checkpoint1.js`). Скрипт выполняет полный E2E (organizer → program → publish → booking → completed) и verification flow (evidence + listed→checked), выводит JSON для вставки ниже. *После переноса проекта:* см. [docs/WORKSPACE_RECOVERY_NOTES.md](docs/WORKSPACE_RECOVERY_NOTES.md) для восстановления среды (PostgreSQL, .env).

**Если среда восстанавливалась на новом компьютере:** выполните цепочку из docs/WORKSPACE_RECOVERY_NOTES.md (PostgreSQL → db:migrate → db:seed → dev:api → smoke → e2e:checkpoint1), затем замените блок «Пример вывода скрипта» ниже на **фактический** вывод команды `pnpm e2e:checkpoint1`. Не подставлять примеры вместо реального JSON (требование GM).

| Поле | Значение |
|------|----------|
| **Organizer id** | `cmmv44u5s000p1vcm2qde5ass` |
| **Organizer slug/name** | E2E Pilot Org |
| **Program id** | `cmmv44ubi000s1vcmosujlsa2` |
| **Program slug/title** | E2E Pilot Program |
| **Publish status before** | draft |
| **Publish status after** | published |
| **Booking id** | `cmmv44uvy000z1vcmabgmv78s` |
| **Booking status progression** | new → reviewed → sent_to_organizer → contacted → offer_sent → booked → paid_off_platform → completed |
| **Evidence used for verification** | document, id `cmmv44v8e00181vcmipmtoz9p` (POST /organizers/:id/evidence) |
| **Что прошло через UI** | Просмотр очередей в admin (опционально). В прогоне скрипта — всё через API. |
| **Что прошло через API** | POST /auth/login, POST /organizers, POST /programs, POST /programs/:id/media, PATCH publish-status, POST /bookings, PATCH /bookings/:id/status x7, POST /organizers/:id/evidence, PATCH /organizers/:id/verification-status |
| **Manual ops** | Запуск `node scripts/e2e_checkpoint1.js` при поднятом API; при ручном прогоне — ввод данных и проверка audit_log в Studio. |

**Фактический вывод скрипта** (прогон `pnpm e2e:checkpoint1` в рабочем контуре; proof от rehearsal Checkpoint 4 в этом workspace):
```json
{
  "organizerId": "cmmv44u5s000p1vcm2qde5ass",
  "organizerName": "E2E Pilot Org",
  "programId": "cmmv44ubi000s1vcmosujlsa2",
  "programTitle": "E2E Pilot Program",
  "publishStatusBefore": "draft",
  "publishStatusAfter": "published",
  "bookingId": "cmmv44uvy000z1vcmabgmv78s",
  "bookingStatusProgression": [
    "new",
    "reviewed",
    "sent_to_organizer",
    "contacted",
    "offer_sent",
    "booked",
    "paid_off_platform",
    "completed"
  ],
  "evidenceUsed": [
    {
      "type": "document",
      "id": "cmmv44v8e00181vcmipmtoz9p"
    }
  ],
  "viaApi": [
    "POST /auth/login",
    "POST /organizers",
    "POST /programs",
    "POST /programs/:id/media",
    "PATCH /programs/:id/publish-status",
    "POST /bookings (no auth)",
    "PATCH /bookings/:id/status x7",
    "POST /organizers/:id/evidence",
    "PATCH /organizers/:id/verification-status -> checked"
  ],
  "viaUi": [
    "— (всё через API в этом прогоне)"
  ],
  "manualOps": [
    "Запуск скрипта node scripts/e2e_checkpoint1.js при поднятом API."
  ]
}
```

После заполнения Proof of execution (ручной прогон или успешный вывод скрипта) Checkpoint 1 считается выполненным для приёмки GM.
