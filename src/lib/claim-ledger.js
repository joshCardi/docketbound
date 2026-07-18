import { randomUUID } from "node:crypto";

export const CLAIM_LABELS = Object.freeze(["E", "I", "A", "R"]);
export const HUMAN_DECISIONS = Object.freeze(["ANSWER", "LIMIT", "REJECT", "UNRESOLVED"]);
export const PACKET_STATUSES = Object.freeze(["BLOCKED", "READY FOR HUMAN REVIEW", "EXCLUDED"]);

function tokens(value) {
  return String(value).match(/\b\d[\d,.]*\b|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/gi) ?? [];
}

export function datesAndNumbersPreserved(claim) {
  const english = [...new Set(tokens(claim.text.en))].sort();
  const spanish = [...new Set(tokens(claim.text.es))].sort();
  return JSON.stringify(english) === JSON.stringify(spanish);
}

export function noNewCitations(claim) {
  const approved = new Set(claim.approvedSourceIds);
  return claim.citationSourceIds.every((id) => approved.has(id));
}

export function isRealGroundedDiff(claim) {
  if (!claim.groundedDiff) return false;
  const { before, after } = claim.groundedDiff;
  return before?.en !== after?.en && before?.es !== after?.es;
}

export function approvalVersion(claim) {
  return JSON.stringify({
    text: claim.text,
    evidenceSourceIds: [...claim.approvedSourceIds].sort(),
    sourceSpan: { sourceId: claim.sourceSpan?.sourceId, text: claim.sourceSpan?.text },
    fixtureSha256: claim.fixtureSha256
  });
}

export function refreshApprovalState(claim) {
  if (!claim.decision || claim.decision.status === "STALE") return claim.decision?.status === "STALE";
  if (claim.decision.boundVersion === approvalVersion(claim)) return false;
  claim.decision.status = "STALE";
  if (claim.groundedDiff) claim.groundedDiff.status = "STALE";
  return true;
}

export function evaluateExport(claim) {
  const stale = refreshApprovalState(claim);
  if (stale) {
    return {
      gates: {
        sourceSpanBound: Boolean(claim.sourceSpan?.sourceId && claim.sourceSpan?.text),
        noNewCitations: noNewCitations(claim), datesAndNumbersPreserved: datesAndNumbersPreserved(claim),
        humanDecisionResolved: false, groundedDiffComplete: false, approvalCurrent: false
      },
      status: "BLOCKED"
    };
  }
  if (claim.humanDecision === "REJECT" && claim.decision?.status === "CURRENT") {
    return {
      gates: {
        sourceSpanBound: Boolean(claim.sourceSpan?.sourceId && claim.sourceSpan?.text),
        noNewCitations: noNewCitations(claim),
        datesAndNumbersPreserved: datesAndNumbersPreserved(claim),
        humanDecisionResolved: true,
        groundedDiffComplete: false,
        approvalCurrent: true
      },
      status: "EXCLUDED"
    };
  }

  const gates = {
    sourceSpanBound: Boolean(claim.sourceSpan?.sourceId && claim.sourceSpan?.text),
    noNewCitations: noNewCitations(claim),
    datesAndNumbersPreserved: datesAndNumbersPreserved(claim),
    humanDecisionResolved: ["ANSWER", "LIMIT"].includes(claim.humanDecision) && claim.decision?.status === "CURRENT",
    groundedDiffComplete: claim.decision?.status === "CURRENT" && (claim.humanDecision === "ANSWER" || (claim.humanDecision === "LIMIT" && isRealGroundedDiff(claim))),
    approvalCurrent: claim.humanDecision === "UNRESOLVED" ? false : claim.decision?.status === "CURRENT"
  };
  return { gates, status: Object.values(gates).every(Boolean) ? "READY FOR HUMAN REVIEW" : "BLOCKED" };
}

function baseClaim({ id, claim, label, text, sourceSpan, approvedSourceIds, adversarialQuestion, evidenceStatus, fixtureSha256 }) {
  return {
    id, claim, label, text, sourceSpan,
    owner: "Demo Fishing Community Organization (fictional)",
    language: "bilingual",
    humanDecision: "UNRESOLVED",
    evidenceStatus,
    approvedSourceIds,
    citationSourceIds: [...approvedSourceIds],
    adversarialQuestion,
    groundedDiff: null,
    decision: null,
    fixtureSha256
  };
}

export function buildDemoClaims(fixture, approvedEvidence) {
  const official = fixture.sourceSpans.operative;
  const local = approvedEvidence.items[0];
  return [
    baseClaim({
      id: "C-01",
      claim: "Rainbow runner reclassification",
      label: "E",
      text: {
        en: "The proposed rule would reclassify rainbow runner from a reef fish to a pelagic fish while retaining sector-specific annual catch limits.",
        es: "La regla propuesta reclasificaría el medregal de una especie de arrecife a una pelágica, manteniendo los límites de captura anual específicos por sector."
      },
      sourceSpan: official,
      approvedSourceIds: [official.sourceId],
      adversarialQuestion: "Does the bound Federal Register span support both the reclassification and retention of sector-specific catch limits?",
      evidenceStatus: "SUPPORTED",
      fixtureSha256: fixture.fixtureSha256
    }),
    baseClaim({
      id: "C-02",
      claim: "Island-wide fiscal effect",
      label: "I",
      text: {
        en: "The proposed reclassification will create an island-wide fiscal burden for Puerto Rico's fishing economy.",
        es: "La reclasificación propuesta creará una carga fiscal en toda la isla para la economía pesquera de Puerto Rico."
      },
      sourceSpan: local.sourceSpan,
      approvedSourceIds: [local.sourceId],
      adversarialQuestion: "What approved evidence supports an island-wide fiscal effect rather than impacts reported by the participating organization's members in three municipalities?",
      evidenceStatus: "NEEDS EVIDENCE",
      fixtureSha256: fixture.fixtureSha256
    })
  ];
}

