import type { RunLogEvent, RunLogger } from "./logger";

function toErrorDetails(error: unknown): {
  errorName: string;
  errorMessage: string;
} {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    };
  }

  return {
    errorName: "Error",
    errorMessage: String(error),
  };
}

export class RunLogEmitter {
  private logger?: RunLogger;

  constructor(logger?: RunLogger) {
    this.logger = logger;
  }

  private createTimestamp(): string {
    return new Date().toISOString();
  }

  private async emit(event: RunLogEvent): Promise<void> {
    if (!this.logger) {
      return;
    }

    try {
      await this.logger.log(event);
    } catch {
      // Logging must never break runtime behavior.
    }
  }

  async runStarted(
    agent: string,
    maxTurns: number,
    historyItems: number,
  ): Promise<void> {
    await this.emit({
      timestamp: this.createTimestamp(),
      level: "info",
      type: "run_started",
      agent,
      maxTurns,
      historyItems,
    });
  }

  async agentActivated(agent: string, turn: number): Promise<void> {
    await this.emit({
      timestamp: this.createTimestamp(),
      level: "info",
      type: "agent_activated",
      agent,
      turn,
    });
  }

  async turnStarted(agent: string, turn: number): Promise<void> {
    await this.emit({
      timestamp: this.createTimestamp(),
      level: "debug",
      type: "turn_started",
      agent,
      turn,
    });
  }

  async toolCallStarted(
    agent: string,
    turn: number,
    toolName: string,
    callId: string,
  ): Promise<void> {
    await this.emit({
      timestamp: this.createTimestamp(),
      level: "info",
      type: "tool_call_started",
      agent,
      turn,
      toolName,
      callId,
    });
  }

  async toolCallCompleted(
    agent: string,
    turn: number,
    toolName: string,
    callId: string,
  ): Promise<void> {
    await this.emit({
      timestamp: this.createTimestamp(),
      level: "info",
      type: "tool_call_completed",
      agent,
      turn,
      toolName,
      callId,
    });
  }

  async toolCallFailed(
    agent: string,
    turn: number,
    toolName: string,
    callId: string,
    error: unknown,
  ): Promise<void> {
    const details = toErrorDetails(error);
    await this.emit({
      timestamp: this.createTimestamp(),
      level: "error",
      type: "tool_call_failed",
      agent,
      turn,
      toolName,
      callId,
      errorName: details.errorName,
      errorMessage: details.errorMessage,
    });
  }

  async outputGuardrailStarted(
    agent: string,
    turn: number,
    guardrailName: string,
  ): Promise<void> {
    await this.emit({
      timestamp: this.createTimestamp(),
      level: "debug",
      type: "output_guardrail_started",
      agent,
      turn,
      guardrailName,
    });
  }

  async outputGuardrailPassed(
    agent: string,
    turn: number,
    guardrailName: string,
  ): Promise<void> {
    await this.emit({
      timestamp: this.createTimestamp(),
      level: "info",
      type: "output_guardrail_passed",
      agent,
      turn,
      guardrailName,
    });
  }

  async outputGuardrailTriggered(
    agent: string,
    turn: number,
    guardrailName: string,
    reason?: string,
  ): Promise<void> {
    await this.emit({
      timestamp: this.createTimestamp(),
      level: "warn",
      type: "output_guardrail_triggered",
      agent,
      turn,
      guardrailName,
      reason,
    });
  }

  async runCompleted(
    agent: string,
    turn: number,
    outputLength: number,
  ): Promise<void> {
    await this.emit({
      timestamp: this.createTimestamp(),
      level: "info",
      type: "run_completed",
      agent,
      turn,
      outputLength,
    });
  }

  async runFailed(
    agent: string,
    turn: number | undefined,
    error: unknown,
  ): Promise<void> {
    const details = toErrorDetails(error);
    await this.emit({
      timestamp: this.createTimestamp(),
      level: "error",
      type: "run_failed",
      agent,
      turn,
      errorName: details.errorName,
      errorMessage: details.errorMessage,
    });
  }
}
