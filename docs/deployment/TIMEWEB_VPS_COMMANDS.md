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
cd /opt/mywave/toutism
bash scripts/le-deploy-sync.sh
docker compose -f docker-compose.production.yml up -d reverse-proxy
curl -sS -I https://mywavetour.ru/ | head -n 5
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
