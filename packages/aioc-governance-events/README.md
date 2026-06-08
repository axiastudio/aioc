# @axiastudio/aioc-governance-events

Experimental governance event mapper and exporter helpers for AIOC `RunRecord`
artifacts.

This package derives reduced operational events from the complete `RunRecord`.
It does not replace the run record and does not export raw prompt, context,
response, tool arguments, or handoff payloads by default.

## Install

```bash
npm install @axiastudio/aioc-governance-events @axiastudio/aioc
```

## Usage

```ts
import {
  createGovernanceEventSink,
  toGovernanceEvents,
} from "@axiastudio/aioc-governance-events";

const events = toGovernanceEvents(runRecord, {
  includeRunMetadata: true,
});

await run(agent, userMessage, {
  record: {
    sink: createGovernanceEventSink({
      async exportEvents(events) {
        await queue.publish("aioc.governance_events", events);
      },
    }),
  },
});
```

## Status

Experimental. The canonical schema is `aioc.governance_event.v0`.
