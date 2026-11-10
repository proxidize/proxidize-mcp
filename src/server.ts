import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { get } from "./client.js";
import { config } from "./config.js";
import type { Mode } from "./context.js";
import { logger } from "./logger.js";
import { registerAccountTools } from "./tools/account.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerFeedbackTools } from "./tools/feedback.js";
import { registerPerProxyTools } from "./tools/per-proxy.js";
import { registerPerGbTools } from "./tools/per-gb.js";
import { instrumentServer } from "./telemetry.js";
import type { Paginated, Subscription } from "./schemas.js";
import {
  getActiveSubscriptionUsername,
  toLegacyWireType,
  type CanonicalSubscriptionType,
} from "./subscriptions.js";

export interface Plans {
  perProxyUser: string | null;
  perGbUser: string | null;
  resiUser: string | null;
}

async function resolveSubscriptionUsername(
  type: CanonicalSubscriptionType
): Promise<string | null> {
  try {
    const res = await get<Paginated<Subscription>>("/subscription", {
      type: toLegacyWireType(type),
    });
    return getActiveSubscriptionUsername(res, type);
  } catch (err) {
    logger.warn(`failed to discover ${type} subscription`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Looks up which plans the current token's account has (3 API calls). */
export async function discoverPlans(): Promise<Plans> {
  const [perProxyUser, perGbUser, resiUser] = await Promise.all([
    resolveSubscriptionUsername("per_proxy_mobile"),
    resolveSubscriptionUsername("per_gb_mobile"),
    resolveSubscriptionUsername("per_gb_residential"),
  ]);
  return { perProxyUser, perGbUser, resiUser };
}

function instructions(mode: Mode): string {
  // stdio text is unchanged from the original server. The hosted server has no
  // get_outbound_ip (see tools/account.ts), so its whitelisting hint differs.
  const socksHint =
    mode === "stdio"
      ? "ignore credentials and require source-IP whitelisting first (get_outbound_ip, " +
        "then create_ip_whitelist).\n\n"
      : "ignore credentials and require source-IP whitelisting first: ask the user for the " +
        "public IP of the machine that will connect, then use create_ip_whitelist.\n\n";
  return (
    "Proxidize proxy management server. Use these tools when the user asks about " +
    "managing mobile proxies, rotating IPs, checking proxy status, listing locations " +
    "or carriers, managing IP whitelists, tagging proxies, or viewing data usage. " +
    "Supports per-proxy and per-GB proxies.\n\n" +
    `Proxies are reached through the gateway host ${config.proxyHost}. ` +
    "Per-proxy responses include ready-to-use http_url and socks_url values. " +
    "The proxy field is 'username:password' credentials: HTTP ports accept them " +
    "directly (e.g. curl -x <http_url> https://httpbin.org/ip), while SOCKS ports " +
    socksHint +
    "Analytics tools (get_traffic_analytics, get_top_domains, get_connection_history) " +
    "answer questions about what the proxies actually did: bandwidth over time, " +
    "top destination domains, and a per-request connection log with errors.\n\n" +
    "If the user asks for something none of these tools can do, and you have confirmed that, " +
    "offer to draft a feature request with request_feature. Ask first, describe only the " +
    "missing capability generically, and never include anything sensitive or about the user."
  );
}

/**
 * Builds an McpServer with the tools the given plans allow. The stdio server
 * calls this once at startup; the hosted server once per request.
 */
export function buildServer(plans: Plans, mode: Mode) {
  const { perProxyUser, perGbUser, resiUser } = plans;
  const verbose = mode === "stdio";

  const server = new McpServer(
    {
      name: "proxidize-mcp-server",
      version: "0.1.0",
    },
    { instructions: instructions(mode) }
  );

  const posthog = instrumentServer(server);

  registerAccountTools(server, { outboundIp: mode === "stdio" });
  registerFeedbackTools(server);

  if (perProxyUser) {
    registerPerProxyTools(server, perProxyUser);
    if (verbose) logger.info("registered per-proxy tools (14)");
  }

  registerPerGbTools(server, perGbUser, resiUser);
  const gbCount = (perGbUser ? 9 : 0) + (resiUser ? 10 : 0);
  if (verbose && gbCount > 0) {
    logger.info(`registered per-gb tools (${gbCount})`);
  }

  if (perProxyUser || perGbUser || resiUser) {
    registerAnalyticsTools(server, {
      per_proxy_mobile: perProxyUser,
      per_gb_mobile: perGbUser,
      per_gb_residential: resiUser,
    });
    if (verbose) logger.info("registered analytics tools (3)");
  }

  return { server, posthog };
}
