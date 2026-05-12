# Команды на VPS (Timeweb консоль / SSH)

Выполняйте **под пользователем с правами root или docker** в **каноническом** каталоге деплоя: **`/opt/mywave/tourism`**. Имя проекта Compose — **`toutism`** (строка **`COMPOSE_PROJECT_NAME=toutism`** в **`.env.production`**), префикс контейнеров — **`toutism-*`**. Вызывайте **`docker compose --env-file .env.production -f docker-compose.production.yml …`** (шаблон: **`export DC='docker compose --env-file .env.production -f docker-compose.production.yml'`**). На VPS **нет `.git`** — **`git pull` не используется**.

**Формула:** папка на диске **`tourism`**, проект **`toutism`**, контейнеры **`toutism-*`**. Путь **`/opt/mywave/toutism`** — только историческая папка в старых заметках, не путать с именем проекта.

На боевом VPS команды **`docker compose`** с **`docker-compose.production.yml`** выполняйте с **`--env-file .env.production`**, чтобы подхватывались **`COMPOSE_PROJECT_NAME`** и прочие переменные из корня проекта.

Нужны, когда **GitHub Actions → Deploy** падает на SSH/rsync или после деплоя нужно проверить окружение.

**В каждой новой SSH-сессии:**

```bash
export MW=/opt/mywave/tourism
cd "$MW"
```

## 0. Плейбук «сделай сейчас» (Timeweb консоль + ваш ПК)

Агент в Cursor **не может** зайти на ваш VPS — он правит репозиторий и даёт команды.

**Критично — где что запускать:**

| Шаг | Где выполнять | Оболочка |
|-----|----------------|----------|
| **§0.1** | Только **ваш ПК** (окно PowerShell / CMD с OpenSSH / Git Bash) | Не консоль Timeweb |
| **§0.2** | Только **VPS** (веб-консоль Timeweb или `ssh root@…`) | Bash на Linux |

Команды **`$REPO = …`**, **`scp`**, пути **`F:\…`** в **консоли Timeweb (bash)** не работают и дадут «command not found» / «No such file» — туда копируют только блок **§0.2**.

### 0.1. С вашего ПК (Windows, PowerShell) — доставить канонические файлы

Откройте **PowerShell (64-bit)** — *не* «Windows PowerShell (x86)», если **`scp`** не находится: в x86-сессии часто нет **`OpenSSH`** в `PATH`.

**В PowerShell нельзя** присваивать переменной имя **`$HOST`** — это встроенная **только для чтения** (ошибка «не удается перезаписать переменную Host»). Используйте **`$VPS`** или однострочники ниже.

Подставьте **`ВАШ_IP`** (пример: `5.129.249.113`).

```powershell
# Только ПК. После каждой строки Enter. Пароль SSH спросит дважды (по одному на файл), если без ключа.
$REPO = "F:\Проекты MyWave\NEW2026\Toutism"
$VPS = "root@ВАШ_IP"

scp "$REPO\scripts\prod_healthcheck.sh" "${VPS}:/opt/mywave/tourism/scripts/prod_healthcheck.sh"
scp "$REPO\infra\nginx\mywave.conf" "${VPS}:/opt/mywave/tourism/infra/nginx/mywave.conf"
```

**Одной вставкой** (без переменных; замените IP):

```powershell
scp "F:\Проекты MyWave\NEW2026\Toutism\scripts\prod_healthcheck.sh" "root@ВАШ_IP:/opt/mywave/tourism/scripts/prod_healthcheck.sh"
scp "F:\Проекты MyWave\NEW2026\Toutism\infra\nginx\mywave.conf" "root@ВАШ_IP:/opt/mywave/tourism/infra/nginx/mywave.conf"
```

Если **`scp : имя не распознано`**:

