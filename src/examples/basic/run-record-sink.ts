import "dotenv/config";
import { z } from "zod";
import {
  Agent,
  allow,
  deny,
  run,
  setupMistral,
  tool,
  type RunRecord,
  type RunRecordSink,
  type ToolPolicy,
} from "../../index";

interface FinanceContext {
  actor: {
    userId: string;
    groups: string[];
    email: string;
  };
}

function findLastToolResultEnvelope(
  record: RunRecord<FinanceContext>,
): unknown | undefined {
  const reversedItems = [...record.items].reverse();
  const outputItem = reversedItems.find(
    (item) => item.type === "tool_call_output_item",
  );
  if (!outputItem || outputItem.type !== "tool_call_output_item") {
    return undefined;
  }
  return outputItem?.output;
}

async function runScenario(
  label: string,
  agent: Agent<FinanceContext>,
  actor: FinanceContext["actor"],
  toolPolicy: ToolPolicy<FinanceContext>,
  sink: RunRecordSink<FinanceContext>,
): Promise<void> {
  process.stdout.write(
    `\n=== Scenario: ${label} (groups: ${actor.groups.join(", ")}) ===\n`,
  );

  const result = await run(agent, "Summarize report Q1-2026.", {
    context: { actor },
    policies: { toolPolicy },
    maxTurns: 6,
    record: {
      metadata: { scenario: label },
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

  process.stdout.write(`assistant: ${result.finalOutput}\n`);
}

async function main(): Promise<void> {
  // Configure default provider from MISTRAL_API_KEY.
  setupMistral();

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
    model: "mistral-small-latest",
    instructions:
      "If asked about a finance report, call get_finance_report first, then provide a short business summary.",
    tools: [getFinanceReport],
  });

  const toolPolicy: ToolPolicy<FinanceContext> = ({ runContext }) => {
    if (!runContext.context.actor.groups.includes("finance")) {
      return deny("deny_missing_finance_group", {
        denyMode: "tool_result",
        publicReason: "You are not authorized to access finance reports.",
        policyVersion: "finance-policy.v1",
      });
    }
    return allow("allow_finance_group_access", {
      policyVersion: "finance-policy.v1",
    });
  };

  const records: RunRecord<FinanceContext>[] = [];
  const sink: RunRecordSink<FinanceContext> = {
    write: (record) => {
      records.push(record);
      process.stdout.write(
        `[sink] runId=${record.runId} status=${record.status} decisions=${record.policyDecisions.length}\n`,
      );
    },
  };

  await runScenario(
    "actor in finance",
    agent,
    {
      userId: "u-finance",
      groups: ["finance"],
      email: "alice.finance@example.com",
    },
    toolPolicy,
    sink,
  );

  await runScenario(
    "actor in sales",
    agent,
    {
      userId: "u-sales",
      groups: ["sales"],
      email: "bob.sales@example.com",
    },
    toolPolicy,
    sink,
  );

  process.stdout.write(`\n=== Persisted records (${records.length}) ===\n`);
  for (const record of records) {
    const lastDecision =
      record.policyDecisions[record.policyDecisions.length - 1];
    process.stdout.write(
      [
        `runId: ${record.runId}`,
        `scenario: ${String(record.metadata?.scenario ?? "")}`,
        `contextRedacted: ${String(record.contextRedacted ?? false)}`,
        `policyDecision: ${lastDecision?.decision ?? "n/a"} (${lastDecision?.reason ?? "n/a"})`,
        `toolResultEnvelope: ${JSON.stringify(findLastToolResultEnvelope(record))}`,
      ].join("\n") + "\n\n",
    );
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
