import { ModelProvider } from "./providers/base";
import { ChatCompletionsProvider } from "./providers/chat-completions";

let defaultProvider: ModelProvider | null = null;

export function setDefaultProvider(provider: ModelProvider): void {
  defaultProvider = provider;
}

export function clearDefaultProvider(): void {
  defaultProvider = null;
}

export function getDefaultProvider(): ModelProvider {
  if (!defaultProvider) {
    throw new Error(
      "No default provider configured. Call setDefaultProvider() or setDefaultApiKey().",
    );
  }
  return defaultProvider;
}

export function setDefaultApiKey(apiKey: string): void {
  setDefaultProvider(
    new ChatCompletionsProvider({
      apiKey,
    }),
  );
}
