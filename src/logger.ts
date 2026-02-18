export type RunLogLevel = "debug" | "info" | "warn" | "error";

interface RunLogEventBase {
  timestamp: string;
  level: RunLogLevel;
  agent: string;
  turn?: number;
}

export type RunLogEvent =
  | (RunLogEventBase & {
      type: "run_started";
      maxTurns: number;
      historyItems: number;
    })
  | (RunLogEventBase & {
      type: "agent_activated";
    })
  | (RunLogEventBase & {
      type: "turn_started";
    })
  | (RunLogEventBase & {
      type: "tool_call_started";
      toolName: string;
      callId: string;
    })
  | (RunLogEventBase & {
      type: "tool_policy_evaluated";
      toolName: string;
      callId: string;
      decision: "allow" | "deny";
      reason: string;
      policyVersion?: string;
      metadata?: Record<string, unknown>;
    })
  | (RunLogEventBase & {
      type: "handoff_policy_evaluated";
      handoffName: string;
      callId: string;
      toAgent: string;
      decision: "allow" | "deny";
      reason: string;
      policyVersion?: string;
      metadata?: Record<string, unknown>;
    })
  | (RunLogEventBase & {
      type: "tool_call_completed";
      toolName: string;
      callId: string;
    })
  | (RunLogEventBase & {
      type: "tool_call_failed";
      toolName: string;
      callId: string;
      errorName: string;
      errorMessage: string;
    })
  | (RunLogEventBase & {
      type: "output_guardrail_started";
      guardrailName: string;
    })
  | (RunLogEventBase & {
      type: "output_guardrail_passed";
      guardrailName: string;
    })
  | (RunLogEventBase & {
      type: "output_guardrail_triggered";
      guardrailName: string;
      reason?: string;
    })
  | (RunLogEventBase & {
      type: "run_completed";
      outputLength: number;
    })
  | (RunLogEventBase & {
      type: "run_failed";
      errorName: string;
      errorMessage: string;
    });

export interface RunLogger {
  log(event: RunLogEvent): Promise<void> | void;
}
