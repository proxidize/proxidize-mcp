import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get, post, put } from "../client.js";
import { ok, fail } from "../result.js";
import { outputSchemas } from "../schemas.js";
import type {
  PerGbUser,
  AccessPointSettings,
  LocationGroup,
  Carrier,
} from "../schemas.js";

type Network = "mobile" | "residential";

function prefix(network: Network) {
  return `/pergb/${network}`;
}

function registerForNetwork(
  server: McpServer,
  network: Network,
  superUser: string | null
) {
  const tag = network === "mobile" ? "mobile" : "residential";
  const label = network === "mobile" ? "mobile" : "residential";
  const titleLabel = network === "mobile" ? "Mobile" : "Residential";

  server.registerTool(
    `${tag}_get_usage`,
    {
      title: `Get ${titleLabel} Usage`,
      description: `Get data usage and balance for per-GB ${label} proxies`,
      outputSchema: outputSchemas.perGbUser,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await get<PerGbUser | Record<string, never>>(
          `${prefix(network)}/user-info`
        );
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    `${tag}_list_locations`,
    {
      title: `List ${titleLabel} Locations`,
      description: `List available ${label} proxy locations with average speeds`,
      inputSchema: {
        carrier: z.string().optional().describe("Filter by carrier ID"),
      },
      outputSchema: outputSchemas.locations,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ carrier }) => {
      try {
        const data = await get<{ locations: LocationGroup[] }>(
          `${prefix(network)}/locations-proxy`,
          carrier ? { carrier } : undefined
        );
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    `${tag}_list_carriers`,
    {
      title: `List ${titleLabel} Carriers`,
      description: `List available ${label} proxy carriers, optionally filtered by location`,
      inputSchema: {
        city: z.string().optional().describe("City name"),
        state: z.string().optional().describe("State code"),
        country: z.string().optional().describe("Country name"),
      },
      outputSchema: outputSchemas.carriers,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ city, state, country }) => {
      try {
        const params: Record<string, string> = {};
        if (city) params.city = city;
        if (state) params.state = state;
        if (country) params.country = country;

        const data = await get<Carrier[]>(
          `${prefix(network)}/carriers-proxy`,
          params
        );
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    `${tag}_get_settings`,
    {
      title: `Get ${titleLabel} Settings`,
      description: `Get access point settings for per-GB ${label} proxies`,
      outputSchema: outputSchemas.accessPointSettings,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await get<AccessPointSettings[]>(
          `${prefix(network)}/settings`
        );
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    `${tag}_list_access_points`,
    {
      title: `List ${titleLabel} Access Points`,
      description: `List all access points (sub-users) for per-GB ${label} proxies`,
      outputSchema: outputSchemas.perGbUsers,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await get<PerGbUser[]>(
          `${prefix(network)}/access-point`
        );
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    `${tag}_create_access_point`,
    {
      title: `Create ${titleLabel} Access Point`,
      description: `Create a new access point (sub-user) for per-GB ${label} proxies`,
      inputSchema: {
        username: z
          .string()
          .describe("Username for the new access point"),
        password: z
          .string()
          .describe("Password for the new access point"),
      },
      outputSchema: outputSchemas.message,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ username, password }) => {
      try {
        const data = await post(`${prefix(network)}/access-point`, {
          username,
          password,
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    `${tag}_create_ip_whitelist`,
    {
      title: `Create ${titleLabel} IP Whitelist`,
      description: `Whitelist source IPs for per-GB ${label} proxy access points`,
      inputSchema: {
        ips: z.array(z.string()).describe("IP addresses to whitelist"),
        hostname: z.enum(["dns", "ip"]).optional().describe("Hostname type"),
        city: z.string().optional().describe("City to route through"),
        state: z.string().optional().describe("State code"),
        country: z.string().optional().describe("Country name"),
        carrier: z.string().optional().describe("Carrier ID"),
        proxy_type: z
          .enum(["socks", "http"])
          .optional()
          .describe("Protocol"),
      },
      outputSchema: outputSchemas.ipWhitelist,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ ips, hostname, city, state, country, carrier, proxy_type }) => {
      try {
        const body: Record<string, unknown> = {
          access_point: ips,
          super_user: superUser,
        };
        if (hostname) body.hostname = hostname;
        if (city) body.city = city;
        if (state) body.state = state;
        if (country) body.country = country;
        if (carrier) body.carrier = carrier;
        if (proxy_type) body.proxy_type = proxy_type;

        const data = await post(`${prefix(network)}/ip-whitelist`, body);
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    `${tag}_update_ip_whitelist`,
    {
      title: `Update ${titleLabel} IP Whitelist`,
      description: `Update an existing IP whitelist entry for per-GB ${label} proxies`,
      inputSchema: {
        ip: z.string().describe("The whitelisted IP to update"),
        hostname: z.enum(["dns", "ip"]).optional().describe("Hostname type"),
        city: z.string().optional().describe("City to route through"),
        state: z.string().optional().describe("State code"),
        country: z.string().optional().describe("Country name"),
        carrier: z.string().optional().describe("Carrier ID"),
        proxy_type: z
          .enum(["socks", "http"])
          .optional()
          .describe("Protocol"),
      },
      outputSchema: outputSchemas.message,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ ip, hostname, city, state, country, carrier, proxy_type }) => {
      try {
        const body: Record<string, unknown> = {
          access_point: ip,
          super_user: superUser,
        };
        if (hostname) body.hostname = hostname;
        if (city) body.city = city;
        if (state) body.state = state;
        if (country) body.country = country;
        if (carrier) body.carrier = carrier;
        if (proxy_type) body.proxy_type = proxy_type;

        const data = await put(`${prefix(network)}/ip-whitelist`, body);
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    }
  );
}

export function registerPerGbTools(
  server: McpServer,
  mobileSuperUser: string | null,
  residentialSuperUser: string | null
) {
  if (mobileSuperUser) {
    registerForNetwork(server, "mobile", mobileSuperUser);
  }
  if (residentialSuperUser) {
    registerForNetwork(server, "residential", residentialSuperUser);
  }
}
