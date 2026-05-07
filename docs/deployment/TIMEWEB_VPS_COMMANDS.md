# Команды на VPS (Timeweb консоль / SSH)

Выполняйте **под пользователем с правами root или docker** в каталоге проекта (часто `/opt/mywave/toutism`).  
Нужны, когда **GitHub Actions → Deploy** падает на SSH/rsync или после деплоя нужно проверить окружение.

## 1. База: где мы и хватает ли места

```bash
cd /opt/mywave/toutism
pwd
df -h /
df -h /opt/mywave 2>/dev/null || true
```

## 2. SSH снаружи (порт 22 слушается, не забанен ли раннер)

```bash
ss -tlnp | grep -E ':22\s' || ss -tlnp | grep ssh
systemctl is-active ssh 2>/dev/null || systemctl is-active sshd 2>/dev/null || true
```

Последние отказы по SSH (ищите `Failed password`, `banner`, `Connection closed`):

```bash
journalctl -u ssh -n 80 --no-pager 2>/dev/null || journalctl -u sshd -n 80 --no-pager 2>/dev/null || true
```

## 3. Fail2ban (часто банит IP после серии неудачных логинов)

```bash
command -v fail2ban-client >/dev/null 2>&1 && fail2ban-client status 2>/dev/null || echo "fail2ban не установлен или нет прав"
command -v fail2ban-client >/dev/null 2>&1 && fail2ban-client status sshd 2>/dev/null || true
```

Разбан конкретного IP (подставьте IP раннера GitHub из лога Actions, **осторожно**):

```bash
# sudo fail2ban-client set sshd unbanip 1.2.3.4
```

## 4. UFW / iptables (если используете)

```bash
command -v ufw >/dev/null 2>&1 && ufw status verbose || echo "ufw нет"
```

Должен быть разрешён **22/tcp** (и **80**, **443** для сайта). Правила меняйте только осознанно.

## 5. Nginx падает / `curl: … 443 … Connection refused` после деплоя

Частая причина: **`rsync --delete` без исключения `infra/nginx/certs/` удалил PEM** на сервере → nginx не поднимает SSL.

Проверка:

```bash
cd /opt/mywave/toutism
ls -la infra/nginx/certs/
docker compose -f docker-compose.production.yml logs --tail=80 reverse-proxy
```

В логах nginx часто: **`cannot load certificate`** / **`BIO_new_file() failed`**.

Восстановление (если на хосте есть цепочка Let's Encrypt в `/etc/letsencrypt/live/…`):

```bash
ls -la /etc/letsencrypt/live/
cd /opt/mywave/toutism
# если сертификат в другом lineage (подставьте каталог из live/):
# export RENEWED_LINEAGE=/etc/letsencrypt/live/ИМЯ_КАТАЛОГА
bash scripts/le-deploy-sync.sh
curl -sS -I https://mywavetour.ru/ | head -n 5
```

Если **`/etc/letsencrypt/live/` пустой или нет вашего домена** — `le-deploy-sync` не сможет ничего скопировать. Временно поднять HTTPS **самоподписанным** сертификатом (браузер будет ругаться, зато nginx и сайт оживут; потом замените на нормальный LE):

```bash
cd /opt/mywave/toutism
mkdir -p infra/nginx/certs
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout infra/nginx/certs/privkey.pem \
  -out infra/nginx/certs/fullchain.pem \
  -days 30 -subj "/CN=mywavetour.ru"
chmod 644 infra/nginx/certs/fullchain.pem
chmod 600 infra/nginx/certs/privkey.pem
docker compose -f docker-compose.production.yml up -d reverse-proxy
curl -sS -k -I https://127.0.0.1/ -H "Host: mywavetour.ru" 2>/dev/null | head -n 3 || curl -sS -I https://mywavetour.ru/ | head -n 5
```

В репозитории деплой уже исправлен: каталог **`infra/nginx/certs/`** исключён из rsync — после следующего **Deploy production** сертификаты с VPS снова **не будут стираться**.

## 6. Docker и прод-стек

```bash
cd /opt/mywave/toutism
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs --tail=60 reverse-proxy
```

Проверка nginx внутри прокси:

```bash
docker compose -f docker-compose.production.yml exec -T reverse-proxy nginx -t
```

Файл на **хосте** (должна быть строка про `api/media` после успешного деплоя):

```bash
grep -n 'api/media' infra/nginx/mywave.conf || echo "СТАРЫЙ КОНФИГ — нужен успешный Deploy с актуальным main"
```

## 6. Быстрые HTTP-проверки с VPS

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://mywavetour.ru/health 2>/dev/null || curl -sS -I https://mywavetour.ru/ | head -n 3
curl -sS -I 'https://mywavetour.ru/api/media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1506905925346-21bda4d32df4%3Fw%3D200' | head -n 8
```

## 8. Панель Timeweb (в браузере)

Сеть и файрвол — см. [TIMEWEB_AND_ACTIONS_LINKS.md](./TIMEWEB_AND_ACTIONS_LINKS.md).

---

## 9. Scheduler policy (owner accepted)

```text
Ingestion scheduler mode: external cron only
Internal scheduler: disabled / not used
Systemd timers/services: not detected
Owner decision: accepted
```

Проверка на VPS:

```bash
cd /opt/mywave/toutism
crontab -l || true
systemctl list-timers --all | grep -Ei "mywave|ingestion|toutism" || true
systemctl list-units --type=service | grep -Ei "mywave|ingestion|toutism" || true
```

---

## 10. Deploy policy (owner accepted)

```text
Deploy policy: manual workflow_dispatch only
Autodeploy on push: disabled
Self-hosted runner: ADR required before implementation
```

---

## 11. Production monitoring baseline

Скрипт: `scripts/prod_healthcheck.sh`

```bash
cd /opt/mywave/toutism
bash scripts/prod_healthcheck.sh
```

Если скрипт завершился с ненулевым кодом — считать состояние RED и разбирать блоки `HTTP health`, `Docker status`, `Recent logs`.

---

## 12. Media regression smoke

Скрипт: `scripts/smoke_media.sh`

```bash
cd /opt/mywave/toutism
bash scripts/smoke_media.sh
```

Ожидаемо:

- placeholder → 200
- `/api/media` → 200
- home page response без ошибок

---

## 13. Safe Docker cleanup policy

Перед очисткой:

```bash
cd /opt/mywave/toutism
docker system df
df -h
```

Безопасные команды:

```bash
docker image prune -f
docker builder prune -f --filter "until=168h"
```

После очистки:

```bash
docker system df
df -h
docker compose -f docker-compose.production.yml ps
curl -fsS https://mywavetour.ru/health
```

Опасные команды (не запускать без отдельного backup-подтверждения):

```bash
docker volume prune
docker system prune --volumes
```
