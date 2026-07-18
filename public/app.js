const DECISIONS = ["ANSWER", "LIMIT", "REJECT", "UNRESOLVED"];
let state;
let activeClaimId = "C-01";
const $ = (id) => document.getElementById(id);
const numberTokens = (value) => value.match(/\b\d[\d,.]*\b|\b\d{4}-\d{2}-\d{2}\b/g) ?? [];

function realDiff(claim) {
  return Boolean(claim.groundedDiff && claim.groundedDiff.before.en !== claim.groundedDiff.after.en && claim.groundedDiff.before.es !== claim.groundedDiff.after.es);
}

function evaluate(claim) {
  const approved = new Set(claim.approvedSourceIds);
  const gates = {
    "Source span bound": Boolean(claim.sourceSpan?.text),
    "No new citations": claim.citationSourceIds.every((id) => approved.has(id)),
    "Dates/numbers preserved": JSON.stringify([...new Set(numberTokens(claim.text.en))].sort()) === JSON.stringify([...new Set(numberTokens(claim.text.es))].sort()),
    "Human decision resolved": ["ANSWER", "LIMIT", "REJECT"].includes(claim.humanDecision),
    "Grounded diff complete": claim.humanDecision === "ANSWER" || (claim.humanDecision === "LIMIT" && realDiff(claim))
  };
  if (claim.humanDecision === "REJECT") return { gates: { ...gates, "Grounded diff complete": false }, status: "EXCLUDED" };
  return { gates, status: Object.values(gates).every(Boolean) ? "READY FOR HUMAN REVIEW" : "BLOCKED" };
}

function currentClaim() { return state.claims.find((claim) => claim.id === activeClaimId); }

async function decide(decision) {
  const claim = currentClaim();
  if (decision === "LIMIT") {
    setBusy(true, "GPT-5.6 is narrowing within approved evidence…");
    try {
      const response = await fetch(`/api/claims/${claim.id}/limit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intake: state.intake }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      Object.assign(claim, result.claim);
    } catch (error) { alert(`Grounded diff blocked: ${error.message}`); }
    finally { setBusy(false); }
  } else {
    claim.humanDecision = decision;
    claim.groundedDiff = null;
  }
  renderClaims();
}

function setBusy(busy, message = "") {
  $("journey").textContent = message;
  document.querySelectorAll("#decisions button").forEach((button) => { button.disabled = busy; });
}

function renderIntake() {
  $("position").value = state.intake.organizationPosition;
  $("evidence-count").textContent = `${state.intake.items.length} / 6 approved sources`;
  $("add-evidence").disabled = state.intake.items.length >= 6;
  $("evidence-items").replaceChildren(...state.intake.items.map((item, index) => {
    const row = document.createElement("div"); row.className = "evidence-row";
    row.innerHTML = `<span class="approved">APPROVED</span><label>Source name<input data-key="sourceName"></label><label>Owner<input data-key="owner"></label><label>Language<select data-key="language"><option>English</option><option>Spanish</option><option>bilingual</option></select></label>`;
    row.querySelector('[data-key="sourceName"]').value = item.sourceName;
    row.querySelector('[data-key="owner"]').value = item.owner;
    row.querySelector("select").value = item.language;
    row.querySelectorAll("input,select").forEach((input) => input.addEventListener("change", () => { state.intake.items[index][input.dataset.key] = input.value; }));
    return row;
  }));
}

function addEvidence() {
  if (state.intake.items.length >= 6) return;
  const n = state.intake.items.length + 1;
  state.intake.items.push({ sourceId: `ORG-0${n}`, sourceName: "New approved source", owner: "Participating organization", language: "bilingual", sourceSpan: { sourceId: `ORG-0${n}`, file: "organization-approved-evidence", start: 0, end: 0, text: "Pending exact approved source span." } });
  renderIntake();
}

function renderClaims() {
  const claim = currentClaim();
  $("claim-tabs").replaceChildren(...state.claims.map((item) => Object.assign(document.createElement("button"), { className: item.id === activeClaimId ? "active" : "", textContent: `${item.id} · ${item.evidenceStatus}`, onclick: () => { activeClaimId = item.id; renderClaims(); } })));
  $("claim-id").textContent = claim.id; $("claim-label").textContent = `${claim.label} · ${claim.label === "E" ? "EVIDENCE" : "INFERENCE"}`;
  $("evidence-state").textContent = claim.evidenceStatus; $("evidence-state").className = `evidence-state ${claim.evidenceStatus.includes("NEEDS") ? "needs" : "supported"}`;
  $("claim-en").textContent = claim.text.en; $("claim-es").textContent = claim.text.es;
  $("source-id").textContent = `Source ${claim.sourceSpan.sourceId}`; $("source-range").textContent = `characters ${claim.sourceSpan.start}–${claim.sourceSpan.end}`;
  $("source-text").textContent = claim.sourceSpan.text; $("question").textContent = claim.adversarialQuestion;
  $("decisions").replaceChildren(...DECISIONS.map((d) => Object.assign(document.createElement("button"), { textContent: d, className: d === claim.humanDecision ? "active" : "", onclick: () => decide(d) })));
  const result = evaluate(claim); $("status").textContent = result.status; $("status").className = `status ${result.status === "BLOCKED" ? "blocked" : result.status === "EXCLUDED" ? "excluded" : "ready"}`;
  $("journey").textContent = result.status === "BLOCKED" ? "Decision unresolved · grounded diff incomplete" : result.status === "EXCLUDED" ? "Rejected by human · removed from participation packet" : "All mechanical gates passed · human review still required";
  $("gates").innerHTML = Object.entries(result.gates).map(([name, pass]) => `<div class="gate ${pass ? "pass" : "fail"}"><span>${pass ? "✓" : "×"}</span>${name}</div>`).join("");
  $("diff").hidden = !realDiff(claim);
  if (realDiff(claim)) { $("before").textContent = claim.groundedDiff.before.en; $("after").textContent = claim.groundedDiff.after.en; }
}

function render() {
  const { fixture } = state;
  $("docket").textContent = `${fixture.type} · ${fixture.docketId}`; $("title").textContent = fixture.title; $("agency").textContent = fixture.agency;
  $("deadline").textContent = fixture.deadline; $("comment-link").href = fixture.commentUrl; $("instructions").textContent = fixture.participationInstructions;
  renderIntake(); renderClaims();
}

$("add-evidence").addEventListener("click", addEvidence);
$("position").addEventListener("change", (event) => { state.intake.organizationPosition = event.target.value; });
try {
  const response = await fetch("/api/fixture/noaa-nmfs-2025-0471");
  if (!response.ok) throw new Error((await response.json()).error);
  state = await response.json(); render(); $("loading").hidden = true; $("app").hidden = false;
} catch (error) { $("loading").textContent = `Fixture unavailable: ${error.message}`; }
