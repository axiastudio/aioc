import "dotenv/config";
import { z } from "zod";
import {
  Agent,
  MistralProvider,
  type RunLogger,
  run,
  setDefaultProvider,
  tool,
} from "../index";

async function main() {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing MISTRAL_API_KEY. Export it before running this script.",
    );
  }

  setDefaultProvider(
    new MistralProvider({
      apiKey,
    }),
  );

  const getUtcTime = tool({
    name: "get_utc_time",
    description: "Return current UTC timestamp in ISO format",
    parameters: z.object({}),
    execute: async () => {
      return {
        now: new Date().toISOString(),
      };
    },
  });

  const agent = new Agent({
    name: "Mistral smoke agent",
    handoffDescription: "Simple smoke test agent for AIOC.",
    instructions:
      "Answer in Italian in 2 short sentences. Use get_utc_time if asked for the current time.",
    model: "mistral-small-latest",
    tools: [getUtcTime],
  });

  const logger: RunLogger = {
    log(event) {
      process.stdout.write(`[aioc-log] ${JSON.stringify(event)}\n`);
    },
  };

  const stream = await run(
    agent,
    "Ciao! Dimmi rapidamente cos'e AIOC e poi dammi l'orario UTC corrente.",
    {
      stream: true,
      context: {
        requestId: "mistral-smoke",
      },
      maxTurns: 8,
      logger,
    },
  );

  for await (const event of stream.toStream()) {
    if (event.type === "raw_model_stream_event") {
      process.stdout.write(event.data.delta ?? "");
      continue;
    }

    if (
      event.type === "run_item_stream_event" &&
      event.item.type === "tool_call_item"
    ) {
      process.stdout.write(
        `\n\n[tool call] ${event.item.name} ${JSON.stringify(event.item.arguments)}\n\n`,
      );
    }
  }

  process.stdout.write(
    `\n\nCompleted. History items persisted in memory: ${stream.history.length}\n`,
  );
}

main().catch((err) => {
  const message =
    err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
