# @axiastudio/aioc-export-otel

Experimental OpenTelemetry Logs exporter for AIOC governance events.

This package maps `GovernanceEvent` records from
`@axiastudio/aioc-governance-events` to OpenTelemetry `LogRecord` values and
emits them through an OpenTelemetry-compatible logger.

It does not configure an OpenTelemetry SDK, processor, collector, OTLP endpoint,
or delivery guarantee. Host applications remain responsible for their
OpenTelemetry pipeline.

## Install

```bash
npm install @axiastudio/aioc-export-otel @axiastudio/aioc-governance-events @opentelemetry/api-logs
```

## Usage

```ts
import { logs } from "@opentelemetry/api-logs";
import { createGovernanceEventSink } from "@axiastudio/aioc-governance-events";
import { createOpenTelemetryLogExporter } from "@axiastudio/aioc-export-otel";

const logger = logs.getLogger("aioc.governance");
const exporter = createOpenTelemetryLogExporter(logger);

await run(agent, userMessage, {
  record: {
    sink: createGovernanceEventSink(exporter),
  },
});
```

## Status

Experimental. The adapter currently maps governance events to OpenTelemetry Logs
only. Span events may be added later if a concrete use case requires them.
