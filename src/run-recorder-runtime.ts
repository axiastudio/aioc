import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  GuardrailDecisionRecord,
  PolicyDecisionRecord,
  PromptSnapshotRecord,
  RequestFingerprintRecord,
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
export type PendingRequestFingerprintRecord = Omit<
  RequestFingerprintRecord,
  | "timestamp"
  | "runtimeVersion"
  | "fingerprintSchemaVersion"
  | "requestHash"
  | "systemPromptHash"
  | "messagesHash"
  | "toolsHash"
  | "modelSettingsHash"
  | "messageCount"
  | "toolCount"
> & {
  systemPrompt?: string;
  messages: AgentInputItem[];
  tools: Array<{
    name: string;
    description: string;
    parameters: unknown;
  }>;
  modelSettings?: Record<string, unknown>;
};

type CanonicalValue =
  | null
  | string
  | number
  | boolean
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

const REQUEST_FINGERPRINT_SCHEMA_VERSION = "request-fingerprint.v1";

function resolveRuntimeVersion(): string {
  const envVersion =
    process.env.AIOC_RUNTIME_VERSION?.trim() ??
    process.env.npm_package_version?.trim();
  if (envVersion) {
    return envVersion;
  }

  try {
    const packageJsonPath = resolve(__dirname, "..", "package.json");
    const packageJsonRaw = readFileSync(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageJsonRaw) as { version?: unknown };
    if (
      typeof packageJson.version === "string" &&
      packageJson.version.trim().length > 0
    ) {
      return packageJson.version.trim();
    }
  } catch {
    // Fallback handled below.
  }

  return "unknown";
}

const RUNTIME_VERSION = resolveRuntimeVersion();

function normalizeForHash(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): CanonicalValue {
  if (value === null) {
    return null;
  }

  const valueType = typeof value;
  if (
    valueType === "string" ||
    valueType === "number" ||
    valueType === "boolean"
  ) {
    return value as string | number | boolean;
  }

  if (valueType === "undefined") {
    return "[undefined]";
  }

  if (valueType === "bigint") {
    return `[bigint:${String(value)}]`;
  }

  if (valueType === "symbol") {
    return `[symbol:${String(value)}]`;
  }

  if (valueType === "function") {
    return "[function]";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof RegExp) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForHash(item, seen));
  }

  if (value instanceof Set) {
    const entries = [...value].map((entry) => normalizeForHash(entry, seen));
    entries.sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
    return entries;
  }

  if (value instanceof Map) {
    const entries = [...value.entries()].map(([key, entry]) => [
      normalizeForHash(key, seen),
      normalizeForHash(entry, seen),
    ]);
    entries.sort((left, right) =>
      JSON.stringify(left[0]).localeCompare(JSON.stringify(right[0])),
    );
    return entries as CanonicalValue;
  }

  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (seen.has(objectValue)) {
      return "[circular]";
    }
    seen.add(objectValue);

    const normalized: Record<string, CanonicalValue> = {};
    const keys = Object.keys(objectValue).sort();
    for (const key of keys) {
      normalized[key] = normalizeForHash(objectValue[key], seen);
    }

    seen.delete(objectValue);
    return normalized;
  }

  return String(value);
}

function hashForFingerprint(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(normalizeForHash(value)))
    .digest("hex");
}

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
  private readonly requestFingerprints: RequestFingerprintRecord[] = [];
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

  onRequestFingerprint = (
    fingerprint: PendingRequestFingerprintRecord,
  ): void => {
    const normalizedSystemPrompt = fingerprint.systemPrompt ?? "";
    const normalizedModelSettings = fingerprint.modelSettings ?? {};
    const normalizedTools = fingerprint.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
    const requestPayload = {
      model: fingerprint.model,
      systemPrompt: normalizedSystemPrompt,
      messages: fingerprint.messages,
      tools: normalizedTools,
      modelSettings: normalizedModelSettings,
    };

    this.requestFingerprints.push({
      timestamp: new Date().toISOString(),
      turn: fingerprint.turn,
      agentName: fingerprint.agentName,
      providerName: fingerprint.providerName,
      model: fingerprint.model,
      runtimeVersion: RUNTIME_VERSION,
      fingerprintSchemaVersion: REQUEST_FINGERPRINT_SCHEMA_VERSION,
      requestHash: hashForFingerprint(requestPayload),
      systemPromptHash: hashForFingerprint(normalizedSystemPrompt),
      messagesHash: hashForFingerprint(fingerprint.messages),
      toolsHash: hashForFingerprint(normalizedTools),
      modelSettingsHash: hashForFingerprint(normalizedModelSettings),
      messageCount: fingerprint.messages.length,
      toolCount: normalizedTools.length,
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
      requestFingerprints: [...this.requestFingerprints],
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
