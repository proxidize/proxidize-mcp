import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { get } from "../client.js";
import { ok, fail } from "../result.js";
import { outputSchemas } from "../schemas.js";
import type { Paginated, Subscription } from "../schemas.js";

export function registerAccountTools(server: McpServer) {
  server.registerTool(
    "get_subscription",
    {
      title: "Get Subscription",
      description:
        "Get active Proxidize subscriptions. Returns plan type, status, dates, and your proxy username.",
      inputSchema: {
        type: z
          .enum(["per_proxy", "per_gb"])
          .describe("Subscription type to query"),
      },
      outputSchema: outputSchemas.paginatedSubscriptions,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ type }) => {
      try {
        const data = await get<Paginated<Subscription>>("/subscription", {
          type,
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "get_outbound_ip",
    {
      title: "Get Outbound IP",
      description:
        "Get the public outbound IP address of the machine running this MCP server. Useful for whitelisting this IP so browser tools can connect via SOCKS5 proxy.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const { data } = await axios.get("https://api.ipify.org", {
          timeout: 5000,
        });
        return ok({ ip: data });
      } catch (err) {
        return fail(err);
      }
    }
  );
}
