import { setDefaultProvider } from "./config";
import {
  MistralProvider,
  type MistralProviderOptions,
} from "./providers/mistral";
import { OpenAIProvider, type OpenAIProviderOptions } from "./providers/openai";

export type SetupMistralOptions = Omit<MistralProviderOptions, "apiKey"> & {
  apiKey?: string;
};

export type SetupOpenAIOptions = Omit<OpenAIProviderOptions, "apiKey"> & {
  apiKey?: string;
};

export type SetupProviderKind = "mistral" | "openai";

function resolveApiKey(
  explicitApiKey: string | undefined,
  envVarName: "MISTRAL_API_KEY" | "OPENAI_API_KEY",
): string {
  const byArgument = explicitApiKey?.trim();
  if (byArgument) {
    return byArgument;
  }

  const byEnv = process.env[envVarName]?.trim();
  if (byEnv) {
    return byEnv;
  }

  throw new Error(
    `Missing ${envVarName}. Pass apiKey explicitly or set ${envVarName} in the environment.`,
  );
}

export function setupMistral(
  options: SetupMistralOptions = {},
): MistralProvider {
  const apiKey = resolveApiKey(options.apiKey, "MISTRAL_API_KEY");
  const provider = new MistralProvider({
    ...options,
    apiKey,
  });
  setDefaultProvider(provider);
  return provider;
}

export function setupOpenAI(options: SetupOpenAIOptions = {}): OpenAIProvider {
  const apiKey = resolveApiKey(options.apiKey, "OPENAI_API_KEY");
  const provider = new OpenAIProvider({
    ...options,
    apiKey,
  });
  setDefaultProvider(provider);
  return provider;
}

export function setupProvider(
  provider: "mistral",
  options?: SetupMistralOptions,
): MistralProvider;
export function setupProvider(
  provider: "openai",
  options?: SetupOpenAIOptions,
): OpenAIProvider;
export function setupProvider(
  provider: SetupProviderKind,
  options: SetupMistralOptions | SetupOpenAIOptions = {},
): MistralProvider | OpenAIProvider {
  if (provider === "mistral") {
    return setupMistral(options as SetupMistralOptions);
  }
  return setupOpenAI(options as SetupOpenAIOptions);
}
