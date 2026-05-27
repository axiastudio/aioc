# RFC-0011: Agent Harness Descriptor

- Status: Experimental
- Date: 2026-05-22
- Owners: aioc maintainers
- Depends on: RFC-0001, RFC-0003, RFC-0005
- Related: RFC-0007, RFC-0008

## Context

`aioc` started as a code-first governance runtime:

- applications instantiate `Agent` objects in TypeScript,
- applications bind executable `Tool` implementations in TypeScript,
- applications configure policies at run time,
- `RunRecord` captures the executed behavior for audit, replay, and
  non-regression checks.

That remains the core model.

However, real applications and evaluation harnesses often need a stable,
portable description of an agent graph:

- which agent is the entry point,
- which agents exist,
- which handoffs are available,
- which tool ids are exposed to each agent,
- which runtime defaults apply,
- which context defaults are expected,
- which context values may be referenced by instruction templates,
- which descriptor version and hash identify the candidate being evaluated.

Without a descriptor layer, this information stays embedded in application code
and is harder to compare, review, diff, or attach to non-regression records.

## Decision

`aioc` introduces an experimental Agent Harness Descriptor.

The descriptor is a data-first representation of an agent graph and its minimal
runtime harness metadata. It can be authored as YAML or JSON, parsed by the
host application, and passed to `buildAgentHarness(...)`.

The descriptor does **not** make the runtime declarative.

The host application still owns:

- tool implementations,
- policy definitions,
- provider setup,
- approval workflows,
- persistence,
- context lifecycle,
- security and deployment configuration.

The first implementation is intentionally narrow and lives in the core package
only while the shape is validated through `0.2.0-next.*` releases.

## Goals

- Make agent graph structure easier to inspect and diff.
- Support descriptor-based examples and evaluation harnesses.
- Attach stable descriptor metadata and `descriptorHash` to run records.
- Keep executable code outside the descriptor.
- Keep policies outside the descriptor.
- Keep provider credentials and setup outside the descriptor.
- Support context defaults for reproducible harness execution.
- Support explicit context references for instruction templates.
- Preserve compatibility with code-first `Agent` construction.

## Non-Goals

- No no-code agent builder.
- No runtime-owned persistence.
- No built-in YAML loader in core.
- No executable JavaScript inside descriptors.
- No policy DSL.
- No tool implementation DSL.
- No provider credential storage.
- No approval workflow DSL.
- No replacement for `Agent`, `Tool`, `ToolPolicy`, or `HandoffPolicy`.
- No stable production configuration contract until the experimental period is
  complete.

## Descriptor Shape

The initial descriptor shape is:

```ts
export interface AgentHarnessDescriptor {
  descriptor_version?: string;
  metadata?: {
    name?: string;
    version?: string;
    [key: string]: unknown;
  };
  runtime: {
    entry_agent: string;
    max_turns?: number;
  };
  context?: {
    fields?: Record<string, HarnessContextFieldDescriptor>;
    references?: Record<string, HarnessContextReferenceEntry>;
  };
  tools?: Record<string, { target: string }>;
  agent_defaults?: {
    model?: string;
    modelSettings?: Record<string, unknown>;
    instructions?: string;
  };
  agents: Record<string, HarnessAgentDescriptor>;
}
```

Agents may define:

```ts
export interface HarnessAgentDescriptor {
  name?: string;
  handoffDescription?: string;
  instructions?: string;
  model?: string;
  modelSettings?: Record<string, unknown>;
  tools?: string[];
  handoffs?: string[];
}
```

Context fields may define defaults:

```ts
export interface HarnessContextFieldDescriptor {
  type: string;
  default?: unknown;
  optional?: boolean;
  mutable?: boolean;
  redact?: boolean;
  [key: string]: unknown;
}
```

Context references define which context paths instruction templates may read:

```ts
export type HarnessContextReferenceEntry =
  | boolean
  | {
      type?: string;
      optional?: boolean;
      [key: string]: unknown;
    };
```

`context.fields` and `context.references` have separate responsibilities:

- `context.fields` describes values that `createContext(...)` can create from
  defaults.
- `context.references` describes values that instruction templates may read from
  the run context.
- Declaring a path under `context.fields` does **not** make it readable by
  instruction templates.
- Declaring a path under `context.references` does **not** create or default the
  value.
