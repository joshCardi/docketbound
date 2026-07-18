# ÁGORA · Evidence-Bound Public Participation

ÁGORA turns a frozen, verified public docket and an organization's approved evidence into a bilingual participation packet, then stress-tests its most material claim before a human approves any change.

## Local run

Requirements: Node.js 22+.

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY` for the API smoke test.
2. Run `npm test`.
3. Run `npm run dev`, then open <http://localhost:3000>.
4. Run `npm run smoke:openai` to verify GPT-5.6 Responses API tool calling.

No frontend build is required. The app uses a thin Node HTTP server and vanilla browser modules. At runtime the NOAA demo reads only the hand-verified files under `fixtures/noaa-nmfs-2025-0471/raw/`; it never fetches the live docket.

## Evidence contract

Citations may enter only from a frozen fixture, organization-approved evidence, or a real conditional arsenal result. Every claim is stored in the claim ledger with an E/I/A/R label, exact source span, owner, language, and human decision. Export remains `BLOCKED` until the mechanical no-new-citations and bilingual dates/numbers gates pass. Output is always a draft for human review and is never auto-submitted.

## Codex collaboration

The product owner froze the golden path, evidence policy, legal-safety boundary, and architecture. Codex implemented the minimal runtime, fixture adapter, ledger/state machine, interface, mechanical gates, tests, and GPT-5.6 Responses API plumbing within those decisions. GPT-5.6 is the sole runtime generation model; the disclosed Ponencia Loop baseline is reference and external data infrastructure only. See `PRIOR_WORK.md`.
