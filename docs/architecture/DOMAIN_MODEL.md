# Target Domain Model (Unified)

Версия: 1.0  
Дата: 2026-04-17  
Статус: draft contract for implementation

## 1. Что обнаружено
- Канон уже описывает `Organizer`, `Program`, `Booking`, `Review`, `Incident`, `Commission`.
- Для трехслойной интеграции и fair rating не хватает формализации `Run`, `Approval`, `ExecutionEvent`, `PolicyRule`, `Channel`, `Agent`.

## 2. Почему это важно
- Без явной доменной модели невозможно обеспечить один source-of-truth и reproducible orchestration.
- Fair rating требует формальных lifecycle/owner связей между booking, review, incident и policy.

## 3. Какое решение предлагается
Принять целевую модель с owners и lifecycle по сущностям ниже.

## 4. Сущности и контракты

### Project
- Обязательные поля: `id`, `slug`, `name`, `status`, `createdAt`, `updatedAt`.
- Owner: `shared-core`.
- Lifecycle: `draft -> active -> paused -> archived`.
- Связи: `Project 1:N Task`, `Project 1:N MemoryEntry`, `Project 1:N Artifact`.

### Task
- Обязательные поля: `id`, `projectId`, `title`, `type`, `priority`, `status`, `createdAt`, `updatedAt`.
- Owner: `shared-core`.
- Lifecycle: `new -> triaged -> planned -> running -> blocked -> completed -> closed`.
- Связи: `Task 1:N Run`, `Task 1:N Decision`, `Task 1:N Approval`.

### Run
- Обязательные поля: `id`, `taskId`, `orchestrator`, `status`, `startedAt`, `finishedAt`.
- Owner: `Molt runtime via shared-core registry`.
- Lifecycle: `queued -> running -> waiting_approval -> succeeded | failed | cancelled`.
- Связи: `Run 1:N ExecutionEvent`, `Run N:1 Agent`.

### Decision
- Обязательные поля: `id`, `taskId`, `runId`, `decisionType`, `payload`, `riskLevel`, `createdAt`.
- Owner: `Agents governance`.
- Lifecycle: `proposed -> validated -> enforced | dismissed`.
- Связи: `Decision 1:0..1 Approval`, `Decision 1:N ExecutionEvent`.

### Approval
- Обязательные поля: `id`, `taskId`, `decisionId`, `requiredByPolicy`, `status`, `requestedAt`, `resolvedAt`.
- Owner: `Agents governance with shared-policy`.
- Lifecycle: `required -> requested -> approved | rejected | expired`.
- Связи: `Approval N:1 Channel`, `Approval N:1 PolicyRule`.

### Artifact
- Обязательные поля: `id`, `projectId`, `taskId`, `kind`, `uri`, `checksum`, `createdAt`.
- Owner: `shared-core`.
- Lifecycle: `draft -> produced -> validated -> published | deprecated`.
- Связи: `Artifact N:1 Run`, `Artifact N:1 Task`.

### MemoryEntry
- Обязательные поля: `id`, `projectId`, `scope`, `key`, `value`, `source`, `createdAt`.
- Owner: `shared-core`.
- Lifecycle: `active -> superseded -> archived`.
- Связи: `MemoryEntry N:1 Project`, `MemoryEntry N:0..1 Task`.

### Channel
- Обязательные поля: `id`, `channelType`, `purpose`, `status`, `configRef`.
- Owner: `shared-policy + runtime`.
- Lifecycle: `configured -> active -> paused -> retired`.
- Связи: `Channel 1:N Approval`, `Channel 1:N ExecutionEvent`.

### Agent
- Обязательные поля: `id`, `layer`, `capabilities`, `status`, `owner`.
- Owner: `Agents governance`.
- Lifecycle: `registered -> active -> throttled -> disabled`.
- Связи: `Agent 1:N Run`, `Agent 1:N Decision`.

### PolicyRule
- Обязательные поля: `id`, `name`, `version`, `scope`, `condition`, `action`, `severity`, `enabled`.
- Owner: `shared-policy`.
- Lifecycle: `draft -> approved -> active -> superseded -> retired`.
- Связи: `PolicyRule 1:N Approval`, `PolicyRule 1:N ExecutionEvent`.

### ExecutionEvent
- Обязательные поля: `id`, `runId`, `eventType`, `actor`, `channelId`, `timestamp`, `payload`.
- Owner: `Molt runtime with shared logging contracts`.
- Lifecycle: immutable append-only.
- Связи: `ExecutionEvent N:1 Run`, `ExecutionEvent N:1 PolicyRule`, `ExecutionEvent N:1 Channel`.

## 5. Что переносим как есть
- `Booking.completed` как триггер review chain.
- Incident и review moderation статусы как operational foundation.
- Score snapshots как временный агрегатный слой.

## 6. Что рефакторим
- Additive введение `Run`, `Approval`, `ExecutionEvent` как first-class contracts.
- Явное разделение internal trust signals и public rating outputs.

## 7. Что откладываем
- Полная физическая миграция всех legacy таблиц в одну ревизию.

## 8. Риски
- Несогласованные IDs между old/new сущностями.
- Потеря аудита при обходе execution event registry.

## 9. Критерий готовности
- Все новые API и jobs используют эти сущности как контракт.
- Нет новых сущностей с дублирующими ролями вне этой модели.
