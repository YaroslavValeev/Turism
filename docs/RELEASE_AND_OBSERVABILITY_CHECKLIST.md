# Release readiness / observability / QA path (pilot-ready)

Минимальный checklist без overengineering.

## Observability

| Элемент | Состояние |
|---------|-----------|
| Health check | GET /health возвращает { status: "ok" }. |
| Логирование ошибок API | Критичные ошибки (5xx, необработанные исключения) логируются в консоль (или в лог-файл при деплое). Без персональных данных в логах. |
| Лог-формат | Рекомендация: одна строка на событие, уровень (error/warn/info), сообщение, при необходимости requestId. |

## QA path

### Smoke (после деплоя)

- [ ] GET /health → 200
- [ ] POST /auth/login (admin) → 200, получен токен
- [ ] GET /organizers с Bearer → 200
- [ ] GET /programs с Bearer, ?all=1 → 200
- [ ] GET /bookings с Bearer → 200
- [ ] GET /incidents с Bearer → 200
- [ ] GET /reviews с Bearer → 200
- [ ] GET /commissions с Bearer → 200
- [ ] GET /metrics/admin/funnel с Bearer → 200

### Regression (ключевые сценарии)

- [ ] Создать организатора → обновить verification-status → проверить audit_log
- [ ] Создать программу (draft) → добавить медиа → пройти publish gate → PATCH publish-status → published
- [ ] POST /bookings (public): programId + guestContact для опубликованной программы → 201
- [ ] GET /bookings/:id (admin) → nextStatuses присутствуют; PATCH status new → reviewed → audit записан
- [ ] Довести бронирование до completed; создать Review для этого bookingId; PATCH moderation approved
- [ ] Создать Commission для completed booking (POST /commissions); PATCH reconciliation
- [ ] Создать Incident; PATCH incident status

## Pilot readiness (предусловия)

- [ ] Один регион/ниша в конфиге (уже задано в startup_config).
- [ ] 1–2 организатора в статусе trusted или verified (ручная верификация по VERIFICATION_LADDER).
- [ ] Каждое тестовое бронирование верифицируется вручную (assisted booking), до completed только после подтверждения.
- [ ] Нет публичных платежей, нет self-serve booking, нет публичной auth.

**Pilot pre-launch (детальный чеклист):** [PILOT_PRELAUNCH_CHECKLIST.md](PILOT_PRELAUNCH_CHECKLIST.md) — E2E path, verification flow, smoke, конфиг перед go-live.

## Что не входит (no overengineering)

- Распределённый трейсинг, метрики в Prometheus/Graphana на этапе пилота не обязательны.
- Сложные алерты — достаточно ручной проверки по checklist после деплоя.
