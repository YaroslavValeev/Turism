# Admin editorial workspace

Scope: admin presentation only. No API, database, publication rules, ingestion, ports, Compose or environment changes.

## Behaviour

- Candidate lists show saved source covers, bounded display headings, existing status and date/location facts. Full source headings and scores remain in a disclosure. Stored titles and descriptions are not rewritten.
- The selected candidate shows original media references, date, organizer, location, level, duration, price and description. Missing values stay explicit; unavailable images show an original-source review message. No generated photographs or invented conditions are added.
- Explicit video metadata is preserved even when the URL has no file extension. The existing original-source link and Telegram media transport remain available.
- Publication/rejection remain explicit existing actions after the preview. Cancelling the rejection prompt sends no rejection. Fast selection ignores older responses.
- Pipeline buttons use the existing design system. Long titles wrap, with the complete text available in a disclosure. Material column widths do not affect publication/metrics tabs.
- Shared table wrappers no longer impose a second vertical scroll or a forced horizontal scrollbar. Truly wide operational tables still scroll horizontally: the ten-column programme editor has not been silently hidden or removed.
- Sidebar takes 248px on desktop and no margin on mobile. Keyboard focus remains visible.

## Local verification (PowerShell, repository root)

```powershell
pnpm run test:web:ux
pnpm --filter admin exec tsc --noEmit
pnpm --filter admin build
```

Run Next builds sequentially. Browser checks use an isolated local fixture API, not production tokens, data or publication jobs. Test 1366px and 390px widths, long Instagram captions, missing facts/media, original image/video references, candidate selection and cancellation. Verify document width does not exceed viewport and main content has no nested vertical scrollbar. On mobile only the wide table itself may scroll sideways.

## Docker verification (repository root)

```powershell
docker build -f apps/admin/Dockerfile -t tourism-admin-editorial:qa .
docker run --rm --name tourism-admin-editorial-qa -p 127.0.0.1:3302:3002 tourism-admin-editorial:qa
```

Check `/login`, `/event-candidates`, `/content-pipeline` return admin HTML and security headers. HTTP/SSR checks do not prove authenticated business actions. Stop only the named QA container.

## Before deployment

Use a pinned commit with green CI. Capture current admin image ID, build arguments and configuration hashes, plus API/web image IDs. Check free disk; the previous S2 observation had only 4.6 GiB free. Back up the admin source and old image before building. Build and replace only admin; do not run a whole-stack `up --build`. Verify source/label identity, nginx upstream and authenticated page rendering, and assert API/web IDs and env/database remain unchanged. Do not publish a candidate or run ingestion as a smoke check.

Rollback: recreate only admin using its saved original image and unchanged runtime configuration. No schema rollback or database restore is required for this presentation change. A future redesign of the dense programme editor is a separate, explicitly verified change.
