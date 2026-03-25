import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  Agent,
  allow,
  deny,
  run,
  setDefaultProvider,
  tool,
  type PolicyConfiguration,
  type RunRecord,
} from "../src/index";
import { toHandoffToolName } from "../src/tests/support/handoff-name";
import { ScriptedProvider } from "../src/tests/support/scripted-provider";

type DemoContext = {
  actor: {
    userId: string;
    groups: string[];
  };
  requestId: string;
  customerId?: string;
};

type SampleManifestEntry = {
  id: string;
  title: string;
  description: string;
  file: string;
};

const outputDirectory = path.resolve(
  process.cwd(),
  "apps/aioc-inspect/public/samples",
);

function redactContext(context: DemoContext): DemoContext {
  return {
    ...context,
    actor: {
      ...context.actor,
      userId: "[redacted-user-id]",
    },
  };
}

function stabilizeRecord(
  record: RunRecord<DemoContext>,
  sampleId: string,
  baseTimestamp: string,
  metadata: Record<string, unknown>,
): RunRecord<DemoContext> {
  const base = new Date(baseTimestamp).getTime();
  const at = (secondsOffset: number): string =>
    new Date(base + secondsOffset * 1000).toISOString();

  return {
    ...record,
    runId: sampleId,
    startedAt: at(0),
    completedAt: at(30),
    metadata: {
      ...(record.metadata ?? {}),
      ...metadata,
    },
    promptSnapshots: record.promptSnapshots.map((snapshot, index) => ({
      ...snapshot,
      timestamp: at(5 + index),
    })),
    requestFingerprints: record.requestFingerprints.map(
      (fingerprint, index) => ({
        ...fingerprint,
        timestamp: at(10 + index),
      }),
    ),
    policyDecisions: record.policyDecisions.map((decision, index) => ({
      ...decision,
      timestamp: at(15 + index),
    })),
    guardrailDecisions: record.guardrailDecisions?.map((decision, index) => ({
      ...decision,
      timestamp: at(20 + index),
    })),
  };
}

async function captureRecord(
  sampleId: string,
  baseTimestamp: string,
  {
    providerTurns,
    agent,
    question,
    context,
    metadata,
    policies,
  }: {
    providerTurns: Array<
      Array<
        | { type: "delta"; delta: string }
        | { type: "completed"; message: string }
        | {
            type: "tool_call";
            callId: string;
            name: string;
            arguments: string;
          }
      >
    >;
    agent: Agent<DemoContext>;
    question: string;
    context: DemoContext;
    metadata: Record<string, unknown>;
    policies?: PolicyConfiguration<DemoContext>;
  },
): Promise<RunRecord<DemoContext>> {
  const records: RunRecord<DemoContext>[] = [];

  setDefaultProvider(new ScriptedProvider(providerTurns));

  await run(agent, question, {
    stream: false,
    context,
    policies,
    record: {
      includePromptText: true,
      metadata,
      contextRedactor: (currentContext) => ({
        contextSnapshot: redactContext(currentContext),
        contextRedacted: true,
      }),
      sink: (record) => {
        records.push(record);
      },
    },
  });

  if (records.length !== 1) {
    throw new Error(
      `Expected exactly one RunRecord for sample "${sampleId}", got ${records.length}`,
    );
  }

  return stabilizeRecord(records[0]!, sampleId, baseTimestamp, metadata);
}

async function createSimpleRunSample(): Promise<RunRecord<DemoContext>> {
  const agent = new Agent<DemoContext>({
    name: "Simple Assistant",
    model: "fake-model",
    promptVersion: "simple-assistant.v1",
    instructions: "Answer in one short sentence.",
  });

  return captureRecord("simple-run", "2026-01-15T09:00:00.000Z", {
    providerTurns: [
      [
        { type: "delta", delta: "AIOC " },
        { type: "completed", message: "AIOC records auditable agent runs." },
      ],
    ],
    agent,
    question: "What does AIOC record?",
    context: {
      actor: {
        userId: "user-001",
        groups: ["support"],
      },
      requestId: "req-simple-001",
    },
    metadata: {
      sampleId: "simple-run",
      sampleCategory: "single-run",
      sampleTitle: "Simple completed run",
    },
  });
}