- A path appears in both sections only when the descriptor both defaults the
  value and allows instructions to read it.

Applications that own the full context lifecycle can declare only
`context.references` for prompt-readable values supplied at run time.

Field and reference keys may use dot paths:

```yaml
context:
  references:
    "prompt.learningStyleLabel":
      type: string
```

Reference paths are exact. Declaring `prompt` does not implicitly allow
`prompt.learningStyleLabel`.

## Builder Contract

The public builder is:

```ts
export function buildAgentHarness<TContext = unknown>(
  descriptor: AgentHarnessDescriptor,
  registry?: AgentHarnessRegistry<TContext>,
): AgentHarness<TContext>;
```

The registry binds descriptor tool targets to real tool implementations:

```ts
export interface AgentHarnessRegistry<TContext = unknown> {
  tools?: Record<string, Tool<TContext>>;
  registryVersion?: string;
}
```

The returned harness contains:

```ts
export interface AgentHarness<TContext = unknown> {
  entryAgent: Agent<TContext>;
  agents: Map<string, Agent<TContext>>;
  descriptorHash: string;
  metadata: AgentHarnessMetadata;
  runOptions: Omit<NonStreamRunOptions<TContext>, "stream">;
  createContext(input?: CreateHarnessContextInput): TContext;
}
```

`runOptions` currently maps descriptor runtime settings such as `max_turns` to
the code-first `run(...)` options.

## Hashing

`hashAgentHarnessDescriptor(...)` produces:

```text
sha256:<hash>
```

The hash is derived from the canonical JSON representation of the descriptor.

The descriptor hash is intended for:

- run-record metadata,
- candidate comparison,
- non-regression reports,
- audit traceability,
- reproducibility checks.

The hash identifies the descriptor content, not the full executable runtime.

Applications that need a complete candidate identity should also include:

- registry version,
- package version,
- provider/model,
- policy version,
- prompt material version,
- fixture or dataset version.

## Context Defaults

`createContext(...)` builds a context object from descriptor defaults and
application overrides.

Only fields with a `default` entry are materialized by `createContext(...)`.
Fields without defaults are metadata for the host application and do not affect
the generated context.

Supported built-in placeholders are:

```text
{{input.message}}
{{runtime.now_iso}}
```

The first maps to the user message passed to `createContext(...)`.

The second maps to the provided `now` value or the current time.

Overrides are merged into the generated context. The application remains
responsible for validating the final context shape.

## Instruction Context References

Instruction templates may reference declared context paths:

```text
{{context.customer.email}}
```

References must be declared under `context.references`.

Instruction placeholders are path references only. They do not support
JavaScript expressions, nullish coalescing, ternaries, function calls, filters,
or conditional imports.

If an instruction references an undeclared context path, descriptor compilation
fails.

If a required context path is declared but missing at instruction-resolution
time, instruction resolution fails.

Optional references render as an empty string when missing.

This rule exists to make prompt/context coupling explicit and reviewable.

## Tool Binding

Descriptors name logical tool ids and map them to registry targets:

```yaml
tools:
  lookup_order:
    target: example://tool/lookup_order
```

Agents reference logical tool ids:

```yaml
agents:
  order:
    tools: [lookup_order]
```

The registry supplies executable tools:

```ts
buildAgentHarness(descriptor, {
  registryVersion: "customer-support-example@1",
  tools: {
    "example://tool/lookup_order": lookupOrder,
  },
});
```

The descriptor never contains executable tool code.

## Handoffs

Agents reference handoff targets by descriptor agent id:

```yaml
agents:
  router:
    handoffs: [identity, order]
```

`buildAgentHarness(...)` resolves those ids into `Agent` handoff objects.

Unknown handoff targets fail at build time.

## Relation To Run Records And Replay

Harness metadata can be attached to `RunRecord.metadata`:

```ts
record: {
  metadata: {
    harness: harness.metadata,
  },
}
```

This makes a run record easier to interpret and compare later.

The descriptor does not replace `RunRecord`.

It complements `RunRecord` by identifying the candidate graph used to produce a
run.

Strict and hybrid replay still depend on the existing run-record replay
utilities and on application-provided policies.

## Privacy And Security

Descriptors can contain prompt text, context defaults, tool topology, and
business-sensitive routing logic.

Applications should treat descriptors as controlled configuration artifacts.

