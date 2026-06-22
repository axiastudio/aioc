# RFC-0013: LangGraph Companion Package

- Status: Experimental
- Date: 2026-06-21
- Owners: aioc maintainers
- Depends on: RFC-0003, RFC-0009, RFC-0011, RFC-0012
- Related: RFC-0001, RFC-0002, RFC-0010

## Context

`aioc` is intentionally governance-first and framework-light. The core runtime
owns deterministic policy gates, `RunRecord`, replay, comparison, and
application-owned audit artifacts. It should not absorb every orchestration,
retrieval, graph, or agent framework feature.

LangGraph is a common orchestration layer for agentic and deterministic
workflows. Teams using LangGraph may still want aioc-style portable run records,
comparison workflows, and governance boundaries without replacing their graph
orchestrator.

The examples in `examples/langchain` validate three integration patterns:

- aioc-first, LangChain-extended;
- LangGraph-orchestrated, aioc-governed;
- LangGraph-orchestrated, aioc-recorded.

The third pattern is especially small:

```ts
const app = withAiocRunRecord(graph.compile(), {
  record: { sink },
});
```

It keeps LangGraph as the orchestrator and adds a transparent aioc recording
layer around the compiled graph.

## Decision

`aioc` should explore a companion package for LangGraph interoperability:

```text
@axiastudio/aioc-langgraph
```

The package should not be a dependency of the core `@axiastudio/aioc` runtime.
It should depend on aioc contracts and LangGraph runtime types through peer
dependencies:

```json
{
  "peerDependencies": {
    "@axiastudio/aioc": "^0.2.6",
    "@langchain/core": "^1.x",
    "@langchain/langgraph": "^1.x"
  }
}
```

The first official candidate API should be `withAiocRunRecord(...)`.

`withAiocGovernance(...)` is a valuable direction, but should remain
experimental until the node-wrapping semantics, deny behavior, and LangGraph
internal API dependency are better understood.

## Goals

- Keep `@axiastudio/aioc` core free of LangGraph dependencies.
- Provide a one-line way to attach `RunRecord` emission to a compiled
  LangGraph app.
- Preserve LangGraph runtime behavior: same input, same output, same error
  semantics.
- Make the recording layer non-invasive and failure-isolated.
- Use existing aioc `RunRecordOptions` for sink, metadata, run id, prompt text
  preference, and context redaction.
- Produce graph-level `RunRecord` values that can be inspected, compared,
  persisted, and evaluated by downstream workflows.
- Keep the companion package small enough to validate with examples before
  expanding the public surface.

## Non-Goals

- No LangGraph dependency in aioc core.
- No broad `@axiastudio/aioc-langchain` package in this RFC.
- No generic replacement for LangChain, LangGraph, or their orchestration
  model.
- No hosted or managed trace/debug/eval platform in this RFC.
- No LangSmith-compatible service API.
- No claim that graph-level recording provides node-level governance.
- No automatic capture of LangGraph internal tool calls unless those calls cross
  an aioc boundary.
- No mutation of compiled LangGraph runtime internals after `compile()`.

Applications may use the emitted `RunRecord` values to build inspection,
comparison, offline evaluation, dashboards, or platform workflows. Those
workflows are consumers of the record contract, not responsibilities of the
LangGraph adapter itself.

## Package Shape

Suggested package layout:

```text
packages/
  aioc-langgraph/
    src/
      index.ts
      with-aioc-run-record.ts
      with-aioc-governance.ts
      types.ts
    README.md
    package.json
```

Initial exports:

```ts
export { withAiocRunRecord } from "./with-aioc-run-record";
export type {
  LangGraphRunRecordContext,
  WithAiocRunRecordOptions,
} from "./types";
```

Future experimental exports:

```ts
export { withAiocGovernance } from "./with-aioc-governance";
export type {
  WithAiocGovernanceOptions,
  GovernedLangGraphNodeOptions,
} from "./types";
```

## Candidate API: `withAiocRunRecord`

`withAiocRunRecord(...)` wraps an already compiled LangGraph app.

