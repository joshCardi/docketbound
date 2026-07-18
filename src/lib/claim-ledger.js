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

export function evaluateExport(claim) {
  if (claim.humanDecision === "REJECT") {
    return {
      gates: {
        sourceSpanBound: Boolean(claim.sourceSpan?.sourceId && claim.sourceSpan?.text),
        noNewCitations: noNewCitations(claim),
        datesAndNumbersPreserved: datesAndNumbersPreserved(claim),
        humanDecisionResolved: true,
        groundedDiffComplete: false
      },
      status: "EXCLUDED"
    };
  }

  const gates = {
    sourceSpanBound: Boolean(claim.sourceSpan?.sourceId && claim.sourceSpan?.text),
    noNewCitations: noNewCitations(claim),
    datesAndNumbersPreserved: datesAndNumbersPreserved(claim),
    humanDecisionResolved: ["ANSWER", "LIMIT"].includes(claim.humanDecision),
    groundedDiffComplete: claim.humanDecision === "ANSWER" || (claim.humanDecision === "LIMIT" && isRealGroundedDiff(claim))
  };
  return { gates, status: Object.values(gates).every(Boolean) ? "READY FOR HUMAN REVIEW" : "BLOCKED" };
}

function baseClaim({ id, claim, label, text, sourceSpan, approvedSourceIds, adversarialQuestion, evidenceStatus }) {
  return {
    id, claim, label, text, sourceSpan,
    owner: "Demo Fishing Community Organization (fictional)",
    language: "bilingual",
    humanDecision: "UNRESOLVED",
    evidenceStatus,
    approvedSourceIds,
    citationSourceIds: [...approvedSourceIds],
    adversarialQuestion,
    groundedDiff: null
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
      evidenceStatus: "SUPPORTED"
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
      evidenceStatus: "NEEDS EVIDENCE"
    })
  ];
}

export function decideClaim(claim, decision, groundedRewrite = null) {
  if (!HUMAN_DECISIONS.includes(decision)) throw new Error("Invalid human decision");
  const next = { ...claim, humanDecision: decision, groundedDiff: null };
  if (decision === "LIMIT") {
    if (!groundedRewrite?.en || !groundedRewrite?.es) throw new Error("LIMIT requires a bilingual grounded rewrite");
    next.groundedDiff = {
      before: { ...claim.text },
      after: { ...groundedRewrite },
      addedCitationSourceIds: [],
      positionChangedWithoutApproval: 0
    };
    next.text = next.groundedDiff.after;
    next.evidenceStatus = "SUPPORTED WITHIN LIMITS";
  }
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
