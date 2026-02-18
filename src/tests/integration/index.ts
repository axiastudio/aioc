import { runChatCompletionsIntegrationTests } from "./chat-completions.integration";

async function main(): Promise<void> {
  await runChatCompletionsIntegrationTests();
  process.stdout.write("Integration tests passed.\n");
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
