# RFC-0011: Agent Harness Descriptor

- Status: Accepted
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

`aioc` introduces an Agent Harness Descriptor.

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

The descriptor contract is intentionally narrow and ships in the core package as
the supported `0.2.x` `aioc.agent_graph.v0` descriptor surface.

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
- No runtime-owned descriptor discovery, deployment configuration, or automatic
  environment loading.
- No executable JavaScript inside descriptors.
- No policy DSL.
- No tool implementation DSL.
- No provider credential storage.
- No approval workflow DSL.
- No replacement for `Agent`, `Tool`, `ToolPolicy`, or `HandoffPolicy`.
- No guarantee that descriptors can replace application-owned deployment
  configuration.

## Descriptor Shape

The descriptor shape is:

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
  instruction_parts?: Record<string, string>;
  tools?: Record<string, { target: string }>;
  agent_defaults?: {
    model?: string;
    modelSettings?: Record<string, unknown>;
    instructions?: HarnessInstructionsDescriptor;
  };
  agents: Record<string, HarnessAgentDescriptor>;
}

export interface HarnessInstructionWhereDescriptor {
  context: string;
}

export type HarnessWhereDescriptor = HarnessInstructionWhereDescriptor;

export interface HarnessInstructionPartDescriptor {
  text: string;
  where?: HarnessInstructionWhereDescriptor;
}

export interface HarnessHandoffDescriptor {
  agent: string;
  where?: HarnessWhereDescriptor;
}

export type HarnessHandoffEntryDescriptor =
  | string
  | HarnessHandoffDescriptor;

export type HarnessInstructionsDescriptor =
  | string
  | HarnessInstructionPartDescriptor[];
