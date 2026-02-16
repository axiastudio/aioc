import { ModelProvider } from "./providers/base";

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
      "No default provider configured. Call setDefaultProvider().",
    );
  }
  return defaultProvider;
}
