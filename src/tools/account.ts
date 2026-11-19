import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
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

// With no active plan the server hides every plan tool, so an empty list is all
// the model sees. Add a plain note so it can tell the user why, instead of
// guessing. The structured result is unchanged.
export const NO_PLAN_NOTE =
  "No active Proxidize plan was found for the account this server is signed in as, so the proxy " +
  "tools are not available. Tell the user: if they expected plans, they may be signed in with a " +
  "different Proxidize account (disconnect and sign in again, or use that account's API key); " +
  "otherwise a plan can be bought at https://proxidize.com.";

function subscriptionsResult(data: Paginated<Subscription>, scope: string): CallToolResult {
  const result = ok(data);
  if (data.data.length === 0) {
    result.content.push({ type: "text", text: scope === "all" ? NO_PLAN_NOTE : `No active ${scope} plan was found for this account.` });
  }
  return result;
}

export function registerAccountTools(
  server: McpServer,
  options: { outboundIp?: boolean } = {}
) {
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
        return subscriptionsResult(await getAllSubscriptions(), "all");
      }

      const data = filterSubscriptionResponse(
        await get<Paginated<Subscription>>("/subscription", {
          type: toLegacyWireType(type),
        }),
        type
      );
      return subscriptionsResult(data, type);
    }
  );

  // get_outbound_ip reports the IP of the machine running this server. Locally
  // that is the user's own machine (what they want to whitelist). On the hosted
  // server it would be OUR server's IP, a wrong answer that could get our box
  // whitelisted on a customer's proxies, so the hosted server leaves it out.
  if (options.outboundIp === false) return;

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
