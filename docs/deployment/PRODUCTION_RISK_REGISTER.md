# Production Risk Register (Gate A)

## Цель
Единый реестр blocker/critical рисков перед production-релизом MyWave Travel на Timeweb с назначенными владельцами и дедлайнами.

## Статусы
- `open` — риск не закрыт
- `mitigating` — в работе
- `accepted` — принято временно с ограничениями
- `closed` — закрыт и перепроверен

## Реестр рисков

| ID | Область | Severity | Риск | Владелец | Срок | Статус | Критерий закрытия |
|---|---|---|---|---|---|---|---|
| R-001 | Security/API | blocker | Нет rate limiting на публичных endpoint и webhook | Backend | T-5 дней | open | Rate-limit включен и покрыт smoke/negative тестом |
| R-002 | Auth/RBAC | blocker | Реально поддержан только admin, нет полной матрицы user/organizer/admin | Backend | T-5 дней | open | RBAC матрица и проверки доступа на ключевых endpoint |
| R-003 | Secrets | critical | Секреты присутствовали в tracked `.env` | DevOps | T-6 дней | open | Ротация ключей, перенос в secret store, подтверждение revoke |
| R-004 | Error Handling | critical | API местами отдает внутренние сообщения ошибок | Backend | T-4 дней | open | Единый error envelope без stack/internal details |
| R-005 | Privacy | critical | Логирование email/telegram username в открытом виде | Backend | T-4 дней | open | Редакция PII в логах + ручная проверка логов |
| R-006 | Data Model | critical | Статусы заявок/бронирований без DB-ограничений | Backend + DBA | T-4 дней | open | Миграция с check constraints + rollback SQL |
| R-007 | Frontend/SEO | critical | Нет canonical/sitemap/robots + слабые метаданные PDP | Frontend | T-4 дней | open | SEO базовый комплект добавлен и проверен |
| R-008 | Frontend URLs | critical | Dev/placeholder ссылки (`localhost`, `mywave.local`) в UI | Frontend | T-3 дня | open | Удалены/заменены на production-safe |
| R-009 | Infra | critical | Нет закрепленного reverse proxy + HTTPS runbook | DevOps | T-3 дня | open | Конфиг и шаги деплоя/отката в runbook |
| R-010 | Storage | critical | Media хранилище без явной persistent стратегии | DevOps | T-3 дня | open | Persistent volume или object storage policy |
| R-011 | Backup | critical | Нет проверенной процедуры backup/restore БД | DevOps + DBA | T-2 дня | open | Успешный restore test на staging |
| R-012 | QA Gate | blocker | Нет финального evidence-пакета smoke/regression | QA Lead | T-1 день | open | QA отчет + закрыты все blocker/critical |

## Принципы эскалации
- Любой `blocker` в статусе `open/mitigating` на T-0 = `NO-GO`.
- `critical` допускается только как `accepted` с подписанным owner decision и компенсирующей мерой.
- После каждого закрытия риска обязателен независимый re-check (peer review или QA).

## Контрольные точки
- T-6..T-4: Security/API/Secrets baseline.
- T-3..T-2: Infra, backup/restore, migration rehearsal.
- T-1: QA evidence + финальный go/no-go созвон.
