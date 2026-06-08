import assert from "node:assert/strict";
import type { RunRecord } from "@axiastudio/aioc";
import {
  GOVERNANCE_EVENT_SCHEMA_VERSION,
  createGovernanceEventSink,
  toGovernanceEvents,
  type GovernanceEvent,
} from "../index.js";

interface TestContext {
  tenantId: string;
}

function createRecord(overrides: Partial<RunRecord<TestContext>> = {}) {
  const record: RunRecord<TestContext> = {
    runId: "run-1",
    startedAt: "2026-06-08T10:00:00.000Z",
    completedAt: "2026-06-08T10:00:02.000Z",
    status: "completed",
    agentName: "Support Agent",
    providerName: "test-provider",
    model: "test-model",
    question: "Sensitive user question",
    response: "Sensitive model response",
    contextSnapshot: {
      tenantId: "tenant-1",
    },
    items: [],
    promptSnapshots: [
      {
        timestamp: "2026-06-08T10:00:00.100Z",
        turn: 1,
        agentName: "Support Agent",
        model: "test-model",
        promptVersion: "prompt.v1",
        promptHash: "prompt-hash-1",
        promptText: "Raw prompt must not be exported.",
      },
    ],
    requestFingerprints: [
      {
        timestamp: "2026-06-08T10:00:00.200Z",
        turn: 1,
        agentName: "Support Agent",
        providerName: "test-provider",
        model: "test-model",
        runtimeVersion: "test-runtime",
        fingerprintSchemaVersion: "aioc.request_fingerprint.v1",
        requestHash: "request-hash-1",
        systemPromptHash: "system-prompt-hash-1",
        messagesHash: "messages-hash-1",
        toolsHash: "tools-hash-1",
        modelSettingsHash: "model-settings-hash-1",
        messageCount: 1,
        toolCount: 1,
      },
    ],
    policyDecisions: [
      {
        timestamp: "2026-06-08T10:00:01.000Z",
        turn: 1,
        callId: "call-allow",
        decision: "allow",
        reason: "allow_search_docs",
        resultMode: "throw",
        resource: {
          kind: "tool",
          name: "search_docs",
        },
        metadata: {
          privatePolicySignal: "include only when requested",
        },
      },
      {
        timestamp: "2026-06-08T10:00:01.100Z",
        turn: 1,
        callId: "call-deny",
        decision: "deny",
        reason: "deny_export_docs",
        publicReason: "Export is not allowed.",
        resultMode: "tool_result",
        resource: {
          kind: "tool",
          name: "export_docs",
        },
      },
      {
        timestamp: "2026-06-08T10:00:01.200Z",
        turn: 1,
        callId: "call-approval",
        decision: "require_approval",
        reason: "approval_required",
        resultMode: "tool_result",
        policyVersion: "policy.v1",
        resource: {
          kind: "tool",
          name: "send_email",
        },
      },
    ],
    suspendedProposals: [
      {
        kind: "tool",
        timestamp: "2026-06-08T10:00:01.200Z",
        runId: "run-1",
        turn: 1,
        callId: "call-approval",
        agentName: "Support Agent",
        proposalHash: "proposal-hash-1",
        reason: "approval_required",
        toolName: "send_email",
        rawArguments: '{"to":"customer@example.com"}',
        parsedArguments: {
          to: "customer@example.com",
        },
        argsCanonicalJson: '{"to":"customer@example.com"}',
      },
    ],
    guardrailDecisions: [
      {
        timestamp: "2026-06-08T10:00:01.300Z",
        turn: 1,
        guardrailName: "no_secret_leakage",
        decision: "triggered",
        reason: "secret_detected",
        metadata: {
          detector: "test",
        },
      },
    ],
    metadata: {
      environment: "test",
    },
    ...overrides,
  };

  return record;
}

function findEvent(
  events: GovernanceEvent[],
  type: GovernanceEvent["type"],
): GovernanceEvent {
  const event = events.find((candidate) => candidate.type === type);
  assert.ok(event, `Expected event ${type}`);
  return event;
}

