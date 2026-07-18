# DOCKETBOUND · Evidence-Bound Public Participation

> **Review draft:** The product owner will personally review and edit this README before submission.

DocketBound helps a citizen or community organization understand a live public proceeding, develop a bilingual participation packet from evidence it has approved, and stress-test the packet's most material claim before a human authorizes any change.

Its visible workflow is **Deadline-to-Defense**: verified docket → challenged claim → human decision → grounded diff. DocketBound does not speak for communities and never submits on their behalf. Export means **READY FOR HUMAN REVIEW**, not filed or approved. Every output remains visibly marked **DRAFT**.

The current Build Week demo uses a hand-verified frozen snapshot of NOAA docket `NOAA-NMFS-2025-0471`. The seeded organization and organization evidence are visibly identified as fictional evaluation data. The official docket snapshot is real; the demo reads it only from `fixtures/noaa-nmfs-2025-0471/raw/` and performs no live docket ingestion.

## The Deadline-to-Defense golden path

1. Load a frozen, verified official docket or bill fixture.
2. Show its source-bound deadline and participation instructions.
3. Capture the organization's position and 3–6 approved evidence sources.
4. Generate one material bilingual claim.
5. Bind the claim to an exact source span.
6. Ask the one adversarial question most capable of breaking the material claim.
7. Require a human decision: `ANSWER`, `LIMIT`, `REJECT`, or `UNRESOLVED`.
8. Use GPT-5.6 to produce a grounded bilingual diff when the human selects `LIMIT`.
9. Mechanically reject new citations and verify that dates and numbers survive across languages.
10. Render a bilingual participation packet only when the included claims are **READY FOR HUMAN REVIEW**.

`REJECT` is a terminal `EXCLUDED` state: that claim does not enter the packet. `UNRESOLVED` keeps export blocked. DocketBound never auto-submits.

## Local development

Requirements:

- Node.js 22 or later
- An OpenAI API key for the live GPT-5.6 grounded-diff path

Install and run:

```bash
npm install
cp .env.example .env
npm run dev
```

Set the environment variable named `OPENAI_API_KEY` in the repo-root `.env`. Never commit the key. Open <http://127.0.0.1:3000>.

Verification commands:

```bash
npm test
npm run smoke:openai
```

The app intentionally has no frontend build step. It uses a thin Node HTTP backend, vanilla browser modules, and Node's built-in test runner. The `.env` file and other secret-bearing local files are ignored by Git.

The public sandbox limits GPT-backed HTTP operations to 10 calls per client IP in a rolling hour. Set `TRUST_PROXY=1` only when deployment is behind a trusted reverse proxy that supplies `X-Forwarded-For`; local development defaults to `0`.

## Demo walkthrough

1. Confirm the header identifies NOAA, the proposed rule, the comment deadline, the neutral days-remaining chip, and the official participation portal.
2. Inspect the faithfully rendered submission instructions. Expand **View raw source** to see the unchanged Federal Register ADDRESSES span.
3. Confirm the intake says **Demo Fishing Community Organization** and **Fictional demo data for evaluation**. The three seeded organization records are not real evidence.
4. Open **C-01 · SUPPORTED**. Its reclassification claim is bound to the Federal Register. Select `ANSWER`; it moves from `BLOCKED` to `READY FOR HUMAN REVIEW` without a rewrite.
5. Open **C-02 · NEEDS EVIDENCE**. It overstates the seeded organization evidence as an island-wide fiscal effect. The adversarial question exposes the unsupported geographic scope, so export remains `BLOCKED`.
6. Select `LIMIT`. GPT-5.6 reads only the approved evidence through a tool and rewrites the claim around reported impacts in three coastal municipalities. The before/after text visibly changes.
7. Confirm: source bound, new citations introduced `0`, dates/numbers preserved, human decision `LIMIT`, and export `READY FOR HUMAN REVIEW`.
8. Review the now-visible bilingual packet. It includes the fictional-data disclosure, included claims and decisions, approved evidence, provenance seal, DRAFT watermark, and the exact portal/docket and mail instructions at the end. Copy or print it; DocketBound does not submit it.

For contrast, selecting `REJECT` on a claim produces `EXCLUDED` and removes it from the packet rather than falsely marking it ready.

### Live mode

Edit the organization position and the exact permissible evidence text, then select **Generate new live claim with GPT-5.6**. One evidence-bound tool loop reads only those approved sources, creates one bilingual material claim with an E/I/A/R label, binds it server-side to the selected stored span, and generates the adversarial question live. The new `C-LIVE-*` claim enters the same ledger as C-01 and C-02 at `UNRESOLVED · BLOCKED`, with the same human decisions, grounded-diff path, gates, packet rules, and per-IP rate limit. The two seeded claims remain unchanged as the stable evaluation walkthrough.

## Runtime architecture and GPT-5.6

