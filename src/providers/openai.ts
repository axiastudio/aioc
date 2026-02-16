import {
  ChatCompletionsProvider,
  ChatCompletionsProviderOptions,
} from "./chat-completions";

export type OpenAIProviderOptions = Omit<
  ChatCompletionsProviderOptions,
  "baseURL" | "headers"
> & {
  baseURL?: string;
  organization?: string;
  project?: string;
  headers?: Record<string, string>;
};

function toOpenAIHeaders(
  options: OpenAIProviderOptions,
): Record<string, string> {
  return {
    ...(options.headers ?? {}),
    ...(options.organization
      ? { "OpenAI-Organization": options.organization }
      : {}),
    ...(options.project ? { "OpenAI-Project": options.project } : {}),
  };
}

export class OpenAIProvider extends ChatCompletionsProvider {
  constructor(options: OpenAIProviderOptions) {
    super({
      apiKey: options.apiKey,
      baseURL: options.baseURL ?? "https://api.openai.com/v1",
      headers: toOpenAIHeaders(options),
    });
  }
}
