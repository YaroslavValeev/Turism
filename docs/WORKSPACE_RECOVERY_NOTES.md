# Workspace Recovery Notes (после переноса проекта)

**Дата:** 2026-03-17  
**Контекст:** Project Context Recovery — восстановление рабочей среды на новом компьютере.

---

## Выполнено

| Шаг | Статус | Примечание |
|-----|--------|------------|
| pnpm install | ✓ | `npx pnpm@9.0.0 install` — зависимости установлены |
| .env | ✓ | Есть в корне и в `services/api/` (Prisma читает из api) |
| docker-compose.yml | ✓ | Локальный PostgreSQL (user/password/mywave на 5432) |
| PostgreSQL | ⚠ | Запустить вручную: `docker compose up -d` (Docker Desktop должен быть запущен) или локальный экземпляр на 5432 |
| db:migrate | — | Выполнить после запуска PostgreSQL |
| db:seed | — | Выполнить после db:migrate |
| smoke | — | Выполнить после `pnpm dev:api` |
| e2e:checkpoint1 | — | Выполнить после smoke; вывод вставить в SPRINT2_CHECKPOINT_1_REPORT.md §7 |

---

## Context Recovery (текущий прогон)

При выполнении плана Project Context Recovery: `pnpm install` выполнен успешно; `db:migrate` завершился ошибкой P1001 (PostgreSQL недоступен — Docker не запущен). Цепочка db:migrate → db:seed → dev:api → smoke → e2e:checkpoint1 не выполнена. **Действие:** запустить Docker Desktop (или локальный PostgreSQL), затем выполнить шаги 2–4 из «Действия для завершения контура до приёмки» ниже и вставить вывод `e2e:checkpoint1` в SPRINT2_CHECKPOINT_1_REPORT.md §7.

---

## Блокер снят (2026-03-17)

PostgreSQL поднят через Docker; миграции, seed, smoke и e2e:checkpoint1 выполнены; реальный Proof of execution вставлен в отчёт §7. Остаётся отправить пакет на приёмку GM.

---

## Действия для завершения контура до приёмки

После установки и запуска PostgreSQL (локально или через Docker):

1. **Запустить PostgreSQL** (если используете Docker):
   ```bash
   docker compose up -d
   ```

2. **Выполнить контур:**
   ```bash
   npx pnpm@9.0.0 db:migrate
   npx pnpm@9.0.0 db:seed
   npx pnpm@9.0.0 dev:api
   # В другом терминале:
   npx pnpm@9.0.0 smoke
   npx pnpm@9.0.0 e2e:checkpoint1
   ```

3. **Вставить фактический JSON** из вывода `e2e:checkpoint1` в `SPRINT2_CHECKPOINT_1_REPORT.md` §7 (блок «Пример вывода скрипта»).

4. **Отправить пакет на приёмку GM.**

---

## Важно

- Не подставлять «примеры» вместо реального JSON (ограничение GM).
- `.env` содержит чувствительные данные — не коммитить.
- При локальной установке PostgreSQL скорректировать `DATABASE_URL` в `services/api/.env`.
