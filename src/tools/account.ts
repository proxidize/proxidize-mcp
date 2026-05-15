import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get } from "../client.js";
import { ok, fail } from "../result.js";
import type { Paginated, Subscription } from "../types.js";

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
}
