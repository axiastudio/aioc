import {
  ChatCompletionsProvider,
  ChatCompletionsProviderOptions,
} from "./chat-completions";

export type MistralProviderOptions = Omit<
  ChatCompletionsProviderOptions,
  "baseURL"
> & {
  baseURL?: string;
};

export class MistralProvider extends ChatCompletionsProvider {
  constructor(options: MistralProviderOptions) {
    super({
      apiKey: options.apiKey,
      baseURL: options.baseURL ?? "https://api.mistral.ai/v1",
      headers: options.headers,
    });
  }
}
