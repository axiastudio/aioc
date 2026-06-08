import type { Logger, LogRecord } from "@opentelemetry/api-logs";
import type {
  GovernanceEvent,
  GovernanceEventExporter,
  GovernanceEventSeverity,
} from "@axiastudio/aioc-governance-events";

type OpenTelemetryAttributeValue =
  | string
  | number
  | boolean
  | Array<string | number | boolean>;

export type OpenTelemetryAttributes = Record<
  string,
  OpenTelemetryAttributeValue
>;

export interface OpenTelemetryLogRecordOptions {
  includeMetadata?: boolean;
  attributes?:
    | OpenTelemetryAttributes
    | ((event: GovernanceEvent) => OpenTelemetryAttributes | undefined);
  body?: string | ((event: GovernanceEvent) => string);
}

export type OpenTelemetryLogExporterOptions = OpenTelemetryLogRecordOptions;

export type OpenTelemetryGovernanceLogger = Pick<Logger, "emit">;

export function createOpenTelemetryLogExporter(
  logger: OpenTelemetryGovernanceLogger,
  options: OpenTelemetryLogExporterOptions = {},
): GovernanceEventExporter {
  return {
    async exportEvents(events) {
      for (const event of events) {
        logger.emit(toOpenTelemetryLogRecord(event, options));
      }
    },
  };
}

export function toOpenTelemetryLogRecord(
  event: GovernanceEvent,
  options: OpenTelemetryLogRecordOptions = {},
): LogRecord {
  return compactLogRecord({
    timestamp: toDate(event.occurredAt),
    observedTimestamp: new Date(),
    severityNumber: mapSeverityNumber(event.severity),
    severityText: mapSeverityText(event.severity),
    body: resolveBody(event, options.body),
    eventName: event.type,
    attributes: mergeAttributes(
      createBaseAttributes(event, options.includeMetadata ?? true),
      resolveAttributes(event, options.attributes),
    ),
  });
}

function createBaseAttributes(
  event: GovernanceEvent,
  includeMetadata: boolean,
): OpenTelemetryAttributes {
  const attributes: OpenTelemetryAttributes = {
    "aioc.governance.schema_version": event.schemaVersion,
    "aioc.governance.event_id": event.id,
    "aioc.governance.event_type": event.type,
    "aioc.governance.severity": event.severity,
    "aioc.run.id": event.runId,
    "aioc.agent.name": event.agentName,
  };

  addAttribute(attributes, "aioc.provider.name", event.providerName);
  addAttribute(attributes, "aioc.model", event.model);
  addAttribute(attributes, "aioc.run.status", event.status);
  addAttribute(attributes, "aioc.subject.kind", event.subject.kind);
  addAttribute(attributes, "aioc.subject.name", event.subject.name);
  addAttribute(attributes, "aioc.subject.turn", event.subject.turn);
  addAttribute(attributes, "aioc.subject.call_id", event.subject.callId);
  addAttribute(
    attributes,
    "aioc.subject.proposal_hash",
    event.subject.proposalHash,
  );
  addAttribute(attributes, "aioc.subject.args_hash", event.subject.argsHash);
  addAttribute(
    attributes,
    "aioc.subject.payload_hash",
    event.subject.payloadHash,
  );
  addAttribute(attributes, "aioc.policy.decision", event.policy?.decision);
  addAttribute(attributes, "aioc.policy.reason", event.policy?.reason);
  addAttribute(
    attributes,
    "aioc.policy.public_reason",
    event.policy?.publicReason,
  );
  addAttribute(attributes, "aioc.policy.version", event.policy?.policyVersion);
  addAttribute(attributes, "aioc.policy.result_mode", event.policy?.resultMode);
  addAttribute(attributes, "aioc.policy.expires_at", event.policy?.expiresAt);
  addAttribute(attributes, "aioc.trace.prompt_hash", event.trace?.promptHash);
  addAttribute(
    attributes,
    "aioc.trace.prompt_version",
    event.trace?.promptVersion,
  );
  addAttribute(attributes, "aioc.trace.request_hash", event.trace?.requestHash);
  addAttribute(
    attributes,
    "aioc.trace.system_prompt_hash",
    event.trace?.systemPromptHash,
  );
  addAttribute(
    attributes,
    "aioc.trace.messages_hash",
    event.trace?.messagesHash,
  );
  addAttribute(attributes, "aioc.trace.tools_hash", event.trace?.toolsHash);
  addAttribute(
    attributes,
    "aioc.trace.model_settings_hash",
    event.trace?.modelSettingsHash,
  );
  addAttribute(
    attributes,
    "aioc.trace.fingerprint_schema_version",
    event.trace?.fingerprintSchemaVersion,
  );
  addAttribute(attributes, "aioc.error.name", event.errorName);
  addAttribute(attributes, "aioc.error.message", event.errorMessage);

  if (includeMetadata) {
    addMetadataAttributes(attributes, event.metadata);
  }

  return attributes;
}

function addMetadataAttributes(
  attributes: OpenTelemetryAttributes,
  metadata?: Record<string, unknown>,
): void {
  if (!metadata) {
    return;
  }

  for (const [key, value] of Object.entries(metadata)) {
    addAttribute(attributes, `aioc.metadata.${key}`, toAttributeValue(value));
  }
}

function addAttribute(
  attributes: OpenTelemetryAttributes,
  key: string,
  value: OpenTelemetryAttributeValue | undefined,
): void {
  if (typeof value !== "undefined") {
    attributes[key] = value;
  }
}

function resolveAttributes(
  event: GovernanceEvent,
  attributes:
    | OpenTelemetryAttributes
    | ((event: GovernanceEvent) => OpenTelemetryAttributes | undefined)
    | undefined,
): OpenTelemetryAttributes | undefined {
  if (typeof attributes === "function") {
    return attributes(event);
  }
  return attributes;
}

function mergeAttributes(
  ...entries: Array<OpenTelemetryAttributes | undefined>
): OpenTelemetryAttributes {
  return Object.assign({}, ...entries.filter(Boolean));
}

function resolveBody(
  event: GovernanceEvent,
  body?: string | ((event: GovernanceEvent) => string),
): string {
  if (typeof body === "function") {
    return body(event);
  }
  return (
    body ?? event.policy?.publicReason ?? event.policy?.reason ?? event.type
  );
}

function toAttributeValue(
  value: unknown,
): OpenTelemetryAttributeValue | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const primitiveValues = value.filter(
      (entry): entry is string | number | boolean =>
        typeof entry === "string" ||
        typeof entry === "number" ||
        typeof entry === "boolean",
    );

    if (primitiveValues.length === value.length) {
      return primitiveValues;
    }
  }

  if (typeof value === "undefined") {
    return undefined;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toDate(value: string): Date {
  return new Date(value);
}

function mapSeverityNumber(severity: GovernanceEventSeverity): number {
  switch (severity) {
    case "debug":
      return 5;
    case "info":
      return 9;
    case "warn":
      return 13;
    case "error":
      return 17;
  }
}

function mapSeverityText(severity: GovernanceEventSeverity): string {
  return severity.toUpperCase();
}

function compactLogRecord(record: LogRecord): LogRecord {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "undefined") {
      output[key] = value;
    }
  }

  return output as LogRecord;
}
