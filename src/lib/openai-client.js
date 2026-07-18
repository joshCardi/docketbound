const RESPONSES_URL = "https://api.openai.com/v1/responses";

export const DOCKETBOUND_MODEL = "gpt-5.6";

export function responseText(response) {
  return (response.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

async function createResponse(body, apiKey = process.env.OPENAI_API_KEY) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const response = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI Responses API ${response.status}: ${detail.slice(0, 500)}`);
  }
  return response.json();
}

export async function runToolLoop({ input, instructions, tools, handlers, model = DOCKETBOUND_MODEL }) {
  let response = await createResponse({ model, instructions, input, tools });
  let toolCalls = 0;

  for (let turn = 0; turn < 8; turn += 1) {
    const calls = response.output?.filter((item) => item.type === "function_call") ?? [];
    if (!calls.length) return { response, toolCalls };
    const outputs = [];
    for (const call of calls) {
      const handler = handlers[call.name];
      if (!handler) throw new Error(`No handler registered for tool: ${call.name}`);
      const result = await handler(JSON.parse(call.arguments || "{}"));
      toolCalls += 1;
      outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
    }
    response = await createResponse({ model, previous_response_id: response.id, input: outputs, tools });
  }
  throw new Error("Tool loop exceeded 8 turns");
}
