const DECISIONS = ["ANSWER", "LIMIT", "REJECT", "UNRESOLVED"];
let state;
let activeClaimId = "C-01";
const $ = (id) => document.getElementById(id);
const numberTokens = (value) => value.match(/\b\d[\d,.]*\b|\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
const LABEL_NAMES = { E: "EVIDENCE", I: "INFERENCE", A: "ASSERTION", R: "RECOMMENDATION" };

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

function appendLinkedText(container, text) {
  container.replaceChildren();
  const urlPattern = /https:\/\/[^\s]+/g;
  let cursor = 0;
  for (const match of text.matchAll(urlPattern)) {
    container.append(document.createTextNode(text.slice(cursor, match.index)));
    const trailing = match[0].match(/[.,;)]$/)?.[0] ?? "";
    const href = trailing ? match[0].slice(0, -1) : match[0];
    const link = document.createElement("a"); link.href = href; link.textContent = href; link.target = "_blank"; link.rel = "noreferrer";
    container.append(link);
    if (trailing) container.append(document.createTextNode(trailing));
    cursor = match.index + match[0].length;
  }
  container.append(document.createTextNode(text.slice(cursor)));
}

function renderInstructions() {
  const view = state.fixture.participationPresentation;
  appendLinkedText($("instructions-intro"), view.intro);
  $("instructions-methods").replaceChildren(...view.methods.map((method) => {
    const item = document.createElement("li"); appendLinkedText(item, method); return item;
  }));
  appendLinkedText($("instructions-note"), view.instructions);
  $("instructions-raw").textContent = view.raw;
}

