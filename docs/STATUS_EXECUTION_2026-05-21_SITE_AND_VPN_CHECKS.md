# Site launch / VPN / auto-update verification — 2026-05-21

## What was possible from this environment

Attempted remote checks from the current execution environment:

1. `curl -I -m 20 https://mywavetour.ru/`
2. `curl -I -m 20 https://www.mywavetour.ru/`
3. `curl -m 20 https://mywavetour.ru/api/health`
4. `curl -m 20 https://api.mywavetour.ru/health`

Result for all attempts: `CONNECT tunnel failed, response 403` (envoy).

Conclusion: this environment cannot be used as a reliable external probe of public site availability (network egress limitation).

## Exact commands for owner to verify "without VPN" and runtime freshness

Run **from your local machine without VPN** first, then repeat with VPN enabled.

```bash
# 0) DNS resolution (must return public IPs)
nslookup mywavetour.ru
nslookup www.mywavetour.ru
nslookup api.mywavetour.ru

# 1) Basic HTTPS availability
curl -I --max-time 20 https://mywavetour.ru/
curl -I --max-time 20 https://www.mywavetour.ru/
curl --max-time 20 https://mywavetour.ru/api/health
curl --max-time 20 https://api.mywavetour.ru/health

# 2) Compare no-VPN vs VPN results
# (repeat same 4 curl commands after enabling VPN)

# 3) Check HTTP code only (quick monitoring-friendly)
curl -s -o /dev/null -w "%{http_code}\n" https://mywavetour.ru/
curl -s -o /dev/null -w "%{http_code}\n" https://mywavetour.ru/api/health

# 4) Check redirects/cert chain
curl -IL --max-time 20 https://mywavetour.ru/
openssl s_client -connect mywavetour.ru:443 -servername mywavetour.ru </dev/null 2>/dev/null | openssl x509 -noout -issuer -subject -dates
```

## Exact commands on VPS to verify that latest deploy is actually running

```bash
# run on Timeweb VPS
cd /opt/mywave/tourism

# containers are up
docker compose --env-file .env.production -f docker-compose.production.yml ps

# recent logs (api/web/admin)
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail 120 api web admin

# API health from inside VPS
curl -sS http://localhost:3001/health

# through nginx route on VPS itself
curl -sS -k https://localhost/api/health

# if image tag/SHA is exposed in logs, capture it
docker compose --env-file .env.production -f docker-compose.production.yml images
```

## Exact commands to verify auto-update/content freshness

```bash
# 1) Trigger ingestion cycle manually (if operationally allowed)
cd /opt/mywave/tourism

docker compose --env-file .env.production -f docker-compose.production.yml exec -T api pnpm exec tsx prisma/run_ingestion_cycle.ts --auto-publish

# 2) Check latest source runs in DB

docker compose --env-file .env.production -f docker-compose.production.yml exec -T db psql -U postgres -d mywave -c "\
SELECT id, status, started_at, finished_at\
FROM source_runs\
ORDER BY started_at DESC\
LIMIT 10;"

# 3) Check recently published programs

docker compose --env-file .env.production -f docker-compose.production.yml exec -T db psql -U postgres -d mywave -c "\
SELECT id, title, updated_at\
FROM programs\
ORDER BY updated_at DESC\
LIMIT 20;"

# 4) Public API sample after update
curl -sS https://mywavetour.ru/api/programs?limit=20 | head -c 800
```

## Acceptance criteria

- Without VPN: `https://mywavetour.ru/` and `https://mywavetour.ru/api/health` return 2xx/3xx.
- With VPN: behavior is not the only working mode; if only VPN works, investigate DNS/firewall/provider path.
- VPS local health: `http://localhost:3001/health` returns OK JSON.
- After ingestion run, new `source_runs` records appear and `programs.updated_at` changes for affected items.
