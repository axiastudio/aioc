import assert from "node:assert/strict";
import {
  MistralProvider,
  OpenAIProvider,
  clearDefaultProvider,
  getDefaultProvider,
  setupMistral,
  setupOpenAI,
  setupProvider,
} from "../../index";

function withEnv(
  key: "MISTRAL_API_KEY" | "OPENAI_API_KEY",
  value: string | undefined,
): () => void {
  const previous = process.env[key];
  if (typeof value === "undefined") {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }

  return () => {
    if (typeof previous === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  };
}

export async function runProviderSetupUnitTests(): Promise<void> {
  {
    const restore = withEnv("MISTRAL_API_KEY", undefined);
    clearDefaultProvider();
    const provider = setupMistral({
      apiKey: "mistral-explicit-key",
    });
    assert.ok(provider instanceof MistralProvider);
    assert.equal(getDefaultProvider(), provider);
    restore();
  }

  {
    const restore = withEnv("MISTRAL_API_KEY", "mistral-from-env");
    clearDefaultProvider();
    const provider = setupMistral();
    assert.ok(provider instanceof MistralProvider);
    assert.equal(getDefaultProvider(), provider);
    restore();
  }

  {
    const restore = withEnv("MISTRAL_API_KEY", undefined);
    clearDefaultProvider();
    assert.throws(() => setupMistral(), /Missing MISTRAL_API_KEY/);
    restore();
  }

  {
    const restore = withEnv("OPENAI_API_KEY", "openai-from-env");
    clearDefaultProvider();
    const provider = setupOpenAI();
    assert.ok(provider instanceof OpenAIProvider);
    assert.equal(getDefaultProvider(), provider);
    restore();
  }

  {
    const restore = withEnv("MISTRAL_API_KEY", "mistral-from-env");
    clearDefaultProvider();
    const provider = setupProvider("mistral");
    assert.ok(provider instanceof MistralProvider);
    assert.equal(getDefaultProvider(), provider);
    restore();
  }

  {
    const restore = withEnv("OPENAI_API_KEY", "openai-from-env");
    clearDefaultProvider();
    const provider = setupProvider("openai");
    assert.ok(provider instanceof OpenAIProvider);
    assert.equal(getDefaultProvider(), provider);
    restore();
  }
}
