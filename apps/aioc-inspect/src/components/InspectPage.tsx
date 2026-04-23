import { GitCompareArrows } from "lucide-react";
import { useMemo } from "react";
import type { ReactElement } from "react";
import {
  deriveRunRecordScope,
  extractHandoffFlow,
  extractToolCalls,
  formatStringList,
  summarizeGuardrailNames,
  summarizePolicyReasons,
  summarizePromptVersions,
  summarizeFingerprintTurns,
  formatNumberList,
} from "../lib/run-record";
import type { InspectRecord } from "../types";
import {
  FormattedResponse,
  HandoffFlowPanel,
  InPageLink,
  InputHistoryItemCard,
  JsonPanel,
  Section,
  buttonClassName,
  formatDateTime,
  policyDecisionAnchorId,
  sectionTitleClassName,
  toolCallAnchorId,
} from "./shared";

export interface InspectPageProps {
  inspectRecord: InspectRecord;
  compareRecord?: InspectRecord;
  label?: string;
  onBack?: () => void;
  onCompare?: () => void;
}

export function InspectPage({
  inspectRecord,
  compareRecord,
  label = "Run",
  onBack,
  onCompare,
}: InspectPageProps): ReactElement {
  const record = inspectRecord.record;
  const scope = useMemo(() => deriveRunRecordScope(record), [record]);
  const toolCalls = useMemo(
    () => extractToolCalls(scope.emittedItems),
    [scope.emittedItems],
  );
  const handoffFlow = useMemo(
    () => extractHandoffFlow(record, scope.emittedItems),
    [record, scope.emittedItems],
  );
  const policyDecisionsByCallId = useMemo(() => {
    const grouped = new Map<string, typeof record.policyDecisions>();

    for (const decision of record.policyDecisions) {
      const existing = grouped.get(decision.callId);
      if (existing) {
        existing.push(decision);
      } else {
        grouped.set(decision.callId, [decision]);
      }
    }

    return grouped;
  }, [record]);

  return (
    <div className="space-y-6">
      <header className="rounded-[2rem] border border-slate-200 bg-white/85 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className={sectionTitleClassName()}>{label}</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">
              {record.agentName}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
              {scope.currentUserMessage}
            </p>
          </div>
          <div className="flex gap-3">
            {onBack ? (
              <button
                type="button"
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                onClick={onBack}
              >
                Back
              </button>
            ) : null}
            {onCompare ? (
              <button
                type="button"
                className={buttonClassName(Boolean(compareRecord), true)}
                disabled={!compareRecord}
                onClick={onCompare}
              >
                <GitCompareArrows className="h-4 w-4" />
                Compare
              </button>
            ) : null}
          </div>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-slate-200 pt-6 text-sm text-slate-600 md:grid-cols-4">
          <div className="min-w-0">
            <dt className={sectionTitleClassName()}>Run ID</dt>
            <dd className="mt-2 break-all font-medium text-slate-900">
              {record.runId}
            </dd>
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
          summary="Current user message, final response, run scope, metadata, and context visibility."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="min-w-0 space-y-4">
              <div>
                <p className={sectionTitleClassName()}>Current User Message</p>
                <p className="mt-2 rounded-[1.25rem] bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                  {scope.currentUserMessage}
                </p>
              </div>
              <div>
                <p className={sectionTitleClassName()}>Final Response</p>
                <div className="mt-2 rounded-[1.25rem] bg-slate-950 p-4">
                  <FormattedResponse text={record.response} tone="dark" />
                </div>
              </div>
              <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                <p className={sectionTitleClassName()}>Run Scope</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="inline-flex rounded-full border border-slate-300 bg-white px-3 py-1 font-medium">
                    {scope.inputItemCount} input items
                  </span>
                  <span className="inline-flex rounded-full border border-slate-300 bg-white px-3 py-1 font-medium">
                    {scope.emittedItemCount} emitted items
                  </span>
                  {scope.inputItemCount > 1 ? (
                    <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-medium text-sky-800">
                      History-backed run
                    </span>
                  ) : null}
                  {scope.fallbackUsed ? (
                    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-medium text-amber-800">
                      Scope fallback: full trajectory
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {scope.fallbackUsed
                    ? "The first request fingerprint did not expose a usable messageCount, so the page is showing the full trajectory as the current run."
                    : "The page is scoped to the current run by splitting the recorded trajectory into input history and emitted items."}
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                <p className={sectionTitleClassName()}>Recorded Question Field</p>
                <p className="mt-2 text-sm leading-7 text-slate-700">
                  {scope.recordedQuestion}
                </p>
              </div>
            </div>
            <div className="min-w-0 space-y-4">
              <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                <p className={sectionTitleClassName()}>Handoff Flow</p>
                <p className="mt-2 text-sm text-slate-500">Current run only.</p>
                <div className="mt-3">
                  <HandoffFlowPanel flow={handoffFlow} showLinks />
                </div>
              </div>
              <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                <p className={sectionTitleClassName()}>Metadata</p>
                <JsonPanel copyable value={record.metadata ?? {}} />
              </div>
              <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                <p className={sectionTitleClassName()}>Context Snapshot</p>
                <p className="mt-2 text-sm text-slate-500">
                  Redacted: {record.contextRedacted ? "yes" : "no"}
                </p>
                <div className="mt-3">
                  <JsonPanel
                    copyable
                    value={record.contextSnapshot}
                    maxHeightClassName="max-h-[26rem]"
                  />
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Tools"
          summary={`Extracted ${toolCalls.length} tool calls emitted during this run.`}
        >
          <div className="space-y-4">
            {toolCalls.length === 0 ? (
              <p className="text-sm text-slate-500">
                No tool calls found for the current run.
              </p>
            ) : null}
            {toolCalls.map((call) => {
              const relatedPolicyDecisions =
                policyDecisionsByCallId.get(call.callId) ?? [];

              return (
                <article
                  id={toolCallAnchorId(call.callId)}
                  key={`${call.callId}-${call.name}`}
                  className="scroll-mt-6 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4 target:border-sky-300 target:bg-sky-50 target:ring-4 target:ring-sky-100"
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
                      <p className="mt-2 break-all font-mono text-xs text-slate-900">
                        {call.argsHash}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {relatedPolicyDecisions.length > 0 ? (
                      relatedPolicyDecisions.map((decision) => (
                        <InPageLink
                          key={`${decision.callId}-${decision.turn}`}
                          targetId={policyDecisionAnchorId(
                            decision.callId,
                            decision.turn,
                          )}
                        >
                          Open policy
                        </InPageLink>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">
                        No linked policy decision.
                      </span>
                    )}
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="min-w-0">
                      <p className={sectionTitleClassName()}>Arguments</p>
                      <div className="mt-2">
                        <JsonPanel
                          copyable
                          value={call.arguments}
                          maxHeightClassName="max-h-[26rem]"
                        />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className={sectionTitleClassName()}>
                        Output {call.hasOutput ? "" : "(missing)"}
                      </p>
                      <div className="mt-2">
                        <JsonPanel
                          copyable
                          value={call.output ?? null}
                          maxHeightClassName="max-h-[26rem]"
                        />
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </Section>

        <Section
          title="Input History"
          summary={
            scope.historyItemCount > 0
              ? `Items already present before the current user message: ${scope.historyItemCount}.`
              : scope.fallbackUsed
                ? "Scope reconstruction fell back to the full trajectory, so input history could not be separated."
                : "No prior history was present in the run input."
          }
          defaultOpen={false}
        >
          <div className="space-y-4">
            {scope.historyItems.length === 0 ? (
              <p className="text-sm text-slate-500">
                {scope.fallbackUsed
                  ? "Unable to separate input history from emitted items for this record."
                  : "This run started from a single prompt with no prior history items."}
              </p>
            ) : null}
            {scope.historyItems.map((item, index) => (
              <InputHistoryItemCard
                key={`input-history-${index}-${item.type}`}
                item={item}
                index={index}
              />
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
                id={policyDecisionAnchorId(decision.callId, decision.turn)}
                key={`${decision.callId}-${decision.turn}-${decision.timestamp}`}
                className="scroll-mt-6 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4 target:border-sky-300 target:bg-sky-50 target:ring-4 target:ring-sky-100"
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
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <InPageLink targetId={toolCallAnchorId(decision.callId)}>
                    Open related tool call
                  </InPageLink>
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
                      <JsonPanel copyable value={snapshot.promptText} />
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
          <JsonPanel copyable value={record} maxHeightClassName="max-h-[26rem]" />
        </Section>
      </div>
    </div>
  );
}
