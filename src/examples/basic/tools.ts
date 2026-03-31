import "dotenv/config";
import { z } from "zod";
import {
  Agent,
  allow,
  deny,
  run,
  tool,
  type ToolPolicy,
} from "../../index";
import { getExampleProviderConfig } from "../support/live-provider";

interface FinanceContext {
  actor: {
    userId: string;
    groups: string[];
  };
}

async function main(): Promise<void> {
  // Choose provider via AIOC_EXAMPLE_PROVIDER and call setup().
  const { setup, model } = getExampleProviderConfig();
  setup();

  // One tool: read a finance report by id.
  const getFinanceReport = tool<FinanceContext>({
    name: "get_finance_report",
    description: "Return summary fields for a finance report.",
    parameters: z.object({
      reportId: z.string(),
    }),
    execute: async ({ reportId }) => {
      return {
        reportId,
        revenue: 1240000,
        costs: 820000,
        margin: 420000,
        currency: "EUR",
      };
    },
  });

  const agent = new Agent<FinanceContext>({
    name: "Finance Analyst Agent",
    model,
    instructions:
      "If asked about a finance report, call get_finance_report first, then provide a short business summary.",
    tools: [getFinanceReport],
  });

  // Policy gate: this tool is allowed only to actors in the "finance" group.
  const toolPolicy: ToolPolicy<FinanceContext> = ({ runContext }) => {
    if (!runContext.context.actor.groups.includes("finance")) {
      return deny("deny_missing_finance_group", {
        resultMode: "tool_result",
        publicReason: "You are not authorized to access finance reports.",
      });
    }
    return allow("allow_finance_group_access");
  };

  const result = await run(
    agent,
    "Give me a concise summary for report Q1-2026.",
    {
      context: {
        actor: {
          userId: "u-finance",
          groups: ["finance"],
        },
      },
      policies: { toolPolicy },
    },
  );

  process.stdout.write(`${result.finalOutput}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
