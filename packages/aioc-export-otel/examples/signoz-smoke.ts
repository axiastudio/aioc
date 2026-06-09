import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { createOpenTelemetryLogExporter } from "../src/index.js";
import type { GovernanceEvent } from "@axiastudio/aioc-governance-events";

const logsUrl =
  process.env.AIOC_OTEL_LOGS_URL ?? "http://localhost:4318/v1/logs";

const loggerProvider = new LoggerProvider({
  resource: resourceFromAttributes({
    "service.name": "aioc-export-otel-signoz-smoke",
    "deployment.environment": "local",
  }),
  processors: [
    new SimpleLogRecordProcessor(
      new OTLPLogExporter({
        url: logsUrl,
      }),
    ),
  ],
});

const logger = loggerProvider.getLogger("aioc.governance.signoz-smoke");
const exporter = createOpenTelemetryLogExporter(logger, {
  attributes: {
    "aioc.smoke.target": "signoz",
  },
});

const events: GovernanceEvent[] = [
  {
    schemaVersion: "aioc.governance_event.v0",
    id: "signoz-smoke-event-1",
    type: "aioc.approval.required",
    occurredAt: new Date().toISOString(),
    severity: "warn",
    runId: "run-signoz-smoke",
    agentName: "SigNoz Smoke Agent",
    providerName: "example-provider",
    model: "example-model",
    subject: {
      kind: "approval",
      name: "export_report",
      turn: 1,
      callId: "call-export-report",
      proposalHash: "proposal-hash-signoz-smoke",
      argsHash: "args-hash-signoz-smoke",
    },
    policy: {
      decision: "require_approval",
      reason: "approval_required",
      publicReason: "Sensitive report exports require approval.",
      policyVersion: "finance-export-policy.v1",
      resultMode: "tool_result",
    },
    trace: {
      promptHash: "prompt-hash-signoz-smoke",
      requestHash: "request-hash-signoz-smoke",
    },
    metadata: {
      environment: "local",
    },
  },
];

try {
  process.stdout.write(`Sending AIOC governance smoke event to ${logsUrl}\n`);
  await exporter.exportEvents(events);
  await loggerProvider.forceFlush();
  await loggerProvider.shutdown();
  process.stdout.write(
    "Sent. In SigNoz, search logs for aioc.governance.event_id = signoz-smoke-event-1\n",
  );
} catch (error) {
  await loggerProvider.shutdown().catch(() => undefined);
  process.stderr.write(
    `Failed to export AIOC governance smoke event to ${logsUrl}\n`,
  );
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
}
