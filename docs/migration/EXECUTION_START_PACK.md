# MyWave Travel: Execution Start Pack (Stage 0 Closure)

Версия: 1.0  
Дата: 2026-04-17  
Статус: ready for stage-1 kickoff after approval

## 1. Owner map по этапам

| Этап | Stage Owner | Reviewer | Final Approver |
|---|---|---|---|
| 0. Audit freeze + contracts | Lead Agent / Orchestrator | Product Logic Agent | Product Owner |
| 1. Искатель: карточка + каталог | Frontend Agent | UX/UI Agent + QA Agent | Product Owner |
| 2. Заявка + доставка лида | Backend Agent | Integration Agent + QA Agent | Product Owner |
| 3. Organizer portal | Frontend Agent + Backend Agent | UX/UI Agent + Product Logic Agent + QA Agent | Product Owner |
| 4. Админка: статусы/автоматизация | Product Logic Agent | Backend Agent + Admin UI Subagent + QA Agent | Product Owner |
| 5. Комиссии/счета/sync | Backend Agent | Integration Agent + Analytics/Data Agent + QA Agent | Product Owner |
| 6. UX/UI pass + analytics | UX/UI Agent | Frontend Agent + Analytics/Data Agent + QA Agent | Product Owner |
| 7. QA и приемка | QA Agent | Все stage owners | Product Owner |

RACI правило:
- `A` (accountable): Stage Owner.
- `R` (responsible): назначенные subagents в этапе.
- `C` (consulted): соседние контуры.
- `I` (informed): Product Owner и Lead Agent.

## 2. Agent / subagent assignment (этап -> agent -> артефакты)

### Этап 1. Искатель: карточка и каталог
- Главный: `Frontend Agent`
- Subagents:
  - `Catalog/Card Subagent`
  - `Public UX Subagent`
  - `Critical Flow QA Subagent`
- Артефакты:
  - `Card Template Spec v1`
  - `Catalog Filter Behavior Contract`
  - `Smoke report: 10 card cases`

### Этап 2. Форма заявки и доставка лида
- Главный: `Backend Agent`
- Subagents:
  - `Lead/Booking Lifecycle Subagent`
  - `Telegram Delivery Subagent`
  - `Sheets Sync Subagent` (только контрактная часть на этапе 2)
  - `Integration QA Subagent`
- Артефакты:
  - `Submit API Contract v1`
  - `Delivery Routing Policy v1`
  - `Delivery Attempt Log Contract`
  - `E2E verified/fallback report`

### Этап 3. Путь организатора
- Главный: `Frontend Agent` + `Backend Agent`
- Subagents:
  - `Organizer Form Subagent`
  - `Organizer Onboarding Subagent`
  - `Content/Validation Subagent`
  - `Organizer UX Subagent`
  - `Critical Flow QA Subagent`
- Артефакты:
  - `Organizer Step Flow Spec`
  - `Draft Save + Validation Contract`
  - `Mandatory Fields Enforcement Policy`
  - `Verified/Not-Verified UI Rules`

### Этап 4. Админка: статусы и автоматизация
- Главный: `Product Logic Agent`
- Subagents:
  - `Programs Policy Subagent`
  - `Admin UI Subagent`
  - `Status/Event QA Subagent`
- Артефакты:
  - `Status Matrix Enforcement Report`
  - `Admin Timeline Event Log Spec`
  - `10 transition scenarios report`

### Этап 5. Комиссии, счета, finance sync
- Главный: `Backend Agent`
- Subagents:
  - `Billing/Commission Subagent`
  - `Sheets Sync Subagent`
  - `Integration QA Subagent`
- Артефакты:
  - `Invoice/Payment Flow Contract`
  - `Finance Sync Contract + Idempotency Evidence`
  - `Reconciliation report`

### Этап 6. UX/UI pass + analytics instrumentation
- Главный: `UX/UI Agent`
- Subagents:
  - `Analytics UI Subagent`
  - `Public UX Subagent`
  - `Organizer UX Subagent`
  - `Admin UX Subagent`
  - `Status/Event QA Subagent`
- Артефакты:
  - `Unified UI States Pack`
  - `Event Instrumentation Map`
  - `Dashboard Contract v1`

### Этап 7. QA и приемка
- Главный: `QA Agent`
- Subagents:
  - `Critical Flow QA Subagent`
  - `Status/Event QA Subagent`
  - `Integration QA Subagent`
- Артефакты:
  - `Regression report`
  - `Open issues register`
  - `Go/No-Go recommendation`

## 3. Когда подключается QA

- Обязательно с этапа 1 в dual-mode:
  - pre-merge check на stage branch,
  - post-demo acceptance check.
- Gate policy:
  - без QA report этап не может перейти в следующий.

## 4. Пакет baseline QA-сценариев (минимум 10)

1. Каталог открывается и показывает актуальные программы.
2. Переход в карточку программы из каталога.
3. Клик по дисциплине в карточке открывает каталог с фильтром дисциплины.
4. Клик по региону в карточке открывает каталог с фильтром региона.
5. Отправка заявки из карточки с валидными данными.
6. Маршрутизация заявки к правильному организатору и программе.
7. Verified organizer получает delivery в primary канале.
8. При недоступности primary срабатывает fallback без потери заявки.
9. Публикация программы с обязательными полями; неполная карточка блокируется.
10. Изменение payment/invoice статуса обновляет admin и `Tourism_RUS.finance` без дублей.

## 5. Stage report format (обязательный)

1) Что сделано  
2) Что в работе  
3) Что требует решения  
4) Что заблокировано  
5) Какие модули затронуты  
6) Что протестировано  
7) Какие риски появились  
8) Что готово к демонстрации

