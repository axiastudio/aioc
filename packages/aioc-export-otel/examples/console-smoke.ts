import {
  ConsoleLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { createOpenTelemetryLogExporter } from "../src/index.js";
import type { GovernanceEvent } from "@axiastudio/aioc-governance-events";

const loggerProvider = new LoggerProvider({
  processors: [new SimpleLogRecordProcessor(new ConsoleLogRecordExporter())],
});

const logger = loggerProvider.getLogger("aioc.governance.console-smoke");
const exporter = createOpenTelemetryLogExporter(logger, {
  attributes: {
    "service.name": "aioc-export-otel-console-smoke",
  },
});

const events: GovernanceEvent[] = [
  {
    schemaVersion: "aioc.governance_event.v0",
    id: "console-smoke-event-1",
    type: "aioc.approval.required",
    occurredAt: "2026-06-08T10:00:00.000Z",
    severity: "warn",
    runId: "run-console-smoke",
    agentName: "Console Smoke Agent",
    providerName: "example-provider",
    model: "example-model",
    subject: {
      kind: "approval",
      name: "export_report",
      turn: 1,
      callId: "call-export-report",
      proposalHash: "proposal-hash-console-smoke",
      argsHash: "args-hash-console-smoke",
    },
    policy: {
      decision: "require_approval",
      reason: "approval_required",
      publicReason: "Sensitive report exports require approval.",
      policyVersion: "finance-export-policy.v1",
      resultMode: "tool_result",
    },
    trace: {
      promptHash: "prompt-hash-console-smoke",
      requestHash: "request-hash-console-smoke",
    },
    metadata: {
      environment: "local",
    },
  },
];

await exporter.exportEvents(events);
await loggerProvider.forceFlush();
await loggerProvider.shutdown();
