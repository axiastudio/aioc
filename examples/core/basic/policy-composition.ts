import "dotenv/config";
import { z } from "zod";
import {
  Agent,
  allow,
  composeToolPolicies,
  deny,
  run,
  tool,
} from "../../../src/index";
import { getExampleProviderConfig } from "../support/live-provider";

async function main(): Promise<void> {
  const { setup, model } = getExampleProviderConfig();
  setup();

  const searchDocs = tool({
    name: "search_docs",
    description: "Search internal documentation.",
    parameters: z.object({
      query: z.string(),
    }),
    execute: async ({ query }) => ({
      query,
      results: [
        "Start with the onboarding checklist.",
        "Escalate account issues to support operations.",
      ],
    }),
  });

  const exportDocs = tool({
    name: "export_docs",
    description: "Export internal documentation.",
    execute: async () => ({ exported: true }),
  });

  const toolPolicy = composeToolPolicies({
    search_docs: () => allow("allow_search_docs"),
    "*": ({ toolName }) =>
      deny(`deny_tool_${toolName}`, {
        resultMode: "tool_result",
        publicReason: "This example only allows documentation search.",
      }),
  });

  const agent = new Agent({
    name: "Docs Agent",
    model,
    instructions:
      "Use search_docs to answer documentation questions. Do not export documents unless explicitly asked.",
    tools: [searchDocs, exportDocs],
  });

  const result = await run(
    agent,
    "Search internal docs for the onboarding escalation rule.",
    {
      policies: { toolPolicy },
    },
  );

  process.stdout.write(`${result.finalOutput}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
