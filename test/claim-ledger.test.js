import test from "node:test";
import assert from "node:assert/strict";
import { buildDemoClaims, decideClaim, evaluateExport, isRealGroundedDiff, SEEDED_EVIDENCE_INTAKE, SEEDED_LIMIT_REWRITE } from "../src/lib/claim-ledger.js";
import { loadFixture } from "../src/lib/fixture-loader.js";

async function claims() { return buildDemoClaims(await loadFixture(), SEEDED_EVIDENCE_INTAKE); }

test("approved evidence intake has 3–6 exact source spans", () => {
  assert.ok(SEEDED_EVIDENCE_INTAKE.items.length >= 3 && SEEDED_EVIDENCE_INTAKE.items.length <= 6);
  for (const item of SEEDED_EVIDENCE_INTAKE.items) {
    assert.equal(item.sourceSpan.end - item.sourceSpan.start, item.sourceSpan.text.length);
    assert.ok(item.sourceName && item.owner && item.language);
  }
});

test("C-01 visibly progresses BLOCKED to READY on ANSWER", async () => {
  const [claim] = await claims();
  const initial = evaluateExport(claim);
  assert.equal(initial.status, "BLOCKED");
  assert.equal(initial.gates.humanDecisionResolved, false);
  assert.equal(initial.gates.groundedDiffComplete, false);
  assert.equal(evaluateExport(decideClaim(claim, "ANSWER")).status, "READY FOR HUMAN REVIEW");
});

test("C-02 LIMIT requires and records a real bilingual rewrite", async () => {
  const [, claim] = await claims();
  assert.equal(claim.evidenceStatus, "NEEDS EVIDENCE");
  assert.equal(evaluateExport(claim).status, "BLOCKED");
  assert.throws(() => decideClaim(claim, "LIMIT"), /requires a bilingual grounded rewrite/);
  const limited = decideClaim(claim, "LIMIT", SEEDED_LIMIT_REWRITE);
  assert.equal(isRealGroundedDiff(limited), true);
  assert.notEqual(limited.groundedDiff.before.en, limited.groundedDiff.after.en);
  assert.equal(evaluateExport(limited).status, "READY FOR HUMAN REVIEW");
});

test("REJECT produces EXCLUDED and never READY", async () => {
  const [, claim] = await claims();
  const rejected = decideClaim(claim, "REJECT");
  assert.equal(evaluateExport(rejected).status, "EXCLUDED");
  assert.equal(rejected.groundedDiff, null);
});

test("a model-originated citation mechanically blocks export", async () => {
  const [, claim] = await claims();
  const limited = decideClaim(claim, "LIMIT", SEEDED_LIMIT_REWRITE);
  limited.citationSourceIds.push("MODEL-INVENTED");
  assert.equal(evaluateExport(limited).status, "BLOCKED");
  assert.equal(evaluateExport(limited).gates.noNewCitations, false);
});

test("dates and numbers must match across languages", async () => {
  const [, claim] = await claims();
  const limited = decideClaim(claim, "LIMIT", SEEDED_LIMIT_REWRITE);
  limited.text.en += " Effective 2026-08-07.";
  assert.equal(evaluateExport(limited).gates.datesAndNumbersPreserved, false);
});
