import { useMemo } from "react";
import type { ReactElement } from "react";
import {
  compareRunRecords,
  deriveRunRecordScope,
  extractHandoffFlow,
  extractToolCalls,
  formatJson,
  truncateText,
} from "../lib/run-record";
import type { InspectRecord } from "../types";
import {
  FormattedResponse,
  HandoffFlowPanel,
  Section,
  formatDateTime,
  sectionTitleClassName,
} from "./shared";

export interface ComparePageProps {
  left: InspectRecord;
  right: InspectRecord;
  leftLabel?: string;
  rightLabel?: string;
  onBack?: () => void;
  onInspectLeft?: () => void;
  onInspectRight?: () => void;
}

export function ComparePage({
  left,
  right,
  leftLabel = "File 1",
  rightLabel = "File 2",
  onBack,
  onInspectLeft,
  onInspectRight,
}: ComparePageProps): ReactElement {
  const comparison = useMemo(
    () => compareRunRecords(left.record, right.record),
    [left.record, right.record],
  );
  const leftScope = useMemo(() => deriveRunRecordScope(left.record), [left.record]);
  const rightScope = useMemo(
    () => deriveRunRecordScope(right.record),
    [right.record],
  );
  const leftTools = useMemo(
    () => extractToolCalls(leftScope.emittedItems),
    [leftScope.emittedItems],
  );
  const rightTools = useMemo(
    () => extractToolCalls(rightScope.emittedItems),
    [rightScope.emittedItems],
  );
  const leftHandoffFlow = useMemo(
    () => extractHandoffFlow(left.record, leftScope.emittedItems),
    [left.record, leftScope.emittedItems],
  );
  const rightHandoffFlow = useMemo(
    () => extractHandoffFlow(right.record, rightScope.emittedItems),
    [right.record, rightScope.emittedItems],
  );
  const compareEntries = [
    { label: leftLabel, entry: left, scope: leftScope },
    { label: rightLabel, entry: right, scope: rightScope },
  ];

  return (
    <div className="space-y-6">
      <header className="rounded-[2rem] border border-slate-200 bg-white/85 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className={sectionTitleClassName()}>Compare</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">
              {leftLabel} vs {rightLabel}
            </h1>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              Read the deltas first, then drill into each run only if needed.
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
            {onInspectLeft ? (
              <button
                type="button"
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                onClick={onInspectLeft}
              >
                Inspect {leftLabel}
              </button>
            ) : null}
            {onInspectRight ? (
              <button
                type="button"
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                onClick={onInspectRight}
              >
                Inspect {rightLabel}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {compareEntries.map(({ label, entry, scope }) => (
            <article
              key={`${label}-${entry.sourceName ?? entry.record.runId}`}
              className="min-w-0 rounded-[1.5rem] border border-slate-200 bg-slate-50/90 p-4"
            >
              <p className={sectionTitleClassName()}>{label}</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {entry.record.agentName}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {entry.sourceName ?? entry.record.runId}
              </p>
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
                <div className="flex justify-between gap-4">
                  <dt>Current Message</dt>
                  <dd className="max-w-[18rem] text-right font-medium text-slate-900">
                    {truncateText(scope.currentUserMessage, 72)}
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

        <Section
          title="Handoff Flow"
          summary="Current-run handoff path and attempt outcomes for both records."
          defaultOpen={false}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>{leftLabel}</p>
              <div className="mt-3">
                <HandoffFlowPanel flow={leftHandoffFlow} />
              </div>
            </div>
            <div className="min-w-0 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>{rightLabel}</p>
              <div className="mt-3">
                <HandoffFlowPanel flow={rightHandoffFlow} />
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Metrics"
          summary="Structural counts and current-run tool matching metrics."
        >
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
            <div className="min-w-0">
              <p className={sectionTitleClassName()}>{leftLabel}</p>
              <div className="mt-2 rounded-[1.25rem] bg-slate-50 p-4">
                <FormattedResponse text={left.record.response} tone="light" />
              </div>
            </div>
            <div className="min-w-0">
              <p className={sectionTitleClassName()}>{rightLabel}</p>
              <div className="mt-2 rounded-[1.25rem] bg-slate-50 p-4">
                <FormattedResponse text={right.record.response} tone="light" />
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Tool Calls"
          summary="Current-run sequence and normalized argument shape."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>{leftLabel}</p>
              <div className="mt-3 space-y-3">
                {leftTools.map((call) => (
                  <article key={call.callId} className="rounded-2xl bg-white p-3">
                    <p className="text-sm font-medium text-slate-900">
                      {call.turn ?? "n/a"}. {call.name}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-slate-500">
                      {call.argsHash}
                    </p>
                  </article>
                ))}
              </div>
            </div>
            <div className="min-w-0 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>{rightLabel}</p>
              <div className="mt-3 space-y-3">
                {rightTools.map((call) => (
                  <article key={call.callId} className="rounded-2xl bg-white p-3">
                    <p className="text-sm font-medium text-slate-900">
                      {call.turn ?? "n/a"}. {call.name}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-slate-500">
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