1. Установите клиент: **Параметры Windows → Приложения → Дополнительные компоненты → Добавить компонент → OpenSSH Client**.  
   Либо в **админ**-PowerShell: `Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0` (см. [установка OpenSSH в Windows](https://learn.microsoft.com/windows-server/administration/openssh/openssh_install_firstuse)).
2. Закройте окно PowerShell, откройте **новое** (лучше **не x86**).
3. Проверка: `where.exe scp` — должен показать путь, чаще всего **`C:\Windows\System32\OpenSSH\scp.exe`**.  
   Явный вызов: `& "$env:SystemRoot\System32\OpenSSH\scp.exe" "F:\…\prod_healthcheck.sh" "root@ВАШ_IP:/opt/mywave/tourism/scripts/prod_healthcheck.sh"`

**WinSCP / FileZilla (SFTP)** — те же удалённые пути: **`/opt/mywave/tourism/scripts/`**, **`/opt/mywave/tourism/infra/nginx/`**. Если с ПК **тоже** таймаут на порт **22**, WinSCP не поможет — сначала **§0.1a**.

### 0.1a. `Connection timed out` / `kex_exchange_identification` / `banner exchange` на порт 22

**Смысл:** с вашего ПК пакеты до **`IP:22`** не доходят или ответ не приходит (это не «не найден `scp`»).

**Проверка с ПК (PowerShell):**

```powershell
Test-NetConnection -ComputerName 5.129.249.113 -Port 22
```

Ожидается **`TcpTestSucceeded : True`**. Если **`False`** — **`scp`/`ssh`** с этого ПК не заработают, пока не исправите сеть/файрвол.

**Что проверить:**

1. **Панель Timeweb** → сервер → **сеть / файрвол / правила** — разрешён ли входящий **TCP 22** (иногда закрыт или разрешён только с выбранных IP). Для диагностики временно разрешите **22** с вашего IP или осторожно с **0.0.0.0/0**, затем сузьте правило.
2. **Провайдер / офис** — исходящий **22** иногда блокируется; проверьте с **другой сети** (мобильный модем, раздача с телефона).
3. **Публичный IPv4** сервера — сверьте в панели Timeweb.
4. **fail2ban** реже даёт именно *таймаут до баннера*; при чистом таймауте сначала сеть и файрвол.

**Ошибка PowerShell `ParserError` при `scp`:** не склеивайте **две** команды **`& …\scp.exe …`** в одну строку, вставляя **`&`** между путями. Выполняйте **две отдельные строки** (первый `scp` → Enter → второй `scp`).

### 0.1b. Доставка без `scp`/`ssh` с ПК (если порт 22 недоступен)

В **веб-консоли Timeweb** вы уже **`root`** на сервере — файлы можно записать **на VPS** без SSH с дома.

**Вариант A — `nano` + вставка из Cursor**

На VPS:

```bash
export MW=/opt/mywave/tourism
cd "$MW"
cp -a scripts/prod_healthcheck.sh "scripts/prod_healthcheck.sh.bak.$(date +%Y%m%d%H%M)" 2>/dev/null || true
nano scripts/prod_healthcheck.sh
```

В Cursor откройте локальный **`scripts/prod_healthcheck.sh`**, выделите всё (**Ctrl+A**), скопируйте; в **nano** вставьте (**Shift+Insert** или вставка из меню консоли Timeweb), сохраните (**Ctrl+O**, Enter, **Ctrl+X**). Аналогично **`infra/nginx/mywave.conf`** (сначала **`cp -a … .bak…`**).

**Вариант B — одна строка `base64` (если консоль не обрезает длинную вставку)**

На **ПК** (PowerShell):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('F:\Проекты MyWave\NEW2026\Toutism\scripts\prod_healthcheck.sh')) | Set-Clipboard
```

На **VPS** (вместо `ВСТАВЬТЕ_BASE64` — вставка из буфера одной строкой):

```bash
echo 'ВСТАВЬТЕ_BASE64' | base64 -d > /opt/mywave/tourism/scripts/prod_healthcheck.sh
chmod +x /opt/mywave/tourism/scripts/prod_healthcheck.sh
```

Для **`mywave.conf`** — тот же приём с путём **`/opt/mywave/tourism/infra/nginx/mywave.conf`** (без `chmod +x`).

Альтернатива без ручного копирования: успешный **GitHub Actions → Deploy production** или **`bash scripts/manual_rsync_deploy_timeweb.sh`** с ПК (если настроен) — если **и раннер** не достучится до **:22**, смотрите логи Actions и файрвол Timeweb для IP GitHub.

### 0.2. На VPS — одним блоком (веб-консоль Timeweb или `ssh root@…`)

```bash
export MW=/opt/mywave/tourism
cd "$MW"
export DC='docker compose --env-file .env.production -f docker-compose.production.yml'

# Скрипт из репо: обязательны строки с _insecure_tls / --insecure (иначе PROD_HEALTHCHECK_INSECURE_TLS бесполезен)
grep -nE '_insecure_tls|--insecure|PROD_HEALTHCHECK_INSECURE_TLS' scripts/prod_healthcheck.sh \
  || { echo "ОШИБКА: залейте scripts/prod_healthcheck.sh (§0.1 / §0.1b)"; exit 1; }

grep '^COMPOSE_PROJECT_NAME=' .env.production || true
$DC ps -a

# Конфиг nginx внутри контейнера + цепочка до API
$DC exec reverse-proxy sh -c 'grep -n "location = /api/health" -A6 /etc/nginx/conf.d/default.conf'
$DC exec reverse-proxy sh -c 'wget -qO- http://api:3001/health' && echo

# После замены mywave.conf на диске
$DC up -d --force-recreate reverse-proxy

# Пока сертификат самоподписанный — иначе curl (60)
PROD_HEALTHCHECK_INSECURE_TLS=1 bash scripts/prod_healthcheck.sh
```

Ожидание: перед проверками в stderr появится строка **`prod_healthcheck: внешний HTTPS с --insecure`**. Если **`grep` в начале блока упал** — сначала доставьте файл (**§0.1** или **§0.1b** при таймауте SSH).

### 0.3. Быстрая ручная проверка HTTPS (самоподписанный PEM)

```bash
curl -4 -vk --resolve mywavetour.ru:443:127.0.0.1 https://mywavetour.ru/api/health 2>&1 | tail -n 25
```

### 0.4. После стабильного 200 на `/api/health`

Выпустите **Let's Encrypt**, синхронизируйте PEM в **`infra/nginx/certs/`** (см. §5 и **`scripts/le-deploy-sync.sh`** / **`SSL_LE_AUTORENEW.md`**), затем healthcheck **без** `PROD_HEALTHCHECK_INSECURE_TLS`.

---

Проверка каталога compose после переустановки сервера:  
Проверка **`working_dir`** для **текущего** проекта (из **`$MW`**, без ручного имени контейнера):

```bash
export MW=/opt/mywave/tourism
cd "$MW"
CID=$(docker compose --env-file .env.production -f docker-compose.production.yml ps -q api | head -n1)
docker inspect "$CID" --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}'
```

Не использовать **`toutism-api-1`** из старых шпаргалок — может оказаться **старый** контейнер с путём **`/opt/mywave/toutism`**. Актуальное имя — в **`docker compose ps`**.

## 1. База: где мы и хватает ли места

```bash
export MW=/opt/mywave/tourism
cd "$MW"
pwd
df -h /
df -h /opt/mywave 2>/dev/null || true
```

Анти-footgun: `docker compose --env-file .env.production -f docker-compose.production.yml ...` запускать **только** из **`$MW`** (см. выше). Если выполнить в `/tmp`, получите `open /tmp/docker-compose.production.yml: no such file or directory`.

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
export MW=/opt/mywave/tourism
cd "$MW"
ls -la infra/nginx/certs/
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=80 reverse-proxy
```