```ts
const graph = new StateGraph(State)
  .addNode("answer", answerNode)
  .addEdge(START, "answer")
  .addEdge("answer", END);

const app = withAiocRunRecord(graph.compile(), {
  record: {
    sink,
    metadata: { workflow: "support-answer" },
    contextRedactor: (context) => ({
      contextSnapshot: {
        ...context,
        input: "[redacted]",
      },
      contextRedacted: true,
    }),
  },
});

const result = await app.invoke(input);
```

The function returns a compiled-graph-like runnable wrapper, not a
`StateGraph`.

Conceptually:

```text
CompiledStateGraph -> RecordedCompiledStateGraph
```

The returned object should preserve the operational interface of the input app
as much as practical:

- `invoke(...)` delegates to the original app and records the run.
- non-intercepted methods delegate to the original app.
- successful graph output is returned unchanged.
- graph errors are recorded and then rethrown unchanged.
- sink failures must not alter LangGraph behavior.

### Proposed Type

```ts
export interface LangGraphRunRecordContext<
  RunInput = unknown,
  RunOutput = unknown,
> {
  integration: "langgraph";
  runnableName: string;
  input: RunInput;
  output?: RunOutput;
  error?: {
    name: string;
    message: string;
  };
}

export interface WithAiocRunRecordOptions<TContext = unknown> {
  record: RunRecordOptions<TContext>;
}

export function withAiocRunRecord<
  TApp extends RunnableInterface<unknown, unknown, any>,
>(
  app: TApp,
  options: WithAiocRunRecordOptions<
    LangGraphRunRecordContext<
      RunnableInput<TApp>,
      RunnableOutput<TApp>
    >
  >,
): TApp;
```

The adapter should use the existing aioc `RunRecordOptions` surface rather than
introducing parallel `sink`, `metadata`, or `contextRedactor` options.

## RunRecord Semantics

`withAiocRunRecord(...)` produces a graph-level `RunRecord`.

For a completed graph run:

- `status`: `completed`
- `providerName`: `LangGraph`
- `agentName`: runnable or graph name when available
- `question`: serialized graph input
- `response`: serialized graph output
- `contextSnapshot`: LangGraph wrapper context, optionally redacted through
  `record.contextRedactor`
- `items`: a minimal input item representing the graph input
- `policyDecisions`: empty unless the graph itself crosses an aioc-governed
  boundary
- `promptSnapshots`: empty unless future instrumentation can capture stable
  prompt evidence
- `requestFingerprints`: empty unless future instrumentation can capture stable
  model request evidence
- `metadata`: user metadata plus adapter metadata

For a failed graph run:

- `status`: `failed`
- `errorName` and `errorMessage` are populated
- original error is rethrown after recording

This record is useful for inspection, persistence, comparison, regression
checks, and offline judging. It should not be presented as a complete
node-level LangGraph trace.

## Privacy

The adapter should follow the existing aioc privacy posture:

- no implicit redaction by default;
- `record.contextRedactor` is the primary minimization hook;
- sink ownership remains application-side;
- recording failures are isolated from runtime behavior;
- examples should show redaction when context may contain sensitive data.

Because graph inputs and outputs may contain full message histories, documents,
tool payloads, or business data, production usage should treat
`contextRedactor` as mandatory before durable persistence.

## Candidate API: `withAiocGovernance`

`withAiocGovernance(...)` is a separate, stronger pattern.

```ts
const governedGraph = withAiocGovernance(graph, {
  nodes: "all",
  record: { sink },
});

const app = governedGraph.compile();
```

Conceptually:

```text
StateGraph -> GovernedStateGraph -> CompiledStateGraph
```

Unlike `withAiocRunRecord(...)`, this function operates before `compile()`.
It would wrap graph nodes so selected execution boundaries can cross aioc
policy and recording logic.

Potential behavior:

- inspect `graph.nodes`;
- replace selected node runnables with aioc-governed wrappers;
- preserve graph edges, branches, waiting edges, schemas, and node options;
- return a compilable `StateGraph`;
- record policy decisions for governed nodes;
- allow node-specific deny behavior through explicit `onDeny` callbacks.

This API should remain experimental because denial in a graph node must still
return a valid LangGraph state update or command. The adapter cannot invent a
universal deny shape for arbitrary graph state.

