# Preserve distinct public listings — 2026-10-23

## Reproduction

A read-only public GET returned 122 programs. Running the deduplication source
identical to web revision `907464be6a7b` locally reduced those to 118. It removed:

- raceenduro/2871 behind raceenduro/2878 (two different named race posts);
- Mountain Guru alp/0_84 and trad/0_2 behind climb/0_64 (first ascents behind a
  climbing school in Turkey);
- BirdTravel's Kazakhstan/Ridder tour behind the Mamay ski tour.

These records share importer-supplied dates/organizers/region labels. Those
attributes do not establish that the underlying programs are the same. The
old loose key ignored titles, source URLs, precise locations and disciplines;
the subsequent strict key still ignored title and source identity.

## Bounded fix

Web display only. A fixed-date pair may collapse only when a specific HTTP(S)
source item URL, normalized title and the existing event signature all match.
Missing/malformed/credential-bearing URLs and organizer homepages do not count
as item identity. On-request tours keep separate IDs. Existing quality ranking
still picks a deterministic fuller card for proven same-item duplicates.

This deliberately prefers visible duplicate candidates over silently hiding
different programs. Different posts about the same trip may both remain until
an independently verified canonical event relation exists. No heuristic title
similarity, new domain alias, source fetch or runtime setting is introduced.

## Validation / release boundary

Regression cases cover the observed collision shapes, distinct source/title/
organizer/discipline/location/date/duration, absent sources, on-request tours,
quality ranking, tie order and input immutability. The tests are wired into the
existing web unit command and committed-SHA quality workflow.

All 24 focused regression tests passed locally. An existing quality-preference
fixture was made explicitly same-source, because dates alone no longer justify
merging. At `2026-10-23T19:49:15.819Z`, a fresh public catalog GET replayed through
the local candidate retained **122/122** programs, with no excluded IDs and all
four known hidden records retained. This is local pure-function evidence, not
proof of deployment or rendered/browser acceptance of the candidate.

This change does not correct source data or dates, write production rows, change
media/notifications or prove full device/browser acceptance. Verify the exact
candidate on the current public catalog, CI builds and isolated Docker tests
before a separately approved web-only rollout. Production remains unchanged.

Rollback is web-image-only: retain and restore the previous web image through
the existing guarded web rollout procedure. No database restore is appropriate.
