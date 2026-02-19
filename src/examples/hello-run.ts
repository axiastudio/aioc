import "dotenv/config";
import { Agent, run, setupMistral } from "../index";

async function main(): Promise<void> {
  // Minimal setup: configure default provider from MISTRAL_API_KEY.
  setupMistral();

  const agent = new Agent({
    name: "Hello run agent",
    model: "mistral-small-latest",
    instructions: "You only respond in haikus.",
  });

  // Default behavior: non-stream run (stream defaults to false).
  const result = await run(
    agent,
    "Tell me about recursion in programming. Quickly responding with a single answer is fine.",
  );

  process.stdout.write(`${result.finalOutput}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
