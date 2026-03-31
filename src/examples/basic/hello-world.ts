import "dotenv/config";
import { Agent, run } from "../../index";
import { getExampleProviderConfig } from "../support/live-provider";

async function main(): Promise<void> {
  // Minimal setup: choose provider via AIOC_EXAMPLE_PROVIDER and call setup().
  const { setup, model } = getExampleProviderConfig();
  setup();

  const agent = new Agent({
    name: "Hello run agent",
    model,
    instructions: "Answer in 2 short sentences.",
  });

  // Default behavior: non-stream run (stream defaults to false).
  const result = await run(
    agent,
    "In one sentence, what is a deterministic policy gate in an agent SDK?",
  );

  process.stdout.write(`${result.finalOutput}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
