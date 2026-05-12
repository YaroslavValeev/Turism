# TLS-сертификаты для Docker nginx

Файлы **`fullchain.pem`** и **`privkey.pem`** кладутся **только на VPS** (Let's Encrypt / своя цепочка). В git они **не коммитятся**.

Деплой через GitHub Actions **не должен** перезаписывать или удалять этот каталог: в `deploy-production.yml` для `rsync` задано **`--exclude='infra/nginx/certs/'`**.

Восстановление на сервере после сбоя:

```bash
export MW=/opt/mywave/tourism
cd "$MW"
bash scripts/le-deploy-sync.sh
docker compose -f docker-compose.production.yml up -d reverse-proxy
```

См. также `docs/deployment/TIMEWEB_VPS_COMMANDS.md`.
