import { compareRunRecords, type RunRecord } from "../../index";

interface DemoContext {
  actorId: string;
}

function buildRunRecord(
  response: string,
  customerId: string,
  policyDecision: "allow" | "deny",
): RunRecord<DemoContext> {
  return {
    runId: `demo-compare-${customerId}`,
    startedAt: "2026-03-11T08:05:00.000Z",
    completedAt: "2026-03-11T08:05:01.000Z",
    status: "completed",
    agentName: "demo-agent",
    providerName: "DemoProvider",
    model: "demo-model",
    question: "Summarize account status",
    response,
    contextSnapshot: { actorId: "u-1" },
    items: [
      {
        type: "tool_call_item",
        callId: "call-1",
        name: "get_account",
        arguments: { customerId },
      },
      {
        type: "tool_call_output_item",
        callId: "call-1",
        output: {
          status: "ok",
          code: null,
          publicReason: null,
          data: { customerId, balance: customerId === "C-42" ? 1200 : 850 },
        },
      },
    ],
    promptSnapshots: [],
    requestFingerprints: [],
    policyDecisions: [
      {
        timestamp: "2026-03-11T08:05:00.500Z",
        turn: 1,
        callId: "call-1",
        decision: policyDecision,
        reason:
          policyDecision === "allow"
            ? "allow_account_lookup"
            : "deny_account_lookup",
        resource: { kind: "tool", name: "get_account" },
      },
    ],
    guardrailDecisions: [],
  };
}

const baseline = buildRunRecord("Account C-42 is healthy.", "C-42", "allow");
const candidate = buildRunRecord(
  "Account C-77 requires review.",
  "C-77",
  "deny",
);

const comparison = compareRunRecords(baseline, candidate, {
  includeSections: ["response", "toolCalls", "policy", "metadata"],
  responseMatchMode: "exact",
});

process.stdout.write("Comparison summary:\n");
process.stdout.write(`${JSON.stringify(comparison.summary, null, 2)}\n\n`);
process.stdout.write("Comparison metrics:\n");
process.stdout.write(`${JSON.stringify(comparison.metrics, null, 2)}\n\n`);
process.stdout.write("Differences:\n");
process.stdout.write(`${JSON.stringify(comparison.differences, null, 2)}\n`);