async function createToolAllowSample(): Promise<RunRecord<DemoContext>> {
  const getFinanceReport = tool<DemoContext>({
    name: "get_finance_report",
    description: "Returns a deterministic finance report summary.",
    parameters: z.object({
      reportId: z.string(),
    }),
    execute: async ({ reportId }) => ({
      reportId,
      status: "approved",
      owner: "finance-ops",
    }),
  });

  const agent = new Agent<DemoContext>({
    name: "Finance Assistant",
    model: "fake-model",
    promptVersion: "finance-assistant.v1",
    instructions: "Call get_finance_report before answering.",
    tools: [getFinanceReport],
  });

  return captureRecord("tool-allow", "2026-01-15T10:00:00.000Z", {
    providerTurns: [
      [
        {
          type: "tool_call",
          callId: "tool-call-finance-1",
          name: "get_finance_report",
          arguments: JSON.stringify({ reportId: "Q1-2026" }),
        },
      ],
      [
        {
          type: "completed",
          message: "Report Q1-2026 is approved and owned by finance-ops.",
        },
      ],
    ],
    agent,
    question: "Summarize the Q1 finance report.",
    context: {
      actor: {
        userId: "user-002",
        groups: ["finance"],
      },
      requestId: "req-tool-001",
      customerId: "C-100",
    },
    metadata: {
      sampleId: "tool-allow",
      sampleCategory: "tool-policy",
      sampleTitle: "Tool call allowed by policy",
    },
    policies: {
      toolPolicy: () =>
        allow("allow_finance_report", {
          policyVersion: "finance-policy.v1",
        }),
    },
  });
}

async function createHandoffAllowSample(): Promise<RunRecord<DemoContext>> {
  const financeSpecialist = new Agent<DemoContext>({
    name: "Finance Specialist",
    model: "fake-model",
    promptVersion: "finance-specialist.v1",
    instructions: "Take over finance-related escalations.",
  });

  const triageAgent = new Agent<DemoContext>({
    name: "Triage Agent",
    model: "fake-model",
    promptVersion: "triage-agent.v1",
    instructions: "Escalate finance requests when needed.",
    handoffs: [financeSpecialist],
  });

  return captureRecord("handoff-allow", "2026-01-15T11:00:00.000Z", {
    providerTurns: [
      [
        {
          type: "tool_call",
          callId: "handoff-call-allow-1",
          name: toHandoffToolName(financeSpecialist.name),
          arguments: JSON.stringify({ reason: "invoice_dispute" }),
        },
      ],
      [
        {
          type: "completed",
          message:
            "The finance specialist will review the invoice dispute today.",
        },
      ],
    ],
    agent: triageAgent,
    question: "Can finance review this invoice dispute?",
    context: {
      actor: {
        userId: "user-003",
        groups: ["support"],
      },
      requestId: "req-handoff-allow-001",
      customerId: "C-220",
    },
    metadata: {
      sampleId: "handoff-allow",
      sampleCategory: "handoff",
      sampleTitle: "Handoff accepted by policy",
    },
    policies: {
      handoffPolicy: () =>
        allow("allow_finance_handoff", {
          policyVersion: "handoff-policy.v1",
        }),
    },
  });
}

async function createHandoffDenySample(): Promise<RunRecord<DemoContext>> {
  const financeSpecialist = new Agent<DemoContext>({
    name: "Finance Specialist",
    model: "fake-model",
    promptVersion: "finance-specialist.v1",
    instructions: "Take over finance-related escalations.",
  });

  const triageAgent = new Agent<DemoContext>({
    name: "Triage Agent",
    model: "fake-model",
    promptVersion: "triage-agent.v1",
    instructions: "Escalate finance requests when needed.",
    handoffs: [financeSpecialist],
  });

  return captureRecord("handoff-deny", "2026-01-15T12:00:00.000Z", {
    providerTurns: [
      [
        {
          type: "tool_call",
          callId: "handoff-call-deny-1",
          name: toHandoffToolName(financeSpecialist.name),
          arguments: JSON.stringify({ reason: "invoice_dispute" }),
        },
      ],
      [
        {
          type: "completed",
          message:
            "I cannot escalate this request to finance, but I can prepare a manual review note.",
        },
      ],
    ],
    agent: triageAgent,
    question: "Can finance review this invoice dispute?",
    context: {
      actor: {
        userId: "user-004",
        groups: ["support"],
      },
      requestId: "req-handoff-deny-001",
      customerId: "C-221",
    },
    metadata: {
      sampleId: "handoff-deny",
      sampleCategory: "handoff",
      sampleTitle: "Handoff denied as tool result",
    },
    policies: {
      handoffPolicy: () =>
        deny("missing_finance_approval", {
          publicReason:
            "Escalation to finance is not allowed for this request.",
          denyMode: "tool_result",
          policyVersion: "handoff-policy.v1",
        }),
    },
  });
}

