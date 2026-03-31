import "dotenv/config";
import { Agent, deny, run, tool, type ToolPolicy } from "../../index";
import { getExampleProviderConfig } from "../support/live-provider";

async function main(): Promise<void> {
  // Choose provider via AIOC_EXAMPLE_PROVIDER and call setup().
  const { setup, model } = getExampleProviderConfig();
  setup();

  const get_resource = tool({
    name: "get_resource",
    description: "Return the resource.",
    execute: async () => {
      return {};
    },
  });

  const toolPolicy: ToolPolicy = () => {
    return deny("deny_resource_access", {
      resultMode: "tool_result",
      publicReason: "You are not authorized to access resource.",
    });
  };

  const agent = new Agent({
    name: "Policy check agent",
    model,
    instructions: "Use the get_resource if the users asks for the resource.",
    tools: [get_resource],
  });

  const result = await run(agent, "Give me the resource.", {
    policies: { toolPolicy },
  });

  process.stdout.write(`${result.finalOutput}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
