# UX remediation — discovery to inquiry

## Goal and scope

Make the public journey from choosing a trip to registering an inquiry predictable and truthful. This change is based on the live UX audit of MyWaveTour. It does not certify a subjective 10/10 score or production readiness.

Implementation starts from `origin/main` at `96b9665` in an isolated worktree. Pre-existing changes in the original checkout are not included. Backend contracts, database schema, deployment configuration and Telegram integrations are unchanged.

## Changes

- One catalogue and one filter form replace competing discovery controls and rails. Filters are encoded in the URL, can be removed individually and survive the link to a trip and back.
- Empty results remain empty. No other region, other discipline, expired offer or demo price is substituted.
- Dates, levels and formats have explicit semantics. An all-level festival is not automatically presented as suitable for beginners or children.
- Loading, failure, retry and empty states have clear next actions. Invalid date ranges are explained.
- The header is compact and wraps on small screens. Primary buttons use dark teal with white text; controls have visible focus and larger targets. Reduced-motion preferences are respected.
- Cards show key facts and an explicit unknown-price state. Source-derived information is distinguished from organizer claims.
- Topic-page CTAs lead to the trip catalogue. Organizer intake has the correct description label, a kite option and expandable contract information.
- Inquiry contact validation, consent errors and submission feedback are visible. Success requires a persisted ID. HTTP 409 references the existing inquiry. The UI does not claim delivery to an organizer or promise a 24-hour response.
- Long sourced descriptions are expandable and dated promotional claims are qualified. Secondary discovery links follow the decision and inquiry sections.
- Empty editorial pages link to the catalogue. Technical implementation errors are not exposed in these public states.
- Unused automatic slideshow, duplicate filmstrip and fake favorite/demo-card code are removed.

## Validation commands

```sh
pnpm install --frozen-lockfile
pnpm run build:deps
pnpm run test:web:ux
pnpm --filter web build
pnpm --filter api exec vitest run --maxWorkers=2
git diff --check
```

`test:web:ux` is part of `test:unit`, so the existing committed-SHA quality workflow runs the regression tests.

For a local production-mode preview, set `NEXT_PUBLIC_API_URL` and `API_INTERNAL_BASE_URL` in `apps/web/.env.local` to the isolated local API before building. The browser API origin must be present at build time for CSP. Never copy production credentials into the preview.

For Docker, use the existing `apps/web/Dockerfile` with a clean source-only build context that excludes `.env*`, `node_modules` and `.next`. Run the existing image on an unused local port, without production tokens. Do not start the production Compose stack alongside services already using ports 80/443.

## Acceptance checks

- A non-matching region shows zero trips and a clear reset action.
- A sport filter never substitutes a different sport or a demo card.
- A date range remains visible after opening a trip and returning to results.
- Missing/invalid contact and unchecked consents produce accessible feedback.
- A valid inquiry is stored once and displays its ID; an immediate duplicate resolves to that ID.
- Full and expired trips cannot receive inquiries through the API.
- Mobile layouts have no horizontal overflow; primary controls remain readable and reachable.
- Topic CTAs do not send travelers to organizer publication forms.

## Remaining external acceptance

Before deployment, review the PR and its committed-SHA CI evidence. On an authorized staging environment, verify the complete inquiry handoff with a real organizer, confirm operational response expectations and test with representative travelers on real devices. Have an editor confirm program prices, dates, participation categories, source identity and media rights. Local fixtures and automated checks are not evidence of those external outcomes.

## Risk and rollback

The principal change is the public discovery layout. Old anchor aliases are retained where useful, and backend URLs and request shapes remain compatible. The catalogue may look smaller because unrelated and expired results are no longer used as fallbacks. Unknown conditions are intentionally shown as requiring confirmation.

Rollback by reverting this PR and redeploying the previous web image. No database migration or data rollback is required. The isolated local verification database is not part of the deliverable.
