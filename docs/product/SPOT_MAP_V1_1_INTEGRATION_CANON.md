# MyWave Spot Map v1.1 — integration canon

Status: implementation canon  
Date: 2026-09-29

## Product boundary

Spot Map is a native module of the existing MyWaveTour monorepo, not a separate production Flask service.

The travel marketplace and Spot Map remain different product contours:
- MyWaveTour Travel: programs, organizers, assisted booking, ingestion, OSINT supply.
- Spot Map: discovery and independent quality assessment of concrete sports services/spots.

They may share infrastructure, identity, organizer records and public navigation, but their trust semantics must not be mixed.

## MVP discipline

Official rating MVP is **wakesurf**. Wakeboard and water-ski disciplines receive separate protocols and rating snapshots later; a wakesurf score must never be reused as their score.

## Official rating unit

The unit is a **concrete service at a concrete spot with the tested equipment configuration**. A score for one boat does not describe the whole fleet.

## Approved v1.1 weights

- infrastructure: 25%
- sporting instrument: 25%
- water area: 15%
- personnel: 15%
- safety: 10%
- atmosphere/community: 10%

The six weights are configuration data and sum to 100%.

## Mandatory gates

All eight must be PASS before an official rating can be published:

- G01 working instrument
- G02 suitable/safe water area
- G03 closed changing room
- G04 toilet
- G05 working hot shower
- G06 safety briefing
- G07 first-aid/rescue equipment
- G08 safety system

UNKNOWN is not zero. FAIL or UNKNOWN blocks publication; a high weighted average cannot compensate for a gate.

## Trust rules

An official rating requires:
- a real professional test for the discipline;
- criterion evidence;
- real media evidence, not generated evidence;
- expert signature;
- an explicitly approved methodology version;
- all mandatory gates PASS;
- a non-expired test;
- for a MyWave-related spot: external expert + independent editor.

Reviews, advertising, questionnaires, OSINT data, sponsorship and payment never create or alter the official score.

## Versioning and history

Persist separately:
- methodology_version
- criteria_version
- protocol_version
- rating_version

Published rating snapshots are immutable. A new assessment creates a new version/snapshot rather than overwriting history.

Plan reassessment 12 calendar months after a full professional test. A club-requested reassessment is not the same as closing a defect or handling an appeal.

## Public score and band

Round the weighted result exactly once to one decimal using ROUND_HALF_UP. Public band is derived from the shown score:

- 9.0–10.0: Premium+
- 7.5–8.9: Premium
- 6.0–7.4: Standard
- 4.0–5.9: Basic
- below 4.0: Below Standard

No valid official rating means no numeric 0.0 placeholder.

## G05 hot-shower remediation

G05 is the only approved remote-remediation exception in v1.1:
- keep the original real professional test and its criterion results;
- club supplies evidence;
- trusted editor/moderator verifies the spot and that hot water actually works;
- record decision, author, time, evidence and rationale;
- accepted remediation changes G05 to PASS;
- if score-bearing criteria themselves changed, an expert must confirm those changes before a new signature;
- remediation does not extend the professional-test expiry;
- no automatic publication;
- this exception does not extend to safety gates or replacement of tested sporting equipment.

## Native implementation sequence

1. Rating domain engine + tests.
2. PostgreSQL models and migrations for spot, service/equipment unit, audit/test, evidence, gate results, immutable rating snapshots, remediation and appeals.
3. Admin/editor API and UI.
4. Public API: catalog/detail/compare/methodology.
5. Web: /spots, /spots/[id], /spots/compare and map.
6. Import candidate registry as unrated discovery data.
7. Real pilot audits; only then enable official rating publication.

Do not import synthetic demo ratings into production.
