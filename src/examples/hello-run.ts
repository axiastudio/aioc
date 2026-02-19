import "dotenv/config";
import { Agent, run, setupMistral } from "../index";

async function main(): Promise<void> {
  // Minimal setup: configure default provider from MISTRAL_API_KEY.
  setupMistral();

  const agent = new Agent({
    name: "Hello run agent",
    model: "mistral-small-latest",
    instructions: "Reply in one short sentence and explain what AIOC is.",
  });

  // stream: true lets us print deltas while the model is generating.
  const stream = await run(agent, "What is AIOC?", {
    stream: true,
    maxTurns: 4,
    context: {
      requestId: "hello-run",
    },
  });

  for await (const event of stream.toStream()) {
    if (event.type === "raw_model_stream_event") {
      process.stdout.write(event.data.delta ?? "");
    }
  }

  process.stdout.write(
    `\n\nCompleted. Last agent: ${stream.lastAgent.name}. History items: ${stream.history.length}\n`,
  );
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
