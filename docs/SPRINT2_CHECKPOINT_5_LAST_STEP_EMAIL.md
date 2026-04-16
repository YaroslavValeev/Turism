# SPRINT2_CHECKPOINT_5_LAST_STEP_EMAIL.md

**Тема:** Final recovery docs confirmed — only manual operator pass remains

Привет.

Файл `docs/SPRINT2_CHECKPOINT_5_FINAL_RECOVERY_EMAIL.md` принят.

## Текущий статус

- file sync confirmed
- recovery path confirmed
- current gate report remains valid
- current pilot go-live decision remains `NO-GO` until real manual operator pass is completed

## Что делать дальше

Никаких новых документов, checkpoint-ов и фич не создаём.

Остаётся только один финальный operational path:

1. восстановить PostgreSQL
2. выполнить:
   - `npx pnpm@9.0.0 db:migrate`
   - `npx pnpm@9.0.0 db:seed`
3. поднять:
   - `npx pnpm@9.0.0 dev:api`
   - `npx pnpm@9.0.0 dev:admin`
4. пройти один реальный manual operator pass через admin
5. обновить **тот же** `SPRINT2_CHECKPOINT_5_REPORT.md`
6. обновить:
   - блок `Manual Operator Proof`
   - финальную рекомендацию:
     - `GO`
     - или `GO WITH GUARDRAILS`
7. повторно отправить обновлённый отчёт на финальную приёмку GM

## Что не делать

- не создавать новые версии тех же документов
- не открывать новый checkpoint
- не менять scope
- не добавлять новые фичи
- не трогать public/payment layer
- не менять доменную модель
- не подменять manual proof narrative-описанием

## Что должно быть в обновлённом Manual Operator Proof

- scenario used
- admin pages used
- what was clear
- what was unclear
- where workaround was required
- what guardrails are needed before pilot go-live
- final recommendation

## Актуальный source of truth

Использовать текущие версии:

- `SPRINT2_CHECKPOINT_5_REPORT.md`
- `docs/SPRINT2_CHECKPOINT_5_RECOVERY_PATH_EMAIL.md`
- `docs/SPRINT2_CHECKPOINT_5_FILE_SYNC_EMAIL.md`
- `docs/SPRINT2_CHECKPOINT_5_RECOVERY_EXECUTION_EMAIL.md`
- `docs/SPRINT2_CHECKPOINT_5_FINAL_RECOVERY_EMAIL.md`

После прохождения manual operator pass пришлите обновлённый `SPRINT2_CHECKPOINT_5_REPORT.md` на финальную приёмку GM.
