# Prior Work Disclosure

ÁGORA consumes an existing, pre-competition Ponencia Loop baseline as external infrastructure.

The local file `reference/ponencia-loop-index.ts` is a read-only snapshot of that pre-existing production edge function. It is excluded from judging as newly built functionality. It documents the established Supabase data primitives, search functions, and the model-specific embedding pattern used by `search_opinions_semantic`.

ÁGORA does not port or claim the baseline's agent-generation layer. Its legacy non-OpenAI model calls remain reference-only. The Build Week product runtime is a new, minimal GPT-5.6 Responses API orchestrator with programmatic tool calling, an evidence-bound claim ledger, one internal adversarial review, human decision controls, grounded diffs, and mechanical export gates.

Existing services are treated as data services and will be called only when the conditional relevance router requires them. The frozen-fixture golden path does not depend on live ingestion.
