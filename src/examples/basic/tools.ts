import "dotenv/config";
import { z } from "zod";
import {
  Agent,
  allow,
  createStdoutLogger,
  deny,
  run,
  setupMistral,
  tool,
  type ToolPolicy,
} from "../../index";

interface FinanceContext {
  actor: {
    userId: string;
    groups: string[];
  };
}

async function runScenario(
  label: string,
  agent: Agent<FinanceContext>,
  toolPolicy: ToolPolicy<FinanceContext>,
  logger: ReturnType<typeof createStdoutLogger>,
  actor: FinanceContext["actor"],
): Promise<void> {
  process.stdout.write(
    `\n=== Scenario: ${label} (groups: ${actor.groups.join(", ")}) ===\n`,
  );

  const stream = await run(
    agent,
    "Give me a concise summary for report Q1-2026.",
    {
      stream: true,
      context: { actor },
      policies: { toolPolicy },
      logger,
      maxTurns: 6,
    },
  );

  for await (const event of stream.toStream()) {
    if (
      event.type === "run_item_stream_event" &&
      event.item.type === "tool_call_item"
    ) {
      process.stdout.write(
        `\n[tool call] ${event.item.name} ${JSON.stringify(event.item.arguments)}\n`,
      );
    }

    if (
      event.type === "run_item_stream_event" &&
      event.item.type === "tool_call_output_item"
    ) {
      process.stdout.write(
        `[tool result] ${JSON.stringify(event.item.output)}\n\n`,
      );
    }

    if (event.type === "raw_model_stream_event") {
      process.stdout.write(event.data.delta ?? "");
    }
  }

  process.stdout.write(
    `\n\nCompleted. Last agent: ${stream.lastAgent.name}. History items: ${stream.history.length}\n`,
  );
}

async function main(): Promise<void> {
  // Minimal provider setup from env (MISTRAL_API_KEY).
  setupMistral();

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
    model: "mistral-small-latest",
    instructions:
      "If asked about a finance report, call get_finance_report first, then provide a short business summary.",
    tools: [getFinanceReport],
  });

  // Policy gate: the tool is allowed only to users in 'finance' group.
  const toolPolicy: ToolPolicy<FinanceContext> = ({ runContext }) => {
    const hasFinanceAccess =
      runContext.context.actor.groups.includes("finance");
    if (!hasFinanceAccess) {
      return deny("deny_missing_finance_group", {
        denyMode: "tool_result",
        publicReason: "You are not authorized to access finance reports.",
      });
    }
    return allow("allow_finance_group_access");
  };

  // Optional logger: prints only the policy decision event to keep output readable.
  const logger = createStdoutLogger({
    pretty: true,
    events: ["tool_policy_evaluated"],
  });

  await runScenario("actor in finance", agent, toolPolicy, logger, {
    userId: "u-finance",
    groups: ["finance"],
  });

  await runScenario("actor in sales", agent, toolPolicy, logger, {
    userId: "u-sales",
    groups: ["sales"],
  });
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
