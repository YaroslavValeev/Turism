# Web (`apps/web`)

Next.js 14 приложение публичного веб-фронта монорепозитория.

## Запуск

Из корня репозитория:

```bash
pnpm --filter @mywave/config build
pnpm --filter web dev
```

Production-сборка:

```bash
pnpm --filter web build
```

## Если в Next.js dev видите `Cannot find module './xxx.js'`

Чаще всего это **битый локальный кэш** в `apps/web/.next`, а не ошибка markdown в `docs/`.

1. Остановите dev-сервер.
2. Удалите каталог **`apps/web/.next`** (при необходимости также `.turbo` и `node_modules/.cache` в корне репо).
3. Снова выполните:

   ```bash
   pnpm --filter @mywave/config build
   pnpm --filter web dev
   ```

**Полная инструкция**, второй уровень очистки, что собирать в логах и заметка про Windows/путь:  
[`docs/dev/nextjs_dev_cache_troubleshooting.md`](../../docs/dev/nextjs_dev_cache_troubleshooting.md)
