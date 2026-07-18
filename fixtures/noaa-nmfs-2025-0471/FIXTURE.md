# Frozen Fixture — NOAA-NMFS-2025-0471 · FR Doc 2026-13808
### DocketBound primary demo case · FROZEN — the demo reads ONLY from this snapshot, never live

## Verified identity (extracted from official raw snapshot, cross-checked)
- **Title:** Fisheries of the Caribbean, Gulf of America, and South Atlantic; **Puerto Rico Fishery Management Plan; Amendment 4**
- **Type:** Proposed Rule · **Agencies:** Commerce Department / National Oceanic and Atmospheric Administration (NOAA, NMFS)
- **Federal Register:** Doc **2026-13808** · Vol. 91, No. 129 · Pages 42158–42165 · **Published 2026-07-08**
- **Docket:** NOAA-NMFS-2025-0471 (internal FR docket ref: 260706-0162)
- **Comments close: 2026-08-07** — window OPEN at retrieval time (live, judge-verifiable deadline)
- **Official comment portal:** https://www.regulations.gov/commenton/NOAA-NMFS-2025-0471-0005

## Provenance
- **Retrieved (UTC):** 2026-07-18T19:55:59Z (AST 2026-07-18 15:55) — see `raw/RETRIEVAL-TIMESTAMP.txt`
- **Sources (all HTTP 200):**
  1. `raw/fr-2026-13808.json` ← https://www.federalregister.gov/api/v1/documents/2026-13808.json
  2. `raw/fr-2026-13808-fulltext.txt` (51,433 B) ← https://www.federalregister.gov/documents/full_text/text/2026/07/08/2026-13808.txt
  3. `raw/regulations-gov-docket.html` ← https://www.regulations.gov/docket/NOAA-NMFS-2025-0471 — **note:** SPA shell only (JS-rendered site); substantive authority = the Federal Register snapshots, which are the official publication of record.
- **SHA-256:** see `raw/SHA256SUMS.txt`
  - `7f8fb5b7…c07bdb` fr-2026-13808.json
  - `1ef25fe4…34196f` fr-2026-13808-fulltext.txt
  - `655d3523…ae5e83e` regulations-gov-docket.html

## Usage rules (binding for the build)
1. The demo's docket loader reads exclusively from `raw/` — no network calls to FR/regulations.gov at runtime.
2. Deadline + participation instructions shown in Act 1 come from the JSON fields (`comments_close_on`, comment URL) and the full-text ADDRESSES section — source-span-bound like any other evidence.
3. Any claim in the participation packet that references the rule must bind to an exact span of `fr-2026-13808-fulltext.txt`.
4. Fallback case remains PC1213 (proven in prod); fixture loader is case-agnostic.
