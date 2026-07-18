import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";
import { loadFixture } from "./lib/fixture-loader.js";
import { buildDemoClaims, decideClaim, evaluateExport, isRealGroundedDiff, SEEDED_EVIDENCE_INTAKE } from "./lib/claim-ledger.js";
import { runToolLoop } from "./lib/openai-client.js";
import { clientIp, createHourlyIpRateLimiter, RATE_LIMIT_MESSAGE } from "./lib/rate-limit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try { loadEnvFile(path.join(ROOT, ".env")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const gptRateLimiter = createHourlyIpRateLimiter({ limit: 10 });

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function enforceGptRateLimit(req, res) {
  const result = gptRateLimiter.check(clientIp(req, TRUST_PROXY));
  if (result.allowed) return true;
  res.writeHead(429, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "retry-after": String(result.retryAfterSeconds)
  });
  res.end(JSON.stringify({ error: RATE_LIMIT_MESSAGE }));
  return false;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function generateLimitedClaim(claim, intake) {
  let submittedRewrite = null;
  const tools = [{
    type: "function", name: "read_approved_evidence", strict: true,
    description: "Return the only organization-approved evidence permissible for narrowing this claim.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false }
  }, {
    type: "function", name: "submit_grounded_rewrite", strict: true,
    description: "Submit the final bilingual claim narrowed strictly to the approved evidence returned by read_approved_evidence.",
    parameters: {
      type: "object",
      properties: { en: { type: "string" }, es: { type: "string" } },
      required: ["en", "es"], additionalProperties: false
    }
  }];
  await runToolLoop({
    instructions: "You are ÁGORA's single internal grounded-diff operation. First call read_approved_evidence. Then narrow the challenged claim strictly to what the returned source spans support and call submit_grounded_rewrite. Preserve every date and number across English and Spanish. Introduce no citation, source, fact, or geographic scope beyond tool output. Do not state the rewrite as prose; submit it through the tool.",
    input: `LIMIT claim ${claim.id}. Before EN: ${claim.text.en}\nBefore ES: ${claim.text.es}\nReviewer: ${claim.adversarialQuestion}`,
    tools,
    handlers: {
      read_approved_evidence() {
        const allowed = new Set(claim.approvedSourceIds);
        return intake.items.filter((item) => allowed.has(item.sourceId));
      },
      submit_grounded_rewrite(rewrite) {
        submittedRewrite = rewrite;
        return { acceptedForMechanicalValidation: true };
      }
    }
  });
  if (!submittedRewrite) throw new Error("GPT-5.6 did not submit a grounded rewrite");
  const limited = decideClaim(claim, "LIMIT", submittedRewrite);
  if (!isRealGroundedDiff(limited)) throw new Error("GPT-5.6 did not materially narrow both languages");
  const exportResult = evaluateExport(limited);
  if (exportResult.status !== "READY FOR HUMAN REVIEW") throw new Error("Grounded rewrite failed mechanical export gates");
  return { claim: limited, export: exportResult };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname === "/api/cases") {
      return json(res, 200, [
        { id: "noaa-nmfs-2025-0471", label: "NOAA-NMFS-2025-0471", available: true },
        { id: "pc1213", label: "PC1213", available: false }
      ]);
    }
    if (url.pathname.startsWith("/api/fixture/")) {
      const fixture = await loadFixture(url.pathname.split("/").at(-1));
      const claims = buildDemoClaims(fixture, SEEDED_EVIDENCE_INTAKE);
      return json(res, 200, { fixture, intake: SEEDED_EVIDENCE_INTAKE, claims, exports: Object.fromEntries(claims.map((claim) => [claim.id, evaluateExport(claim)])) });
    }
    if (req.method === "POST" && url.pathname === "/api/claims/C-02/limit") {
      if (!enforceGptRateLimit(req, res)) return;
      const fixture = await loadFixture();
      const body = await readJson(req);
      const intake = body.intake ?? SEEDED_EVIDENCE_INTAKE;
      const claim = buildDemoClaims(fixture, intake).find((item) => item.id === "C-02");
      return json(res, 200, await generateLimitedClaim(claim, intake));
    }
    const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const safe = path.normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
    const file = await readFile(path.join(PUBLIC, safe));
    res.writeHead(200, { "content-type": TYPES[path.extname(safe)] ?? "application/octet-stream" });
    res.end(file);
  } catch (error) {
    if (req.url?.startsWith("/api/")) return json(res, error.status ?? 500, { error: error.message });
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(PORT, HOST, () => console.log(`ÁGORA listening on http://${HOST}:${PORT}`));
