# Готовое письмо разработчику (Sprint 2 Checkpoint 1 — verification first)

**Тема:** Sprint 2 Checkpoint 1 plan accepted — proceed with verification-first implementation

---

Привет.

`SPRINT2_CHECKPOINT_1_PLAN.md` принят.

# **Sprint 2 Checkpoint 1 plan — Accepted**

# **Proceed to implementation**

### Зафиксированная цель checkpoint

* freeze pilot configuration
* prove one full E2E path
* harden one ops flow to executable state

### Уточнение GM

В этом checkpoint-е берем только один приоритетный ops flow:

# **Verification flow first**

`Commission accrual flow` переносится в следующий checkpoint, если не будет отдельного согласованного изменения приоритета.

### Что должно выйти по итогам

1. pilot config frozen
2. one proven E2E path:

   * organizer → program → publish → booking → completed
3. verification runbook hardened
4. updated pilot pre-launch checklist
5. checkpoint report with proof of execution

### Что обязательно показать в отчете

Добавьте отдельный блок:

**Proof of execution**

* organizer id / slug
* program id / slug
* publish status before / after
* booking id
* booking status progression
* evidence used for verification
* what was done via UI / API / manual ops

### Что остается out of scope

* public payment
* self-serve booking
* revenue UI
* public review layer
* public auth expansion
* новые сущности/статусы
* второй hardened ops flow в этом checkpoint-е

### Формат отчета

1. что изменено
2. какие файлы созданы/изменены
3. как тестировать
4. риски
5. rollback
6. source of truth used
7. proof of execution

Можно начинать реализацию.
