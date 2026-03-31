import { setupMistral, setupOpenAI } from "../../index";

export interface ExampleProviderConfig {
  provider: "openai" | "mistral";
  model: string;
  setup: () => void;
}

function readModelOverride(): string | undefined {
  const value = process.env.AIOC_EXAMPLE_MODEL?.trim();
  return value ? value : undefined;
}

export function getExampleProviderConfig(): ExampleProviderConfig {
  const provider = process.env.AIOC_EXAMPLE_PROVIDER?.trim().toLowerCase();
  const modelOverride = readModelOverride();

  if (provider === "openai") {
    return {
      provider: "openai",
      model: modelOverride ?? "gpt-4.1-mini",
      setup: () => setupOpenAI(),
    };
  }

  if (provider === "mistral") {
    return {
      provider: "mistral",
      model: modelOverride ?? "mistral-small-latest",
      setup: () => setupMistral(),
    };
  }

  throw new Error(
    'Set AIOC_EXAMPLE_PROVIDER to "openai" or "mistral". Optionally set AIOC_EXAMPLE_MODEL to override the default model.',
  );
}
