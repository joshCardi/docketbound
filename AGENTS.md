# AGENTS.md — ÁGORA
### Guidance for coding agents working in this repository

## What this project is
ÁGORA: an agent that interviews a citizen/community org about a live Puerto Rico bill, teaches them what it does to them, and produces verified, citation-gated legislative testimony (ponencia). Built for OpenAI Build Week (deadline Tue Jul 21, 5:00 PM PT). Track: Work & Productivity. Full product spec: `SPEC.md` (FROZEN — do not expand scope).

## Architecture rules
- **Minimal harness:** one agent loop + tool calls. Do not add subagents, planners, or orchestration layers. If a step can be a tool call, it is a tool call.
- **Runtime model:** GPT-5.6 via OpenAI **Responses API** with **Programmatic Tool Calling**. Never substitute another model in the product runtime.
- **Legacy reference only:** `reference/ponencia-loop-index.ts` (copied from the prod edge function) shows how to call the data primitives and how query embedding is done. Its LLM calls use a non-OpenAI model — do NOT port those; rebuild generation GPT-5.6-native.
- **Data primitives are external services** (existing Supabase project): treat RPCs and search functions as a database. Mirror the reference implementation's embedding call pattern exactly for `search_opinions_semantic` (corpus embeddings are model-specific).
- **Evidence integrity is the product.** No citation may originate from the model — citations enter only from the frozen fixture, the organization's approved evidence, or real arsenal search results. The **no-new-citations gate** and the **dates/numbers-preserved-across-languages check** are product features, not test conveniences. Never weaken them to make a demo smoother.
- **The claim ledger is the spine:** every claim carries `E/I/A/R label · source span · owner · language · human decision (ANSWER/LIMIT/REJECT/UNRESOLVED)`. Export is conditioned: `BLOCKED` until gates pass, then `READY FOR HUMAN REVIEW` — never auto-submit.
- **One orchestrator + tools + one internal adversarial reviewer.** No visible multi-agent panel, no personas. The arsenal (corpus/crossings fns) activates only via the conditional router when materially relevant.

## Working style
- Small, frequent, dated commits with clear messages — commit history is competition evidence of work done within the submission window.
- English for code, comments, commit messages, README. Product UI English-first with Spanish toggle; generated ponencia in Spanish with English mirror.
- No secrets in the repo, ever. Env vars documented by name only.
- Prefer boring, robust choices: vanilla or minimal-framework frontend, one thin backend. Fast load matters (product opens instantly).
- Errors are product surface: clear error states, no silent failures, honest empty states.
- The seeded demo case (PC1213) must run end-to-end at all times after Sunday. If a change breaks the seeded flow, fixing it takes priority over any new work.

## Compliance (hackathon-critical)
- Majority of core functionality is built in the single main Codex thread ("AGORA-CORE"); its `/feedback` Session ID is submitted.
- README must narrate the Codex collaboration: where Codex accelerated, where the human made product/engineering decisions, how GPT-5.6 is used at runtime.
- Judges must be able to test without rebuilding: keep the public demo instance working and the README run instructions accurate.
- Visible disclaimer: drafts are not legal advice; petitioning the legislature is not the practice of law; DRAFT watermark on output.

## Commands
(Fill in as the stack solidifies — keep this section current so any agent session can build/test/run without archaeology.)
- Dev server: `TBD`
- Tests / seeded E2E check: `TBD`
- Deploy: `TBD`
