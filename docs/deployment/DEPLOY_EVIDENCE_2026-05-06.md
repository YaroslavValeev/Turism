# DEPLOY EVIDENCE — 2026-05-06

**Окружение:** production (Timeweb VPS, проект MyWaveTour)  
**Версия / git SHA:** `заполнить после git pull на Timeweb: git rev-parse HEAD`  
**Ответственный:** owner  

## Связанные артефакты

- Источники и SQL: [`SOURCE_INVENTORY_2026-05-06.md`](./SOURCE_INVENTORY_2026-05-06.md)
- Gates: [`../gates/GATE1_LOCAL_GREEN_SMOKE.md`](../gates/GATE1_LOCAL_GREEN_SMOKE.md), [`../gates/P1_CHECKPOINT.md`](../gates/P1_CHECKPOINT.md)
- CI: деплой только **`workflow_dispatch`** — [`.github/workflows/deploy-production.yml`](../../.github/workflows/deploy-production.yml)

---

## 1. Docker

Вставьте актуальный вывод после выката этого SHA:

```bash
docker compose -f docker-compose.production.yml ps
```

```text
(заполнить)
```

---

## 2. DNS / TLS

| Хост | Назначение | Проверено |
|------|------------|-----------|
| `mywavetour.ru` | web | |
| `admin.mywavetour.ru` | admin | |
| `api.mywavetour.ru` | api | |

---

## 3. Health

```bash
curl -sS "https://api.mywavetour.ru/health"
```

```text
(ожидаемо: {"status":"ok"})
```

---

## 4. Миграции

```bash
docker compose -f docker-compose.production.yml exec api sh -lc \
  'cd /app/services/api && pnpm exec prisma migrate deploy'
```

```text
(вставить последнюю строку статуса; ожидаемо: нет pending)
```

---

## 5. БД — inventory (зафиксировано SQL)

Сводка из [`SOURCE_INVENTORY_2026-05-06.md`](./SOURCE_INVENTORY_2026-05-06.md):

| Метрика | Значение |
|---------|----------|
| `organizers` | 17 |
| `sources` | 86 |
| по типам (все `isActive`) | site **56**, instagram **20**, telegram **10** |
| `type = website` | 0 |
| дубликаты `(type, urlOrHandle)` | 0 |

Импорт реестра v5 (повторный прогон): `{ "total": 68, "created": 0, "updated": 68 }`.

---

## 6. Prod env guardrails

Проверить, что переменные реально попадают в процесс API (не только в файл на хосте):

```bash
docker compose -f docker-compose.production.yml exec api sh -lc \
  'env | sort | grep -E "^(APP_ENV|PILOT_MODE|LEGAL_CONSENT|SEED_DEMO|AI_|INGESTION_AUTOPUBLISH)="'
```

Чеклист имён см. в `services/api/.env.example` (блок Timeweb guardrails) и в SOURCE_INVENTORY.

```text
(вставить вывод; если виден только APP_ENV — перезапустить api после правки env_file)
```

---

## 7. Security

- [ ] Утечённый GitHub PAT отозван; новый токен не в git / скринах / markdown с секретами.

---

## 8. Smoke (публичный API + админ)

- [ ] `POST /bookings` без `legalConsent` → **400**
- [ ] `legalConsent: true` → **201**, есть `legalConsentAt`
- [ ] повтор в окне дубликата → **409**
- [ ] `GET /metrics/pilot-kpi` без JWT → **401**
- [ ] Web / Admin открываются по HTTPS

Команды: см. [`../gates/GATE3_TIMEWEB_EVIDENCE.md`](../gates/GATE3_TIMEWEB_EVIDENCE.md).

---

## 9. Images / media (P1 UX blocker)

Симптом до фикса: карточки загружались, но часть изображений в каталоге была broken (массовые ошибки во вкладке Network → Img).

### Кодовый фикс в релиз-кандидате

- `apps/web/src/components/ProgramCard.tsx` — `onError` fallback на placeholder.
- `apps/web/src/components/ProgramRailCard.tsx` — `onError` fallback на placeholder.
- `apps/web/src/lib/programCardCover.ts` — фильтр битых literal URL (`null` / `undefined` / `/null` / `/undefined`).
- `apps/web/public/images/placeholders/program-card.svg` — production-safe placeholder.

### Проверка на сервере

```bash
# 1) Вытащить URL программ и убедиться, что нет явных /undefined /null
curl -fsS https://mywavetour.ru/api/programs | head -c 3000

# 2) Если есть jq:
curl -fsS https://mywavetour.ru/api/programs | jq '.. | objects | select(.title? or .name?) | {title: (.title // .name), imageUrl: (.imageUrl // .coverImageUrl // .coverUrl // .image // null), media: (.media // null)}' | head -80

# 3) Проверить headers по 1-2 проблемным URL
curl -I "https://mywavetour.ru/<broken-image-path>"

# 4) Проверить nginx/static handling
cd /opt/mywave/toutism
docker compose -f docker-compose.production.yml exec reverse-proxy nginx -T | grep -Ei "uploads|media|images|static|_next" -n || true
```

### Acceptance criteria

- [ ] На главной/каталоге нет broken image icon.
- [ ] Карточка показывает либо реальную картинку, либо `/images/placeholders/program-card.svg`.
- [ ] В DevTools Network → Img нет массовых 404/400.
- [ ] API не отдаёт image URL вида `/undefined`, `/null`, `null`, `undefined`.
- [ ] После `docker compose up -d --build web reverse-proxy` поведение подтверждено.
