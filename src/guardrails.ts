import type { Agent } from "./agent";
import type { RunContext } from "./run-context";
import type { AgentInputItem } from "./types";

export interface GuardrailFunctionOutput {
  tripwireTriggered: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface OutputGuardrailFunctionArgs<TContext = unknown> {
  agent: Agent<TContext>;
  runContext: RunContext<TContext>;
  outputText: string;
  history: readonly AgentInputItem[];
}

export interface OutputGuardrail<TContext = unknown> {
  name: string;
  execute: (
    args: OutputGuardrailFunctionArgs<TContext>,
  ) => Promise<GuardrailFunctionOutput> | GuardrailFunctionOutput;
}

export function defineOutputGuardrail<TContext = unknown>(
  guardrail: OutputGuardrail<TContext>,
): OutputGuardrail<TContext> {
  return guardrail;
}
