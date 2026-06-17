import "dotenv/config";
import { z } from "zod";
import {
  Agent,
  allow,
  run,
  tool,
  type RunRecord,
  type RunRecordSink,
  type ToolPolicy,
} from "../../../src/index";
import { getExampleProviderConfig } from "../support/live-provider";

interface FinanceContext {
  actor: {
    userId: string;
    groups: string[];
    email: string;
  };
}

async function main(): Promise<void> {
  const { setup, model } = getExampleProviderConfig();
  setup();

  const getFinanceReport = tool<FinanceContext>({
    name: "get_finance_report",
    description: "Return summary fields for a finance report.",
    parameters: z.object({
      reportId: z.string(),
    }),
    execute: async ({ reportId }) => ({
      reportId,
      revenue: 1240000,
      costs: 820000,
      margin: 420000,
      currency: "EUR",
    }),
  });

  const agent = new Agent<FinanceContext>({
    name: "Finance Analyst Agent",
    model,
    promptVersion: "finance-analyst.v1",
    instructions:
      "If asked about a finance report, call get_finance_report first, then provide a short business summary.",
    tools: [getFinanceReport],
  });

  const toolPolicy: ToolPolicy<FinanceContext> = () => {
    return allow("allow_example_finance_report", {
      policyVersion: "finance-policy.v1",
    });
  };

  const records: RunRecord<FinanceContext>[] = [];

  // A sink lets the application decide where finalized RunRecords are stored.
  const sink: RunRecordSink<FinanceContext> = {
    write: (record) => {
      records.push(record);
    },
  };

  const result = await run(agent, "Summarize report Q1-2026.", {
    context: {
      actor: {
        userId: "u-finance",
        groups: ["finance"],
        email: "alice.finance@example.com",
      },
    },
    policies: { toolPolicy },
    record: {
      metadata: { example: "run-record-sink" },
      // Redact application context before it becomes part of the persisted record.
      contextRedactor: (context) => ({
        contextSnapshot: {
          actor: {
            ...context.actor,
            email: "[redacted-email]",
          },
        },
        contextRedacted: true,
      }),
      sink,
    },
  });

  const record = records[0];
  if (!record) {
    throw new Error("Expected the run-record sink to receive one record.");
  }

  const lastDecision =
    record.policyDecisions[record.policyDecisions.length - 1];

  process.stdout.write(
    [
      `assistant: ${result.finalOutput}`,
      `recordStatus: ${record.status}`,
      `recordedItems: ${record.items.length}`,
      `contextRedacted: ${String(record.contextRedacted)}`,
      `policyDecision: ${lastDecision?.decision ?? "n/a"} (${lastDecision?.reason ?? "n/a"})`,
      `metadata: ${JSON.stringify(record.metadata)}`,
    ].join("\n") + "\n",
  );
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
