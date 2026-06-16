---
title: Harness Descriptor
description: Descriptor API for building an agent harness from data plus application-owned tools.
---

The harness descriptor is a supported `0.2.x` API for describing an agent graph
as data.

It does not make an application declarative. The application still owns tool
implementations, policies, provider setup, persistence, approvals, and context
lifecycle.

## Core Idea

A descriptor defines:

- runtime defaults such as entry agent and max turns
- logical tool ids and registry targets
- agents, model settings, tools, and handoffs
- optional boolean gates for instruction parts and handoffs
- optional context defaults
- context paths that instruction templates and handoff gates may read

The application binds executable tools through a registry and then calls
`buildAgentHarness(...)`.

## Descriptor Shape

```ts
interface AgentHarnessDescriptor {
  descriptor_version?: string;
  metadata?: Record<string, unknown>;
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
    instructions?: string | HarnessInstructionPartDescriptor[];
  };
  agents: Record<string, HarnessAgentDescriptor>;
}

interface HarnessInstructionPartDescriptor {
  text: string;
  where?: {
    context: string;
  };
}

type HarnessHandoffEntryDescriptor =
  | string
  | {
      agent: string;
      where?: {
        context: string;
      };
    };
```

## Building

```ts
import { buildAgentHarness } from "@axiastudio/aioc";

const harness = buildAgentHarness(descriptor, {
  registryVersion: "customer-support-tools@1",
  tools: {
    "example://tool/lookup_order": lookupOrder,
  },
});
```

If you keep prompts in separate Markdown files, load and materialize the YAML
first:

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

```ts
import {
  buildAgentHarness,
  loadAgentHarnessDescriptorFromFile,
} from "@axiastudio/aioc";

const descriptor = await loadAgentHarnessDescriptorFromFile(
  "./harness.yaml",
);
const harness = buildAgentHarness(descriptor, registry);
```

`instructions_file` and `instructions_files` are resolved relative to the
descriptor file and replaced by `instructions` before the descriptor reaches
`buildAgentHarness(...)`. Lists are joined in order with blank lines; inline
`instructions` after `instructions_files` are appended last.

For richer composition, use a top-level `instruction_parts` catalog and an
agent-level `instructions_sequence`:

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
      optional: true
    "prompt.includeCompanyContext":
      type: boolean

agents:
  qna:
    instructions_sequence:
      - ref: company_context
        where:
          context: prompt.includeCompanyContext
      - text: |-
          You must ALWAYS invoke find_chunks before answering.
      - file: ./prompts/qna-extra.md
```

Each `instructions_sequence` item must define exactly one of:

- `ref`: reusable text from top-level `instruction_parts`
- `text`: agent-local inline instructions
- `file`: local prompt file resolved by the loader

The optional `where.context` path must be declared under `context.references`
with `type: boolean`. It is evaluated when agent instructions are resolved for a
run. Parts whose `where` value is not exactly `true` are skipped.

## Conditional Handoffs

Agents can list handoff targets as plain ids or as gated handoff entries:

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

A string entry is always available. An object entry must include `agent` and may
include `where.context`.

The optional `where.context` path follows the same boolean rules as instruction
parts: it must be declared under `context.references` with `type: boolean`, and
it is evaluated against the current run context. If it resolves to `false`, the
handoff tool is not exposed to the provider for that turn.

The returned harness contains:

- `entryAgent`
- `agents`
- `runOptions`
- `metadata`
- `descriptorHash`
- `createContext(...)`

Use it with `run(...)`:

```ts
const result = await run(harness.entryAgent, "Check order ORD-1001", {
  ...harness.runOptions,
  context,
  policies,
});
```

## Tool Registry

Descriptors never contain executable tool code.

They map logical ids to application-owned targets:

```yaml
tools:
  lookup_order:
    target: example://tool/lookup_order

agents:
  order:
    tools: [lookup_order]
```

The registry supplies the real tool implementation:

```ts
buildAgentHarness(descriptor, {
  tools: {
    "example://tool/lookup_order": lookupOrder,
  },
});
```

## Context Fields

`context.fields` describes values that `createContext(...)` can default.

```yaml
context:
  fields:
    "turn.userMessage":
      type: string
      default: "{{input.message}}"
```

Only fields with `default` are materialized by `createContext(...)`.

Supported default placeholders:

- `{{input.message}}`
- `{{runtime.now_iso}}`

## Context References

`context.references` describes values that instruction templates may read from
the run context.

```yaml
context:
  references:
    "prompt.learningStyleLabel":
      type: string
```

Instructions can then use:

```md
Learning style: {{context.prompt.learningStyleLabel}}
```

Important rules:

- references are exact paths
- declaring `prompt` does not allow `prompt.learningStyleLabel`
- `fields` does not grant prompt access
- `references` does not create default values
- placeholders are path references only, not JavaScript expressions

## Hashing

`hashAgentHarnessDescriptor(...)` and `harness.descriptorHash` identify the
descriptor content passed to `buildAgentHarness(...)`.

When using `loadAgentHarnessDescriptorFromFile(...)` or
`loadAgentHarnessDescriptor(...)` with a `promptMap`, prompt file content from
`instructions_file`, `instructions_files`, or `instructions_sequence` file
items is materialized into `instructions` before hashing, so prompt text changes
alter the descriptor hash.

The hash does not include executable runtime behavior such as:

- registry implementation
- provider setup
- policy logic
- persistence
- approval workflows

For audit records, include descriptor metadata together with registry, provider,
policy, and package metadata.

## Boundaries

Keep these outside the descriptor:

- provider credentials
- tool implementation code
- policy definitions
- approval lifecycle logic
- database or persistence configuration
- arbitrary JavaScript expressions
- unresolved `instructions_file`, `instructions_files`, or
  `instructions_sequence` entries passed directly to `buildAgentHarness(...)`

The descriptor should make the agent graph inspectable, not replace the
application runtime.
