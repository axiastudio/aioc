import { extractToolCalls, type RunRecord } from "../../index";

interface DemoContext {
  actorId: string;
}

const runRecord: RunRecord<DemoContext> = {
  runId: "demo-extract-1",
  startedAt: "2026-03-11T08:00:00.000Z",
  completedAt: "2026-03-11T08:00:01.000Z",
  status: "completed",
  agentName: "demo-agent",
  providerName: "DemoProvider",
  model: "demo-model",
  question: "Summarize account C-42",
  response: "Done",
  contextSnapshot: { actorId: "u-1" },
  items: [
    {
      type: "tool_call_item",
      callId: "call-1",
      name: "get_account",
      arguments: { customerId: "C-42", includeRisk: true },
    },
    {
      type: "tool_call_output_item",
      callId: "call-1",
      output: {
        status: "ok",
        code: null,
        publicReason: null,
        data: { tier: "enterprise", risk: 12 },
      },
    },
    {
      type: "tool_call_item",
      callId: "call-2",
      name: "get_open_tickets",
      arguments: { customerId: "C-42" },
    },
  ],
  promptSnapshots: [],
  requestFingerprints: [],
  policyDecisions: [],
  guardrailDecisions: [],
};

const toolCalls = extractToolCalls(runRecord);

process.stdout.write("Extracted tool calls:\n");
process.stdout.write(`${JSON.stringify(toolCalls, null, 2)}\n`);