export function createLiveClaim({ id, intake, submission, adversarialQuestion, fixtureSha256 }) {
  if (!/^C-LIVE-[A-Z0-9]{6}$/.test(id)) throw new Error("Invalid live claim id");
  if (!CLAIM_LABELS.includes(submission?.label)) throw new Error("Invalid E/I/A/R label");
  if (!submission?.title || !submission?.en || !submission?.es) throw new Error("Live claim must be titled and bilingual");
  if (!adversarialQuestion?.trim()) throw new Error("Live claim requires an adversarial question");
  const evidence = intake.items.find((item) => item.sourceId === submission.sourceId);
  if (!evidence?.sourceSpan?.text?.trim()) throw new Error("Live claim source must be approved evidence with an exact span");
  const sourceSpan = {
    ...evidence.sourceSpan,
    sourceId: evidence.sourceId,
    start: 0,
    end: evidence.sourceSpan.text.length
  };
  const claim = baseClaim({
    id,
    claim: submission.title,
    label: submission.label,
    text: { en: submission.en, es: submission.es },
    sourceSpan,
    approvedSourceIds: [evidence.sourceId],
    adversarialQuestion: adversarialQuestion.trim(),
    evidenceStatus: "SUPPORTED",
    fixtureSha256
  });
  claim.owner = evidence.owner;
  if (!datesAndNumbersPreserved(claim)) throw new Error("Live claim failed bilingual dates/numbers preservation");
  return claim;
}

export function decideClaim(claim, decision, groundedRewrite = null, { decisionId = randomUUID(), decidedAt = new Date().toISOString() } = {}) {
  if (!HUMAN_DECISIONS.includes(decision)) throw new Error("Invalid human decision");
  const next = { ...claim, humanDecision: decision, groundedDiff: null };
  if (decision === "LIMIT") {
    if (!groundedRewrite?.en || !groundedRewrite?.es) throw new Error("LIMIT requires a bilingual grounded rewrite");
    next.groundedDiff = {
      before: { ...claim.text },
      after: { ...groundedRewrite },
      addedCitationSourceIds: [],
      positionChangedWithoutApproval: 0,
      decisionId,
      status: "CURRENT"
    };
    next.text = next.groundedDiff.after;
    next.evidenceStatus = "SUPPORTED WITHIN LIMITS";
  }
  next.decision = { decisionId, type: decision, decidedAt, status: "CURRENT", boundVersion: approvalVersion(next) };
  return next;
}

export const SEEDED_EVIDENCE_INTAKE = Object.freeze({
  organizationName: "Demo Fishing Community Organization",
  demoDisclosure: "Fictional demo data for evaluation — not a real organization or evidentiary record.",
  isFictionalDemo: true,
  organizationPosition: "Support evidence-based management while protecting small-scale fishing communities from unsupported economic assumptions.",
  organizationPositionEs: "Apoyar el manejo basado en evidencia mientras se protege a las comunidades pesqueras de pequeña escala frente a supuestos económicos sin fundamento.",
  items: [{
    sourceId: "ORG-01",
    sourceName: "Approved member impact notes",
    owner: "Demo Fishing Community Organization (fictional)",
    language: "bilingual",
    sourceSpan: {
      sourceId: "ORG-01",
      file: "organization-approved-evidence",
      start: 0,
      end: 164,
      text: "Member fishers operating in three coastal municipalities reported concern that changes to catch management could affect trip planning and near-term operating costs."
    }
  }, {
    sourceId: "ORG-02",
    sourceName: "Board-approved policy position",
    owner: "Demo Fishing Community Organization (fictional)",
    language: "English",
    sourceSpan: {
      sourceId: "ORG-02", file: "organization-approved-evidence", start: 0, end: 125,
      text: "The organization supports measures tied to fishery science and requests clear explanations of sector accountability measures."
    }
  }, {
    sourceId: "ORG-03",
    sourceName: "Community meeting summary",
    owner: "Demo Fishing Community Organization (fictional)",
    language: "Spanish",
    sourceSpan: {
      sourceId: "ORG-03", file: "organization-approved-evidence", start: 0, end: 144,
      text: "Pescadores participantes solicitaron que cualquier afirmación económica se limite a experiencias documentadas y no se generalice a toda la isla."
    }
  }]
});

export const SEEDED_LIMIT_REWRITE = Object.freeze({
  en: "Member fishers in three coastal municipalities reported that changes to catch management could affect trip planning and near-term operating costs.",
  es: "Pescadores miembros en tres municipios costeros informaron que los cambios al manejo de capturas podrían afectar la planificación de viajes y los costos operacionales a corto plazo."
});
