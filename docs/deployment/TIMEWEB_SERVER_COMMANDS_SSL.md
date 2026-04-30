# Timeweb VPS — команды для консоли (по одной)

Копируйте **ровно одну** строку из каждого блока, выполняйте, затем переходите к следующей.

Предполагается каталог **`/opt/mywave/toutism`** и уже рабочий Docker Compose production.

Подробности: `docs/deployment/SSL_LE_AUTORENEW.md`.

---

## Обновление кода и nginx + webroot

```bash
cd /opt/mywave/toutism
```

```bash
git pull origin main
```

*(Если здесь ошибка авторизации GitHub на сервере — залейте архив/`scp` теми же версиями `infra/nginx/mywave.conf`, `docker-compose.production.yml`, `scripts/le-deploy-sync.sh` с ПК.)*

```bash
mkdir -p infra/certbot-webroot
```

```bash
chmod 755 infra/certbot-webroot
```

```bash
docker compose -f docker-compose.production.yml --env-file .env.production up -d reverse-proxy
```

```bash
docker compose -f docker-compose.production.yml --env-file .env.production exec reverse-proxy nginx -t
```

Убедитесь в выводе: **нет** предупреждений `listen ... http2` deprecated.

```bash
docker compose -f docker-compose.production.yml --env-file .env.production exec reverse-proxy nginx -s reload
```

---

## Контроль: ACME доступен по HTTP

```bash
mkdir -p infra/certbot-webroot/.well-known/acme-challenge
```

```bash
printf test > infra/certbot-webroot/.well-known/acme-challenge/probe-test
```

Проверьте с сервера (должен вернуть `test`):

```bash
curl -sS http://mywavetour.ru/.well-known/acme-challenge/probe-test
```

```bash
rm -f infra/certbot-webroot/.well-known/acme-challenge/probe-test
```

---

## Одноразовый выпуск SAN (4 имени, HTTP-01)

```bash
chmod +x /opt/mywave/toutism/scripts/le-deploy-sync.sh
```

```bash
sudo certbot certonly --webroot -w /opt/mywave/toutism/infra/certbot-webroot -d mywavetour.ru -d www.mywavetour.ru -d api.mywavetour.ru -d admin.mywavetour.ru --preferred-challenges http
```

```bash
sudo MYWAVE_ROOT=/opt/mywave/toutism /opt/mywave/toutism/scripts/le-deploy-sync.sh
```

```bash
curl -sSI https://api.mywavetour.ru/health | head -n 5
```

---

## Автопродление: deploy-hook и таймер

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/99-mywave-le-deploy-sync.sh >/dev/null <<'EOF'
#!/bin/sh
set -e
export MYWAVE_ROOT=/opt/mywave/toutism
exec /opt/mywave/toutism/scripts/le-deploy-sync.sh
EOF
```

```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/99-mywave-le-deploy-sync.sh
```

```bash
sudo systemctl enable certbot.timer
```

```bash
sudo systemctl start certbot.timer
```

```bash
sudo certbot renew --dry-run
```

---

## Если снова «рассинхрон» конфига в контейнере

```bash
cd /opt/mywave/toutism
```

```bash
docker compose -f docker-compose.production.yml --env-file .env.production stop reverse-proxy
```

```bash
docker compose -f docker-compose.production.yml --env-file .env.production rm -f reverse-proxy
```

```bash
docker compose -f docker-compose.production.yml --env-file .env.production up -d reverse-proxy
```

```bash
docker compose -f docker-compose.production.yml --env-file .env.production exec reverse-proxy nginx -t
```
