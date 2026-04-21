# MyWave Travel: аудит и целевая архитектура

Версия: 1.0  
Дата: 2026-04-17  
Статус: proposed for approval

## 1) Что обнаружено

- В репозитории уже есть сильный канон продукта: `docs/PROJECT_SOURCEBOOK.md`, `DERIVED_PRD.md`, `canonical_entity_model.md`, `canonical_status_models.md`, `program_card_schema.md`.
- Текущий публичный контур (искатель) работает как каталог + детальная карточка + отправка заявки:
  - `apps/web/src/app/page.tsx`
  - `apps/web/src/app/program/[id]/page.tsx`
  - `services/api/src/modules/programs/routes.ts`
  - `services/api/src/modules/bookings/routes.ts`
- Контур организатора реализован как intake-заявка, а не как полноценный кабинет со статусной моделью:
  - `apps/web/src/app/organizers/program/page.tsx`
  - `apps/web/src/components/organizers/ProgramIntakeForm.tsx`
  - `services/api/src/modules/public-intake/routes.ts`
- Админ-контур существует и покрывает ключевые очереди (`organizers`, `programs`, `bookings`, `commissions`), но UX и автоматизация пока не унифицированы.
- Есть валидные зачатки статусной и аудиторной логики:
  - publish-gate и статусы программ в `programs/routes.ts`
  - transitions для заявок в `bookings/statusRules`
  - audit log при изменении критичных полей/статусов
- Финансовый контур частично реализован (`commissions`, `billing`, `payments`), но не доведен до целевой модели "invoice paid => авто-статус + Google Sheets sync".
- Интеграции Telegram как приоритетного канала доставки лида и Google Sheets (`Tourism_RUS.finance`) сейчас отсутствуют как завершенный production flow.

## 2) Почему это важно

- Основа уже рабочая, поэтому нужен не “перезапуск”, а контролируемый product-hardening.
- Главный риск — локальные точечные правки без единой статусной/событийной модели: это приведет к расхождению UI, API и аналитики.
- Без нормализации обязательных полей карточки и управляемого onboarding организатора качество каталога и конверсия в заявку будут деградировать.
- Без формализации событий и интеграций невозможно надежно поддержать SLA по лидам, финансам и админ-аналитике.

## 3) Какое решение предлагается

Принять целевую архитектуру из трех продуктовых контуров с единым event backbone.

### 3.1 Product boundaries

- **Искатель приключений (public web):**
  - каталог, фильтры, карточка программы, отправка заявки;
  - прозрачный UX статусов и доверия (verified/not verified, условия участия, безопасность).
- **Организатор (organizer portal):**
  - верификация, договор, подача/редактирование программ, статус подачи, аналитика и лиды.
- **Админ (control panel):**
  - модерация, статусные переходы (manual + auto), комиссии/оплаты, синхронизации, аудит.

### 3.2 Единая операционная модель

- Канонические операционные сущности для реализации:
  - `Organizer`, `Program`, `Lead` (или `Booking` как canonical lead lifecycle), `Invoice`, `Commission`, `DeliveryAttempt`, `StatusEvent`, `ContractVersionAcceptance`.
- Любая смена статуса = событие с audit-следом.
- Любая автоматическая смена статуса = детерминированный триггер + лог причины.

### 3.3 Карточка программы (единый render template)

- Вводим единый шаблон секций с условным рендерингом:
  - секция показывается только если поле заполнено;
  - секции из обязательного набора не могут быть пустыми на этапе `submitted`.
- Для legacy карточек:
  - статус `changes_requested` или `requires_completion` до публикации;
  - миграционный репорт по полноте.

### 3.4 Событийно-статусный backbone

- Источник правды: backend events (`StatusEvent`, `DomainEvent`) из API-модулей.
- UI не вычисляет бизнес-статусы самостоятельно; UI отражает состояние из API.
- Аналитика собирается из тех же событий (не из дублирующих клиентских эвентов).

### 3.5 Интеграции

- Приоритет доставки лида:
  1. Telegram verified-организатору (если есть подтвержденный канал),
  2. fallback: email / internal queue / admin alert.
- Финансы:
  - invoice/payment transition обновляет статус комиссии;
  - синхронизация в Google Sheets `Tourism_RUS.finance` по фиксированному контракту полей.

## 4) Какие файлы/модули/папки затрагиваются

- Web (traveler): `apps/web/src/app/page.tsx`, `apps/web/src/app/program/[id]/page.tsx`, `apps/web/src/components/ProgramCard.tsx`
- Organizer surfaces: `apps/web/src/app/organizers/*`, `apps/web/src/components/organizers/*`
- Admin: `apps/admin/src/app/{organizers,programs,bookings,commissions}/page.tsx`
- API: `services/api/src/modules/{programs,bookings,organizers,public-intake,commissions,billing,payments}/`
- Shared contracts: `packages/shared-schema`, `packages/shared-policy` (расширение под status/event contracts)
- Docs: `docs/architecture/*`, `docs/migration/*`, `docs/qa/*`

## 5) Что переносим как есть

- Базовую каноническую документацию (PRD/sourcebook/status model).
- Существующие CRUD/queue маршруты API.
- Текущую модель audit-log и publish-gate.
- Базовый каталог и детальную страницу программы как foundation для UX-hardening.

## 6) Что рефакторим

- Приводим карточку и форму подачи программы к единой схеме обязательных полей.
- Вводим формальный organizer onboarding flow (verification + contract acceptance + submission statuses).
- Переводим lead delivery на explicit routing с fallback каналами и журналом доставки.
- Формализуем финансовые статусы и авто-переходы после оплаты/коррекции.
- Нормализуем справочники дисциплин/регионов (controlled vocabulary + moderation).

## 7) Что откладываем

- Финальную юридическую редакцию договора (оставляем versioned entity и adaptable rendering).
- Финальные формулировки всех статусов в UI (пока берём рабочие label-коды).
- Расширенную BI-витрину beyond MVP.

## 8) Риски

- Дублирование или расхождение статусной логики между web/admin/API.
- Потеря лидов при отсутствии централизованного delivery log и retry policy.
- Неконсистентность дисциплин/регионов без controlled dictionary.
- Расхождение админ-данных и Google Sheets без idempotency ключей синхронизации.
- Падение UX при добавлении обязательных полей без staged migration для старых карточек.

## 9) Критерий готовности

- Есть согласованная статусная матрица и event model.
- Все 3 контура работают по единой операционной логике и не конфликтуют.
- Карточка программы структурирована, секции условные, обязательные поля enforced.
- Лид гарантированно доставляется (primary + fallback + audit trail).
- Смена статуса оплаты отражается в админке и в `Tourism_RUS.finance` без дублей.

