# Sprint 2 — Checkpoint 5 Plan

**Назначение:** Пятый checkpoint Sprint 2. Pilot Go-Live Gate — принять решение о pilot go-live на основе одного manual operator pass (ручной проход оператора через admin) и списка оставшихся operational guardrails.

---

## 1. Управленческая цель checkpoint

**Pilot Go-Live Gate:** на основе одного **manual operator pass** и фиксации операционного трения принять управленческое решение:

- **GO** — pilot go-live допустим при текущем контуре и зафиксированных guardrails;
- **GO WITH GUARDRAILS** — go-live допустим при явных ограничениях/правилах для оператора и пилота;
- **NO-GO** — до go-live необходимо снять перечисленные блокеры или выполнить минимальные исправления.

Checkpoint — это **gate**: решение о выходе в pilot опирается на доказательство того, что оператор может пройти контур руками через admin, а не только через скрипты/API.

---

## 2. Scope

| Элемент | Содержание |
|---------|------------|
| **One manual operator pass** | Один проход оператора через admin/operational flow: тот же контур, что в Checkpoint 4 (organizer → program → booking → verification / commission), но выполняемый вручную в UI, без опоры на скрипты. |
| **Operator friction capture** | Фиксация: где UI был понятен, где потребовался workaround, где возникло трение. Список без превращения в «чинить всё». |
| **Minimal operator-facing fixes** | Только если manual pass явно выявил необходимость; минимальные правки (подсказки, ссылки, одна кнопка/поле). Не redesign, не новые сущности. |
| **Pilot go-live recommendation** | Итоговая рекомендация: GO / GO WITH GUARDRAILS / NO-GO с обоснованием и при необходимости — список guardrails или блокеров. |

В рамках checkpoint **не вводятся** новые сущности, миграции, новые доменные статусы, расширение API, public payment, self-serve booking, revenue dashboard, public review layer, расширение public auth, крупная аналитика или редизайн админки.

---

## 3. Deliverables

| Deliverable | Описание |
|-------------|----------|
| **Manual operator pass scenario** | Документ: сценарий прохода (какие страницы admin, в каком порядке, какие действия). Воспроизводимый сценарий для повторной проверки. |
| **Operator friction list** | Список: что было непонятно, где потребовался обходной путь, где возникло трение. Без обязательного «всё починить». |
| **Minimal fixes list** | Только если manual pass показал необходимость; перечень минимальных правок (если есть). Может быть пустым. |
| **Pilot guardrails list** | Список operational guardrails: правила, ограничения, чек-листы или напоминания для оператора/пилота до и во время go-live. |
| **Go-live recommendation** | GO / GO WITH GUARDRAILS / NO-GO с кратким обоснованием и ссылкой на friction/guardrails. |
| **SPRINT2_CHECKPOINT_5_REPORT.md** | Отчёт Checkpoint 5: цель, scope, что сделано, Manual Operator Proof, friction, guardrails, recommendation, риски, rollback, source of truth, out of scope. |

### Требование к финальному отчёту: блок Manual Operator Proof

В отчёте Checkpoint 5 должен быть отдельный блок:

**Manual Operator Proof**
- scenario used (какой сценарий использовался)
- admin pages used (какие страницы admin задействованы)
- what was clear (что было понятно в UI)
- what was unclear (что было непонятно)
- where workaround was required (где потребовался обходной путь)
- what guardrails are needed before pilot go-live (какие guardrails нужны до go-live)
- final recommendation: **GO** / **GO WITH GUARDRAILS** / **NO-GO**

---

## 4. Risks

| Риск | Митигация |
|------|-----------|
| Manual pass drifts into feature work | Строго держать scope: один pass, capture friction, не «чинить по ходу». Исправления — только минимальные и только если явно нужны для проходимости контура. |
| Friction capture replaced by "fix everything" | Сначала — полный список трения и guardrails; исправления — только из minimal fixes list по согласованию с форматом checkpoint. |
| Operator path not reproducible | Сценарий manual pass документировать так, чтобы другой оператор мог повторить (страницы, порядок действий). |
| Premature GO without explicit guardrails | Рекомендация GO или GO WITH GUARDRAILS должна сопровождаться явным списком guardrails (что оператор должен знать/делать/проверять до и во время pilot). |

---

## 5. Rollback

- **Откат допустим** только для минимальных admin/usability изменений, если они появятся в рамках checkpoint (подсказки, ссылки, одна кнопка/поле). Откат — revert по затронутым файлам.
- **Миграции БД, новые доменные сущности, расширение API** в scope checkpoint не входят; если по исключению появятся — только по отдельному согласованию с GM, с отдельным rollback-планом.

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
| Checkpoint 4 итог | [SPRINT2_CHECKPOINT_4_REPORT.md](SPRINT2_CHECKPOINT_4_REPORT.md) |
| Checkpoint 4 приёмка | [docs/SPRINT2_CHECKPOINT_4_ACCEPTANCE_EMAIL.md](docs/SPRINT2_CHECKPOINT_4_ACCEPTANCE_EMAIL.md) |

---

## 7. Explicitly out of scope (Checkpoint 5)

- Public payment
- Self-serve booking
- Revenue dashboard
- Public review layer
- Public auth expansion
- New entities / new statuses
- Major admin redesign
- Broad analytics expansion
- API expansion (новые эндпоинты/контракты) — только по отдельному решению GM

Любое из перечисленного — только по отдельному решению GM, вне рамок Checkpoint 5.

---

*Правило: в этом checkpoint нужен реальный manual operator pass через admin и явный блок Manual Operator Proof в отчёте; решение о go-live принимается на основе доказательства и списка guardrails.*
