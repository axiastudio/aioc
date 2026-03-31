import "dotenv/config";
import {
  Agent,
  deny,
  run,
  setupMistral,
  tool,
  type ToolPolicy,
} from "../../index";

async function main(): Promise<void> {
  // Minimal setup: configure default provider from MISTRAL_API_KEY.
  setupMistral();

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
    model: "mistral-small-latest",
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
