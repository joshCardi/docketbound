import test from "node:test";
import assert from "node:assert/strict";
import { SEEDED_EVIDENCE_INTAKE } from "../src/lib/claim-ledger.js";
import { generateLiveClaim, validateIntake } from "../src/lib/live-claim.js";

test("live tool path reads sources, submits claim, then adversarial question", async () => {
  const order = [];
  const runTools = async ({ handlers, tools }) => {
    assert.deepEqual(tools.map((tool) => tool.name), ["read_approved_sources", "submit_material_claim", "submit_adversarial_question"]);
    const evidence = handlers.read_approved_sources(); order.push("read");
    assert.equal(evidence.sources.length, 3);
    handlers.submit_material_claim({ title: "Operating concerns", label: "E", en: "Members reported operating concerns.", es: "Los miembros informaron preocupaciones operacionales.", source_id: "ORG-01" }); order.push("claim");
    handlers.submit_adversarial_question({ question: "How broadly were these concerns shared?" }); order.push("review");
    return { response: {}, toolCalls: 3 };
  };
  const result = await generateLiveClaim(validateIntake(SEEDED_EVIDENCE_INTAKE), { fixtureSha256: "fixture-hash", runTools, idFactory: () => "C-LIVE-ABC123" });
  assert.deepEqual(order, ["read", "claim", "review"]);
  assert.equal(result.claim.sourceSpan.sourceId, "ORG-01");
  assert.equal(result.claim.adversarialQuestion, "How broadly were these concerns shared?");
  assert.equal(result.export.status, "BLOCKED");
});

test("live intake requires 3–6 complete permissible spans", () => {
  assert.throws(() => validateIntake({ organizationPosition: "Position", items: [] }), /3–6/);
  const broken = structuredClone(SEEDED_EVIDENCE_INTAKE); broken.items[0].sourceSpan.text = "";
  assert.throws(() => validateIntake(broken), /evidence text/);
});
