function sanitizeToolSegment(input: string): string {
  const sanitized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized || "agent";
}

export function toHandoffToolName(agentName: string): string {
  return `handoff_to_${sanitizeToolSegment(agentName)}`;
}
