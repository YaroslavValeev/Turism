# Pilot go/no-go (rehearsal path и критерии)

Перед принятием решения о go-live пилота выполнить один репетиционный путь и проверить блокеры. Итоговое решение go/no-go — за GM.

---

## 1. Rehearsal path (один пилотный прогон)

Выполнить по порядку:

| # | Шаг | Как проверить |
|---|-----|----------------|
| 1 | Pilot config зафиксирован | [startup_config.md](../startup_config.md) §2: pilot wedge Wakesurf-first, anchor locations (Krasnodar, Dubai, Bodrum), assumptions. |
| 2 | Организаторы и программы | 1–2 организатора в статусе checked или выше; 3–10 программ в статусе published. Admin: очереди организаторов и программ. |
| 3 | Smoke | `pnpm smoke` или пункты [RELEASE_AND_OBSERVABILITY_CHECKLIST.md](RELEASE_AND_OBSERVABILITY_CHECKLIST.md) (health, login, organizers, programs, bookings, incidents, reviews, commissions, metrics). |
| 4 | E2E path | Organizer → program (draft) → media → publish → booking (public) → booking status до completed. Скрипт: `pnpm e2e:checkpoint1` при поднятом API. |
| 5 | Verification flow | По [VERIFICATION_RUNBOOK.md](VERIFICATION_RUNBOOK.md): evidence для организатора, переход listed → checked (или выше); запись в audit_log. |
| 6 | Commission flow | По [COMMISSION_RUNBOOK.md](COMMISSION_RUNBOOK.md): для одного completed booking создать Commission, при необходимости PATCH reconciliation; запись в audit_log. |
| 7 | Pilot pre-launch checklist | Все пункты [PILOT_PRELAUNCH_CHECKLIST.md](PILOT_PRELAUNCH_CHECKLIST.md) отмечены или явно исключены с причиной. |

Репетиция считается пройденной, если шаги 1–7 выполнены без блокеров ниже или блокеры сняты.

---

## 2. Блокеры (no-go при неустранении)

Не выходить в go-live, если:

| Блокер | Действие |
|--------|----------|
| Smoke не прошёл | Устранить падение API/доступность; повторить smoke. |
| Нет ни одного completed booking для проверки commission path | Выполнить E2E до completed (или e2e:checkpoint1), затем commission flow. |
| Критические инциденты не закрыты | Все инциденты с severity high/critical в resolved или closed перед go-live. |
| Миграция commission uniqueness не применена | Выполнить `pnpm db:migrate`, убедиться, что миграция `20250317100000_commission_booking_unique` применена (или дубликатов по bookingId нет и constraint не требуется к моменту запуска — по решению GM). |
| Нарушен out-of-scope | Появились public payment, revenue dashboard, self-serve booking, public review layer, public auth expansion — откатить или заморозить до решения GM. |

Дополнительные блокеры может ввести GM (например, отсутствие подписанного договора с организатором и т.п.).

---

## 3. Go / no-go критерии

- **Go:** Репетиционный путь выполнен; блокеры из §2 отсутствуют или сняты; GM принял решение о go-live.
- **No-go:** Хотя бы один блокер из §2 не снят; репетиция не пройдена; GM принял решение не запускать.
- **Условный go:** GM может принять решение о запуске с оговорками (например, ограниченный список организаторов или программ); зафиксировать условия в конфиге или отдельном решении.

Итог: после прохождения rehearsal path и проверки блокеров — передать результат и чеклист GM для финального go/no-go.
