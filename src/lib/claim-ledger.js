export const CLAIM_LABELS = Object.freeze(["E", "I", "A", "R"]);
export const HUMAN_DECISIONS = Object.freeze(["ANSWER", "LIMIT", "REJECT", "UNRESOLVED"]);

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

export function evaluateExport(claim) {
  const gates = {
    sourceSpanBound: Boolean(claim.sourceSpan?.sourceId && claim.sourceSpan?.text),
    noNewCitations: noNewCitations(claim),
    datesAndNumbersPreserved: datesAndNumbersPreserved(claim),
    humanDecisionResolved: ["ANSWER", "LIMIT", "REJECT"].includes(claim.humanDecision),
    groundedDiffComplete: claim.humanDecision === "REJECT" || Boolean(claim.groundedDiff)
  };
  return {
    gates,
    status: Object.values(gates).every(Boolean) ? "READY FOR HUMAN REVIEW" : "BLOCKED"
  };
}

export function buildSeedClaim(fixture) {
  const sourceSpan = fixture.sourceSpans.operative;
  return {
    id: "C-01",
    claim: "Rainbow runner reclassification",
    label: "E",
    text: {
      en: "The proposed rule would reclassify rainbow runner from a reef fish to a pelagic fish while retaining sector-specific annual catch limits.",
      es: "La regla propuesta reclasificaría el medregal de una especie de arrecife a una pelágica, manteniendo los límites de captura anual específicos por sector."
    },
    sourceSpan,
    owner: "Participating organization",
    language: "bilingual",
    humanDecision: "UNRESOLVED",
    approvedSourceIds: [sourceSpan.sourceId],
    citationSourceIds: [sourceSpan.sourceId],
    adversarialQuestion: "What evidence shows that retaining sector-specific catch limits remains appropriate after reclassification?",
    groundedDiff: null
  };
}

export function decideClaim(claim, decision) {
  if (!HUMAN_DECISIONS.includes(decision)) throw new Error("Invalid human decision");
  const next = { ...claim, humanDecision: decision };
  if (decision === "LIMIT") {
    next.groundedDiff = {
      before: claim.text,
      after: {
        en: "The proposed rule would reclassify rainbow runner from a reef fish to a pelagic fish and states that sector-specific annual catch limits would be retained.",
        es: "La regla propuesta reclasificaría el medregal de una especie de arrecife a una pelágica y dispone que se mantendrían los límites de captura anual específicos por sector."
      },
      addedCitationSourceIds: [],
      positionChangedWithoutApproval: 0
    };
    next.text = next.groundedDiff.after;
  } else if (decision === "ANSWER") {
    next.groundedDiff = { before: claim.text, after: claim.text, addedCitationSourceIds: [], positionChangedWithoutApproval: 0 };
  } else if (decision === "REJECT") {
    next.groundedDiff = null;
  } else {
    next.groundedDiff = null;
  }
  return next;
}
