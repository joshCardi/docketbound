import { loadEnvFile } from "node:process";
import { loadFixture } from "../src/lib/fixture-loader.js";
import { AGORA_MODEL, responseText, runToolLoop } from "../src/lib/openai-client.js";

try { loadEnvFile(new URL("../.env", import.meta.url)); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const tools = [{
  type: "function",
  name: "read_frozen_fixture",
  description: "Read verified metadata from a frozen local public-participation fixture. This tool is the only source of docket facts.",
  strict: true,
  parameters: {
    type: "object",
    properties: { fixture_id: { type: "string", enum: ["noaa-nmfs-2025-0471"] } },
    required: ["fixture_id"],
    additionalProperties: false
  }
}];

const { response, toolCalls } = await runToolLoop({
  model: AGORA_MODEL,
  instructions: "You are the single ÁGORA orchestrator. Use the fixture tool before stating any docket fact. Return a one-sentence confirmation without adding citations or facts not returned by the tool.",
  input: "Read the frozen NOAA fixture and confirm its docket ID and comment deadline.",
  tools,
  handlers: {
    async read_frozen_fixture({ fixture_id }) {
      const fixture = await loadFixture(fixture_id);
      return { docketId: fixture.docketId, deadline: fixture.deadline, sourceSpan: fixture.sourceSpans.deadline };
    }
  }
});

if (toolCalls < 1) throw new Error("Smoke test failed: GPT-5.6 did not call the fixture tool");
if (!responseText(response)) throw new Error("Smoke test failed: GPT-5.6 returned no final text");
console.log(JSON.stringify({ ok: true, model: AGORA_MODEL, toolCalls, responseId: response.id }, null, 2));
