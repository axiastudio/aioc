import type { GuardrailFunctionOutput } from "./guardrails";
import type { PolicyResult } from "./policy";

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

export interface ToolCallPolicyDeniedResult {
  toolName: string;
  policyResult: PolicyResult;
}

export class ToolCallPolicyDeniedError extends ToolCallError {
  result: ToolCallPolicyDeniedResult;

  constructor(result: ToolCallPolicyDeniedResult) {
    super(
      `Tool "${result.toolName}" denied by policy: ${result.policyResult.reason}`,
    );
    this.result = result;
  }
}
