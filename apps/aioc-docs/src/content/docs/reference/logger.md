---
title: Logging
description: Structured runtime logging with RunLogger, RunLogEvent, and createStdoutLogger(...).
---

`RunLogger` is the runtime logging sink used by `run(...)`.

It is intended for observability and diagnostics, not for policy enforcement or audit persistence.

## Core Contract

```ts
type RunLogger = {
  log(event: RunLogEvent): void | Promise<void>;
}
```

The runtime emits structured `RunLogEvent` objects and forwards them to the configured logger.

If no logger is configured, logging is simply skipped.

## What Logging Is For

Use runtime logging when you want:

- live visibility into run progress
- structured diagnostics around tool calls and policy outcomes
- simple console or application-level telemetry

Do not treat it as the canonical audit artifact.

For persistent audit and replay workflows, use `RunRecord`.

## Event Model

All log events include:

- `timestamp`
- `level`
- `agent`
- optional `turn`

The event `type` then determines the rest of the shape.

Current runtime event types include:

- `run_started`
- `agent_activated`
- `turn_started`
- `tool_call_started`
- `tool_policy_evaluated`
- `handoff_policy_evaluated`
- `tool_call_completed`
- `tool_call_failed`
- `output_guardrail_started`
- `output_guardrail_passed`
- `output_guardrail_triggered`
- `run_completed`
- `run_failed`

## Policy Events

The most governance-relevant events are:

- `tool_policy_evaluated`
- `handoff_policy_evaluated`

These include:

- `decision`
- `reason`
- `publicReason`
- `resultMode`
- `policyVersion`
- `expiresAt`
- `metadata`

This makes runtime logs useful for debugging policy behavior without having to inspect the full `RunRecord`.

## Log Levels

The runtime uses four levels:

```ts
type RunLogLevel = "debug" | "info" | "warn" | "error";
```

In practice:

- `debug` is used for lower-level lifecycle events such as turn starts
- `info` is used for normal progress
- `warn` is used for blocked or triggered conditions such as non-allow policy results
- `error` is used for runtime failures

## Runtime Behavior

Logging must never break execution.

If the configured logger throws, the runtime swallows the logging failure and continues.

This is intentional: logging is observational, not part of the control plane.

## `createStdoutLogger(...)`

`aioc` provides a simple built-in logger for terminal output:

```ts
createStdoutLogger({
  minLevel?: "debug" | "info" | "warn" | "error";
  events?: RunLogEvent["type"][];
  pretty?: boolean;
  write?: (message: string) => void;
})
```

It supports:

- minimum log level filtering
- event-type filtering
- pretty human-readable output
- JSON line output by default

## Example

```ts
import { createStdoutLogger, run } from "@axiastudio/aioc";

const logger = createStdoutLogger({
  minLevel: "info",
  pretty: true,
});

const result = await run(agent, "Summarize report Q1.", {
  logger,
});
```

## Logging vs Run Records

Use `RunLogger` when you want:

- runtime visibility
- lightweight telemetry
- terminal-oriented diagnostics

Use `RunRecord` when you want:

- persistent audit artifacts
- replay and comparison
- prompt snapshots and request fingerprints

## Related Pages

- See `/reference/run/` for how `logger` is passed into `run(...)`.
- See `/run-records/` for the persistent audit artifact model.
