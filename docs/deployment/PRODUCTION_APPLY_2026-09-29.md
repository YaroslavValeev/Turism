# Production apply runbook — MyWaveTour — 2026-09-29

Статус: **НЕ ВЫПОЛНЯТЬ deploy/migrations/import/cron, пока Owner не снял production STOP по Camp/Tour API.**

Release candidate на момент документа:
`572af19f4be60db4f0b19664916f0ec9f89d8368`

## 1. Что уже в main

- PR #94: owner-only Telegram, Instagram SOCKS + session cookie, manual post fallback, currency, admin search, location fixes.
- PR #95: OSINT discovery playbook + safe SourceProposal importer + 30 candidates.
- PR #96: CI validation of OSINT seed.

## 2. Безопасный preflight — можно выполнять при STOP

```bash
export MW=/opt/mywave/tourism
cd "$MW"
DC=(docker compose --env-file .env.production -f docker-compose.production.yml)

cat .release/REVISION 2>/dev/null || true
"${DC[@]}" ps
curl -4 -sS https://mywavetour.ru/api/health
grep -E '^(TELEGRAM_PUBLIC_BOT_ENABLED|INSTAGRAM_HTTP_PROXY|ANALYTICS_OPS_SCHEDULER_ENABLED)=' .env.production || true
```

Не выводить в консоль:
- `INSTAGRAM_SESSION_ID`
- `TELEGRAM_BOT_TOKEN`
- `INTERNAL_ANALYTICS_TOKEN`
- пароли БД.

## 3. После явного Owner GO — подготовить env

Сначала backup:

```bash
export MW=/opt/mywave/tourism
cd "$MW"
cp -a .env.production ".env.production.bak.$(date -u +%Y%m%dT%H%M%SZ)"
chmod 600 .env.production
```

Owner-only Telegram:

```bash
sed -i '/^TELEGRAM_PUBLIC_BOT_ENABLED=/d' .env.production
printf '\nTELEGRAM_PUBLIC_BOT_ENABLED=false\n' >> .env.production
```

Instagram использует тот же SOCKS relay, что Telegram:

```bash
IG_PROXY="$(sed -n 's/^TELEGRAM_BOT_HTTP_PROXY=//p' .env.production | tail -n1)"
test -n "$IG_PROXY" || { echo "TELEGRAM_BOT_HTTP_PROXY is empty"; exit 1; }
sed -i '/^INSTAGRAM_HTTP_PROXY=/d' .env.production
printf 'INSTAGRAM_HTTP_PROXY=%s\n' "$IG_PROXY" >> .env.production
unset IG_PROXY
```

Instagram sessionid вводить без попадания в shell history:

```bash
read -rsp 'Instagram sessionid: ' IG_SESSION; echo
test -n "$IG_SESSION" || { echo "empty sessionid"; exit 1; }
case "$IG_SESSION" in *';'*|*$'\r'*|*$'\n'*) echo "invalid sessionid"; unset IG_SESSION; exit 1;; esac
sed -i '/^INSTAGRAM_SESSION_ID=/d' .env.production
printf 'INSTAGRAM_SESSION_ID=%s\n' "$IG_SESSION" >> .env.production
unset IG_SESSION
chmod 600 .env.production
```

Проверка только наличия секретов:

```bash
grep -q '^INSTAGRAM_HTTP_PROXY=.' .env.production && echo INSTAGRAM_HTTP_PROXY=ok || echo INSTAGRAM_HTTP_PROXY=missing
grep -q '^INSTAGRAM_SESSION_ID=.' .env.production && echo INSTAGRAM_SESSION_ID=ok || echo INSTAGRAM_SESSION_ID=missing
grep -q '^TELEGRAM_PUBLIC_BOT_ENABLED=false$' .env.production && echo TELEGRAM_PUBLIC_BOT_ENABLED=ok || echo TELEGRAM_PUBLIC_BOT_ENABLED=check
```

## 4. Рекомендуемый deploy

Канон проекта: `Deploy production` → manual `workflow_dispatch`, `deploy_mode=full`, `build_mode=incremental`.