async function main(): Promise<void> {
  {
    const events = toGovernanceEvents(createRecord());

    assert.equal(events.length, 5);
    assert.equal(events[0]?.schemaVersion, GOVERNANCE_EVENT_SCHEMA_VERSION);
    assert.equal(findEvent(events, "aioc.run.completed").severity, "info");
    assert.equal(findEvent(events, "aioc.policy.allowed").severity, "info");
    assert.equal(findEvent(events, "aioc.policy.denied").severity, "warn");
    assert.equal(findEvent(events, "aioc.approval.required").severity, "warn");
    assert.equal(
      findEvent(events, "aioc.guardrail.triggered").severity,
      "warn",
    );
  }

  {
    const events = toGovernanceEvents(
      createRecord({
        status: "failed",
        errorName: "Error",
        errorMessage: "boom",
      }),
    );
    const failed = findEvent(events, "aioc.run.failed");

    assert.equal(failed.severity, "error");
    assert.equal(failed.status, "failed");
    assert.equal(failed.errorName, "Error");
    assert.equal(failed.errorMessage, "boom");
  }

  {
    const approval = findEvent(
      toGovernanceEvents(createRecord()),
      "aioc.approval.required",
    );

    assert.equal(approval.subject.kind, "approval");
    assert.equal(approval.subject.name, "send_email");
    assert.equal(approval.subject.proposalHash, "proposal-hash-1");
    assert.match(approval.subject.argsHash ?? "", /^[a-f0-9]{64}$/);
    assert.equal(approval.policy?.policyVersion, "policy.v1");
  }

  {
    const record = createRecord({
      policyDecisions: [
        {
          timestamp: "2026-06-08T10:00:01.400Z",
          turn: 1,
          callId: "call-handoff-approval",
          decision: "require_approval",
          reason: "handoff_approval_required",
          resultMode: "throw",
          resource: {
            kind: "handoff",
            name: "Billing Agent",
          },
        },
      ],
      suspendedProposals: [
        {
          kind: "handoff",
          timestamp: "2026-06-08T10:00:01.400Z",
          runId: "run-1",
          turn: 1,
          callId: "call-handoff-approval",
          agentName: "Support Agent",
          proposalHash: "handoff-proposal-hash-1",
          reason: "handoff_approval_required",
          fromAgentName: "Support Agent",
          toAgentName: "Billing Agent",
          handoffPayload: {
            customerId: "customer-1",
          },
          payloadCanonicalJson: '{"customerId":"customer-1"}',
        },
      ],
      guardrailDecisions: [],
    });
    const approval = findEvent(
      toGovernanceEvents(record),
      "aioc.approval.required",
    );
    const serialized = JSON.stringify(approval);

    assert.equal(approval.subject.name, "Billing Agent");
    assert.equal(approval.subject.proposalHash, "handoff-proposal-hash-1");
    assert.match(approval.subject.payloadHash ?? "", /^[a-f0-9]{64}$/);
    assert.equal(serialized.includes("customer-1"), false);
  }

  {
    const pass = findEvent(
      toGovernanceEvents(
        createRecord({
          policyDecisions: [],
          suspendedProposals: [],
          guardrailDecisions: [
            {
              timestamp: "2026-06-08T10:00:01.500Z",
              turn: 1,
              guardrailName: "safe_output",
              decision: "pass",
            },
          ],
        }),
      ),
      "aioc.guardrail.passed",
    );

    assert.equal(pass.severity, "info");
    assert.equal(pass.subject.name, "safe_output");
  }

  {
    const events = toGovernanceEvents(createRecord());
    const serialized = JSON.stringify(events);

    assert.equal(serialized.includes("Sensitive user question"), false);
    assert.equal(serialized.includes("Sensitive model response"), false);
    assert.equal(serialized.includes("Raw prompt must not be exported"), false);
    assert.equal(serialized.includes("customer@example.com"), false);
    assert.equal(serialized.includes("tenant-1"), false);
  }

  {
    const withoutMetadata = toGovernanceEvents(createRecord());
    const withMetadata = toGovernanceEvents(createRecord(), {
      includeRunMetadata: true,
      includePolicyMetadata: true,
      includeGuardrailMetadata: true,
      metadata: { deployment: "local" },
    });

    assert.equal(
      findEvent(withoutMetadata, "aioc.run.completed").metadata,
      undefined,
    );
    assert.deepEqual(findEvent(withMetadata, "aioc.run.completed").metadata, {
      deployment: "local",
      environment: "test",
    });
    assert.deepEqual(findEvent(withMetadata, "aioc.policy.allowed").metadata, {
      deployment: "local",
      privatePolicySignal: "include only when requested",
    });
    assert.deepEqual(
      findEvent(withMetadata, "aioc.guardrail.triggered").metadata,
      {
        deployment: "local",
        detector: "test",
      },
    );
  }

  {
    const left = toGovernanceEvents(createRecord());
    const right = toGovernanceEvents(createRecord());

    assert.deepEqual(
      left.map((event) => event.id),
      right.map((event) => event.id),
    );
  }

  {
    const exportedBatches: GovernanceEvent[][] = [];
    const sink = createGovernanceEventSink<TestContext>({
      async exportEvents(events) {
        exportedBatches.push([...events]);
      },
    });

    await sink.write(createRecord());

    assert.equal(exportedBatches.length, 1);
    assert.equal(exportedBatches[0]?.length, 5);
  }

  {
    let observedError: unknown;
    const sink = createGovernanceEventSink<TestContext>(
      {
        async exportEvents() {
          throw new Error("export failed");
        },
      },
      {
        onExportError(error) {
          observedError = error;
        },
      },
    );

    await assert.doesNotReject(async () => {
      await sink.write(createRecord());
    });
    assert.ok(observedError instanceof Error);
  }

  process.stdout.write("Governance events tests passed.\n");
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