```

Agents may define:

```ts
export interface HarnessAgentDescriptor {
  name?: string;
  handoffDescription?: string;
  instructions?: HarnessInstructionsDescriptor;
  model?: string;
  modelSettings?: Record<string, unknown>;
  tools?: string[];
  handoffs?: HarnessHandoffEntryDescriptor[];
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

## Descriptor Loading And External Instructions

`buildAgentHarness(...)` stays pure. It accepts a fully materialized
`AgentHarnessDescriptor` object and does not read YAML or prompt files.

Applications that load descriptors from YAML can use:

```ts
export function loadAgentHarnessDescriptor(
  yaml: string,
  options?: LoadAgentHarnessDescriptorOptions | Record<string, string>,
): AgentHarnessDescriptor;

export function loadAgentHarnessDescriptorFromFile(
  path: string,
  options?: LoadAgentHarnessDescriptorFromFileOptions,
): Promise<AgentHarnessDescriptor>;
```

The YAML/source descriptor may use `instructions_file` or `instructions_files`
on agents or `agent_defaults`:

```yaml
agents:
  router:
    instructions_file: ./prompts/router.md

  game_master:
    instructions_files:
      - ./prompts/shared.md
      - ./prompts/game-master.md
    instructions: |-
      Inline instructions are appended after the listed files.
```

The loader resolves those files and returns a descriptor where
`instructions_file` or `instructions_files` has been replaced by
`instructions`.

Rules:

- `instructions_file` is mutually exclusive with inline `instructions`.
- `instructions_files` is mutually exclusive with `instructions_file`.
- `instructions_files` may be combined with inline `instructions`; listed files
  are joined in order with blank lines, then inline `instructions` is appended.
- paths are local and relative to the descriptor file;
- `rootDir` constrains resolved paths and blocks traversal outside the allowed
  tree;
- in the descriptor contract, no remote URLs, globbing, conditional file
  imports, or expression evaluation are supported;
- loaded file content is treated exactly like inline `instructions`, including
  `{{context.path}}` placeholders;
- descriptor hashing sees the materialized `instructions` content because
  `hashAgentHarnessDescriptor(...)` hashes the descriptor returned by the
  loader.

For environments that already own prompt loading, such as tests, browsers, or
bundled applications, `loadAgentHarnessDescriptor(...)` accepts a prompt map:

```ts
const descriptor = loadAgentHarnessDescriptor(yaml, {
  descriptorPath: "/app/harness.yaml",
  rootDir: "/app",
  promptMap: {
    "./prompts/router.md": "Route the next turn.",
  },
});
```

Passing a descriptor with unresolved `instructions_file` or
`instructions_files` directly to
`buildAgentHarness(...)` fails. This keeps file-system policy in the loader and
keeps the builder deterministic over an already materialized object.

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
or inline conditional logic.

Conditional inclusion belongs to instruction part metadata via `where`, not to
placeholder syntax.

If an instruction references an undeclared context path, descriptor compilation
fails.

If a required context path is declared but missing at instruction-resolution
time, instruction resolution fails.

Optional references render as an empty string when missing.

This rule exists to make prompt/context coupling explicit and reviewable.

## Instruction Parts And `where`

Status: implemented in `0.2.2`.

The Cosmo descriptor spike showed two recurring prompt-composition problems:

- applications sometimes need to reuse the same instruction block across
  agents without moving every small fragment to a separate file;
- applications sometimes need to include a complete instruction block only when
  a runtime condition is true.

Without descriptor-level support, applications must either:

- keep small prompt fragments in TypeScript, or
- expose empty string placeholders such as
  `{{context.prompt.qnaCompanyInstructionsPrepend}}` and
  `{{context.prompt.qnaCompanyInstructionsAppend}}`.

Both approaches work, but they weaken the descriptor as the reviewable source of
prompt composition.

The implemented extension has two parts:

- a top-level `instruction_parts` catalog for reusable inline instruction
  blocks;
- an agent-level `instructions_sequence` for explicit ordered composition from
  local files, catalog references, and agent-local inline text items, with an
  optional boolean `where:` gate on each item.

The existing `instructions`, `instructions_file`, and `instructions_files`
fields remain valid shortcuts for simple cases.

Example:

```yaml
instruction_parts:
  company_context: |-
    COMPANY CONTEXT:
    {{context.prompt.companyInstructionsText}}
    ---

context:
  references:
    "prompt.companyInstructionsText":
      type: string
    "prompt.includeQnaCompanyContext":
      type: boolean
    "prompt.includeTutorCompanyContext":
      type: boolean

agents:
  qna:
    instructions_sequence:
      - ref: company_context
        where:
          context: prompt.includeQnaCompanyContext
      - text: |-
          You must ALWAYS invoke find_chunks before answering.

  tutor:
    instructions_sequence:
      - ref: company_context
        where:
          context: prompt.includeTutorCompanyContext
      - text: |-
          You are Cosmo's Kolb tutor.
```

Local files can still be used when the block deserves to live outside YAML:

```yaml
agents:
  qna:
    instructions_sequence:
      - file: ./prompts/company-context.md
        where:
          context: prompt.includeQnaCompanyContext
      - file: ./prompts/qna.md
```

### Semantics

- `instruction_parts` is a descriptor-local catalog. It does not execute code and
  does not read files.
- `instructions_sequence` is an ordered list of instruction items.
- Each source item must contain exactly one of `file`, `ref`, or `text`.
- `file` paths follow the same local loading rules as `instructions_file` and
  `instructions_files`.
- `ref` values must point to entries declared in top-level `instruction_parts`.
- `text` values are agent-local inline instruction blocks.
- `instructions_sequence` is mutually exclusive with `instructions`,
  `instructions_file`, and `instructions_files`.
- `where` is evaluated at instruction-resolution time, not when the descriptor
  is loaded.
- `where.context` is a dot path under the run context.
- The path must be declared under `context.references`.
- The resolved value must be boolean.
- The instruction part is included only when the value is exactly `true`.
- Missing or non-boolean values fail instruction resolution.
- Included parts are joined in descriptor order.
- Placeholder rendering runs only on included parts.
- Undeclared placeholders fail descriptor compilation even when they appear in a
  conditional part.

This keeps conditional prompt composition deterministic, explicit, and
reviewable without adding JavaScript expressions to templates.

### Type Shape

The existing string form stays valid:

```yaml
instructions_files:
  - ./prompts/base.md
```

Reusable instruction parts are declared in a top-level catalog:

```yaml
instruction_parts:
  company_context: |-
    COMPANY CONTEXT:
    {{context.prompt.companyInstructionsText}}
    ---
```

Composition uses `instructions_sequence`:

```yaml
agents:
  qna:
    instructions_sequence:
      - ref: company_context
        where:
          context: prompt.includeCompanyContext
      - text: |-
          You must ALWAYS invoke find_chunks before answering.
```

The materialized descriptor shape can represent instructions as a list of
instruction parts:

```ts
export interface HarnessInstructionWhereDescriptor {
  context: string;
}

export interface HarnessInstructionPartDescriptor {
  text: string;
  where?: HarnessInstructionWhereDescriptor;
}

export type HarnessInstructionsDescriptor =
  | string
  | HarnessInstructionPartDescriptor[];
```

The YAML/source descriptor can represent sequence items before materialization:

```ts
export interface HarnessInstructionFileSourceDescriptor {
  file: string;
  where?: HarnessInstructionWhereDescriptor;
}

export interface HarnessInstructionRefSourceDescriptor {
  ref: string;
  where?: HarnessInstructionWhereDescriptor;
}

export interface HarnessInstructionTextSourceDescriptor {
  text: string;
  where?: HarnessInstructionWhereDescriptor;
}

export type HarnessInstructionSourceDescriptor =
  | HarnessInstructionFileSourceDescriptor
  | HarnessInstructionRefSourceDescriptor
  | HarnessInstructionTextSourceDescriptor;
```

The loader resolves `file`, catalog `ref`, and source `text` entries to
materialized `text` parts before the builder runs. The builder remains
filesystem-free.

### Non-Goals

This extension does not add:

- JavaScript expressions;
- equality checks;
- ternaries;
- string interpolation outside existing placeholders;
- remote prompt imports;
- glob imports;
- policy references;
- provider-specific prompt selection.

More expressive conditions can be considered later only if a concrete
application need appears. The first version should support only boolean context
paths and descriptor-local instruction references.

### Run Records And Hashing

`descriptorHash` hashes the materialized descriptor, including reusable
instruction part content, ordered instruction sequences, and `where` clauses.

The exact prompt seen by the model still depends on runtime context. Therefore
the existing prompt snapshot remains the authoritative record of the resolved
instruction text for a specific run.

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

Handoffs can also be gated with the same boolean `where.context` shape used by
instruction parts:

```yaml
context:
  references:
    "prompt.kolbEnabled":
      type: boolean

agents:
  router:
    handoffs:
      - qna
      - agent: assessment
        where:
          context: prompt.kolbEnabled
      - agent: tutor
        where:
          context: prompt.kolbEnabled
```

A string handoff entry is always available. An object handoff entry must include
`agent` and may include `where.context`.

`where.context` must be declared under `context.references` with
`type: boolean`. It is evaluated for the current run context before provider
tool exposure. If the value is `false`, the handoff tool is not included in the
provider request for that turn.

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

This RFC is additive and accepted.

Existing code-first applications do not need descriptors.

The descriptor builder produces normal `Agent` objects and normal `run(...)`
options, so it composes with existing provider, policy, logging, run-record,
thread-history, and stream-output APIs.

## Decisions For 0.2.x

The `0.2.x` descriptor scope is intentionally narrow:

- The descriptor remains in `@axiastudio/aioc` as part of the supported
  `0.2.x` API surface.
- Descriptor validation is lightweight and implemented in the builder. A
  schema-backed validator is deferred.
- `buildAgentHarness(...)` remains pure. YAML, `instructions_file`,
  `instructions_files`, and `instructions_sequence` materialization are handled
  by `loadAgentHarnessDescriptor(...)` and
  `loadAgentHarnessDescriptorFromFile(...)`.
- `context.fields[*].redact` remains metadata only. Applications still provide
  explicit `record.contextRedactor` implementations.
- `descriptorHash` remains descriptor-only. Registry version, provider/model,
  policy version, package version, and prompt material version remain separate
  metadata.
- `buildAgentHarness(...)` accepts materialized JavaScript objects and remains
  filesystem-free. YAML parsing and prompt file materialization are limited to
  explicit loader helpers.
- Policies remain code-owned. The descriptor does not contain policy
  definitions or policy references.
- Handoff `where` gates only control provider tool exposure. They do not replace
  `HandoffPolicy`; policies remain responsible for allow/deny/approval
  decisions for exposed handoffs.
- Instruction placeholders remain path-only references. JavaScript expressions,
  filters, nullish coalescing, ternaries, and function calls are not supported.
- Prompt file loading and prompt materialization are supported only through the
  explicit local loader helpers. There are no remote URLs, glob imports, or
  expression evaluation.
- Descriptor examples are positioned as harness/evaluation or controlled
  application configuration artifacts, not as no-code production builders.

## Deferred Questions

The following topics are intentionally left for later RFCs or future `0.x`
iterations:

1. Whether descriptor helpers should eventually move to a separate package.
2. Whether to add schema-backed validation for descriptor files.
3. Whether descriptor redaction metadata should feed a reusable redaction
   helper.
4. Whether policy composition helpers should ever be referenced from
   descriptors.
5. Whether richer prompt composition is needed beyond boolean `where` gates,
   agent-local `text` items, and descriptor-local references.

## Implementation Notes

The current implementation is:

- `src/harness-descriptor.ts`
- `src/harness-descriptor-loader.ts`
- `src/harness-descriptor-loader-paths.ts`
- exported from `src/index.ts`
- covered by `src/tests/unit/harness-descriptor.unit.ts`
- covered by `src/tests/unit/harness-descriptor-loader.unit.ts`
- demonstrated by `examples/core/harness-descriptor/customer-support.ts`
- descriptor example in `examples/core/harness-descriptor/customer-support.yaml`
- documented by `apps/aioc-docs/src/content/docs/reference/harness-descriptor.md`
- validated by a Cosmo-shaped unit fixture covering router/specialist graphs,
  registry-backed tools, handoffs, and prompt-readable context references

The descriptor shape ships as the supported `aioc.agent_graph.v0` descriptor
contract. Future changes to this contract should include explicit migration
guidance.

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

Accepted. Implemented in `src/harness-descriptor.ts`,
`src/harness-descriptor-loader.ts`, and
`src/harness-descriptor-loader-paths.ts`, and promoted into the supported
`0.2.x` API surface.
