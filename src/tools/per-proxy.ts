import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get, post } from "../client.js";
import { config } from "../config.js";
import { ok } from "../result.js";
import { outputSchemas } from "../schemas.js";
import type {
  ApiProxy,
  Paginated,
  Proxy,
  LocationGroup,
  Carrier,
  Tag,
} from "../schemas.js";

function withConnectionUrls(proxy: ApiProxy): Proxy {
  return Object.assign({}, proxy, {
    http_url: `http://${proxy.proxy}@${config.proxyHost}:${proxy.http_port}`,
    socks_url: `socks5h://${config.proxyHost}:${proxy.socks_port}`,
  });
}

export function registerPerProxyTools(server: McpServer, username: string) {
  server.registerTool(
    "list_proxies",
    {
      title: "List Proxies",
      description:
        "List all per-proxy mobile proxies with their IPs, ports, speeds, and usage",
      inputSchema: {
        page: z.number().int().positive().optional().describe("Page number"),
        page_size: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Results per page"),
      },
      outputSchema: outputSchemas.paginatedProxies,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ page, page_size }) => {
      const data = await get<Paginated<ApiProxy>>(
        `/perproxy/proxies/${username}`,
        { page, page_size }
      );
      return ok({ ...data, data: data.data.map(withConnectionUrls) });
    }
  );

  server.registerTool(
    "get_proxy",
    {
      title: "Get Proxy",
      description: "Get details of a single proxy by session ID",
      inputSchema: {
        session_id: z
          .string()
          .describe(
            "Session ID (from list_proxies or proxy string after '-s-')"
          ),
      },
      outputSchema: outputSchemas.proxy,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ session_id }) => {
      const data = await get<ApiProxy>(
        `/perproxy/proxy/${username}/${session_id}`
      );
      return ok(withConnectionUrls(data));
    }
  );

  server.registerTool(
    "rotate_proxy",
    {
      title: "Rotate Proxy",
      description:
        "Rotate a proxy's IP address and return the old and new IP. " +
        "Optionally lock to a specific city or carrier.",
      inputSchema: {
        session_id: z
          .string()
          .describe("Session ID of the proxy to rotate"),
        city: z
          .string()
          .optional()
          .describe("Lock rotation to a city (e.g. 'Dallas')"),
        carrier: z
          .string()
          .optional()
          .describe("Lock rotation to a carrier ID (e.g. '6614')"),
      },
      outputSchema: outputSchemas.rotateResult,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ session_id, city, carrier }) => {
      const fetchIp = () =>
        get<ApiProxy>(`/perproxy/proxy/${username}/${session_id}`)
          .then((p) => p.ip)
          .catch(() => null);

      const oldIp = await fetchIp();

      const filter: Record<string, string> = {};
      if (city) filter.city = city;
      if (carrier) filter.carrier = carrier;

      const data = await post<{ message: string }>("/perproxy/rotate", {
        username,
        key: session_id,
        filter,
      });

      let newIp = await fetchIp();
      for (let attempt = 0; attempt < 3 && newIp === oldIp; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        newIp = await fetchIp();
      }

      return ok({ ...data, old_ip: oldIp, new_ip: newIp });
    }
  );

  server.registerTool(
    "rotate_proxy_url",
    {
      title: "Rotate Proxy via URL",
      description:
        "Rotate a proxy by its rotation token (the token at the end of the rotation URL)",
      inputSchema: {
        rotation_token: z
          .string()
          .describe("Rotation token from the proxy's public_key field"),
      },
      outputSchema: outputSchemas.message,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ rotation_token }) => {
      const data = await get(`/perproxy/rotate-url/${rotation_token}`);
      return ok(data);
    }
  );

  server.registerTool(
    "set_rotation_interval",
    {
      title: "Set Rotation Interval",
      description:
        "Set automatic IP rotation interval for a proxy. Use -1 to disable.",
      inputSchema: {
        session_id: z.string().describe("Session ID of the proxy"),
        public_key: z
          .string()
          .describe("Public key token from the proxy's rotate URL"),
        interval: z
          .number()
          .int()
          .describe(
            "Interval in seconds (min 60, max 604800). Use -1 to disable."
          ),
      },
      outputSchema: outputSchemas.message,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ session_id, public_key, interval }) => {
      const data = await post("/perproxy/set-rotation-interval", {
        username,
        session_id,
        interval,
        public_key,
      });
      return ok(data);
    }
  );

  server.registerTool(
    "update_proxy_password",
    {
      title: "Update Proxy Password",
      description: "Change the password for all proxies under this account",
      inputSchema: {
        old_password: z
          .string()
          .describe("Current password (letters and numbers only)"),
        new_password: z
          .string()
          .describe("New password (letters and numbers only)"),
      },
      outputSchema: outputSchemas.message,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ old_password, new_password }) => {
      const data = await post("/perproxy/update-password", {
        username,
        oldPassword: old_password,
        newPassword: new_password,
      });
      return ok(data);
    }
  );

  server.registerTool(
    "list_proxy_locations",
    {
      title: "List Proxy Locations",
      description:
        "List available U.S. cities for per-proxy mobile proxies, with average speeds",
      inputSchema: {
        carrier: z
          .string()
          .optional()
          .describe("Filter locations by carrier ID (e.g. '6614')"),
      },
      outputSchema: outputSchemas.locations,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ carrier }) => {
      const data = await get<{ locations: LocationGroup[] }>(
        "/perproxy/locations-proxy",
        carrier ? { carrier } : undefined
      );
      return ok(data);
    }
  );

  server.registerTool(
    "list_proxy_carriers",
    {
      title: "List Proxy Carriers",
      description:
        "List available mobile carriers, optionally filtered by location",
      inputSchema: {
        city: z.string().optional().describe("City name (e.g. 'Dallas')"),
        state: z
          .string()
          .optional()
          .describe("State code (e.g. 'TX'). Requires city."),
        country: z
          .string()
          .optional()
          .describe("Country (e.g. 'UnitedStates')"),
      },
      outputSchema: outputSchemas.carriers,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ city, state, country }) => {
      const params: Record<string, string> = {};
      if (city) params.city = city;
      if (state) params.state = state;
      if (country) params.country = country;

      const data = await get<Carrier[]>("/perproxy/carriers-proxy", params);
      return ok({ carriers: data });
    }
  );

  server.registerTool(
    "create_ip_whitelist",
    {
      title: "Create IP Whitelist",
      description:
        "Whitelist source IPs allowed to connect to your per-proxy proxies",
      inputSchema: {
        ips: z.array(z.string()).describe("IP addresses to whitelist"),
      },
      outputSchema: outputSchemas.ipWhitelist,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ ips }) => {
      const data = await post("/perproxy/ip-whitelist", {
        access_point: ips,
        super_user: username,
      });
      return ok(data);
    }
  );

  server.registerTool(
    "list_tags",
    {
      title: "List Tags",
      description: "List all tags for organizing proxies",
      outputSchema: outputSchemas.tags,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      const data = await get<Tag[]>("/perproxy/get-tags-user");
      return ok({ tags: data });
    }
  );

  server.registerTool(
    "create_tag",
    {
      title: "Create Tag",
      description: "Create a new tag for organizing proxy sessions",
      inputSchema: { name: z.string().describe("Tag name") },
      outputSchema: outputSchemas.createTag,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ name }) => {
      const data = await post("/perproxy/create-tag-user", { tag: name });
      return ok(data);
    }
  );

  server.registerTool(
    "delete_tag",
    {
      title: "Delete Tag",
      description:
        "Delete a tag. Any proxies with this tag will be untagged.",
      inputSchema: {
        tag_id: z.number().int().describe("ID of the tag to delete"),
      },
      outputSchema: outputSchemas.deleteTag,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ tag_id }) => {
      const data = await post("/perproxy/delete-tag-user", { tag_id });
      return ok(data);
    }
  );

  server.registerTool(
    "tag_proxy",
    {
      title: "Tag Proxy",
      description: "Assign an existing tag to a proxy session",
      inputSchema: {
        tag_id: z.number().int().describe("Tag ID"),
        session_id: z.string().describe("Proxy session ID to tag"),
      },
      outputSchema: outputSchemas.tagSession,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ tag_id, session_id }) => {
      const data = await post("/perproxy/create-tag-session", {
        tag_id,
        session: session_id,
      });
      return ok(data);
    }
  );

  server.registerTool(
    "untag_proxy",
    {
      title: "Untag Proxy",
      description: "Remove a tag from a proxy session",
      inputSchema: {
        tag_id: z.number().int().describe("Tag ID"),
        session_id: z.string().describe("Proxy session ID to untag"),
      },
      outputSchema: outputSchemas.tagSession,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ tag_id, session_id }) => {
      const data = await post("/perproxy/delete-tag-session", {
        tag_id,
        session: session_id,
      });
      return ok(data);
    }
  );
}