async function decide(decision) {
  const claim = currentClaim();
  if (decision === "LIMIT") {
    setBusy(true, "GPT-5.6 is narrowing within approved evidence…");
    try {
      const response = await fetch(`/api/claims/${claim.id}/limit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intake: state.intake, claim }) });
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
  $("organization-name").textContent = state.intake.organizationName;
  $("demo-disclosure").textContent = state.intake.demoDisclosure;
  $("position").value = state.intake.organizationPosition;
  $("position-es").value = state.intake.organizationPositionEs;
  $("evidence-count").textContent = `${state.intake.items.length} / 6 approved sources`;
  $("add-evidence").disabled = state.intake.items.length >= 6;
  $("evidence-items").replaceChildren(...state.intake.items.map((item, index) => {
    const row = document.createElement("div"); row.className = "evidence-row";
    row.innerHTML = `<span class="approved">APPROVED</span><label>Source name<input data-key="sourceName"></label><label>Owner<input data-key="owner"></label><label>Language<select data-key="language"><option>English</option><option>Spanish</option><option>bilingual</option></select></label><label class="evidence-text">Approved evidence text · exact permissible span<textarea data-key="sourceText" rows="3"></textarea></label>`;
    row.querySelector('[data-key="sourceName"]').value = item.sourceName;
    row.querySelector('[data-key="owner"]').value = item.owner;
    row.querySelector("select").value = item.language;
    row.querySelector('[data-key="sourceText"]').value = item.sourceSpan.text;
    row.querySelectorAll("input,select,textarea").forEach((input) => input.addEventListener("change", () => {
      if (input.dataset.key === "sourceText") state.intake.items[index].sourceSpan = { ...state.intake.items[index].sourceSpan, start: 0, end: input.value.length, text: input.value };
      else state.intake.items[index][input.dataset.key] = input.value;
      renderPacket();
    }));
    return row;
  }));
}

async function generateLiveClaim() {
  const button = $("generate-claim"); button.disabled = true;
  $("generate-status").textContent = "GPT-5.6 is reading approved sources and reviewing one new claim…";
  try {
    const response = await fetch("/api/claims/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intake: state.intake }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    state.claims.push(result.claim); activeClaimId = result.claim.id;
    $("generate-status").textContent = `${result.claim.id} created · BLOCKED pending human decision`;
    renderClaims();
  } catch (error) { $("generate-status").textContent = error.message; }
  finally { button.disabled = false; }
}

function addEvidence() {
  if (state.intake.items.length >= 6) return;
  const n = state.intake.items.length + 1;
  state.intake.items.push({ sourceId: `ORG-0${n}`, sourceName: "New approved source", owner: "Demo Fishing Community Organization (fictional)", language: "bilingual", sourceSpan: { sourceId: `ORG-0${n}`, file: "organization-approved-evidence", start: 0, end: 0, text: "Pending exact approved source span." } });
  renderIntake();
}

function renderClaims() {
  const claim = currentClaim();
  $("claim-tabs").replaceChildren(...state.claims.map((item) => Object.assign(document.createElement("button"), { className: item.id === activeClaimId ? "active" : "", textContent: `${item.id} · ${item.evidenceStatus}`, onclick: () => { activeClaimId = item.id; renderClaims(); } })));
  $("claim-id").textContent = claim.id; $("claim-label").textContent = `${claim.label} · ${LABEL_NAMES[claim.label] ?? "CLAIM"}`;
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
  renderPacket();
}

function renderPacket() {
  if (!state) return;
  const results = state.claims.map((claim) => ({ claim, result: evaluate(claim) }));
  const ready = results.every(({ result }) => result.status !== "BLOCKED") && results.some(({ result }) => result.status === "READY FOR HUMAN REVIEW");
  $("packet-lock").hidden = ready; $("packet").hidden = !ready;
  if (!ready) return;
  $("packet-case").textContent = `${state.fixture.docketId} · comments close ${state.fixture.deadline}`;
  $("packet-organization").textContent = state.intake.organizationName; $("packet-disclosure").textContent = state.intake.demoDisclosure;
  $("packet-position").textContent = state.intake.organizationPosition;
  $("packet-position-es").textContent = state.intake.organizationPositionEs;
  $("packet-claims").replaceChildren(...results.filter(({ result }) => result.status !== "EXCLUDED").map(({ claim, result }) => {
    const entry = document.createElement("div"); entry.className = `packet-claim ${result.status === "EXCLUDED" ? "packet-excluded" : ""}`;
    entry.innerHTML = `<div><strong>${claim.id} · ${claim.label}</strong><span>${claim.humanDecision} · ${result.status}</span></div><p class="packet-en"></p><p class="packet-es"></p><small>Source: ${claim.sourceSpan.sourceId} · Owner: ${claim.owner}</small>`;
    entry.querySelector(".packet-en").textContent = claim.text.en; entry.querySelector(".packet-es").textContent = claim.text.es;
    return entry;
  }));
  $("packet-evidence").replaceChildren(...state.intake.items.map((item) => {
    const entry = document.createElement("p"); entry.textContent = `${item.sourceId} · ${item.sourceName} · ${item.owner} · ${item.language}`; return entry;
  }));
  const excluded = results.filter(({ result }) => result.status === "EXCLUDED").length;
  $("packet-provenance").textContent = `Frozen fixture ${state.fixture.documentNumber} · raw ADDRESSES span ${state.fixture.sourceSpans.addresses.start}–${state.fixture.sourceSpans.addresses.end} · ${state.intake.items.length} fictional approved evidence records · excluded claims: ${excluded} · new citations introduced: 0`;
  const submission = $("packet-submission"); submission.replaceChildren(...state.fixture.participationPresentation.methods.map((method) => {
    const quote = document.createElement("blockquote"); appendLinkedText(quote, method); return quote;
  }));
}

function render() {
  const { fixture } = state;
  $("docket").textContent = `${fixture.type} · ${fixture.docketId}`; $("title").textContent = fixture.title; $("agency").textContent = fixture.agency;
  const dayLabel = fixture.daysLeftToComment === 1 ? "day" : "days";
  $("deadline").textContent = fixture.deadline; $("countdown").textContent = `${fixture.daysLeftToComment} ${dayLabel} left to comment`; $("comment-link").href = fixture.commentUrl;
  renderInstructions(); renderIntake(); renderClaims();
}

$("add-evidence").addEventListener("click", addEvidence);
$("generate-claim").addEventListener("click", generateLiveClaim);
$("position").addEventListener("change", (event) => { state.intake.organizationPosition = event.target.value; renderPacket(); });
$("position-es").addEventListener("change", (event) => { state.intake.organizationPositionEs = event.target.value; renderPacket(); });
$("print-packet").addEventListener("click", () => window.print());
$("copy-packet").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("packet").innerText);
  $("copy-packet").textContent = "Copied";
});
try {
  const response = await fetch("/api/fixture/noaa-nmfs-2025-0471");
  if (!response.ok) throw new Error((await response.json()).error);
  state = await response.json(); render(); $("loading").hidden = true; $("app").hidden = false;
} catch (error) { $("loading").textContent = `Fixture unavailable: ${error.message}`; }
