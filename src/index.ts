#!/usr/bin/env node

// Local (stdio) server: what `npx @proxidize/mcp` runs. Behaviour is the same
// as before the hosted server was added; the hosted server lives in http.ts.

import { readStdioToken } from "./token.js";

// Read the token before loading anything else, as the original server did
// (config.ts used to validate it at import time, before the base URL).
const token = readStdioToken();

const { StdioServerTransport } = await import(
  "@modelcontextprotocol/sdk/server/stdio.js"
);
const { setMode, setStdioToken } = await import("./context.js");
const { logger } = await import("./logger.js");
const { buildServer, discoverPlans } = await import("./server.js");

async function main() {
  setMode("stdio");
  setStdioToken(token);

  logger.info("discovering subscriptions...");

  const plans = await discoverPlans();

  logger.info("per-proxy: " + (plans.perProxyUser ?? "(none)"));
  logger.info("per-gb mobile: " + (plans.perGbUser ?? "(none)"));
  logger.info("residential: " + (plans.resiUser ?? "(none)"));

  const { server, posthog } = buildServer(plans, "stdio");

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
