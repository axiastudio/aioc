import "dotenv/config";
import {
  Agent,
  requireApproval,
  run,
  tool,
  type ToolPolicy,
} from "../../index";
import { getExampleProviderConfig } from "../support/live-provider";

async function main(): Promise<void> {
  const { setup, model } = getExampleProviderConfig();
  setup();

  const export_report = tool({
    name: "export_report",
    description: "Export the report.",
    execute: async () => ({ exported: true }),
  });

  const toolPolicy: ToolPolicy = () =>
    requireApproval("approval_export_report", {
      resultMode: "tool_result",
      publicReason: "Export requires explicit approval.",
    });

  const agent = new Agent({
    name: "Approval check agent",
    model,
    instructions: "Use export_report if the user asks to export the report.",
    tools: [export_report],
  });

  const result = await run(agent, "Export the report.", {
    policies: { toolPolicy },
  });

  const outputItem = result.history.find(
    (item) => item.type === "tool_call_output_item",
  );

  process.stdout.write(
    `tool output: ${JSON.stringify(
      outputItem && "output" in outputItem ? outputItem.output : null,
    )}\n`,
  );
  process.stdout.write(`assistant: ${result.finalOutput}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
