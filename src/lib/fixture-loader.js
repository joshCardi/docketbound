import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const FIXTURES = Object.freeze({
  "noaa-nmfs-2025-0471": {
    kind: "federal-docket",
    rawDir: "fixtures/noaa-nmfs-2025-0471/raw",
    metadata: "fr-2026-13808.json",
    fullText: "fr-2026-13808-fulltext.txt"
  },
  pc1213: { kind: "puerto-rico-bill", unavailable: true }
});

export function daysUntilDate(date, now = new Date()) {
  const [year, month, day] = date.split("-").map(Number);
  const deadlineUtc = Date.UTC(year, month - 1, day);
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.ceil((deadlineUtc - todayUtc) / 86_400_000));
}

function exactSpan(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start < 0) throw new Error(`Fixture span start not found: ${startMarker}`);
  const endStart = text.indexOf(endMarker, start);
  if (endStart < 0) throw new Error(`Fixture span end not found: ${endMarker}`);
  const end = endStart + endMarker.length;
  return { start, end, text: text.slice(start, end) };
}

function faithfulText(raw) {
  return raw
    .replace(/<a href="([^"]+)">([^<]+)<\/a>/g, "$2")
    .replace(/``([^']+)''/g, "“$1”")
    .replace(/\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/([A-Z0-9])-\s+(?=\d)/g, "$1-")
    .trim();
}

export function presentParticipationInstructions(raw) {
  const [introRaw, electronicRaw = "", mailAndInstructionsRaw = ""] = raw.split(/\s*<bullet>\s*/);
  const [mailRaw = "", instructionsRaw = ""] = mailAndInstructionsRaw.split(/\s+Instructions:\s*/);
  return {
    intro: faithfulText(introRaw).replace(/^ADDRESSES:\s*/, ""),
    methods: [faithfulText(electronicRaw), faithfulText(mailRaw)].filter(Boolean),
    instructions: instructionsRaw ? `Instructions: ${faithfulText(instructionsRaw)}` : "",
    raw
  };
}

export async function loadFixture(id = "noaa-nmfs-2025-0471") {
  const config = FIXTURES[id];
  if (!config) throw Object.assign(new Error("Unknown fixture"), { status: 404 });
  if (config.unavailable) {
    throw Object.assign(new Error("PC1213 fallback fixture slot is reserved but not yet seeded."), { status: 503 });
  }

  const rawDir = path.join(ROOT, config.rawDir);
  const [metadataRaw, fullText] = await Promise.all([
    readFile(path.join(rawDir, config.metadata), "utf8"),
    readFile(path.join(rawDir, config.fullText), "utf8")
  ]);
  const metadata = JSON.parse(metadataRaw);
  const deadline = exactSpan(fullText, "DATES:", "August 7, 2026.");
  const addresses = exactSpan(fullText, "ADDRESSES:", "remain anonymous).");
  const operative = exactSpan(
    fullText,
    "SUMMARY:",
    "management of other pelagic species."
  );

  return {
    id,
    kind: config.kind,
    title: metadata.title,
    type: metadata.type,
    documentNumber: metadata.document_number,
    docketId: "NOAA-NMFS-2025-0471",
    agency: metadata.agencies?.at(-1)?.name ?? "Unknown agency",
    publicationDate: metadata.publication_date,
    deadline: metadata.comments_close_on,
    daysLeftToComment: daysUntilDate(metadata.comments_close_on),
    commentUrl: metadata.regulations_dot_gov_url?.replace(/^http:/, "https:"),
    participationInstructions: addresses.text,
    participationPresentation: presentParticipationInstructions(addresses.text),
    sourceSpans: {
      deadline: { sourceId: "FR-2026-13808", file: config.fullText, ...deadline },
      addresses: { sourceId: "FR-2026-13808", file: config.fullText, ...addresses },
      operative: { sourceId: "FR-2026-13808", file: config.fullText, ...operative }
    }
  };
}
