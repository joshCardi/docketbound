const DECISIONS = ["ANSWER", "LIMIT", "REJECT", "UNRESOLVED"];
let state;

const $ = (id) => document.getElementById(id);
const numberTokens = (value) => value.match(/\b\d[\d,.]*\b|\b\d{4}-\d{2}-\d{2}\b/g) ?? [];

function evaluate(claim) {
  const approved = new Set(claim.approvedSourceIds);
  const gates = {
    "Source span bound": Boolean(claim.sourceSpan?.text),
    "No new citations": claim.citationSourceIds.every((id) => approved.has(id)),
    "Dates/numbers preserved": JSON.stringify([...new Set(numberTokens(claim.text.en))].sort()) === JSON.stringify([...new Set(numberTokens(claim.text.es))].sort()),
    "Human decision resolved": ["ANSWER", "LIMIT", "REJECT"].includes(claim.humanDecision),
    "Grounded diff complete": claim.humanDecision === "REJECT" || Boolean(claim.groundedDiff)
  };
  return { gates, status: Object.values(gates).every(Boolean) ? "READY FOR HUMAN REVIEW" : "BLOCKED" };
}

function decide(decision) {
  const claim = state.claim;
  claim.humanDecision = decision;
  if (decision === "LIMIT") {
    const after = {
      en: "The proposed rule would reclassify rainbow runner from a reef fish to a pelagic fish and states that sector-specific annual catch limits would be retained.",
      es: "La regla propuesta reclasificaría el medregal de una especie de arrecife a una pelágica y dispone que se mantendrían los límites de captura anual específicos por sector."
    };
    claim.groundedDiff = { before: { ...claim.text }, after, addedCitationSourceIds: [], positionChangedWithoutApproval: 0 };
    claim.text = after;
  } else if (decision === "ANSWER") claim.groundedDiff = { before: claim.text, after: claim.text, addedCitationSourceIds: [], positionChangedWithoutApproval: 0 };
  else claim.groundedDiff = null;
  render();
}

function render() {
  const { fixture, claim } = state;
  $("docket").textContent = `${fixture.type} · ${fixture.docketId}`;
  $("title").textContent = fixture.title; $("agency").textContent = fixture.agency;
  $("deadline").textContent = fixture.deadline; $("comment-link").href = fixture.commentUrl;
  $("instructions").textContent = fixture.participationInstructions;
  $("claim-id").textContent = claim.id; $("claim-label").textContent = `${claim.label} · EVIDENCE`;
  $("claim-en").textContent = claim.text.en; $("claim-es").textContent = claim.text.es;
  $("source-id").textContent = `Source ${claim.sourceSpan.sourceId}`;
  $("source-range").textContent = `characters ${claim.sourceSpan.start}–${claim.sourceSpan.end}`;
  $("source-text").textContent = claim.sourceSpan.text; $("question").textContent = claim.adversarialQuestion;
  $("decisions").replaceChildren(...DECISIONS.map((d) => Object.assign(document.createElement("button"), { textContent: d, className: d === claim.humanDecision ? "active" : "", onclick: () => decide(d) })));
  const result = evaluate(claim); $("status").textContent = result.status; $("status").className = `status ${result.status === "BLOCKED" ? "blocked" : "ready"}`;
  $("gates").innerHTML = Object.entries(result.gates).map(([name, pass]) => `<div class="gate ${pass ? "pass" : "fail"}"><span>${pass ? "✓" : "×"}</span>${name}</div>`).join("");
  $("diff").hidden = !claim.groundedDiff;
  if (claim.groundedDiff) { $("before").textContent = claim.groundedDiff.before.en; $("after").textContent = claim.groundedDiff.after.en; }
}

try {
  const response = await fetch("/api/fixture/noaa-nmfs-2025-0471");
  if (!response.ok) throw new Error((await response.json()).error);
  state = await response.json(); render(); $("loading").hidden = true; $("app").hidden = false;
} catch (error) { $("loading").textContent = `Fixture unavailable: ${error.message}`; }
