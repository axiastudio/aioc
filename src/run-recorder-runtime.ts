import { createHash } from "node:crypto";
import type {
  GuardrailDecisionRecord,
  PolicyDecisionRecord,
  PromptSnapshotRecord,
  RunRecord,
  RunRecordContextRedactionResult,
  RunRecordOptions,
  RunRecordWriter,
} from "./run-record";
import type { AgentInputItem } from "./types";

export type PendingPolicyDecisionRecord = Omit<
  PolicyDecisionRecord,
  "timestamp"
>;
export type PendingGuardrailDecisionRecord = Omit<
  GuardrailDecisionRecord,
  "timestamp"
>;
export type PendingPromptSnapshotRecord = Omit<
  PromptSnapshotRecord,
  "timestamp" | "promptHash" | "promptText"
> & {
  promptText?: string;
};

interface RunRecorderCreateOptions<TContext> {
  input: string | AgentInputItem[];
  context: TContext;
  providerName: string;
  recordOptions?: RunRecordOptions<TContext>;
}

interface RunRecorderFinalizeOptions {
  agentName: string;
  model?: string;
  items: AgentInputItem[];
}

function extractQuestion(input: string | AgentInputItem[]): string {
  if (typeof input === "string") {
    return input;
  }

  const userMessages = input
    .filter(
      (item): item is Extract<AgentInputItem, { type: "message" }> =>
        item.type === "message" && item.role === "user",
    )
    .map((item) => item.content.trim())
    .filter((item) => item.length > 0);

  if (userMessages.length > 0) {
    return userMessages.join("\n\n");
  }

  return "";
}

function createRunId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function resolveRunRecordWriter<TContext = unknown>(
  options?: RunRecordOptions<TContext>,
): RunRecordWriter<TContext> | null {
  const sink = options?.sink;
  if (!sink) {
    return null;
  }

  if (typeof sink === "function") {
    return sink;
  }

  return sink.write;
}

async function resolveContextSnapshot<TContext>(
  context: TContext,
  options?: RunRecordOptions<TContext>,
): Promise<RunRecordContextRedactionResult<TContext>> {
  if (!options?.contextRedactor) {
    return {
      contextSnapshot: context,
      contextRedacted: false,
    };
  }

  try {
    return await options.contextRedactor(context);
  } catch {
    return {
      contextSnapshot: context,
      contextRedacted: false,
    };
  }
}

function toErrorSummary(error: unknown): {
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

function hashPrompt(promptText: string): string {
  return createHash("sha256").update(promptText).digest("hex");
}

export class RunRecorder<TContext = unknown> {
  private readonly runRecordWriter: RunRecordWriter<TContext> | null;
  private readonly runRecordId: string;
  private readonly startedAt: string;
  private readonly question: string;
  private readonly providerName: string;
  private readonly metadata?: Record<string, unknown>;
  private readonly contextSnapshot: RunRecordContextRedactionResult<TContext>;
  private readonly includePromptText: boolean;

  private readonly policyDecisions: PolicyDecisionRecord[] = [];
  private readonly guardrailDecisions: GuardrailDecisionRecord[] = [];
  private readonly promptSnapshots: PromptSnapshotRecord[] = [];
  private observedFinalOutput = "";
  private runRecordWritten = false;

  private constructor(
    runRecordWriter: RunRecordWriter<TContext> | null,
    runRecordId: string,
    startedAt: string,
    question: string,
    providerName: string,
    metadata: Record<string, unknown> | undefined,
    contextSnapshot: RunRecordContextRedactionResult<TContext>,
    includePromptText: boolean,
  ) {
    this.runRecordWriter = runRecordWriter;
    this.runRecordId = runRecordId;
    this.startedAt = startedAt;
    this.question = question;
    this.providerName = providerName;
    this.metadata = metadata;
    this.contextSnapshot = contextSnapshot;
    this.includePromptText = includePromptText;
  }

  static async create<TContext = unknown>(
    options: RunRecorderCreateOptions<TContext>,
  ): Promise<RunRecorder<TContext>> {
    const runRecordWriter = resolveRunRecordWriter(options.recordOptions);
    const runRecordId = options.recordOptions?.runId ?? createRunId();
    const startedAt = new Date().toISOString();
    const question = extractQuestion(options.input);
    const contextSnapshot = await resolveContextSnapshot(
      options.context,
      options.recordOptions,
    );

    return new RunRecorder(
      runRecordWriter,
      runRecordId,
      startedAt,
      question,
      options.providerName,
      options.recordOptions?.metadata,
      contextSnapshot,
      options.recordOptions?.includePromptText ?? false,
    );
  }

  onPolicyDecision = (decision: PendingPolicyDecisionRecord): void => {
    this.policyDecisions.push({
      timestamp: new Date().toISOString(),
      ...decision,
    });
  };

  onGuardrailDecision = (decision: PendingGuardrailDecisionRecord): void => {
    this.guardrailDecisions.push({
      timestamp: new Date().toISOString(),
      ...decision,
    });
  };

  onPromptSnapshot = (snapshot: PendingPromptSnapshotRecord): void => {
    const normalizedPrompt = snapshot.promptText ?? "";
    this.promptSnapshots.push({
      timestamp: new Date().toISOString(),
      turn: snapshot.turn,
      agentName: snapshot.agentName,
      model: snapshot.model,
      promptVersion: snapshot.promptVersion,
      promptHash: hashPrompt(normalizedPrompt),
      promptText: this.includePromptText ? normalizedPrompt : undefined,
    });
  };

  onMessageOutput = (content: string): void => {
    this.observedFinalOutput = content;
  };

  async emitCompleted(options: RunRecorderFinalizeOptions): Promise<void> {
    await this.emit("completed", options);
  }

  async emitFailed(
    options: RunRecorderFinalizeOptions,
    error: unknown,
  ): Promise<void> {
    await this.emit("failed", options, error);
  }

  private async emit(
    status: "completed" | "failed",
    options: RunRecorderFinalizeOptions,
    error?: unknown,
  ): Promise<void> {
    if (!this.runRecordWriter || this.runRecordWritten) {
      return;
    }
    this.runRecordWritten = true;

    const errorSummary = error ? toErrorSummary(error) : undefined;
    const record: RunRecord<TContext> = {
      runId: this.runRecordId,
      startedAt: this.startedAt,
      completedAt: new Date().toISOString(),
      status,
      agentName: options.agentName,
      providerName: this.providerName,
      model: options.model,
      question: this.question,
      response: this.observedFinalOutput,
      contextSnapshot: this.contextSnapshot.contextSnapshot,
      contextRedacted: this.contextSnapshot.contextRedacted,
      items: [...options.items],
      promptSnapshots: [...this.promptSnapshots],
      policyDecisions: [...this.policyDecisions],
      guardrailDecisions:
        this.guardrailDecisions.length > 0
          ? [...this.guardrailDecisions]
          : undefined,
      errorName: errorSummary?.errorName,
      errorMessage: errorSummary?.errorMessage,
      metadata: this.metadata,
    };

    try {
      await this.runRecordWriter(record);
    } catch {
      // Recording failures must never alter runtime behavior.
    }
  }
}
