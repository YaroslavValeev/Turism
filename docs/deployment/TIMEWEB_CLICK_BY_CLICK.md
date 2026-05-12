# Timeweb: пошагово (клики + команды по одной строке)

Цель: зайти в **веб-консоль** сервера, при необходимости открыть **SSH :22** в файрволе, вручную обновить **`prod_healthcheck.sh`** и **`mywave.conf`**, перезапустить **reverse-proxy**, запустить healthcheck.

**Канон имён:** на диске папка **`/opt/mywave/tourism`**, имя Docker Compose project — **`toutism`** (в **`.env.production`**: **`COMPOSE_PROJECT_NAME=toutism`**), живые контейнеры — **`toutism-api-1`**, **`toutism-web-1`**, … Команды compose в этом документе используют **`export DC='docker compose --env-file .env.production -f docker-compose.production.yml'`** — без **`--env-file`** префикс контейнеров станет **`tourism-*`** (имя каталога).

Названия пунктов меню в панели Timeweb могут слегка отличаться («Сеть», «Firewall», «Защита») — ориентируйтесь по смыслу; официальные подсказки: [документация файрвола Timeweb](https://timeweb.cloud/docs/firewall/upravlenie-fajrvolom).

---

## Часть 1. Открыть консоль сервера (только мышь и браузер)

1. Откройте браузер и перейдите на **`https://timeweb.cloud`**.
2. Войдите в аккаунт (логин / пароль Timeweb).
3. В **левом боковом меню** найдите раздел **«Облачные серверы»** (или **Cloud Servers**) и **один раз нажмите** по нему левой кнопкой мыши.
4. Откроется список серверов. **Нажмите** на строку вашего сервера (например, проект **MyWaveTour** / имя вида **`msk-1-…`**), чтобы открыть **карточку сервера**.
5. На странице сервера найдите вкладку или кнопку **«Консоль»**, **«VNC»**, **«Серийная консоль»** или **«Подключиться»** (Timeweb часто показывает **веб-терминал**). **Нажмите** её.
6. Дождитесь чёрного окна терминала. Если просят логин: введите **`root`**, Enter; пароль — **как вы задавали для сервера** (символы при вводе могут не отображаться — это нормально), снова Enter.
7. Вставка в консоль Timeweb: **`Ctrl+Shift+V`** или правая кнопка мыши → **«Вставить»** (как подсказывает подсказка над консолью).

Дальше все **команды** из частей 2–4 вводите **именно в этом окне** (это Linux **bash**, не PowerShell).

---

## Часть 2. Открыть порт 22 (если с ПК не работает `scp` / таймаут)

Если с домашнего ПК **`Test-NetConnection … -Port 22`** даёт **`False`** или **`scp`** пишет **`Connection timed out`** до **`5.129.249.113`**, сначала проверьте файрвол в панели Timeweb.

### Клики в панели (общая схема)

1. Снова откройте **`https://timeweb.cloud`** (если консоль у вас в другой вкладке — оставьте её, откройте **новую вкладку** для панели).
2. **Облачные серверы** → ваш сервер (тот же, что в части 1).
3. Найдите раздел **«Сеть»**, **«Firewall»**, **«Группы безопасности»** или **«Защита»** (зависит от типа продукта). **Откройте** его.
4. Просмотрите правила для **входящего** трафика:
   - должно быть разрешено **`TCP`**, порт **`22`**, источник **ваш IP** или **все (0.0.0.0/0)** — в зависимости от вашей политики;
   - если стоит **whitelist только «мой домашний IP»**, с **другой сети** или с **GitHub Actions** подключение не пройдёт — временно расширьте правило для проверки, затем сузьте.
5. Сохраните изменения (**«Сохранить»** / **«Применить»**), если панель это предлагает.
6. Подождите **1–2 минуты** и с ПК снова выполните (одна строка, **без** склейки двух команд подряд):

```powershell
Test-NetConnection -ComputerName 5.129.249.113 -Port 22
```

**Важно:** не вставляйте команду **дважды** в одну строку. Неверно: `… -Port 22Test-NetConnection …`. Верно: **одна** строка, в конце **Enter**.

---

## Часть 3. Подготовка каталога на VPS (команды по одной)

В **веб-консоли** Timeweb выполняйте **по одной строке**, после каждой — **Enter**.

```bash
export MW=/opt/mywave/tourism
```

```bash
cd "$MW"
```

```bash
pwd
```

Должно вывести: **`/opt/mywave/tourism`**.

```bash
ls -la scripts/prod_healthcheck.sh
```

```bash
ls -la infra/nginx/mywave.conf
```

Резервные копии перед правкой:

```bash
cp -a scripts/prod_healthcheck.sh "scripts/prod_healthcheck.sh.bak.$(date +%Y%m%d%H%M)"
```

```bash
cp -a infra/nginx/mywave.conf "infra/nginx/mywave.conf.bak.$(date +%Y%m%d%H%M)"
```

---

## Часть 4. Вставить файлы через `nano` (без `scp`)

### 4.1. Скрипт `prod_healthcheck.sh`

1. На **вашем ПК** в **Cursor** откройте файл репозитория: **`scripts/prod_healthcheck.sh`**.
2. **Ctrl+A** (выделить всё) → **Ctrl+C** (копировать).
3. В **веб-консоли** Timeweb выполните:

```bash
nano /opt/mywave/tourism/scripts/prod_healthcheck.sh
```

4. В **nano**: удалите старое содержимое (**Ctrl+K** несколько раз сносит строку под курсором) или сразу вставьте поверх: **Shift+Insert** / **Ctrl+Shift+V** / вставка из меню мыши консоли.
5. Сохранить: **Ctrl+O** → **Enter**.
6. Выйти: **Ctrl+X**.

Проверка, что в файле есть режим insecure:

```bash
grep -nE '_insecure_tls|--insecure' /opt/mywave/tourism/scripts/prod_healthcheck.sh
```

Должны появиться **номера строк** с этими словами. Если пусто — вставка не сохранилась, повторите 4.1.

```bash
chmod +x /opt/mywave/tourism/scripts/prod_healthcheck.sh
```

### 4.2. Файл `infra/nginx/mywave.conf`

1. В **Cursor** откройте **`infra/nginx/mywave.conf`** → **Ctrl+A** → **Ctrl+C**.
2. В консоли:

```bash
nano /opt/mywave/tourism/infra/nginx/mywave.conf
```

3. Вставьте содержимое, **Ctrl+O** → **Enter** → **Ctrl+X**.

Проверка блока health:

```bash
grep -n 'location = /api/health' -A6 /opt/mywave/tourism/infra/nginx/mywave.conf
```

Должна быть строка **`proxy_pass`** на **`…/health`** (не на **`/api/health`** бэкенда).

---

## Часть 5. Проверка nginx и перезапуск прокси (команды по одной)

```bash
cd /opt/mywave/tourism
```

```bash
docker run --rm -v "$PWD/infra/nginx/mywave.conf:/etc/nginx/conf.d/default.conf:ro" -v "$PWD/infra/nginx/certs:/etc/nginx/certs:ro" nginx:1.27-alpine nginx -t
```

Ожидается **`syntax is ok`** и **`test is successful`**.

```bash
export DC='docker compose --env-file .env.production -f docker-compose.production.yml'
```

```bash
$DC up -d --force-recreate reverse-proxy
```

```bash
$DC ps -a
```

---

## Часть 6. Проверки изнутри и healthcheck

```bash
$DC exec reverse-proxy sh -c 'wget -qO- http://api:3001/health'
```

Ожидается ответ с **`ok`** / JSON статуса.

```bash
PROD_HEALTHCHECK_INSECURE_TLS=1 bash /opt/mywave/tourism/scripts/prod_healthcheck.sh
```

Пока на nginx **самоподписанный** сертификат, переменная **обязательна**. В начале stderr должна быть строка про **`--insecure`**.

Ручная проверка с VPS на локальный 443:

```bash
curl -4 -vk --resolve mywavetour.ru:443:127.0.0.1 https://mywavetour.ru/api/health 2>&1 | tail -n 30
```

---

## Часть 7. Если позже заработает `scp` с ПК (PowerShell)

Выполняйте **две отдельные строки** (после первой — **Enter**, потом вторая). Подставьте свой IP, если не **`5.129.249.113`**.

```powershell
Test-NetConnection -ComputerName 5.129.249.113 -Port 22
```

```powershell
scp "F:\Проекты MyWave\NEW2026\Toutism\scripts\prod_healthcheck.sh" "root@5.129.249.113:/opt/mywave/tourism/scripts/prod_healthcheck.sh"
```

```powershell
scp "F:\Проекты MyWave\NEW2026\Toutism\infra\nginx\mywave.conf" "root@5.129.249.113:/opt/mywave/tourism/infra/nginx/mywave.conf"
```

**Не используйте** имя переменной **`$HOST`** в PowerShell. **Не склеивайте** две команды **`scp`** в одну строку через лишний **`&`**.

---

## Часть 8. Запуск **Deploy production** в GitHub (после пуша исправления)

1. Откройте **`https://github.com`** и войдите в аккаунт.
2. Откройте репозиторий **`YaroslavValeev/Turism`** (или ваш форк с тем же workflow).
3. Верхняя вкладка репозитория — **«Actions»** — щёлкнуть один раз.
4. В левом списке workflows выберите **«Deploy production»**.
5. Справа кнопка **«Run workflow»** (выпадающая) — нажать.
6. Ветка: **`main`**. Параметры: **`deploy_mode` = `full`**, **`build_mode` = `incremental`** (или **`full`**, если подозреваете битый кэш Docker).
7. Зелёная кнопка **«Run workflow»** внизу модального окна — нажать.
8. В списке запусков откройте **верхний** (самый новый) workflow run и дождитесь завершения шагов; при ошибке раскройте шаг **«Build and restart api, web, admin on VPS»** и читайте хвост лога (после фикса **`db:generate`** ошибка Prisma на этом шаге не должна повторяться).

---

- Общий плейбук и обходы: **[`TIMEWEB_VPS_COMMANDS.md`](./TIMEWEB_VPS_COMMANDS.md)** (§0).
- Канон путей и имён контейнеров: **[`DEPLOYMENT_CANON.md`](./DEPLOYMENT_CANON.md)**.
- Сети, файрвол, GitHub: **[`TIMEWEB_AND_ACTIONS_LINKS.md`](./TIMEWEB_AND_ACTIONS_LINKS.md)**.