Workflow сам:
- делает backup;
- rsync current committed SHA;
- build;
- `prisma migrate deploy`;
- restart;
- `prod_healthcheck.sh`;
- ingestion trace audit;
- pilot readiness audit.

На VPS нет git checkout/pull.

После успешного workflow:

```bash
export MW=/opt/mywave/tourism
cd "$MW"
DC=(docker compose --env-file .env.production -f docker-compose.production.yml)

cat .release/REVISION
test "$(cat .release/REVISION)" = "572af19f4be60db4f0b19664916f0ec9f89d8368" \
  && echo "release SHA OK" \
  || { echo "STOP: unexpected release SHA"; exit 1; }

"${DC[@]}" ps
PROD_HEALTHCHECK_EXPECTED_SHA="$(cat .release/REVISION)" MYWAVE_ROOT="$MW" bash scripts/prod_healthcheck.sh
```

Если после даты этого документа в main появились новые изменения, сначала заменить expected SHA на новый одобренный release SHA.

## 5. Проверить runtime Instagram без раскрытия secret

```bash
"${DC[@]}" exec -T api sh -lc '
  test -n "$INSTAGRAM_HTTP_PROXY" && echo INSTAGRAM_HTTP_PROXY=ok || echo INSTAGRAM_HTTP_PROXY=missing
  test -n "$INSTAGRAM_SESSION_ID" && echo INSTAGRAM_SESSION_ID=ok || echo INSTAGRAM_SESSION_ID=missing
  echo TELEGRAM_PUBLIC_BOT_ENABLED="${TELEGRAM_PUBLIC_BOT_ENABLED:-false}"
'
```

QA:
1. Instagram profile with several posts.
2. Single-photo publication.
3. Carousel.
4. Reel.
5. Restricted/private profile.
6. Repeat collection after old CDN URL expiration.
7. If Instagram blocks a concrete permalink, paste the post into the owner Telegram bot and verify draft creation via `/check_publish`.

## 6. OSINT proposal import — after GO, not before

Dry-run:

```bash
"${DC[@]}" exec -T api sh -lc 'cd /app && pnpm osint:proposals:validate'
```

Expected: `total=30`, regions 10/10/10, no DB writes.

Import to `SourceProposal(status=pending)`:

```bash
"${DC[@]}" exec -T api sh -lc 'cd /app && pnpm osint:proposals:import'
```

This does **not** activate Source, start collection, or publish anything.

## 7. Create missing score snapshots — one-shot after GO

```bash
"${DC[@]}" exec -T api sh -lc '
  test -n "$INTERNAL_ANALYTICS_TOKEN" || { echo INTERNAL_ANALYTICS_TOKEN=missing; exit 1; }
  node -e '\''fetch("http://127.0.0.1:3001/internal/analytics/scores/recalculate", {
    method: "POST",
    headers: { authorization: "Bearer " + process.env.INTERNAL_ANALYTICS_TOKEN }
  }).then(async r => {
    const body = await r.text();
    console.log(r.status, body);
    if (!r.ok) process.exit(1);
  }).catch(e => { console.error(e); process.exit(1); })'\''
'
```

Verify snapshot counts:

```bash
"${DC[@]}" exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "
SELECT '''organizer_snapshots=''' || count(*) FROM organizer_score_snapshots;
SELECT '''program_snapshots=''' || count(*) FROM program_score_snapshots;
"'
```

Expected effect: admin no longer says `P3 · ждём snapshot` merely because a snapshot never existed. With insufficient booking/view samples, bands may correctly remain `unknown` / `insufficient_data`.

## 8. Scheduler policy

Current owner-approved production policy:
- ingestion scheduler: external cron only;
- internal scheduler: disabled;
- no new cron/timer during current production STOP.

Therefore do **not** set `ANALYTICS_OPS_SCHEDULER_ENABLED=1` as part of this release. One-shot score calculation is enough for acceptance.

## 9. Rollback

Workflow writes the latest release backup path to:

`/var/lib/mywave-tourism/last-release-backup`

Inspect:

```bash
cat /var/lib/mywave-tourism/last-release-backup
ls -lh "$(cat /var/lib/mywave-tourism/last-release-backup)"
```

Do not perform a DB/data rollback without a separate owner-approved rollback decision.