В логах nginx часто: **`cannot load certificate`** / **`BIO_new_file() failed`**.

Восстановление (если на хосте есть цепочка Let's Encrypt в `/etc/letsencrypt/live/…`):

```bash
ls -la /etc/letsencrypt/live/
export MW=/opt/mywave/tourism
cd "$MW"
# если сертификат в другом lineage (подставьте каталог из live/):
# export RENEWED_LINEAGE=/etc/letsencrypt/live/ИМЯ_КАТАЛОГА
bash scripts/le-deploy-sync.sh
curl -sS -I https://mywavetour.ru/ | head -n 5
```

Если **`/etc/letsencrypt/live/` пустой или нет вашего домена** — `le-deploy-sync` не сможет ничего скопировать. Временно поднять HTTPS **самоподписанным** сертификатом (браузер будет ругаться, зато nginx и сайт оживут; потом замените на нормальный LE):

```bash
export MW=/opt/mywave/tourism
cd "$MW"
mkdir -p infra/nginx/certs
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout infra/nginx/certs/privkey.pem \
  -out infra/nginx/certs/fullchain.pem \
  -days 30 -subj "/CN=mywavetour.ru"
chmod 644 infra/nginx/certs/fullchain.pem
chmod 600 infra/nginx/certs/privkey.pem
docker compose --env-file .env.production -f docker-compose.production.yml up -d reverse-proxy
curl -sS -k -I https://127.0.0.1/ -H "Host: mywavetour.ru" 2>/dev/null | head -n 3 || curl -sS -I https://mywavetour.ru/ | head -n 5
```

В репозитории деплой уже исправлен: каталог **`infra/nginx/certs/`** исключён из rsync — после следующего **Deploy production** сертификаты с VPS снова **не будут стираться**.

### 5b. После ручного редактирования nginx: **443 refused**, **`location /` → api**, плюс **нет PEM**

Если в логах одновременно **`cannot load certificate … fullchain.pem`** и **`location directive is not allowed here`**: сначала восстановите **PEM** в **`infra/nginx/certs/`** (блок выше в §5: **`le-deploy-sync`** или временный **openssl**), затем **валидный** `mywave.conf` — без сертификатов nginx для **443** не стартует; сообщение по **`default.conf:106`** часто добавляется, если конфиг ещё и **обрезан** после неудачного **`curl`**.

Типичные ошибки при «быстром» патче:

- **`location /`** с **`proxy_pass http://api:3001`** — с основного домена весь трафик уходит в API вместо **Next (`web:3000`)** → ломается витрина.
- **`location = /api/health`** с **`proxy_pass …/api/health`** — на бэкенде канон **`GET /health`**, нужно **`…/health`**, не **`/api/health`**.

**Восстановление:** сначала **PEM** в **`infra/nginx/certs/`** (см. §5), иначе **`docker run … nginx -t`** с примонтированными сертификатами завершится ошибкой. Затем верните **`infra/nginx/mywave.conf`** из **`main`** (Deploy / rsync / `scp` с ПК). Если тянете с GitHub с VPS — **не** делайте `mv`, пока файл **не** прошёл проверки ниже (иначе при **таймауте `curl`** получите обрезанный конфиг → **`location directive is not allowed here`** и crash-loop **reverse-proxy**).

```bash
export MW=/opt/mywave/tourism
cd "$MW"
cp -a infra/nginx/mywave.conf "infra/nginx/mywave.conf.bak.$(date +%Y%m%d%H%M)" 2>/dev/null || true
curl -fsSL --connect-timeout 25 --max-time 180 \
  -o infra/nginx/mywave.conf.new "https://raw.githubusercontent.com/YaroslavValeev/Turism/main/infra/nginx/mywave.conf"
# Файл не пустой и начинается с server {
test -s infra/nginx/mywave.conf.new && head -n1 infra/nginx/mywave.conf.new | grep -q 'server[[:space:]]*{' || { echo "Скачанное — не nginx-конфиг"; exit 1; }
# Синтаксис (конфиг + PEM на диске хоста, как у compose)
docker run --rm \
  -v "$MW/infra/nginx/mywave.conf.new:/etc/nginx/conf.d/default.conf:ro" \
  -v "$MW/infra/nginx/certs:/etc/nginx/certs:ro" \
  nginx:1.27-alpine nginx -t \
  && mv infra/nginx/mywave.conf.new infra/nginx/mywave.conf
grep -n 'location = /api/health' -A4 infra/nginx/mywave.conf
```

Если **`curl`** / **`docker run nginx -t`** падают — **откатитесь на бэкап** и используйте **`scp`** с ПК:

```bash
ls -lt infra/nginx/mywave.conf.bak* 2>/dev/null | head
# cp -a infra/nginx/mywave.conf.bak.НУЖНЫЙ_СУФФИКС infra/nginx/mywave.conf
```

Дальше:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml exec -T reverse-proxy nginx -t
docker compose --env-file .env.production -f docker-compose.production.yml up -d --force-recreate reverse-proxy
curl -4 -sS -o /dev/null -w "HTTPS /api/health → %{http_code}\n" https://mywavetour.ru/api/health
```

## 6. Docker и прод-стек

```bash
export MW=/opt/mywave/tourism
cd "$MW"
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=60 reverse-proxy
```

Проверка nginx внутри прокси:

```bash
export MW=/opt/mywave/tourism
cd "$MW"
docker compose --env-file .env.production -f docker-compose.production.yml exec -T reverse-proxy nginx -t
```

Файл на **хосте** (должна быть строка про `api/media` после успешного деплоя):

```bash
export MW=/opt/mywave/tourism
cd "$MW"
grep -n 'api/media' infra/nginx/mywave.conf || echo "СТАРЫЙ КОНФИГ — нужен успешный Deploy с актуальным main"
```

## 7. Быстрые HTTP-проверки с VPS

Канон health на витрине: **`/api/health`**. Короткий путь **`/health`** подтверждён после Deploy #22 (SHA `d3d503e`) — alias `location = /health` присутствует в nginx (см. [`ADR_PUBLIC_HEALTH_ENDPOINT.md`](./ADR_PUBLIC_HEALTH_ENDPOINT.md)).

```bash
curl -sS https://mywavetour.ru/api/health
curl -sS -o /dev/null -w '/health HTTP %{http_code}\n' https://mywavetour.ru/health
curl -sS -I 'https://mywavetour.ru/api/media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1506905925346-21bda4d32df4%3Fw%3D200' | head -n 8
```

Проверка, что alias попал в конфиг на диске:

```bash
grep -n "location = /health" infra/nginx/mywave.conf || echo "НА ДИСКЕ НЕТ alias /health — нужен успешный Deploy с актуальным main"
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
export MW=/opt/mywave/tourism
cd "$MW"
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

Скрипт: `scripts/prod_healthcheck.sh` — обязательные проверки **`GET /`**, **`GET /api/health`**, **`GET /health`**, **`GET /api/media`**, **placeholder**, плюс Docker/ресурсы/логи.

```bash
export MW=/opt/mywave/tourism
cd "$MW"
bash scripts/prod_healthcheck.sh
```

Самоподписанный сертификат на nginx (временно): **`PROD_HEALTHCHECK_INSECURE_TLS=1 bash scripts/prod_healthcheck.sh`** (см. **§0** — сначала убедитесь, что на VPS **полный** `scripts/prod_healthcheck.sh` из репо, иначе переменная не сработает).

Если скрипт завершился с ненулевым кодом — считать состояние RED и разбирать блоки `HTTP health`, `Docker status`, `Recent logs`.

Факт checkpoint (2026-05-08): `prod_healthcheck.sh` выполнен на VPS, статус **PASSED**.

---

## 11b. P0 source_runs triage output format

Для owner checkpoint сохранять результат в формате:

```text
source_id
type
url_or_handle
is_active
failed_count
last_error
category
recommended_action: keep / retry / fix_parser / pause / disable / manual_review
reason
```

Категории для разбиения `other`:

```text
http_429
fetch_failed
timeout
http_404
http_403
parser_error
media_fetch_failed
unsupported_source
empty_response
network_error
unknown
```

---

## 12. Media regression smoke

Скрипт: `scripts/smoke_media.sh`

```bash
export MW=/opt/mywave/tourism
cd "$MW"
bash scripts/smoke_media.sh
```

Ожидаемо:

- placeholder → 200
- `/api/media` → 200
- home page response без ошибок

---

## 12b. Source runs triage + stale running

Скрипт: `scripts/triage_source_runs.sh`

```bash
export MW=/opt/mywave/tourism
cd "$MW"
bash scripts/triage_source_runs.sh
```

Ожидаемо на текущем checkpoint:

- `success: 239`, `failed: 231`, `running: 2`
- categories: `fetch_failed`, `http_429`, `invalid_url`

Если `running` старые (дни) и без `finishedAt`, считать их stale-кандидатами для controlled manual close (через отдельную SQL-процедуру владельца).

---

## 13. Safe Docker cleanup policy

Перед очисткой:

```bash
export MW=/opt/mywave/tourism
cd "$MW"
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
docker compose --env-file .env.production -f docker-compose.production.yml ps
curl -fsS https://mywavetour.ru/api/health
curl -sS -o /dev/null -w '/health HTTP %{http_code}\n' https://mywavetour.ru/health || true
```

Опасные команды (не запускать без отдельного backup-подтверждения):

```bash
docker volume prune
docker system prune --volumes
```

Факт checkpoint (2026-05-08):

- Выполнено безопасно: `docker image prune -f`, `docker builder prune -f --filter "until=168h"`.
- Не выполнялись: `docker volume prune`, `docker system prune --volumes`, `docker compose down -v`.
- После cleanup: контейнеры `Up`, health/home/media `PASSED`, disk usage около `71%`.
