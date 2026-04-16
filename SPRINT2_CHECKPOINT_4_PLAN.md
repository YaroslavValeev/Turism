# Sprint 2 — Checkpoint 4 Plan

**Назначение:** Четвёртый checkpoint Sprint 2. Pilot Rehearsal Execution — провести реальный операционный rehearsal по одному пути и получить управленческий сигнал: контур pilot-ready или конкретные blockers до go-live.

---

## 1. Управленческая цель checkpoint

Провести **pilot rehearsal execution** и получить реальный управленческий сигнал:
- либо контур **pilot-ready** (подтверждён доказательством выполнения),
- либо выявлены **конкретные blockers** до go-live с фиксацией для принятия решений.

Checkpoint — это шаг **rehearsal execution**, а не только описание или план: в отчёте должен быть отдельный блок **Rehearsal Proof** с реальными идентификаторами и шагами оператора.

---

## 2. Scope

| Элемент | Содержание |
|---------|------------|
| **One rehearsal path** | Один полный путь: от конфига/данных до завершённого сценария (организатор → программа → бронирование → верификация / комиссия по runbook). Без распыления на несколько сценариев. |
| **Operator trace** | Фиксация действий оператора по шагам: что делал, в каком порядке, в каком интерфейсе (admin/API). |
| **Blocker capture** | Все места, где процесс заблокировался или потребовал обходного пути — в список блокеров с кратким описанием. |
| **Go / no-go signal** | Итоговая рекомендация: go (контур готов к pilot go-live) или no-go (перечислить блокеры, которые должны быть сняты до выхода). |
| **Minimal admin usability fixes** | Только если rehearsal выявил реальное трение; исправления минимальные (подсказки, ссылки, одна кнопка/поле). Не redesign, не новые сущности. |

В рамках checkpoint **не вводятся** новые сущности, миграции, новые доменные статусы, public payment, self-serve booking, revenue dashboard, public review layer, расширение public auth, крупная аналитика или редизайн админки.

---

## 3. Deliverables

| Deliverable | Описание |
|-------------|----------|
| **Rehearsal plan** | Документ: выбранный путь (шаги), роли, данные (organizer/program/booking id или slug), критерии «успешно прошло» и «заблокировано». |
| **Rehearsal execution proof** | Фактическое выполнение по плану; в отчёте — блок **Rehearsal Proof** (см. ниже). |
| **Operator pain points list** | Список мест, где оператор столкнулся с трением (неочевидный UI, отсутствие подсказки, лишние клики, неясный статус). |
| **Blocker list** | Список блокеров: что сломалось или не позволило завершить путь; приоритизация по критичности для go-live. |
| **Go / no-go recommendation** | Итоговая рекомендация с обоснованием: go или no-go; при no-go — перечень блокеров для снятия. |
| **Checkpoint report** | Отчёт Checkpoint 4: цель, scope, что сделано, Rehearsal Proof, pain points, blockers, go/no-go, риски, rollback, source of truth, out of scope. |

### Требование к финальному отчёту: блок Rehearsal Proof

В отчёте Checkpoint 4 должен быть отдельный блок:

**Rehearsal Proof**
- organizer id / slug
- program id / slug
- booking id
- operator steps (кратко: что делал оператор по шагам)
- где потребовалось ручное вмешательство
- что прошло без сбоев
- что сломалось / заблокировало
- go / no-go recommendation

---

## 4. Risks

| Риск | Митигация |
|------|-----------|
| Rehearsal drifts into feature work | Строго держать scope: один путь, capture, не «чинить по ходу». Исправления — только минимальные admin usability и только если rehearsal явно выявил трение. |
| Manual frictions are not captured | Встроить в процесс фиксацию: после каждого шага — «прошло чисто / трение / блок». Pain points list и blocker list заполнять по ходу, не по памяти. |
| Proof replaced by narrative | В отчёте обязателен блок Rehearsal Proof с реальными id/slug и перечислением шагов. Без id/slug доказательство не считается полным. |
| Team starts fixing everything instead of capturing blockers | Сначала — полный проход и список блокеров; исправления — только минимальные и только по согласованию с форматом checkpoint (minimal admin usability). |

---

## 5. Rollback

- **Откат допустим** только для минимальных admin/usability изменений, если они появятся в рамках checkpoint (например, одна подсказка, одна ссылка). Откат — revert по затронутым файлам.
- **Миграции БД и новые доменные сущности** в scope checkpoint не входят; если по исключению появятся — только по отдельному согласованию с GM, с отдельным rollback-планом.

---

## 6. Source of truth used

| Область | Документ/артефакт |
|---------|--------------------|
| Sprint 2, GM brief | [SPRINT2_GM_BRIEF.md](SPRINT2_GM_BRIEF.md) |
| Pilot config | [startup_config.md](startup_config.md) |
| Operator runbook | [docs/PILOT_OPERATOR_RUNBOOK.md](docs/PILOT_OPERATOR_RUNBOOK.md) |
| Go/no-go | [docs/PILOT_GO_NOGO.md](docs/PILOT_GO_NOGO.md) |
| Pre-launch checklist | [docs/PILOT_PRELAUNCH_CHECKLIST.md](docs/PILOT_PRELAUNCH_CHECKLIST.md) |
| Commission | [docs/COMMISSION_RUNBOOK.md](docs/COMMISSION_RUNBOOK.md) |
| Verification | [docs/VERIFICATION_LADDER.md](docs/VERIFICATION_LADDER.md) |
| Checkpoint 3 итог | [SPRINT2_CHECKPOINT_3_REPORT.md](SPRINT2_CHECKPOINT_3_REPORT.md) |

---

## 7. Explicitly out of scope (Checkpoint 4)

- Public payment
- Self-serve booking
- Revenue dashboard
- Public review layer
- Public auth expansion
- New entities / new statuses
- Major admin redesign
- Broad analytics expansion

Любое из перечисленного — только по отдельному решению GM, вне рамок Checkpoint 4.

---

*Правило: в этом checkpoint нужен реальный rehearsal с доказательством (Rehearsal Proof), а не только описанный план.*
