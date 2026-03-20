import { FileJson2, FolderSearch, GitCompareArrows, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import {
  buildRunRecordPreview,
  compareRunRecords,
  extractToolCalls,
  formatJson,
  formatNumberList,
  formatStringList,
  isRecordRenderable,
  parseRunRecordJson,
  summarizeFingerprintTurns,
  summarizeGuardrailNames,
  summarizePolicyReasons,
  summarizePromptVersions,
  truncateText,
} from "./lib/run-record";
import type {
  InspectView,
  LoadedRunRecord,
  RunSlotId,
  RunSlotState,
} from "./types";

const EMPTY_SLOT: RunSlotState = { status: "empty" };

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read the selected file"));
    reader.readAsText(file);
  });
}

async function loadFileToSlot(file: File): Promise<LoadedRunRecord> {
  const text = await readFileText(file);
  const record = parseRunRecordJson(text);

  if (!isRecordRenderable(record)) {
    throw new Error("RunRecord shape is not renderable by this MVP");
  }

  return {
    fileName: file.name,
    loadedAt: new Date().toISOString(),
    record,
    preview: buildRunRecordPreview(record),
  };
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function buttonClassName(enabled: boolean, centered = false): string {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition";
  const enabledClasses =
    "border-slate-900 bg-slate-950 text-white hover:bg-slate-800";
  const disabledClasses =
    "cursor-not-allowed border-slate-300 bg-white text-slate-400";

  return `${base} ${centered ? "min-w-44" : "w-full"} ${
    enabled ? enabledClasses : disabledClasses
  }`;
}

function sectionTitleClassName(): string {
  return "text-xs font-semibold uppercase tracking-[0.24em] text-slate-500";
}

interface SlotCardProps {
  slotId: RunSlotId;
  slot: RunSlotState;
  onFileSelected: (slotId: RunSlotId, file: File) => void;
  onClear: (slotId: RunSlotId) => void;
  onInspect: (slotId: RunSlotId) => void;
}

function SlotCard({
  slotId,
  slot,
  onFileSelected,
  onClear,
  onInspect,
}: SlotCardProps): ReactElement {
  const label = slotId === "file1" ? "File 1" : "File 2";

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white/85 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className={sectionTitleClassName()}>{label}</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            RunRecord Input Slot
          </h2>
        </div>
        {slot.status !== "empty" ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            onClick={() => onClear(slotId)}
          >
            <X className="h-4 w-4" />
            Clear
          </button>
        ) : null}
      </div>

      <label
        className="flex min-h-44 cursor-pointer flex-col justify-between rounded-[1.5rem] border border-dashed border-slate-300 bg-[linear-gradient(145deg,rgba(255,255,255,0.8),rgba(248,250,252,0.95))] p-5 transition hover:border-slate-400 hover:bg-slate-50"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files.item(0);
          if (file) {
            onFileSelected(slotId, file);
          }
        }}
      >
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-slate-950 p-3 text-white">
            <FileJson2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-950">
              Drop a single RunRecord JSON file here
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Or click to browse from disk.
            </p>
          </div>
        </div>

        <input
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.item(0);
            if (file) {
              onFileSelected(slotId, file);
            }
            event.currentTarget.value = "";
          }}
        />

        <div className="mt-6 rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-4">
          {slot.status === "empty" ? (
            <p className="text-sm text-slate-500">No file loaded yet.</p>
          ) : null}

          {slot.status === "invalid" ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-rose-700">Invalid file</p>
              <p className="text-sm text-rose-600">{slot.error}</p>
            </div>
          ) : null}

          {slot.status === "loaded" && slot.data ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-950">
                {slot.data.fileName}
              </p>
              <dl className="grid gap-2 text-sm text-slate-600">
                <div className="flex justify-between gap-4">
                  <dt>Agent</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {slot.data.preview.agentName}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Status</dt>
                  <dd className="text-right font-medium capitalize text-slate-900">
                    {slot.data.preview.status}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Started</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {formatDateTime(slot.data.preview.startedAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Question</dt>
                  <dd className="max-w-[18rem] text-right font-medium text-slate-900">
                    {truncateText(slot.data.preview.question, 72)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>
      </label>

      <div className="mt-4">
        <button
          type="button"
          className={buttonClassName(slot.status === "loaded")}
          disabled={slot.status !== "loaded"}
          onClick={() => onInspect(slotId)}
        >
          <Search className="h-4 w-4" />
          Inspect
        </button>
      </div>
    </section>
  );
}

function JsonPanel({ value }: { value: unknown }): ReactElement {
  return (
    <pre className="overflow-x-auto rounded-[1.25rem] border border-slate-200 bg-slate-950 p-4 text-xs leading-6 text-slate-100">
      <code>{formatJson(value)}</code>
    </pre>
  );
}

function Section({
  title,
  summary,
  children,
  defaultOpen = true,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}): ReactElement {
  return (
    <details
      open={defaultOpen}
      className="rounded-[1.75rem] border border-slate-200 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <div>
          <p className={sectionTitleClassName()}>{title}</p>
          {summary ? (
            <p className="mt-2 text-sm text-slate-500">{summary}</p>
          ) : null}
        </div>
      </summary>
      <div className="mt-5">{children}</div>
    </details>
  );
}

function InspectPage({
  loaded,
  otherLoaded,
  slotId,
  onBack,
  onCompare,
}: {
  loaded: LoadedRunRecord;
  otherLoaded?: LoadedRunRecord;
  slotId: RunSlotId;
  onBack: () => void;
  onCompare: () => void;
}): ReactElement {
  const record = loaded.record;
  const toolCalls = useMemo(() => extractToolCalls(record), [record]);

  return (
    <div className="space-y-6">
      <header className="rounded-[2rem] border border-slate-200 bg-white/85 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className={sectionTitleClassName()}>
              {slotId === "file1" ? "File 1" : "File 2"}
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">
              {record.agentName}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
              {record.question}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={onBack}
            >
              Back
            </button>
            <button
              type="button"
              className={buttonClassName(Boolean(otherLoaded), true)}
              disabled={!otherLoaded}
              onClick={onCompare}
            >
              <GitCompareArrows className="h-4 w-4" />
              Compare
            </button>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-slate-200 pt-6 text-sm text-slate-600 md:grid-cols-4">
          <div>
            <dt className={sectionTitleClassName()}>Run ID</dt>
            <dd className="mt-2 font-medium text-slate-900">{record.runId}</dd>
          </div>
          <div>
            <dt className={sectionTitleClassName()}>Status</dt>
            <dd className="mt-2 font-medium capitalize text-slate-900">
              {record.status}
            </dd>
          </div>
          <div>
            <dt className={sectionTitleClassName()}>Started</dt>
            <dd className="mt-2 font-medium text-slate-900">
              {formatDateTime(record.startedAt)}
            </dd>
          </div>
          <div>
            <dt className={sectionTitleClassName()}>Model</dt>
            <dd className="mt-2 font-medium text-slate-900">
              {record.model ?? "n/a"}
            </dd>
          </div>
        </dl>
      </header>

      <div className="grid gap-6">
        <Section
          title="Overview"
          summary="Question, final response, metadata, and context visibility."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <p className={sectionTitleClassName()}>Question</p>
                <p className="mt-2 rounded-[1.25rem] bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                  {record.question}
                </p>
              </div>
              <div>
                <p className={sectionTitleClassName()}>Final Response</p>
                <p className="mt-2 rounded-[1.25rem] bg-slate-950 p-4 text-sm leading-7 text-slate-100">
                  {record.response}
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                <p className={sectionTitleClassName()}>Metadata</p>
                <JsonPanel value={record.metadata ?? {}} />
              </div>
              <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                <p className={sectionTitleClassName()}>Context Snapshot</p>
                <p className="mt-2 text-sm text-slate-500">
                  Redacted: {record.contextRedacted ? "yes" : "no"}
                </p>
                <div className="mt-3">
                  <JsonPanel value={record.contextSnapshot} />
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Tools"
          summary={`Extracted ${toolCalls.length} tool calls from the item trajectory.`}
        >
          <div className="space-y-4">
            {toolCalls.length === 0 ? (
              <p className="text-sm text-slate-500">No tool calls found.</p>
            ) : null}
            {toolCalls.map((call) => (
              <article
                key={`${call.callId}-${call.name}`}
                className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4"
              >
                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-4">
                  <div>
                    <p className={sectionTitleClassName()}>Turn</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {call.turn ?? "n/a"}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Tool</p>
                    <p className="mt-2 font-medium text-slate-900">{call.name}</p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Call ID</p>
                    <p className="mt-2 break-all font-medium text-slate-900">
                      {call.callId}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Args Hash</p>
                    <p className="mt-2 font-mono text-xs text-slate-900">
                      {call.argsHash}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className={sectionTitleClassName()}>Arguments</p>
                    <div className="mt-2">
                      <JsonPanel value={call.arguments} />
                    </div>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>
                      Output {call.hasOutput ? "" : "(missing)"}
                    </p>
                    <div className="mt-2">
                      <JsonPanel value={call.output ?? null} />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Section
          title="Policies"
          summary={formatStringList(summarizePolicyReasons(record.policyDecisions))}
          defaultOpen={false}
        >
          <div className="space-y-4">
            {record.policyDecisions.length === 0 ? (
              <p className="text-sm text-slate-500">No policy decisions found.</p>
            ) : null}
            {record.policyDecisions.map((decision) => (
              <article
                key={`${decision.callId}-${decision.turn}-${decision.timestamp}`}
                className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4"
              >
                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-4">
                  <div>
                    <p className={sectionTitleClassName()}>Decision</p>
                    <p className="mt-2 font-medium capitalize text-slate-900">
                      {decision.decision}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Turn</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {decision.turn}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Resource</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {decision.resource.kind}:{decision.resource.name}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Policy Version</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {decision.policyVersion ?? "n/a"}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-700">
                  {decision.reason}
                </p>
              </article>
            ))}
          </div>
        </Section>

        <Section
          title="Guardrails"
          summary={formatStringList(
            summarizeGuardrailNames(record.guardrailDecisions ?? []),
          )}
          defaultOpen={false}
        >
          <div className="space-y-4">
            {(record.guardrailDecisions ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No guardrail decisions found.</p>
            ) : null}
            {(record.guardrailDecisions ?? []).map((decision) => (
              <article
                key={`${decision.guardrailName}-${decision.turn}-${decision.timestamp}`}
                className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4"
              >
                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-4">
                  <div>
                    <p className={sectionTitleClassName()}>Guardrail</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {decision.guardrailName}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Decision</p>
                    <p className="mt-2 font-medium capitalize text-slate-900">
                      {decision.decision}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Turn</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {decision.turn}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Reason</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {decision.reason ?? "n/a"}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Section
          title="Prompts"
          summary={formatStringList(summarizePromptVersions(record.promptSnapshots))}
          defaultOpen={false}
        >
          <div className="space-y-4">
            {record.promptSnapshots.map((snapshot) => (
              <article
                key={`${snapshot.turn}-${snapshot.timestamp}-${snapshot.promptHash}`}
                className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4"
              >
                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-4">
                  <div>
                    <p className={sectionTitleClassName()}>Turn</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {snapshot.turn}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Version</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {snapshot.promptVersion ?? "n/a"}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Agent</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {snapshot.agentName}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Model</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {snapshot.model ?? "n/a"}
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <p className={sectionTitleClassName()}>Prompt Hash</p>
                  <p className="mt-2 break-all font-mono text-xs text-slate-900">
                    {snapshot.promptHash}
                  </p>
                </div>
                {snapshot.promptText ? (
                  <div className="mt-4">
                    <p className={sectionTitleClassName()}>Prompt Text</p>
                    <div className="mt-2">
                      <JsonPanel value={snapshot.promptText} />
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </Section>

        <Section
          title="Fingerprints"
          summary={formatNumberList(
            summarizeFingerprintTurns(record.requestFingerprints),
          )}
          defaultOpen={false}
        >
          <div className="space-y-4">
            {record.requestFingerprints.map((fingerprint) => (
              <article
                key={`${fingerprint.turn}-${fingerprint.timestamp}-${fingerprint.requestHash}`}
                className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4"
              >
                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-5">
                  <div>
                    <p className={sectionTitleClassName()}>Turn</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {fingerprint.turn}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Provider</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {fingerprint.providerName}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Model</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {fingerprint.model}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Messages</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {fingerprint.messageCount}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Tools</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {fingerprint.toolCount}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className={sectionTitleClassName()}>Request Hash</p>
                    <p className="mt-2 break-all font-mono text-xs text-slate-900">
                      {fingerprint.requestHash}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>System Prompt Hash</p>
                    <p className="mt-2 break-all font-mono text-xs text-slate-900">
                      {fingerprint.systemPromptHash}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Messages Hash</p>
                    <p className="mt-2 break-all font-mono text-xs text-slate-900">
                      {fingerprint.messagesHash}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Tools Hash</p>
                    <p className="mt-2 break-all font-mono text-xs text-slate-900">
                      {fingerprint.toolsHash}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Section title="Raw JSON" summary="Complete RunRecord payload." defaultOpen={false}>
          <JsonPanel value={record} />
        </Section>
      </div>
    </div>
  );
}

function ComparePage({
  left,
  right,
  onBack,
  onInspect,
}: {
  left: LoadedRunRecord;
  right: LoadedRunRecord;
  onBack: () => void;
  onInspect: (slotId: RunSlotId) => void;
}): ReactElement {
  const comparison = useMemo(
    () => compareRunRecords(left.record, right.record),
    [left.record, right.record],
  );
  const leftTools = useMemo(() => extractToolCalls(left.record), [left.record]);
  const rightTools = useMemo(
    () => extractToolCalls(right.record),
    [right.record],
  );

  return (
    <div className="space-y-6">
      <header className="rounded-[2rem] border border-slate-200 bg-white/85 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className={sectionTitleClassName()}>Compare</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">
              File 1 vs File 2
            </h1>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              Read the deltas first, then drill into each run only if needed.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={onBack}
            >
              Back
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={() => onInspect("file1")}
            >
              Inspect File 1
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={() => onInspect("file2")}
            >
              Inspect File 2
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[left, right].map((entry, index) => (
            <article
              key={entry.fileName}
              className="rounded-[1.5rem] border border-slate-200 bg-slate-50/90 p-4"
            >
              <p className={sectionTitleClassName()}>
                {index === 0 ? "File 1" : "File 2"}
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {entry.record.agentName}
              </p>
              <p className="mt-1 text-sm text-slate-500">{entry.fileName}</p>
              <dl className="mt-4 grid gap-2 text-sm text-slate-600">
                <div className="flex justify-between gap-4">
                  <dt>Status</dt>
                  <dd className="font-medium capitalize text-slate-900">
                    {entry.record.status}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Started</dt>
                  <dd className="font-medium text-slate-900">
                    {formatDateTime(entry.record.startedAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Prompt Version</dt>
                  <dd className="font-medium text-slate-900">
                    {entry.record.promptSnapshots[0]?.promptVersion ?? "n/a"}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </header>

      <div className="grid gap-6">
        <Section
          title="Summary"
          summary="Fast read on whether behavior stayed aligned."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Equal</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {comparison.equal ? "yes" : "no"}
              </p>
            </article>
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Final Response</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {comparison.summary.sameFinalResponse ? "same" : "different"}
              </p>
            </article>
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Tool Shape</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {comparison.summary.sameToolCallShape ? "same" : "different"}
              </p>
            </article>
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Policies</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {comparison.summary.samePolicyDecisions ? "same" : "different"}
              </p>
            </article>
          </div>
        </Section>

        <Section title="Metrics" summary="Structural counts and tool matching metrics.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Response Length</p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {comparison.metrics.responseLengthA} vs{" "}
                {comparison.metrics.responseLengthB}
              </p>
            </article>
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Tool Calls</p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {comparison.metrics.toolCallsA} vs {comparison.metrics.toolCallsB}
              </p>
            </article>
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Matched</p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {comparison.metrics.matchedToolCalls}
              </p>
            </article>
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Missing / Extra</p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {comparison.metrics.missingToolCalls} /{" "}
                {comparison.metrics.extraToolCalls}
              </p>
            </article>
          </div>
        </Section>

        <Section title="Response" summary="Exact final output comparison.">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className={sectionTitleClassName()}>File 1</p>
              <p className="mt-2 rounded-[1.25rem] bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                {left.record.response}
              </p>
            </div>
            <div>
              <p className={sectionTitleClassName()}>File 2</p>
              <p className="mt-2 rounded-[1.25rem] bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                {right.record.response}
              </p>
            </div>
          </div>
        </Section>

        <Section title="Tool Calls" summary="Sequence and normalized argument shape.">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>File 1</p>
              <div className="mt-3 space-y-3">
                {leftTools.map((call) => (
                  <article key={call.callId} className="rounded-2xl bg-white p-3">
                    <p className="text-sm font-medium text-slate-900">
                      {call.turn ?? "n/a"}. {call.name}
                    </p>
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {call.argsHash}
                    </p>
                  </article>
                ))}
              </div>
            </div>
            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>File 2</p>
              <div className="mt-3 space-y-3">
                {rightTools.map((call) => (
                  <article key={call.callId} className="rounded-2xl bg-white p-3">
                    <p className="text-sm font-medium text-slate-900">
                      {call.turn ?? "n/a"}. {call.name}
                    </p>
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {call.argsHash}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Prompt & Fingerprint Signals"
          summary="Quick indicators useful for non-regression triage."
          defaultOpen={false}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Prompt Version</p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {comparison.signals.promptVersionA ?? "n/a"} vs{" "}
                {comparison.signals.promptVersionB ?? "n/a"}
              </p>
            </article>
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Prompt Hash Changed</p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {comparison.signals.promptHashChanged ? "yes" : "no"}
              </p>
            </article>
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Fingerprint Turns</p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {comparison.signals.requestFingerprintTurnsA} vs{" "}
                {comparison.signals.requestFingerprintTurnsB}
              </p>
            </article>
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>First Request Hash</p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {comparison.signals.firstRequestHashChanged ? "changed" : "same"}
              </p>
            </article>
          </div>
        </Section>

        <Section
          title="Structured Differences"
          summary={`${comparison.differences.length} difference entries.`}
          defaultOpen={false}
        >
          {comparison.differences.length === 0 ? (
            <p className="text-sm text-slate-500">No differences recorded.</p>
          ) : (
            <div className="space-y-4">
              {comparison.differences.map((difference, index) => (
                <article
                  key={`${difference.path}-${index}`}
                  className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <p className={sectionTitleClassName()}>Path</p>
                      <p className="mt-2 font-medium text-slate-900">
                        {difference.path}
                      </p>
                    </div>
                    <div>
                      <p className={sectionTitleClassName()}>Kind</p>
                      <p className="mt-2 font-medium text-slate-900">
                        {difference.kind}
                      </p>
                    </div>
                    <div>
                      <p className={sectionTitleClassName()}>Preview</p>
                      <p className="mt-2 text-sm text-slate-700">
                        {truncateText(formatJson(difference.left ?? null), 40)} vs{" "}
                        {truncateText(formatJson(difference.right ?? null), 40)}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function AppShell({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.22),transparent_32%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_28%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">
              aioc-inspect
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950">
              Stateless RunRecord inspection for implementors.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              Load one or two RunRecord artifacts, inspect the execution trail, and
              compare behavioral changes without a backing service.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-white/80 bg-white/70 px-5 py-4 text-sm text-slate-600 shadow-[0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur">
            Session-only. No persistence.
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

export function App(): ReactElement {
  const [slots, setSlots] = useState<Record<RunSlotId, RunSlotState>>({
    file1: EMPTY_SLOT,
    file2: EMPTY_SLOT,
  });
  const [view, setView] = useState<InspectView>({ name: "home" });

  async function handleFileSelected(slotId: RunSlotId, file: File): Promise<void> {
    try {
      const loaded = await loadFileToSlot(file);
      setSlots((current) => ({
        ...current,
        [slotId]: {
          status: "loaded",
          fileName: file.name,
          data: loaded,
        },
      }));
    } catch (error) {
      setSlots((current) => ({
        ...current,
        [slotId]: {
          status: "invalid",
          fileName: file.name,
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }

  function clearSlot(slotId: RunSlotId): void {
    setSlots((current) => ({
      ...current,
      [slotId]: EMPTY_SLOT,
    }));

    setView((current) => {
      if (current.name === "inspect" && current.slotId === slotId) {
        return { name: "home" };
      }
      if (
        current.name === "compare" &&
        (slotId === "file1" || slotId === "file2")
      ) {
        return { name: "home" };
      }
      return current;
    });
  }

  const leftLoaded = slots.file1.status === "loaded" ? slots.file1.data : undefined;
  const rightLoaded =
    slots.file2.status === "loaded" ? slots.file2.data : undefined;

  let content: ReactElement;

  if (view.name === "inspect") {
    const slot = slots[view.slotId];
    if (slot.status === "loaded" && slot.data) {
      const otherSlotId = view.slotId === "file1" ? "file2" : "file1";
      const otherLoaded =
        slots[otherSlotId].status === "loaded" ? slots[otherSlotId].data : undefined;
      content = (
        <InspectPage
          loaded={slot.data}
          otherLoaded={otherLoaded}
          slotId={view.slotId}
          onBack={() => setView({ name: "home" })}
          onCompare={() => setView({ name: "compare" })}
        />
      );
    } else {
      content = (
        <div className="rounded-[2rem] border border-slate-200 bg-white/85 p-8 text-sm text-slate-600">
          Selected slot is empty. Go back and load a RunRecord first.
        </div>
      );
    }
  } else if (view.name === "compare" && leftLoaded && rightLoaded) {
    content = (
      <ComparePage
        left={leftLoaded}
        right={rightLoaded}
        onBack={() => setView({ name: "home" })}
        onInspect={(slotId) => setView({ name: "inspect", slotId })}
      />
    );
  } else {
    content = (
      <div className="space-y-8">
        <div className="grid gap-6 xl:grid-cols-2">
          <SlotCard
            slotId="file1"
            slot={slots.file1}
            onFileSelected={(slotId, file) => {
              void handleFileSelected(slotId, file);
            }}
            onClear={clearSlot}
            onInspect={(slotId) => setView({ name: "inspect", slotId })}
          />
          <SlotCard
            slotId="file2"
            slot={slots.file2}
            onFileSelected={(slotId, file) => {
              void handleFileSelected(slotId, file);
            }}
            onClear={clearSlot}
            onInspect={(slotId) => setView({ name: "inspect", slotId })}
          />
        </div>

        <section className="flex justify-center">
          <button
            type="button"
            className={buttonClassName(Boolean(leftLoaded && rightLoaded), true)}
            disabled={!leftLoaded || !rightLoaded}
            onClick={() => setView({ name: "compare" })}
          >
            <GitCompareArrows className="h-4 w-4" />
            Compare
          </button>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-950 p-3 text-white">
                <FolderSearch className="h-5 w-5" />
              </div>
              <div>
                <p className={sectionTitleClassName()}>MVP Scope</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">
                  Single-run inspection, dual-run comparison
                </h2>
              </div>
            </div>
            <div className="mt-5 grid gap-4 text-sm leading-7 text-slate-600 md:grid-cols-3">
              <p>
                Each slot accepts one JSON file containing a single RunRecord
                object.
              </p>
              <p>
                Inspect a slot independently or compare both records once both are
                loaded.
              </p>
              <p>
                Data is kept in memory only for the current browser session.
              </p>
            </div>
          </article>

          <article className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-slate-100 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <p className={sectionTitleClassName()}>Current Session</p>
            <div className="mt-5 grid gap-4 text-sm">
              {(
                [
                  ["File 1", slots.file1],
                  ["File 2", slots.file2],
                ] as Array<[string, RunSlotState]>
              ).map(
                ([label, slot]) => (
                  <div
                    key={label}
                    className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4"
                  >
                    <p className="font-medium">{label}</p>
                    <p className="mt-2 text-slate-300">
                      {slot.status === "loaded" && slot.data
                        ? `${slot.data.preview.agentName} • ${truncateText(
                            slot.data.preview.question,
                            56,
                          )}`
                        : slot.status === "invalid"
                          ? slot.error
                          : "Empty"}
                    </p>
                  </div>
                ),
              )}
            </div>
          </article>
        </section>
      </div>
    );
  }

  return <AppShell>{content}</AppShell>;
}
