import type {
  ModelProvider,
  ProviderEvent,
  ProviderRequest,
} from "../../providers/base";

export class ScriptedProvider implements ModelProvider {
  private readonly turns: ProviderEvent[][];
  private index = 0;

  constructor(turns: ProviderEvent[][]) {
    this.turns = turns;
  }

  async *stream<TContext = unknown>(
    _request: ProviderRequest<TContext>,
  ): AsyncIterable<ProviderEvent> {
    void _request;
    const events = this.turns[this.index] ?? [];
    this.index += 1;

    for (const event of events) {
      yield event;
    }
  }
}
