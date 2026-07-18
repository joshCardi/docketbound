import test from "node:test";
import assert from "node:assert/strict";
import { DOCKETBOUND_MODEL, responseText } from "../src/lib/openai-client.js";

test("runtime model is frozen to GPT-5.6", () => {
  assert.equal(DOCKETBOUND_MODEL, "gpt-5.6");
});

test("extracts text from raw Responses API message output", () => {
  assert.equal(responseText({ output: [{ type: "message", content: [{ type: "output_text", text: "ready" }] }] }), "ready");
});