DocketBound follows a deliberately small architecture: **one GPT-5.6 orchestrator, programmatic tool calls, one internal adversarial review operation, a claim ledger, and mechanical export gates**. There is no visible multi-agent panel, planner hierarchy, authentication system, dashboard, history view, or live-ingestion pipeline.

The runtime uses the OpenAI **Responses API** with model alias `gpt-5.6`. GPT-5.6 runs live claim generation, adversarial review, and grounded diff; tool calls are the only path by which frozen fixture facts and approved organization evidence may enter those operations. The two seeded claims retain frozen questions only as a deterministic evaluation walkthrough. New claims execute generation and review live inside the same single orchestrator loop—not a separate agent.

In the current demo:

- the fixture reader proves GPT-5.6 tool plumbing;
- live mode generates both a typed bilingual claim and the one adversarial question that can most materially break it;
- the seeded adversarial questions preserve the stable C-01/C-02 walkthrough without adding a visible persona or panel;
- `LIMIT` calls an approved-evidence tool, then requires GPT-5.6 to submit a typed bilingual grounded rewrite;
- the application rejects the rewrite unless it is materially different and passes the no-new-citations and bilingual dates/numbers gates.

Runtime responsibility is deliberately explicit:

| Operation | GPT-5.6 role | Tonight's demo status |
| --- | --- | --- |
| Claim generation | Generate a bilingual material claim only after reading permissible evidence tools. | Live for new `C-LIVE-*` claims; C-01/C-02 remain frozen walkthrough fixtures. |
| Adversarial review | Ask the one question most capable of breaking the material claim, using the same bound record. | Live for new claims in the same tool loop; seeded questions remain stable. |
| Grounded diff | On human `LIMIT`, read approved evidence and submit a typed bilingual narrowing. | Live through the Responses API and mechanically gated. |

Citations never originate from model prose. Permissible sources are limited to the frozen fixture, organization-approved evidence, and—when later activated by relevance—real corpus results.

## Evidence integrity and human authority

The claim ledger is the product spine. Each claim carries:

`claim · E/I/A/R label · exact source span · owner · language · human decision`

Packet rendering is conditioned on state and gates. DocketBound may challenge or narrow language, but it cannot silently change the organization's position. Human authority remains visible at the decision point and in the final ledger.

The generated packet is not legal advice. Petitioning an agency or legislature is not presented as the practice of law. All output is a draft for human review.

P1 TODO: extend bilingual parity beyond dates and numbers with source-aware checks for geographic scope, causality strength, certainty/modals, and affected population. This remains explicit follow-on work; the current gate does not claim to detect those semantic divergences.

## Codex collaboration

This repository was built in one primary Codex collaboration thread for OpenAI Build Week.

**Where Codex accelerated the work:** Codex translated the frozen specification into the minimal Node/vanilla scaffold; implemented the fixture adapter, exact-span binding, claim ledger, decision state machine, mechanical gates, GPT-5.6 Responses tool loop, evidence intake, faithful instructions renderer, and printable packet; wrote regression tests; and repeatedly self-QA'd the real browser flow with Playwright. That browser QA caught concrete defects—including a misleading READY state for rejected claims, an identical before/after diff, a packet visibility bug, and excluded claims leaking into the packet—before handoff.

**Where the human made the product and legal decisions:** Josué Cardona, the product owner and a licensed attorney, authored and froze the product specification; defined the Deadline-to-Defense winning beat; chose the scope cuts; required a single orchestrator rather than multi-agent theater; defined `ANSWER / LIMIT / REJECT / UNRESOLVED` semantics; required `EXCLUDED` for rejected claims; set the evidence, provenance, bilingual-integrity, citation, legal-safety, human-authority, and fictional-data disclosure rules; selected the demo contrast; and reviewed the product in the browser. Codex implemented within those decisions rather than expanding product scope.

Commit history is intentionally small, frequent, and dated as evidence of the collaboration during the submission window.

## Prior work and roadmap

The pre-existing Ponencia Loop baseline and external data primitives are disclosed in [PRIOR_WORK.md](PRIOR_WORK.md). They are not claimed as newly built Build Week functionality, and the baseline's legacy non-OpenAI generation layer is not part of DocketBound's runtime.

Roadmap—not part of the frozen demo scope: the **Jurisdictional Impact Map** will act as a conditional corpus router from docket → agency authority → operative requirements → affected groups → deadline → evidentiary questions. Puerto Rico jurisprudence and other corpus tools will activate only when materially relevant to a claim. Relevance, not exhibition, governs that path.

## Current commands

```text
Dev server:                  npm run dev
Tests:                       npm test
GPT-5.6 tool smoke test:     npm run smoke:openai
Deployment:                  TBD
```

## License

DocketBound is available under the [MIT License](LICENSE). Copyright 2026 Josué R. Cardona Hernández.

Product: [docketbound.com](https://docketbound.com) · Source: [github.com/joshCardi/docketbound](https://github.com/joshCardi/docketbound)
