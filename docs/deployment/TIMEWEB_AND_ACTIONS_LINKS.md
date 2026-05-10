# Ссылки: Timeweb + GitHub Deploy

**Пошаговый выкат (команды по порядку):** [TIMEWEB_DEPLOY_STEPS.md](./TIMEWEB_DEPLOY_STEPS.md).

Используйте этот файл, когда **Deploy production** падает на SSH/rsync (таймаут до VPS:22).

## GitHub — запуск и статус деплоя

- [Все Actions репозитория](https://github.com/YaroslavValeev/Turism/actions)
- [Workflow **Deploy production** (ручной запуск)](https://github.com/YaroslavValeev/Turism/actions/workflows/deploy-production.yml)
- При запуске выберите:
  - **`deploy_mode=full`** — полный деплой (по умолчанию);
  - **`deploy_mode=web_only`** — быстрый выкат витрины: `up -d --no-deps --build web reverse-proxy` (после rsync; код Next внутри образа);
  - **`deploy_mode=sync_only`** — только rsync без restart/build (для безопасной доставки файлов).
- Параметр **`build_mode`** применяется только для `deploy_mode=full`:
  - `incremental` — `up -d --build` (быстрее),
  - `full` — `build --no-cache` + `up`.

## Timeweb Cloud — сеть и доступ по SSH

- [Firewall (обзор)](https://timeweb.cloud/docs/firewall)
- [Управление файрволом](https://timeweb.cloud/docs/firewall/upravlenie-fajrvolom)
- [SSH-ключи для облачных серверов](https://timeweb.cloud/docs/cloud-servers/manage-servers/ssh-keys)
- [Сети и безопасность (туториалы)](https://cloud.timeweb.com/tutorials/network-security)

Проверьте, что для сервера **разрешён входящий TCP 22** (и при whitelist-группе — не забыты адреса, с которых реально ходит GitHub Actions; при проблемах временно ослабьте правила для проверки).

Если в логе был **ssh-ok** на probe, а упал уже шаг **rsync** через долгое время — чаще **обрыв длинной SSH-сессии** (NAT, промежуточный файрвол), **fail2ban** по числу соединений или **место на диске** на VPS. В workflow для rsync включены SSH keepalive и `--timeout` (см. `deploy-production.yml`).

## После зелёного деплоя на VPS

См. проверки в [`DEPLOY_EVIDENCE_2026-05-06.md`](./DEPLOY_EVIDENCE_2026-05-06.md) (`grep api/media`, `curl` на `/api/media`, ingestion-media).

## Команды в консоли VPS (копипаст)

Готовый чеклист: **[`TIMEWEB_VPS_COMMANDS.md`](./TIMEWEB_VPS_COMMANDS.md)**.
