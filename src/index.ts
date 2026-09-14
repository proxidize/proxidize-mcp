#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { get } from "./client.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { registerAccountTools } from "./tools/account.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerPerProxyTools } from "./tools/per-proxy.js";
import { registerPerGbTools } from "./tools/per-gb.js";
import { instrumentServer } from "./telemetry.js";
import type { Paginated, Subscription } from "./schemas.js";
import {
  getActiveSubscriptionUsername,
  toLegacyWireType,
  type CanonicalSubscriptionType,
} from "./subscriptions.js";

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

async function main() {
  logger.info("discovering subscriptions...");

  const [perProxyUser, perGbUser, resiUser] = await Promise.all([
    resolveSubscriptionUsername("per_proxy_mobile"),
    resolveSubscriptionUsername("per_gb_mobile"),
    resolveSubscriptionUsername("per_gb_residential"),
  ]);

  logger.info("per-proxy: " + (perProxyUser ?? "(none)"));
  logger.info("per-gb mobile: " + (perGbUser ?? "(none)"));
  logger.info("residential: " + (resiUser ?? "(none)"));

  const server = new McpServer(
    {
      name: "proxidize-mcp-server",
      version: "0.1.0",
    },
    {
      instructions:
        "Proxidize proxy management server. Use these tools when the user asks about " +
        "managing mobile proxies, rotating IPs, checking proxy status, listing locations " +
        "or carriers, managing IP whitelists, tagging proxies, or viewing data usage. " +
        "Supports per-proxy and per-GB proxies.\n\n" +
        `Proxies are reached through the gateway host ${config.proxyHost}. ` +
        "Per-proxy responses include ready-to-use http_url and socks_url values. " +
        "The proxy field is 'username:password' credentials: HTTP ports accept them " +
        "directly (e.g. curl -x <http_url> https://httpbin.org/ip), while SOCKS ports " +
        "ignore credentials and require source-IP whitelisting first (get_outbound_ip, " +
        "then create_ip_whitelist).\n\n" +
        "Analytics tools (get_traffic_analytics, get_top_domains, get_connection_history) " +
        "answer questions about what the proxies actually did: bandwidth over time, " +
        "top destination domains, and a per-request connection log with errors.",
    }
  );

  const posthog = instrumentServer(server);

  registerAccountTools(server);

  if (perProxyUser) {
    registerPerProxyTools(server, perProxyUser);
    logger.info("registered per-proxy tools (14)");
  }

  registerPerGbTools(server, perGbUser, resiUser);
  const gbCount = (perGbUser ? 9 : 0) + (resiUser ? 9 : 0);
  if (gbCount > 0) {
    logger.info(`registered per-gb tools (${gbCount})`);
  }

  if (perProxyUser || perGbUser || resiUser) {
    registerAnalyticsTools(server, {
      per_proxy_mobile: perProxyUser,
      per_gb_mobile: perGbUser,
      per_gb_residential: resiUser,
    });
    logger.info("registered analytics tools (3)");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", async () => {
    await server.close();
    await posthog?.shutdown();
    process.exit(0);
  });

  logger.info("server running on stdio");
}

main().catch((err) => {
  logger.error("fatal:", err);
  process.exit(1);
});