## Relationship Between APIs

The two APIs serve different purposes.

```ts
withAiocRunRecord(graph.compile(), options)
```

- input: compiled LangGraph app;
- output: compiled-graph-like runnable wrapper;
- purpose: graph-level recording;
- enforcement: none;
- implementation: wrap `invoke(...)` and delegate runtime behavior.

```ts
withAiocGovernance(graph, options)
```

- input: uncompiled `StateGraph`;
- output: uncompiled `StateGraph`;
- purpose: node-level governance;
- enforcement: yes, for wrapped nodes;
- implementation: wrap selected nodes before LangGraph compiles them.

`withAiocRunRecord(...)` should be the first package API because it has a small
surface and a strong one-line value proposition. `withAiocGovernance(...)`
should follow only after examples validate a clear and honest state-update
contract.

## Example

A minimal LLM-backed example should live in:

```text
examples/langchain/src/langgraph-run-record.ts
```

It should:

- build a pure LangGraph workflow;
- call an LLM from a LangGraph node;
- wrap the compiled graph with `withAiocRunRecord(...)`;
- invoke the wrapped app;
- print the LangGraph result and a compact `RunRecord` summary.

The current example domain is intentionally simple:

```text
Explain photosynthesis for a 10 year old.
```

This keeps attention on the integration pattern rather than on retrieval,
tools, or multi-agent routing.

## Versioning

The companion package should start as experimental:

```text
0.x
```

Compatibility should be documented around:

- aioc minor version;
- LangGraph major version;
- LangChain core major version.

Breaking changes are expected while the adapter validates:

- graph-level record shape;
- streaming behavior;
- batch behavior;
- topology fingerprinting;
- node governance semantics.

## Implementation Notes

The initial implementation can be promoted from:

```text
examples/langchain/src/lib/aioc-langgraph.ts
```

The companion package should avoid depending on aioc internals that are not
exported from `@axiastudio/aioc`. If helper reuse is required, core should
export small stable utilities rather than asking the companion package to reach
into private files.

For `withAiocRunRecord(...)`, a proxy or small runnable wrapper is acceptable
as long as:

- `invoke(...)` preserves the original return value;
- non-intercepted methods remain available;
- sink failures are swallowed or routed to an explicit optional error handler;
- TypeScript inference keeps graph input and output types usable.

For `withAiocGovernance(...)`, the adapter should prefer public LangGraph
builder surfaces. If wrapping requires internal fields such as `nodes`, `edges`,
`branches`, or `waitingEdges`, the RFC should mark that part as version-fragile
until a stable extension point exists.

## Open Questions

- Should `withAiocRunRecord(...)` also intercept `batch(...)`, `stream(...)`,
  and `streamEvents(...)` in the first companion package release?
- Should the adapter produce a topology fingerprint from graph nodes and edges?
- Should topology metadata live in `RunRecord.metadata` or in a future harness
  descriptor extension?
- Should the adapter expose an optional `onRecordError` callback for sink
  failures?
- Should input and output serialization be configurable, or should the first
  release keep strict default JSON serialization?
- Should graph-level `RunRecord.items` remain minimal, or should it include a
  LangGraph-specific item type once core supports extension items?
- Can `withAiocGovernance(...)` be implemented without relying on LangGraph
  internals?
- What is the minimal deny contract for governed nodes that still feels
  LangGraph-native?
- Should this package also expose helpers for correlating multiple aioc
  node-level `RunRecord` values under one graph run id?

## Adoption Plan

1. Keep the prototype in `examples/langchain/src/lib/aioc-langgraph.ts`.
2. Add one LLM-backed example for `withAiocRunRecord(...)`.
3. Validate the one-line API against real LangGraph usage.
4. Promote the helper into `packages/aioc-langgraph`.
5. Publish as experimental `0.x`.
6. Add docs that clearly distinguish recording from governance.
7. Explore `withAiocGovernance(...)` with explicit node deny examples.

The companion package should graduate only after `withAiocRunRecord(...)`
proves stable enough to support real graph-level recording without surprising
LangGraph users.
