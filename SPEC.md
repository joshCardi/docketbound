# DOCKETBOUND — Product Spec v2.0 (FINAL · FROZEN)
### OpenAI Build Week · Track: Work & Productivity · Deadline: Tue Jul 21, 5:00 PM PT
**Everything that does not strengthen `verified docket → challenged claim → human decision → grounded diff` gets amputated.**

## Brand architecture (visible vs internal)
- **Visible brand:** DOCKETBOUND · Descriptor: **Evidence-Bound Public Participation** · Visible loop: **Deadline-to-Defense**
- **Internal only** (never in pitch): La Prueba (verifier) · Ponencia Loop (disclosed pre-existing baseline) · Motor de Cruces (conditional adapter) · Codex build loops
- **Video one-liner:** *"DocketBound turns a public docket and an organization's approved evidence into a bilingual participation packet — then stress-tests its weakest claim before a human approves it."*
- **Closing line:** *"Evidence can cross language. Authority stays human."*

## Golden path (FROZEN — 10 steps, this IS the demo)
1. Load official docket/bill fixture (frozen, verified by hand — NO live ingestion).
2. Verify deadline and participation instructions (agency/chamber, term, rule — no gamification).
3. Capture the organization's approved evidence (Pareto intake: position, evidence, authority).
4. Generate one material bilingual claim.
5. Bind it to an exact source span.
6. Adversarial reviewer asks **the one question that can break the most material claim**.
7. Human decides: `ANSWER / LIMIT / REJECT / UNRESOLVED`.
8. GPT-5.6 produces a **grounded diff**.
9. **No-new-citations test** passes; dates and numbers preserved across languages.
10. Export becomes **READY FOR HUMAN REVIEW** (never auto-submit).

## The winning beat (center of the video, ~90s)
Weak claim ("island-wide fiscal effect") → reviewer's question → `Evidence: insufficient · Claim status: NEEDS EVIDENCE · Export gate: BLOCKED` → human selects `LIMIT` → grounded diff rewrites within evidence → side panel: `Source: S-04 · Human decision: LIMIT · New citations introduced: 0 · Position changed without approval: 0 · Export: READY FOR HUMAN REVIEW`.
**A judge must see a weak claim enter, get blocked, get limited by a human, and leave defensible. That is the product; everything else is support.**

## Architecture (one loop, not a committee)
```
ONE ORCHESTRATOR (GPT-5.6, Responses API + Programmatic Tool Calling)
  → official-source tools (fixture reader; deployed fns as needed:
     arsenal-verify, ratio-search, statute-checker, genoma-consulta — conditional)
  → claim ledger (claim · E/I/A/R label · source span · owner · language · human decision)
  → ONE adversarial reviewer (internal role, no face/card/personality)
  → human decision state machine (ANSWER / LIMIT / REJECT / UNRESOLVED)
  → grounded diff + no-new-citations gate
```
- Roles exist internally as evaluators. No visible multi-agent theater.
- **Jurisdictional Impact Map** (conditional router): docket → agency authority → operative requirements → affected groups → participation deadline → evidentiary questions → relevant corpus router. The arsenal (Motor de Cruces/`genoma-consulta`, TSPR corpus) activates **only when materially relevant** — relevance, not exhibition.
- Legacy `ponencia-loop` edge fn (Claude-powered) = reference + disclosed baseline ONLY. All agent-layer generation is GPT-5.6-native, built in Codex.

## Case strategy (GATE 0 status: PASSED for infrastructure)
- **Verified live (2026-07-18):** source on disk (`Generador-Ponencias/edge/ponencia-loop/index.ts`); Supabase fns ACTIVE: `ponencia-loop` v13, `arsenal-verify` v17, `ratio-search`, `statute-checker`, `arsenal-consulta`, `genoma-consulta`, `ingest-congress`.
- **Primary case:** federal NOAA docket **IF** the frozen fixture is delivered by Licen (not on this machine — lives in his other workstream). Fisheries/PR-affected org = maximal judge legibility.
- **Fallback (proven):** PC1213 — QA'd E2E in prod, 0 unverified citations, arsenal 10 TSPR + 8 federal. The golden path is **case-agnostic**; build the fixture loader accordingly. Seed both if NOAA lands.

## P0 — the only things that must exist
Controlled repo · `PRIOR_WORK.md` (disclosed baseline) · frozen official fixture · GPT-5.6 central in challenge + review + diff · claim/evidence/decision ledger · source spans · one adversarial question · human decision ANSWER/LIMIT/REJECT/UNRESOLVED · grounded diff · no-new-citations gate · dates/numbers preserved across languages · conditioned export (READY FOR HUMAN REVIEW) · public sandbox · README (EN) narrating Codex collaboration · Codex `/feedback` Session ID · video <3 min (EN voiceover).

## Cuts (final — do NOT build)
Citation graph (31K edges) — only if a material claim demands PR jurisprudence · five-agent panel · Viability/Intaker merge (Act 2) · auth/dashboard/history · live SUTRA/congress.gov/regulations.gov ingestion · PDF polish · payments. Codex loops (planning/build/product/evidence/competition) = internal harness, never UI.

## Founder story (video open, 0:00–0:12) then product, no résumé
*"I'm Josué Cardona, an attorney and former Assistant Secretary for Administration at the Puerto Rico Department of Treasury. I've worked where public decisions, institutional evidence and accountability converge. DocketBound helps smaller organizations enter that process without surrendering their voice to the model."*
Impact framing: *"DocketBound does not speak for communities. It helps their evidence survive the process."*

## Compliance (unchanged, hackathon-critical)
All submission materials in English (product bilingual = feature) · UPL-safe (petitioning ≠ practice of law; DRAFT watermark; conditioned export) · public demo instance, seeded, rate-limited · no secrets in repo · one master Codex thread (DOCKETBOUND-CORE) = `/feedback` Session ID source · small dated commits.

## Score honesty
9.1 = ceiling after gates. Realized expectation ≈ 8.5–8.7 with normal slippage. The climb to 9 comes from the winning beat landing — not from adding intelligence.
