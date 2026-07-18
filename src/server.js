import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixture } from "./lib/fixture-loader.js";
import { buildSeedClaim, evaluateExport } from "./lib/claim-ledger.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
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
      const claim = buildSeedClaim(fixture);
      return json(res, 200, { fixture, claim, export: evaluateExport(claim) });
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
