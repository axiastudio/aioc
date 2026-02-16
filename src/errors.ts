import type { GuardrailFunctionOutput } from "./guardrails";

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

export interface OutputGuardrailTripwireResult {
  guardrail: string;
  output: GuardrailFunctionOutput;
  outputText: string;
}

export class OutputGuardrailTripwireTriggered extends AIOCError {
  result: OutputGuardrailTripwireResult;

  constructor(result: OutputGuardrailTripwireResult) {
    const reason = result.output.reason
      ? ` Reason: ${result.output.reason}`
      : "";
    super(`Output guardrail "${result.guardrail}" triggered.${reason}`);
    this.result = result;
  }
}

export class ToolCallError extends AIOCError {}
