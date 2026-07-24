import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import axios from "axios";
import { get } from "../client.js";
import { ok } from "../result.js";
import { outputSchemas } from "../schemas.js";
import type { Paginated, Subscription } from "../schemas.js";
import {
  canonicalSubscriptionTypes,
  CanonicalSubscriptionTypeSchema,
  filterSubscriptionResponse,
  toLegacyWireType,
} from "../subscriptions.js";

async function getAllSubscriptions(): Promise<Paginated<Subscription>> {
  const wireTypes = [...new Set(canonicalSubscriptionTypes.map(toLegacyWireType))];
  const responses = await Promise.all(
    wireTypes.map((type) =>
      get<Paginated<Subscription>>("/subscription", { type })
    )
  );

  const seen = new Set<string>();
  const data = responses
    .flatMap((response) => response.data)
    .filter(
      (subscription) =>
        (canonicalSubscriptionTypes as readonly string[]).includes(
          subscription.subscription_type_name
        ) &&
        !seen.has(subscription.id) &&
        Boolean(seen.add(subscription.id))
    );

  return { perPage: data.length, page: 1, total: data.length, data };
}

export function registerAccountTools(server: McpServer) {
  server.registerTool(
    "get_subscription",
    {
      title: "Get Subscription",
      description:
        "Get active Proxidize subscriptions. Returns plan type, status, dates, and your proxy username. " +
        "Omit type to list every active plan.",
      inputSchema: {
        type: CanonicalSubscriptionTypeSchema.optional().describe(
          "Canonical subscription type to query. Omit for all plans."
        ),
      },
      outputSchema: outputSchemas.paginatedSubscriptions,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ type }) => {
      if (!type) {
        return ok(await getAllSubscriptions());
      }

      const data = filterSubscriptionResponse(
        await get<Paginated<Subscription>>("/subscription", {
          type: toLegacyWireType(type),
        }),
        type
      );
      return ok(data);
    }
  );

  server.registerTool(
    "get_outbound_ip",
    {
      title: "Get Outbound IP",
      description:
        "Get the public outbound IP address of the machine running this MCP server. Useful for source-IP whitelisting.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      const { data } = await axios.get("https://api.ipify.org", {
        timeout: 5000,
      });
      return ok({ ip: data });
    }
  );
}
