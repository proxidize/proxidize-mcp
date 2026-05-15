#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { get } from "./client.js";
import { logger } from "./logger.js";
import { registerAccountTools } from "./tools/account.js";
import { registerPerProxyTools } from "./tools/per-proxy.js";
import { registerPerGbTools } from "./tools/per-gb.js";
import type { Paginated, Subscription, PerGbUser } from "./schemas.js";

async function resolvePerProxyUsername(): Promise<string | null> {
  try {
    const res = await get<Paginated<Subscription>>("/subscription", {
      type: "per_proxy",
    });
    return res.data[0]?.meta_data?.username ?? null;
  } catch {
    return null;
  }
}

async function resolvePerGbUsername(): Promise<string | null> {
  try {
    const res = await get<Paginated<Subscription>>("/subscription", {
      type: "per_gb",
    });
    return res.data[0]?.meta_data?.username ?? null;
  } catch {
    return null;
  }
}

async function resolveResidentialUsername(): Promise<string | null> {
  try {
    const res = await get<PerGbUser>("/pergb/residential/user-info");
    if (!res || !("username" in res)) return null;
    return res.username ?? null;
  } catch {
    return null;
  }
}

async function main() {
  logger.info("discovering subscriptions...");

  const [perProxyUser, perGbUser, resiUser] = await Promise.all([
    resolvePerProxyUsername(),
    resolvePerGbUsername(),
    resolveResidentialUsername(),
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
        "Supports per-proxy dedicated mobile proxies and per-GB mobile/residential proxies.",
    }
  );

  registerAccountTools(server);

  if (perProxyUser) {
    registerPerProxyTools(server, perProxyUser);
    logger.info("registered per-proxy tools (15)");
  }

  registerPerGbTools(server, perGbUser, resiUser);
  const gbCount = (perGbUser ? 8 : 0) + (resiUser ? 8 : 0);
  if (gbCount > 0) {
    logger.info(`registered per-gb tools (${gbCount})`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });

  logger.info("server running on stdio");
}

main().catch((err) => {
  logger.error("fatal:", err);
  process.exit(1);
});
