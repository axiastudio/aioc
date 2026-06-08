import assert from "node:assert/strict";
import {
  createOpenTelemetryLogExporter,
  toOpenTelemetryLogRecord,
  type OpenTelemetryGovernanceLogger,
} from "../index.js";
import type { GovernanceEvent } from "@axiastudio/aioc-governance-events";

function createEvent(
  overrides: Partial<GovernanceEvent> = {},
): GovernanceEvent {
  return {
    schemaVersion: "aioc.governance_event.v0",
    id: "event-1",
    type: "aioc.approval.required",
    occurredAt: "2026-06-08T10:00:00.000Z",
    severity: "warn",
    runId: "run-1",
    agentName: "Support Agent",
    providerName: "test-provider",
    model: "test-model",
    subject: {
      kind: "approval",
      name: "send_email",
      turn: 1,
      callId: "call-1",
      proposalHash: "proposal-hash-1",
      argsHash: "args-hash-1",
    },
    policy: {
      decision: "require_approval",
      reason: "approval_required",
      publicReason: "Sensitive action requires approval.",
      policyVersion: "policy.v1",
      resultMode: "tool_result",
    },
    trace: {
      promptHash: "prompt-hash-1",
      requestHash: "request-hash-1",
    },
    metadata: {
      tenant: "tenant-1",
      attempts: 2,
      flags: ["approval", "email"],
      nested: {
        safe: true,
      },
    },
    ...overrides,
  };
}

async function main(): Promise<void> {
  {
    const logRecord = toOpenTelemetryLogRecord(createEvent());

    assert.equal(logRecord.eventName, "aioc.approval.required");
    assert.equal(logRecord.severityNumber, 13);
    assert.equal(logRecord.severityText, "WARN");
    assert.equal(logRecord.body, "Sensitive action requires approval.");
    assert.ok(logRecord.timestamp instanceof Date);
    assert.equal(
      logRecord.attributes?.["aioc.governance.schema_version"],
      "aioc.governance_event.v0",
    );
    assert.equal(logRecord.attributes?.["aioc.governance.event_id"], "event-1");
    assert.equal(logRecord.attributes?.["aioc.run.id"], "run-1");
    assert.equal(logRecord.attributes?.["aioc.subject.name"], "send_email");
    assert.equal(
      logRecord.attributes?.["aioc.subject.proposal_hash"],
      "proposal-hash-1",
    );
    assert.equal(logRecord.attributes?.["aioc.policy.version"], "policy.v1");
    assert.equal(
      logRecord.attributes?.["aioc.trace.prompt_hash"],
      "prompt-hash-1",
    );
    assert.equal(logRecord.attributes?.["aioc.metadata.tenant"], "tenant-1");
    assert.deepEqual(logRecord.attributes?.["aioc.metadata.flags"], [
      "approval",
      "email",
    ]);
    assert.equal(
      logRecord.attributes?.["aioc.metadata.nested"],
      '{"safe":true}',
    );
  }

  {
    const debug = toOpenTelemetryLogRecord(
      createEvent({
        severity: "debug",
        policy: undefined,
        type: "aioc.run.completed",
        subject: { kind: "run" },
      }),
    );
    const info = toOpenTelemetryLogRecord(createEvent({ severity: "info" }));
    const error = toOpenTelemetryLogRecord(createEvent({ severity: "error" }));

    assert.equal(debug.severityNumber, 5);
    assert.equal(debug.body, "aioc.run.completed");
    assert.equal(info.severityNumber, 9);
    assert.equal(error.severityNumber, 17);
  }

  {
    const logRecord = toOpenTelemetryLogRecord(createEvent(), {
      includeMetadata: false,
      body: (event) => `governance:${event.id}`,
      attributes: {
        "service.name": "aioc-test",
      },
    });

    assert.equal(logRecord.body, "governance:event-1");
    assert.equal(logRecord.attributes?.["service.name"], "aioc-test");
    assert.equal(logRecord.attributes?.["aioc.metadata.tenant"], undefined);
  }

  {
    const emitted: unknown[] = [];
    const logger: OpenTelemetryGovernanceLogger = {
      emit(logRecord) {
        emitted.push(logRecord);
      },
    };
    const exporter = createOpenTelemetryLogExporter(logger);

    await exporter.exportEvents([
      createEvent(),
      createEvent({ id: "event-2" }),
    ]);

    assert.equal(emitted.length, 2);
  }

  process.stdout.write("OpenTelemetry exporter tests passed.\n");
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
