import type {
  ModelProvider,
  ProviderEvent,
  ProviderRequest,
} from "../../providers/base";

export class ScriptedProvider implements ModelProvider {
  private readonly turns: ProviderEvent[][];
  readonly requests: ProviderRequest[] = [];
  private index = 0;

  constructor(turns: ProviderEvent[][]) {
    this.turns = turns;
  }

  async *stream<TContext = unknown>(
    request: ProviderRequest<TContext>,
  ): AsyncIterable<ProviderEvent> {
    this.requests.push({
      ...request,
      messages: [...request.messages],
      tools: [...request.tools] as ProviderRequest["tools"],
    });
    const events = this.turns[this.index] ?? [];
    this.index += 1;

    for (const event of events) {
      yield event;
    }
  }
}
