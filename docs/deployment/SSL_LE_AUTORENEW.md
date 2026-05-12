# Let's Encrypt — автопродление (Docker nginx)

## Важные факты

1. **`certbot renew` с плагином `manual` не работает** без `--manual-auth-hook` — поэтому `certbot renew --dry-run` у вас и падал. Нужна схема **webroot**, **standalone** или **DNS-01**.
2. **Wildcard (`*.domain`) через HTTP-01 выдать нельзя** — только DNS-01. Текущий wildcard от Timeweb на сервере **автоматом продлить webroot нельзя**; варианты: DNS-API, ручное продление в поддержке или **SAN на 4 имени** через webroot ниже.

## Целевая схема (HTTP-01 + webroot → Docker)

На хосте VPS certbot кладёт токены в **`/opt/mywave/tourism/infra/certbot-webroot`**; nginx в контейнере отдаёт `/.well-known/acme-challenge/` с тома `./infra/certbot-webroot`.

После продления PEM копируются в **`infra/nginx/certs/`** скриптом **`scripts/le-deploy-sync.sh`** (как после ручного `cp -L`).

## Разово: перевыпуск под webroot (четыре имени)

На сервере (пути подставьте свои):

```bash
cd /opt/mywave/tourism
# Поднять конфиг с location ACME и томом certbot-webroot:
docker compose -f docker-compose.production.yml --env-file .env.production up -d reverse-proxy

# Если старый manual-сертификат конфликтует — сохраните бэкап и переиздайте (один профиль имени линии):
sudo certbot certonly --webroot \
  -w /opt/mywave/tourism/infra/certbot-webroot \
  -d mywavetour.ru \
  -d www.mywavetour.ru \
  -d api.mywavetour.ru \
  -d admin.mywavetour.ru \
  --preferred-challenges http

sudo chmod +x /opt/mywave/tourism/scripts/le-deploy-sync.sh
sudo MYWAVE_ROOT=/opt/mywave/tourism /opt/mywave/tourism/scripts/le-deploy-sync.sh
```

Проверка: `openssl x509 -in infra/nginx/certs/fullchain.pem -noout -text | grep -A5 SAN` и `curl -sSI https://api.mywavetour.ru/health`.

---

## Автоматизация продления

### 1) Deploy-hook certbot

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/99-mywave-le-deploy-sync.sh >/dev/null <<'EOF'
#!/bin/sh
set -e
export MYWAVE_ROOT=/opt/mywave/tourism
exec /opt/mywave/tourism/scripts/le-deploy-sync.sh
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/99-mywave-le-deploy-sync.sh
```

Certbot после успешного `renew` задаёт переменную **`RENEWED_LINEAGE`** — скрипт её учитывает.

### 2) Таймер (Ubuntu)

```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
sudo systemctl status certbot.timer
```

Либо **cron** дважды в сутки (hooks из **`renewal-hooks/deploy`** подхватываются сами):

```text
0 3,15 * * * root certbot renew -q
```

### 3) Пробный прогон

```bash
sudo certbot renew --dry-run
```

Ожидание: без ошибки `manual plugin`; в конце — успешная симуляция; hook отрабатывает только при «реальном» продлении (не всегда в dry-run во всех версиях — смотрите лог `/var/log/letsencrypt/letsencrypt.log`).

---

## Конфиг nginx и рассинхрон с контейнером

Если **на хосте** уже `listen 443 ssl` + `http2 on`, а **внутри контейнера** ещё `listen 443 ssl http2` — часто помогало **пересоздать** контейнер после замены inode файла:

```bash
docker compose -f docker-compose.production.yml --env-file .env.production stop reverse-proxy
docker compose -f docker-compose.production.yml --env-file .env.production rm -f reverse-proxy
docker compose -f docker-compose.production.yml --env-file .env.production up -d reverse-proxy
```

Правило: после **перезаписи** целого **`mywave.conf`** (не `sed -i` на месте) при сомнениях — **`rm` + `up`** для **`reverse-proxy`**.

---

## Certbot: часть имён падает (`timeout` / `error getting validation data`)

Let's Encrypt ходит на **каждый** `-d` как на **`http://имя/.well-known/acme-challenge/...`** с разных точек сети («multi-perspective»). Ошибки **не всегда** из-за nginx на одном хосте — часто **файрвол, флап сети VPS, rate limit** после неудачных попыток.

**Проверки на сервере (должно везде быть `200` и тело файла):**

```bash
TOKEN=probe-le; mkdir -p infra/certbot-webroot/.well-known/acme-challenge; echo ok > infra/certbot-webroot/.well-known/acme-challenge/$TOKEN
for h in mywavetour.ru www.mywavetour.ru api.mywavetour.ru admin.mywavetour.ru; do echo "== $h =="; curl -sS -m 15 -D- -o /tmp/body "http://$h/.well-known/acme-challenge/$TOKEN" | head -n 5; cat /tmp/body; echo; done
```

```bash
for h in mywavetour.ru www.mywavetour.ru api.mywavetour.ru admin.mywavetour.ru; do echo "$h -> $(dig +short A $h | tr '\n' ' ')"; done
```

- Если **с сервера** по всем четырём хостам **ok** — конфиг в порядке: повторите **`certbot certonly ...`** через **15–60 минут** (или на следующий день), смотрите лимиты LE.
- Убедитесь, что **`ufw`/фаервол** пропускает **tcp/80** и **443** снаружи: `ufw status verbose`.
- **Резервный путь без HTTP-01 для всех имён:** DNS-01 (wildcard/SAN) через API DNS Timeweb или снова выпуск в поддержке Timeweb + **`le-deploy-sync.sh`**.

---

## Остался wildcard-only на год

Оставляйте календарное напоминание за месяц до **NotAfter**, снова **Timeweb / DNS-01** или миграция на SAN/webroot как выше.
