import type { GuardrailFunctionOutput } from "./guardrails";
import type { PolicyResult } from "./policy";
import type { SuspendedProposal } from "./run-record";

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

export interface ToolCallApprovalRequiredResult {
  toolName: string;
  policyResult: PolicyResult;
  suspendedProposal: SuspendedProposal;
}

export class ToolCallApprovalRequiredError extends ToolCallError {
  result: ToolCallApprovalRequiredResult;

  constructor(result: ToolCallApprovalRequiredResult) {
    super(
      `Tool "${result.toolName}" requires approval: ${result.policyResult.reason}`,
    );
    this.result = result;
  }
}

export interface HandoffPolicyDeniedResult {
  fromAgent: string;
  toAgent: string;
  policyResult: PolicyResult;
}

export class HandoffPolicyDeniedError extends AIOCError {
  result: HandoffPolicyDeniedResult;

  constructor(result: HandoffPolicyDeniedResult) {
    super(
      `Handoff "${result.fromAgent}" -> "${result.toAgent}" denied by policy: ${result.policyResult.reason}`,
    );
    this.result = result;
  }
}

export interface HandoffApprovalRequiredResult {
  fromAgent: string;
  toAgent: string;
  policyResult: PolicyResult;
  suspendedProposal: SuspendedProposal;
}

export class HandoffApprovalRequiredError extends AIOCError {
  result: HandoffApprovalRequiredResult;

  constructor(result: HandoffApprovalRequiredResult) {
    super(
      `Handoff "${result.fromAgent}" -> "${result.toAgent}" requires approval: ${result.policyResult.reason}`,
    );
    this.result = result;
  }
}
