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

export interface StdoutLoggerOptions {
  minLevel?: RunLogLevel;
  events?: RunLogEvent["type"][];
  pretty?: boolean;
  write?: (message: string) => void;
}

const LOG_LEVEL_RANK: Record<RunLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function shouldEmitForLevel(
  eventLevel: RunLogLevel,
  minLevel: RunLogLevel,
): boolean {
  return LOG_LEVEL_RANK[eventLevel] >= LOG_LEVEL_RANK[minLevel];
}

function formatPretty(event: RunLogEvent): string {
  const turn = typeof event.turn === "number" ? ` t${event.turn}` : "";
  const base = `[${event.level}] ${event.type}${turn} agent=${event.agent}`;

  if (event.type === "tool_policy_evaluated") {
    return `${base} tool=${event.toolName} decision=${event.decision} reason=${event.reason}`;
  }

  if (event.type === "handoff_policy_evaluated") {
    return `${base} handoff=${event.handoffName} to=${event.toAgent} decision=${event.decision} reason=${event.reason}`;
  }

  if (event.type === "tool_call_failed") {
    return `${base} tool=${event.toolName} error=${event.errorName}:${event.errorMessage}`;
  }

  if (event.type === "run_failed") {
    return `${base} error=${event.errorName}:${event.errorMessage}`;
  }

  return base;
}

export function createStdoutLogger(
  options: StdoutLoggerOptions = {},
): RunLogger {
  const minLevel = options.minLevel ?? "info";
  const allowedEvents = options.events ? new Set(options.events) : null;
  const pretty = options.pretty ?? false;
  const write =
    options.write ??
    ((message: string) => {
      process.stdout.write(message);
    });

  return {
    log(event) {
      if (!shouldEmitForLevel(event.level, minLevel)) {
        return;
      }

      if (allowedEvents && !allowedEvents.has(event.type)) {
        return;
      }

      if (pretty) {
        write(`${formatPretty(event)}\n`);
        return;
      }

      write(`${JSON.stringify(event)}\n`);
    },
  };
}
