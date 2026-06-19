---
title: Companion Packages
description: Extra AIOC packages for regression judging, governance events, OpenTelemetry export, and RunRecord inspection.
---

The core `@axiastudio/aioc` package remains focused on runtime orchestration,
policy gates, approvals, providers, and audit artifacts.

Companion packages add optional capabilities around that core without changing
the runtime contract or pulling observability and UI dependencies into the SDK.

## Package Map

| Package | Role | Status |
| --- | --- | --- |
| `@axiastudio/aioc-regression-judge` | Builds bounded LLM judge inputs for run-regression suites and parses judge results. | Experimental |
| `@axiastudio/aioc-governance-events` | Derives reduced governance events from `RunRecord` artifacts. | Experimental |
| `@axiastudio/aioc-export-otel` | Maps governance events to OpenTelemetry Logs. | Experimental |
| `@axiastudio/aioc-inspect-ui` | Provides React components for inspecting and comparing `RunRecord` artifacts. | Companion UI package |

## Regression Judge

Use `@axiastudio/aioc-regression-judge` when a run-regression suite should add
LLM-as-judge evaluation without sending full `RunRecord` artifacts by default.

```bash
npm install @axiastudio/aioc-regression-judge @axiastudio/aioc
```

The package provides:

- `createRunRegressionJudge(...)` to adapt a model invocation function into an
  AIOC `RunJudge`
- `toBoundedRunJudgeInput(...)` to project baseline/candidate records into a
  bounded judge input
- `createRunRegressionJudgeRequest(...)` to build provider-agnostic judge
  messages
- `parseRunJudgeResult(...)` to validate structured model output

The package does not configure or bundle a model provider. Host applications
own the model call, credentials, retries, and any stronger application-specific
redaction.

## Governance Events

Use `@axiastudio/aioc-governance-events` when an application needs operational
events derived from a complete `RunRecord`.

```bash
npm install @axiastudio/aioc-governance-events @axiastudio/aioc
```

The package provides:

- `toGovernanceEvents(...)` to derive event-shaped records from a `RunRecord`
- `createGovernanceEventSink(...)` to plug an exporter into `run(...)`
- a canonical experimental schema identified as `aioc.governance_event.v0`

Governance events are intentionally reduced. They do not replace the complete
`RunRecord`, and they do not include raw prompts, context, model responses, tool
arguments, or handoff payloads by default.

## OpenTelemetry Logs

Use `@axiastudio/aioc-export-otel` when those governance events should enter an
OpenTelemetry-compatible logs pipeline.

```bash
npm install @axiastudio/aioc-export-otel @axiastudio/aioc-governance-events @opentelemetry/api-logs
```

The package maps each `GovernanceEvent` to an OpenTelemetry `LogRecord`.

It does not configure an OpenTelemetry SDK, processor, collector, OTLP endpoint,
resource, or delivery guarantee. Host applications remain responsible for their
OpenTelemetry pipeline.

For local diagnostics, the repository includes:

- `npm run export-otel:console`
- `npm run export-otel:signoz`

## Inspect UI

Use `@axiastudio/aioc-inspect-ui` when a React application should render
`RunRecord` inspection and comparison views.

```bash
npm install @axiastudio/aioc-inspect-ui @axiastudio/aioc react react-dom
```

The package is UI-only. It does not collect records, persist records, or change
runtime behavior.

## How They Fit Together

```text
@axiastudio/aioc
  produces complete RunRecord artifacts

@axiastudio/aioc-regression-judge
  creates bounded judge inputs for run-regression suites

@axiastudio/aioc-governance-events
  derives reduced operational GovernanceEvent records

@axiastudio/aioc-export-otel
  maps GovernanceEvent records to OpenTelemetry Logs

@axiastudio/aioc-inspect-ui
  renders RunRecord artifacts in React applications
```

## Related Material

- For the full audit artifact, see [`Run Records`](../run-records/).
- For the event/exporter design rationale, see
  [`RFC-0009`](../governance/current/rfc-0009-governance-events-and-exporters/).
- For the regression judge design rationale, see
  [`RFC-0012`](../governance/current/rfc-0012-run-regression-suites-and-llm-judging/).
- For the visual inspection app positioning, see [`Reference UI`](../reference-ui/).
