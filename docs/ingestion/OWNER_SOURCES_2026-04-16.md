# Источники owner batch (2026-04-16)

## Instagram: permalink → профиль

Парсер ingestion для типа `instagram` ожидает **URL профиля** (`https://www.instagram.com/<username>/`), а не `/reel/…` или `/p/…`.

Профили для указанных ссылок получены через публичную страницу embed:

`https://www.instagram.com/<reel|p>/<shortcode>/embed/captioned/`

В тексте embed есть ссылка на аккаунт автора.

| Исходная ссылка | Профиль (urlOrHandle) |
|-----------------|------------------------|
| https://www.instagram.com/reel/DXCBtTsh_oI/ | https://www.instagram.com/rodeopark/ |
| https://www.instagram.com/p/DW38LrwiAuo/ | https://www.instagram.com/twiglles/ |
| https://www.instagram.com/reel/DXHtd3aNsCU/ | https://www.instagram.com/borisov_sergei/ |
| https://www.instagram.com/reel/DW02R0RiJNu/ | https://www.instagram.com/freeride_in_siberia/ |

Импорт в БД: [`source_imports_owner_2026-04-16.json`](../../services/api/prisma/source_imports_owner_2026-04-16.json).

## Сайты

| URL | Имя в каталоге источников |
|-----|---------------------------|
| https://j-trip.ru/ | J-Trip |
| https://atv51.ru/ | ATV51 |

## Команды

```bash
# Импорт (из корня monorepo, нужен DATABASE_URL и применённые миграции)
pnpm run ingest:import-owner-sources

# Только эти 6 источников: collect → normalize → dedup (без остальной базы)
pnpm run ingest:owner-sources-only

# Сводка: raw_items, event_candidates, последний source_run по каждому источнику
pnpm run ingest:count-owner-sources

# Полный цикл по всем активным источникам (долго; для прод-сервера или осознанного прогона)
pnpm run ingest:owner-cycle
# или с фильтром одного id / типа:
# pnpm --filter api exec tsx prisma/run_ingestion_cycle.ts -- --source-id <id>
```

См. также [`scripts/resolve_instagram_profile_from_permalink.mjs`](../../scripts/resolve_instagram_profile_from_permalink.mjs) для повторного резолва permalink → профиль.

Локальный просмотр и мобилка до домена: [`docs/deployment/PRE_DEPLOY_LOCAL_AND_MOBILE.md`](../deployment/PRE_DEPLOY_LOCAL_AND_MOBILE.md).

Чеклисты приёмки в браузере и на Android: [`docs/qa/BROWSER_CHECK_ROUTES.md`](../qa/BROWSER_CHECK_ROUTES.md), [`docs/qa/MOBILE_CHECK_ROUTES.md`](../qa/MOBILE_CHECK_ROUTES.md).
