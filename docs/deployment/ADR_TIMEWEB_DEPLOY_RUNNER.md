# ADR: Timeweb deploy runner strategy

## Status

Accepted (current policy), self-hosted deferred.

## Context

Production deploy выполняется через GitHub Actions `workflow_dispatch` и rsync по SSH на VPS (канон каталога: **`/opt/mywave/tourism`**).
Наблюдались периодические сетевые сбои:

- SSH probe timeout до VPS:22 (exit 255)
- периодические фейлы на долгих сетевых операциях

При этом owner policy: controlled deploy only, без auto-deploy on push.

## Decision

До отдельного этапа инфраструктуры сохраняем текущую модель:

- `Deploy policy: manual workflow_dispatch only`
- `Autodeploy on push: disabled`
- `Self-hosted runner: deferred (ADR required before implementation)`

## Options considered

### Option A — GitHub hosted runner -> SSH/rsync to VPS (current)

Pros:

- уже внедрено и работает
- минимальная эксплуатационная сложность
- нет отдельного runner-хоста

Cons:

- зависимость от внешней сети GitHub/Azure -> Timeweb
- периодические SSH timeout/нестабильность канала

### Option B — Self-hosted runner on VPS

Pros:

- меньше внешних сетевых рисков
- локальный deploy pipeline на самом VPS

Cons:

- дополнительная поверхность атаки
- операционное обслуживание runner и hardening
- требуется отдельный security review

## Consequences

- Сохраняем controlled deploy с ручным запуском.
- Для устойчивости используем runbook/ретраи/keepalive и fallback ручного выката.
- Возврат к self-hosted runner рассмотреть после pilot в отдельном инфраструктурном спринте.
