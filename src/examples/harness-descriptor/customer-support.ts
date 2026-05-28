import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load as loadYaml } from "js-yaml";
import { z } from "zod";
import {
  allow,
  buildAgentHarness,
  run,
  tool,
  type AgentHarnessDescriptor,
  type ToolPolicy,
} from "../../index";
import { getExampleProviderConfig } from "../support/live-provider";

interface CustomerSupportContext {
  customer: {
    email: string;
    verified: boolean;
  };
  order: {
    id: string;
  };
  session: {
    channel: "web" | "mobile";
  };
  turn: {
    userMessage: string;
    startedAt: string;
  };
}

function loadDescriptor(path: string): AgentHarnessDescriptor {
  const parsed = loadYaml(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid harness descriptor YAML: ${path}`);
  }
  return parsed as AgentHarnessDescriptor;
}

async function main(): Promise<void> {
  const { setup, model, provider } = getExampleProviderConfig();
  setup();
  const descriptorPath = join(__dirname, "customer-support.yaml");
  const descriptor = loadDescriptor(descriptorPath);

  const verifyCustomer = tool<CustomerSupportContext>({
    name: "verify_customer",
    description:
      "Verify customer identity by email and mark the context as verified.",
    parameters: z.object({
      email: z.string().email(),
    }),
    execute: async ({ email }, runContext) => {
      if (!runContext) {
        throw new Error("RunContext is required for verify_customer.");
      }
      const verified = email === runContext.context.customer.email;
      runContext.context.customer.verified = verified;
      return {
        verified,
        customerName: verified ? "Ada Lovelace" : null,
      };
    },
  });

  const lookupOrder = tool<CustomerSupportContext>({
    name: "lookup_order",
    description: "Look up current order details by customer-facing order id.",
    parameters: z.object({
      orderId: z.string(),
    }),
    execute: async ({ orderId }) => {
      return {
        orderId,
        status: "out_for_delivery",
        estimatedDelivery: "today by 18:00",
        items: ["Wireless keyboard", "USB-C dock"],
        courier: "Pronto Express",
        deliveryAddress: "Via Roma 10, Milano",
      };
    },
  });

  const summarizeRefundPolicy = tool<CustomerSupportContext>({
    name: "summarize_refund_policy",
    description: "Summarize the refund policy for the current order status.",
    parameters: z.object({
      orderStatus: z.string().optional(),
    }),
    execute: async ({ orderStatus }) => {
      return {
        orderStatus: orderStatus ?? "out_for_delivery",
        policy:
          "Orders out for delivery cannot be canceled immediately, but the customer can refuse delivery or start a return within 14 days after delivery.",
      };
    },
  });

  const harness = buildAgentHarness<CustomerSupportContext>(
    {
      ...descriptor,
      agent_defaults: {
        ...descriptor.agent_defaults,
        model,
      },
    },
    {
      registryVersion: "customer-support-example@1",
      tools: {
        "example://tool/verify_customer": verifyCustomer,
        "example://tool/lookup_order": lookupOrder,
        "example://tool/summarize_refund_policy": summarizeRefundPolicy,
      },
    },
  );

  const question =
    process.argv.slice(2).join(" ").trim() ||
    "Hi, I am customer@example.com. Can you check order ORD-1001 and tell me whether I can cancel it?";
  const context = harness.createContext({
    message: question,
    overrides: {
      customer: {
        email: "customer@example.com",
      },
      order: {
        id: "ORD-1001",
      },
    },
  });
  const records = [];
  const toolPolicy: ToolPolicy<CustomerSupportContext> = ({ toolName }) =>
    allow(`allow_example_${toolName}`);

  const result = await run(harness.entryAgent, question, {
    ...harness.runOptions,
    context,
    policies: {
      toolPolicy,
      handoffPolicy: () => allow("allow_example_handoff"),
    },
    record: {
      metadata: {
        provider,
        harness: harness.metadata,
      },
      contextRedactor: (ctx) => ({
        contextRedacted: true,
        contextSnapshot: {
          ...ctx,
          customer: {
            ...ctx.customer,
            email: "[redacted]",
          },
        },
      }),
      sink: (record) => {
        records.push(record);
      },
    },
  });

  process.stdout.write(`${result.finalOutput}\n\n`);
  process.stdout.write(
    `descriptor=${descriptorPath}\nlastAgent=${result.lastAgent.name} harness=${harness.metadata.version} descriptorHash=${harness.descriptorHash}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
