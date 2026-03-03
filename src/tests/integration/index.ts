import { runChatCompletionsIntegrationTests } from "./chat-completions.integration";
import { runAnthropicIntegrationTests } from "./anthropic.integration";

async function main(): Promise<void> {
  await runChatCompletionsIntegrationTests();
  await runAnthropicIntegrationTests();
  process.stdout.write("Integration tests passed.\n");
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
