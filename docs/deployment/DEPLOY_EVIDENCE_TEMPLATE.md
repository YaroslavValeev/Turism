# DEPLOY EVIDENCE — YYYY-MM-DD

**Окружение:** production / staging (указать)  
**Версия / git SHA:** `____________`  
**Ответственный:** `____________`  

> Скопируйте файл в корень `docs/deployment/DEPLOY_EVIDENCE_YYYY-MM-DD.md` с реальной датой и заполните все разделы перед признанием production-ready.

---

## 1. Docker

```text
# Вставьте вывод:
docker compose -f docker-compose.production.yml ps
```

Краткое описание сервисов: `api`, `web`, `admin`, `postgres`, `reverse-proxy` — да/нет.

---

## 2. DNS / TLS

| Хост | Назначение | Проверено (да/нет) |
|------|------------|--------------------|
| | web | |
| | admin | |
| | api | |

**TLS:** срок действия, issuer, auto-renewal.  
**Команда проверки (пример):** `curl -sSI https://api._ /health`

---

## 3. Health

```text
curl -sS "https://<API_BASE>/health"
# ожидаемо: {"status":"ok"} или согласованный контракт
```

---

## 4. Миграции

- Команда: `pnpm exec prisma migrate deploy` (где применяли).  
- Последняя миграция: `__________`  
- Статус: success / с заметками: `__________`

---

## 5. Nginx

- Файл конфига: `infra/nginx/...`  
- Проверка: `nginx -t` (если применимо) + доступность путей.

---

## 6. Telegram (webhook **или** polling — один режим)

**Выбранный режим:** `webhook` / `polling`  

- URL webhook / путь: `__________`  
- Или: описание polling (interval, unit, log).  
- Ссылка на runbook: `docs/deployment/TELEGRAM_CONTENT_WEBHOOK_RUNBOOK.md` (и дополнения).

**Скриншот/лог** подтверждения доставки updates (без токенов): приложить ссылку или путь.

---

## 7. Smoke API

| Проверка | Ожидание | Факт (код) |
|----------|----------|------------|
| `GET /health` | 200, ok body | |
| `GET` программы (ваш публичный путь) | 200 + JSON | |
| `POST /bookings` без `legalConsent` | **400** `legal_consent_required` | |
| `POST /bookings` (тело теста) | **201** | |
| Повтор тот же запрос (duplicate window) | **409** | |

**curl лог** (PII обрезать):

```text
# вставьте
```

---

## 8. Admin

- URL: `https://<admin>/login`  
- Проверка: вход, 1–2 ключевых раздела.  
- Скрин (без сессионных куков): `__________`

---

## 9. Logs

| Источник | Путь / команда | PII redaction |
|----------|----------------|---------------|
| API | | да/нет |
| Nginx | | |
| DB | | |

**Пример tail** (без секретов, ≤20 строк): вставить ниже.

```text

```

---

## 10. Backup

- Команда backup:  
- Размер файла / время:  
- Место хранения:  

**Restore (staging or rehearsal):** да/нет, дата, результат.

---

## 11. Rollback

- Сверка с `docs/deployment/ROLLBACK_RUNBOOK.md`  
- Дата/результат репетиции: `__________`  
- Кто подтвердил: `__________`

---

## 12. Итоговое решение

- [ ] Evidence полный, production **разрешён**  
- [ ] Нужны доработки: `__________`

**Подпись / дата:** `__________`
