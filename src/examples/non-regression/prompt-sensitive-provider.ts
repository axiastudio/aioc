import type {
  AgentInputItem,
  ModelProvider,
  ProviderEvent,
  ProviderRequest,
} from "../../index";

interface ToolResultEnvelopeLike {
  status?: unknown;
  data?: unknown;
}

function findProfileToolOutput(
  messages: AgentInputItem[],
): ToolResultEnvelopeLike | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    if (!item || item.type !== "tool_call_output_item") {
      continue;
    }
    if (!item.output || typeof item.output !== "object") {
      continue;
    }
    return item.output as ToolResultEnvelopeLike;
  }
  return null;
}

function toObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

// Deterministic provider used by the non-regression demo:
// its behavior intentionally changes based on the system prompt.
export class PromptSensitiveProvider implements ModelProvider {
  async *stream<TContext = unknown>(
    request: ProviderRequest<TContext>,
  ): AsyncIterable<ProviderEvent> {
    const profileOutput = findProfileToolOutput(
      request.messages as AgentInputItem[],
    );

    if (!profileOutput) {
      const shouldCallProfileTool = (request.systemPrompt ?? "").includes(
        "CALL_PROFILE_TOOL",
      );

      if (shouldCallProfileTool) {
        yield {
          type: "tool_call",
          callId: "call-profile-1",
          name: "get_customer_profile",
          arguments: JSON.stringify({ customerId: "C-42" }),
        };
        yield {
          type: "completed",
          message: "",
        };
        return;
      }

      yield {
        type: "completed",
        message:
          "Customer summary generated without profile lookup. Next action: ask user for missing account details.",
      };
      return;
    }

    if (profileOutput.status === "ok") {
      const profile = toObjectRecord(profileOutput.data);
      const segment = String(profile?.segment ?? "unknown");
      const riskScore = String(profile?.riskScore ?? "n/a");
      yield {
        type: "completed",
        message:
          `Customer C-42 segment=${segment}, riskScore=${riskScore}. ` +
          "Next action: route to success manager with proactive outreach.",
      };
      return;
    }

    yield {
      type: "completed",
      message:
        "Profile lookup was denied. Next action: continue with a minimal safe response.",
    };
  }
}