Specific notes:

- `context.fields[*].redact` is descriptor metadata only in the current
  implementation. Applications still need explicit `record.contextRedactor`.
- Context defaults should not contain secrets.
- Provider credentials must not be stored in descriptors.
- Tool targets may reveal internal capability names and should be reviewed
  before distribution.
- `descriptorHash` is useful for integrity and comparison, but it is not an
  access-control mechanism.

## Example

```yaml
descriptor_version: aioc.agent_graph.v0

metadata:
  name: customer_support_harness
  version: customer-support.v1

runtime:
  entry_agent: router
  max_turns: 8

tools:
  lookup_order:
    target: example://tool/lookup_order

agents:
  router:
    name: Support Router Agent
    handoffs: [order]
    instructions: |-
      Route order questions to Order Agent.

  order:
    name: Order Agent
    tools: [lookup_order]
    instructions: |-
      Look up order details before answering.
```

Application code still loads YAML, binds tools, configures policy, and calls
`run(...)`.

## Compatibility

This RFC is additive and experimental.

Existing code-first applications do not need descriptors.

The descriptor builder produces normal `Agent` objects and normal `run(...)`
options, so it composes with existing provider, policy, logging, run-record,
thread-history, and stream-output APIs.

## Decisions For 0.2.0

The `0.2.0` descriptor scope is intentionally narrow:

- The descriptor remains in `@axiastudio/aioc` during the `0.2.x`
  experimental period.
- Descriptor validation is lightweight and implemented in the builder. A
  schema-backed validator is deferred.
- `context.fields[*].redact` remains metadata only. Applications still provide
  explicit `record.contextRedactor` implementations.
- `descriptorHash` remains descriptor-only. Registry version, provider/model,
  policy version, package version, and prompt material version remain separate
  metadata.
- YAML loading remains application-owned. Core accepts JavaScript objects.
- Policies remain code-owned. The descriptor does not contain policy
  definitions or policy references.
- Instruction placeholders remain path-only references. JavaScript expressions,
  filters, nullish coalescing, ternaries, and function calls are not supported.
- Prompt file loading and prompt materialization remain application-owned.
- Descriptor examples are positioned as harness/evaluation or controlled
  application configuration artifacts, not as no-code production builders.

## Deferred Questions

The following topics are intentionally left for later RFCs or `0.2.x`
experimentation:

1. Whether descriptor helpers should eventually move to a separate package.
2. Whether to add schema-backed validation for descriptor files.
3. Whether descriptor redaction metadata should feed a reusable redaction
   helper.
4. Whether policy composition helpers should ever be referenced from
   descriptors.
5. Whether a future descriptor layer should standardize prompt file imports or
   keep them application-specific.

## Implementation Notes

The current experimental implementation is:

- `src/harness-descriptor.ts`
- exported from `src/index.ts`
- covered by `src/tests/unit/harness-descriptor.unit.ts`
- demonstrated by `src/examples/harness-descriptor/customer-support.ts`
- descriptor example in `src/examples/harness-descriptor/customer-support.yaml`
- documented by `apps/aioc-docs/src/content/docs/reference/harness-descriptor.md`

The implementation should remain explicitly experimental during the
`0.2.0-next.*` line and ship in `0.2.0` as the `aioc.agent_graph.v0`
descriptor contract.

## Minimal Test Matrix

1. Builds an entry agent from a descriptor.
2. Applies `agent_defaults`.
3. Resolves tool ids through the registry.
4. Resolves handoff ids to built agents.
5. Produces a stable descriptor hash for equivalent descriptor content.
6. Builds context from field defaults.
7. Applies `{{input.message}}` and `{{runtime.now_iso}}` defaults.
8. Merges application context overrides.
9. Rejects undeclared context references in instruction templates.
10. Rejects missing required context references at instruction-resolution time.
11. Allows missing optional context references.
12. Rejects non-path instruction expressions.
13. Keeps reference paths exact: parent references do not allow child paths.
14. Rejects missing entry agents, unknown tool ids, missing registry targets,
    and unknown handoff ids.
15. Attaches harness metadata to run records in examples or tests.
16. Composes with strict replay without executing live tools when replay data is
    available.

## Status

Experimental. Implemented in `src/harness-descriptor.ts` and published in the
`0.2.0-next.*` line for validation.
