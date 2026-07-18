import test from "node:test";
import assert from "node:assert/strict";
import { buildSeedClaim, decideClaim, evaluateExport } from "../src/lib/claim-ledger.js";
import { loadFixture } from "../src/lib/fixture-loader.js";

test("export stays blocked until a human resolves the challenge", async () => {
  const claim = buildSeedClaim(await loadFixture());
  assert.equal(evaluateExport(claim).status, "BLOCKED");
  const limited = decideClaim(claim, "LIMIT");
  assert.equal(evaluateExport(limited).status, "READY FOR HUMAN REVIEW");
  assert.equal(limited.groundedDiff.addedCitationSourceIds.length, 0);
});

test("a model-originated citation mechanically blocks export", async () => {
  const claim = decideClaim(buildSeedClaim(await loadFixture()), "LIMIT");
  claim.citationSourceIds.push("MODEL-INVENTED");
  assert.equal(evaluateExport(claim).status, "BLOCKED");
  assert.equal(evaluateExport(claim).gates.noNewCitations, false);
});

test("dates and numbers must match across languages", async () => {
  const claim = decideClaim(buildSeedClaim(await loadFixture()), "LIMIT");
  claim.text.en += " Effective 2026-08-07.";
  assert.equal(evaluateExport(claim).gates.datesAndNumbersPreserved, false);
});
