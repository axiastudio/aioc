export class AIOCError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class MaxTurnsExceededError extends AIOCError {
  constructor(maxTurns: number) {
    super(`Max turns exceeded: ${maxTurns}`);
  }
}

export class OutputGuardrailTripwireTriggered extends AIOCError {}

export class ToolCallError extends AIOCError {}
