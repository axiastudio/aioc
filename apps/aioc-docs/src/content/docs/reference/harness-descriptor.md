---
title: Harness Descriptor
description: Experimental descriptor API for building an agent harness from data plus application-owned tools.
---

The harness descriptor is an experimental `0.2.x` API for describing an agent
graph as data.

It does not make an application declarative. The application still owns tool
implementations, policies, provider setup, persistence, approvals, and context
lifecycle.

## Core Idea

A descriptor defines:

- runtime defaults such as entry agent and max turns
- logical tool ids and registry targets
- agents, model settings, tools, and handoffs
- optional context defaults
- context paths that instruction templates may read

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
  tools?: Record<string, { target: string }>;
  agent_defaults?: {
    model?: string;
    modelSettings?: Record<string, unknown>;
    instructions?: string;
  };
  agents: Record<string, HarnessAgentDescriptor>;
}
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

The descriptor should make the agent graph inspectable, not replace the
application runtime.
