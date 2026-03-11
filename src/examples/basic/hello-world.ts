import "dotenv/config";
import { Agent, run, setupMistral } from "../../index";

async function main(): Promise<void> {
  // Minimal setup: configure default provider from MISTRAL_API_KEY.
  setupMistral();

  const agent = new Agent({
    name: "Hello run agent",
    model: "mistral-small-latest",
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
