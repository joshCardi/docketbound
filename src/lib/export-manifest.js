import { createHash } from "node:crypto";
import { evaluateExport } from "./claim-ledger.js";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function createExportManifest({ fixture, claims, intake, generatedAt = new Date().toISOString() }) {
  const evaluated = claims.map((claim) => ({ claim, result: evaluateExport(claim) }));
  if (evaluated.some(({ result }) => result.status === "BLOCKED")) throw new Error("Packet is BLOCKED; every included claim requires a current approval");
  const included = evaluated.filter(({ result }) => result.status === "READY FOR HUMAN REVIEW").map(({ claim }) => ({
    claimId: claim.id,
    label: claim.label,
    text: claim.text,
    evidenceSourceIds: [...claim.approvedSourceIds].sort(),
    sourceSpan: claim.sourceSpan,
    decisionId: claim.decision.decisionId,
    decisionType: claim.decision.type,
    approvalVersion: claim.decision.boundVersion
  }));
  if (!included.length) throw new Error("Packet has no claims ready for human review");
  const packetContent = JSON.stringify({
    fixture: { docketId: fixture.docketId, sha256: fixture.fixtureSha256 },
    organization: { name: intake.organizationName, position: intake.organizationPosition, positionEs: intake.organizationPositionEs },
    evidence: intake.items.map(({ sourceId, sourceName, owner, language, sourceSpan }) => ({ sourceId, sourceName, owner, language, sourceSpan })),
    claims: included,
    submissionInstructionsRaw: fixture.participationPresentation.raw
  });
  return {
    packetContentSha256: sha256(packetContent),
    fixtureSha256: fixture.fixtureSha256,
    claims: included.map(({ claimId, decisionId }) => ({ claimId, decisionId })),
    generatedAt
  };
}
