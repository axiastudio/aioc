export class RunContext<TContext = unknown> {
  context: TContext;

  constructor(context: TContext) {
    this.context = context;
  }
}
