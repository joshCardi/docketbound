import test from "node:test";
import assert from "node:assert/strict";
import { buildDemoClaims, decideClaim, SEEDED_EVIDENCE_INTAKE, SEEDED_LIMIT_REWRITE } from "../src/lib/claim-ledger.js";
import { createExportManifest } from "../src/lib/export-manifest.js";
import { loadFixture } from "../src/lib/fixture-loader.js";

test("export manifest binds packet, fixture, claims, decisions, and generation time", async () => {
  const fixture = await loadFixture();
  const [first, second] = buildDemoClaims(fixture, SEEDED_EVIDENCE_INTAKE);
  const claims = [
    decideClaim(first, "ANSWER", null, { decisionId: "decision-01", decidedAt: "2026-07-18T20:00:00.000Z" }),
    decideClaim(second, "LIMIT", SEEDED_LIMIT_REWRITE, { decisionId: "decision-02", decidedAt: "2026-07-18T20:01:00.000Z" })
  ];
  const manifest = createExportManifest({ fixture, claims, intake: SEEDED_EVIDENCE_INTAKE, generatedAt: "2026-07-18T20:02:00.000Z" });
  assert.match(manifest.packetContentSha256, /^[0-9a-f]{64}$/);
  assert.equal(manifest.fixtureSha256, fixture.fixtureSha256);
  assert.deepEqual(manifest.claims, [{ claimId: "C-01", decisionId: "decision-01" }, { claimId: "C-02", decisionId: "decision-02" }]);
  assert.equal(manifest.generatedAt, "2026-07-18T20:02:00.000Z");
});

test("manifest refuses stale approval and its hash changes with approved content", async () => {
  const fixture = await loadFixture();
  const [original] = buildDemoClaims(fixture, SEEDED_EVIDENCE_INTAKE);
  const approved = decideClaim(original, "ANSWER", null, { decisionId: "decision-01" });
  const before = createExportManifest({ fixture, claims: [approved], intake: SEEDED_EVIDENCE_INTAKE, generatedAt: "fixed" });
  const changedIntake = structuredClone(SEEDED_EVIDENCE_INTAKE);
  changedIntake.organizationPosition += " Exact amendment.";
  const after = createExportManifest({ fixture, claims: [approved], intake: changedIntake, generatedAt: "fixed" });
  assert.notEqual(before.packetContentSha256, after.packetContentSha256);
  approved.text.en += " Changed after approval.";
  assert.throws(() => createExportManifest({ fixture, claims: [approved], intake: SEEDED_EVIDENCE_INTAKE }), /BLOCKED/);
});