async function createCompareV1Sample(): Promise<RunRecord<DemoContext>> {
  const getCustomerProfile = tool<DemoContext>({
    name: "get_customer_profile",
    description: "Returns a deterministic customer profile.",
    parameters: z.object({
      customerId: z.string(),
    }),
    execute: async ({ customerId }) => ({
      customerId,
      segment: "enterprise",
      riskScore: 18,
    }),
  });

  const agent = new Agent<DemoContext>({
    name: "Customer Support Agent",
    model: "fake-model",
    promptVersion: "customer-support.v1",
    instructions:
      "Call get_customer_profile exactly once before producing the final answer.",
    tools: [getCustomerProfile],
  });

  return captureRecord("compare-v1", "2026-01-15T13:00:00.000Z", {
    providerTurns: [
      [
        {
          type: "tool_call",
          callId: "compare-tool-call-1",
          name: "get_customer_profile",
          arguments: JSON.stringify({ customerId: "C-42" }),
        },
      ],
      [
        {
          type: "completed",
          message:
            "Customer C-42 is enterprise with low risk. Next action: schedule a renewal call.",
        },
      ],
    ],
    agent,
    question: "Summarize customer C-42 and suggest the next action.",
    context: {
      actor: {
        userId: "user-005",
        groups: ["support"],
      },
      requestId: "req-compare-v1-001",
      customerId: "C-42",
    },
    metadata: {
      sampleId: "compare-v1",
      sampleCategory: "compare",
      sampleTitle: "Compare baseline with tool usage",
    },
    policies: {
      toolPolicy: () =>
        allow("allow_customer_profile_lookup", {
          policyVersion: "support-policy.v1",
        }),
    },
  });
}

async function createCompareV2Sample(): Promise<RunRecord<DemoContext>> {
  const getCustomerProfile = tool<DemoContext>({
    name: "get_customer_profile",
    description: "Returns a deterministic customer profile.",
    parameters: z.object({
      customerId: z.string(),
    }),
    execute: async ({ customerId }) => ({
      customerId,
      segment: "enterprise",
      riskScore: 18,
    }),
  });

  const agent = new Agent<DemoContext>({
    name: "Customer Support Agent",
    model: "fake-model",
    promptVersion: "customer-support.v2",
    instructions: "Answer directly without using any tool.",
    tools: [getCustomerProfile],
  });

  return captureRecord("compare-v2", "2026-01-15T13:30:00.000Z", {
    providerTurns: [
      [
        {
          type: "completed",
          message:
            "Customer C-42 appears stable. Next action: send a renewal reminder.",
        },
      ],
    ],
    agent,
    question: "Summarize customer C-42 and suggest the next action.",
    context: {
      actor: {
        userId: "user-006",
        groups: ["support"],
      },
      requestId: "req-compare-v2-001",
      customerId: "C-42",
    },
    metadata: {
      sampleId: "compare-v2",
      sampleCategory: "compare",
      sampleTitle: "Compare candidate without tool usage",
    },
    policies: {
      toolPolicy: () =>
        allow("allow_customer_profile_lookup", {
          policyVersion: "support-policy.v1",
        }),
    },
  });
}

async function writeSample(
  fileName: string,
  record: RunRecord<DemoContext>,
): Promise<void> {
  await writeFile(
    path.join(outputDirectory, fileName),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );
}

async function main(): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });

  const samples = [
    {
      id: "simple-run",
      title: "Simple completed run",
      description:
        "Single-turn run with prompt snapshot, request fingerprint, and redacted context.",
      file: "simple-run.json",
      record: await createSimpleRunSample(),
    },
    {
      id: "tool-allow",
      title: "Tool call allowed by policy",
      description:
        "Two-turn run where a deterministic tool call is allowed and produces a recorded output.",
      file: "tool-allow.json",
      record: await createToolAllowSample(),
    },
    {
      id: "handoff-allow",
      title: "Handoff accepted by policy",
      description:
        "Two-turn run where a handoff is accepted, the active agent changes, and the target agent completes the response.",
      file: "handoff-allow.json",
      record: await createHandoffAllowSample(),
    },
    {
      id: "handoff-deny",
      title: "Handoff denied as tool result",
      description:
        "Two-turn run where the handoff is denied, the source agent remains active, and the denial is visible in policy decisions and tool output.",
      file: "handoff-deny.json",
      record: await createHandoffDenySample(),
    },
    {
      id: "compare-v1",
      title: "Compare baseline with tool usage",
      description:
        "Baseline record for visual comparison, with one customer profile lookup.",
      file: "compare-v1.json",
      record: await createCompareV1Sample(),
    },
    {
      id: "compare-v2",
      title: "Compare candidate without tool usage",
      description:
        "Candidate record for visual comparison, answering directly without a tool call.",
      file: "compare-v2.json",
      record: await createCompareV2Sample(),
    },
  ] satisfies Array<SampleManifestEntry & { record: RunRecord<DemoContext> }>;

  for (const sample of samples) {
    await writeSample(sample.file, sample.record);
  }

  const manifest = {
    samples: samples.map(({ record: _record, ...entry }) => entry),
  };

  await writeFile(
    path.join(outputDirectory, "index.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
