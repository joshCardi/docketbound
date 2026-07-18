import { randomUUID } from "node:crypto";
import { createLiveClaim, evaluateExport } from "./claim-ledger.js";
import { runToolLoop } from "./openai-client.js";

export function validateIntake(value) {
  if (!value || typeof value.organizationPosition !== "string" || !value.organizationPosition.trim()) throw Object.assign(new Error("Organization position is required"), { status: 400 });
  if (!Array.isArray(value.items) || value.items.length < 3 || value.items.length > 6) throw Object.assign(new Error("Approve 3–6 evidence sources before generating a claim"), { status: 400 });
  const ids = new Set();
  const items = value.items.map((item) => {
    if (!item.sourceId || ids.has(item.sourceId)) throw Object.assign(new Error("Approved evidence source IDs must be unique"), { status: 400 });
    ids.add(item.sourceId);
    const text = String(item.sourceSpan?.text ?? "").trim();
    if (!item.sourceName || !item.owner || !item.language || !text || text === "Pending exact approved source span.") throw Object.assign(new Error("Every approved source needs a name, owner, language, and evidence text"), { status: 400 });
    if (text.length > 8_000) throw Object.assign(new Error("Each approved evidence span must be 8,000 characters or fewer"), { status: 400 });
    return { ...item, sourceSpan: { ...item.sourceSpan, sourceId: item.sourceId, start: 0, end: text.length, text } };
  });
  return { ...value, organizationPosition: value.organizationPosition.trim(), items };
}

export async function generateLiveClaim(intake, { fixtureSha256, runTools = runToolLoop, idFactory = () => `C-LIVE-${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}` } = {}) {
  let evidenceRead = false;
  let submission = null;
  let adversarialQuestion = null;
  const tools = [{
    type: "function", name: "read_approved_sources", strict: true,
    description: "Read the organization's position and every permissible approved evidence span.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false }
  }, {
    type: "function", name: "submit_material_claim", strict: true,
    description: "Submit one bilingual material claim bound to exactly one approved source ID.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" }, label: { type: "string", enum: ["E", "I", "A", "R"] },
        en: { type: "string" }, es: { type: "string" }, source_id: { type: "string" }
      },
      required: ["title", "label", "en", "es", "source_id"], additionalProperties: false
    }
  }, {
    type: "function", name: "submit_adversarial_question", strict: true,
    description: "Submit the one question most capable of breaking the material claim against its bound evidence.",
    parameters: { type: "object", properties: { question: { type: "string" } }, required: ["question"], additionalProperties: false }
  }];

  await runTools({
    instructions: "You are DocketBound's single claim-generation and adversarial-review loop. First call read_approved_sources. Generate exactly one material bilingual claim aligned with the organization's position and strictly supported by one returned source span. Preserve all dates and numbers across English and Spanish. Select E (evidence), I (inference), A (assertion), or R (recommendation). Call submit_material_claim with the approved source_id; never invent a citation or span. Then call submit_adversarial_question with the one question most capable of breaking that claim. Do not submit prose outside tools.",
    input: "Generate one new evidence-bound bilingual claim and its adversarial question from the organization's current intake.",
    tools,
    handlers: {
      read_approved_sources() {
        evidenceRead = true;
        return { organizationPosition: intake.organizationPosition, organizationPositionEs: intake.organizationPositionEs, sources: intake.items };
      },
      submit_material_claim(args) {
        if (!evidenceRead) throw new Error("Approved evidence must be read before claim submission");
        submission = { title: args.title, label: args.label, en: args.en, es: args.es, sourceId: args.source_id };
        return { acceptedForValidation: true };
      },
      submit_adversarial_question({ question }) {
        if (!submission) throw new Error("A material claim must be submitted before review");
        adversarialQuestion = question;
        return { acceptedForValidation: true };
      }
    }
  });
  if (!submission || !adversarialQuestion) throw new Error("GPT-5.6 did not complete live claim generation and review");
  const claim = createLiveClaim({ id: idFactory(), intake, submission, adversarialQuestion, fixtureSha256 });
  return { claim, export: evaluateExport(claim) };
}
