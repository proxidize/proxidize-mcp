import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get, post } from "../client.js";
import { ok } from "../result.js";
import { outputSchemas } from "../schemas.js";
import type { ApiProxy, Paginated, PerGbUser } from "../schemas.js";
import {
  CanonicalSubscriptionTypeSchema,
  type CanonicalSubscriptionType,
} from "../subscriptions.js";

export type ActivePlanUsers = Record<CanonicalSubscriptionType, string | null>;

type AnalyticsFilters = {
  from_timestamp: number;
  to_timestamp: number;
  plan: "pp" | "pg";
  type: "mobile" | "residential";
  usernames: string[];
  session_keys?: string[];
  request_url_contains?: string;
  request_methods?: string[];
  status_codes?: number[];
};

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

async function graphql<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const res = await post<GraphqlResponse<T>>("/coreproxy-analytics/graphql", {
    query,
    variables,
  });
  if (res.errors?.length) {
    throw new Error(`Analytics API: ${res.errors[0].message}`);
  }
  if (!res.data) {
    throw new Error("Analytics API returned no data");
  }
  return res.data;
}

async function perProxyFilter(
  username: string
): Promise<Pick<AnalyticsFilters, "plan" | "type" | "usernames" | "session_keys">> {
  const sessionKeys: string[] = [];
  let page = 1;
  for (;;) {
    const res = await get<Paginated<ApiProxy>>(
      `/perproxy/proxies/${username}`,
      { page, page_size: 100 }
    );
    sessionKeys.push(...res.data.map((proxy) => proxy.session_id));
    if (res.data.length === 0 || sessionKeys.length >= res.total) break;
    page += 1;
  }
  return {
    plan: "pp",
    type: "mobile",
    usernames: [username],
    session_keys: [...new Set(sessionKeys)],
  };
}

async function perGbFilter(
  network: "mobile" | "residential",
  fallbackUsername: string
): Promise<Pick<AnalyticsFilters, "plan" | "type" | "usernames">> {
  const [info, accessPoints] = await Promise.all([
    get<{ username?: string }>(`/pergb/${network}/user-info`),
    get<PerGbUser[]>(`/pergb/${network}/access-point`),
  ]);
  const usernames = [
    ...new Set(
      [info.username ?? fallbackUsername, ...accessPoints.map((ap) => ap.username)].filter(
        Boolean
      )
    ),
  ];
  return { plan: "pg", type: network, usernames };
}

function planFilterBase(plan: CanonicalSubscriptionType, username: string) {
  if (plan === "per_proxy_mobile") return perProxyFilter(username);
  return perGbFilter(plan === "per_gb_mobile" ? "mobile" : "residential", username);
}

function resolveWindow(hours?: number, from?: string, to?: string) {
  const toTs = to ? Math.floor(Date.parse(to) / 1000) : Math.floor(Date.now() / 1000);
  const fromTs = from
    ? Math.floor(Date.parse(from) / 1000)
    : toTs - (hours ?? 24) * 3600;
  if (Number.isNaN(fromTs) || Number.isNaN(toTs)) {
    throw new Error("Invalid from/to timestamp; use ISO 8601 (e.g. 2026-07-14T00:00:00Z)");
  }
  if (fromTs >= toTs) {
    throw new Error("Window is empty: from must be earlier than to");
  }
  return { fromTs, toTs };
}

function iso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

const windowInputSchema = {
  hours: z
    .number()
    .int()
    .min(1)
    .max(2160)
    .optional()
    .describe("Lookback window in hours ending now (default 24, max 2160 = 90 days)"),
  from: z
    .string()
    .optional()
    .describe("Window start as ISO 8601 timestamp; overrides hours"),
  to: z
    .string()
    .optional()
    .describe("Window end as ISO 8601 timestamp (default now)"),
  plan: CanonicalSubscriptionTypeSchema.optional().describe(
    "Restrict to one plan. Omit to cover every active plan."
  ),
};

const USAGE_QUERY = `query Usage($filters: AnalyticsFiltersInput!, $bucketSeconds: Int) {
  analyticsUsage(filters: $filters, bucket_seconds: $bucketSeconds) {
    key
    points { timestamp bytes }
  }
  analyticsRequestSummary(filters: $filters, bucket_seconds: $bucketSeconds) {
    points { timestamp total failed }
  }
}`;

const TOP_DOMAINS_QUERY = `query TopDomains($filters: AnalyticsFiltersInput!, $bucketSeconds: Int) {
  analyticsTopDomainsByBytes(filters: $filters, bucket_seconds: $bucketSeconds) {
    domain
    points { timestamp bytes }
  }
  analyticsTopDomainsByRequests(filters: $filters, bucket_seconds: $bucketSeconds) {
    domain
    points { timestamp count }
  }
}`;

const ENTRIES_QUERY = `query Entries($filters: AnalyticsFiltersInput!, $page: PaginationInput) {
  analyticsEntries(filters: $filters, page: $page, order_by: TIMESTAMP, order_direction: DESC) {
    totalCount
    items {
      timestamp
      requestId
      requestUrl
      requestMethod
      requestStatusCode
      requestDuration
      protocol
      port
      sourceIp
      bytesUploaded
      bytesDownloaded
      upstreamType
      upstreamCountry
      upstreamState
      upstreamCity
      upstreamIsp
      subscriptionType
      username
      superUser
      sessionKey
      isPooled
      poolKey
      authType
      hasError
      errorType
    }
  }
}`;

type UsageResult = {
  analyticsUsage: Array<{ key: string; points: Array<{ timestamp: number; bytes: number }> }>;
  analyticsRequestSummary: { points: Array<{ timestamp: number; total: number; failed: number }> } | null;
};

type TopDomainsResult = {
  analyticsTopDomainsByBytes: Array<{ domain: string; points: Array<{ timestamp: number; bytes: number }> }>;
  analyticsTopDomainsByRequests: Array<{ domain: string; points: Array<{ timestamp: number; count: number }> }>;
};

type EntriesResult = {
  analyticsEntries: {
    totalCount: number;
    items: Array<Record<string, unknown> & { timestamp: number }>;
  };
};

export function registerAnalyticsTools(server: McpServer, users: ActivePlanUsers) {
  const activePlans = (Object.keys(users) as CanonicalSubscriptionType[]).filter(
    (plan) => users[plan] !== null
  );

  function targetPlans(requested?: CanonicalSubscriptionType) {
    if (!requested) return activePlans;
    if (!activePlans.includes(requested)) {
      throw new Error(
        `No active ${requested} subscription. Active plans: ${activePlans.join(", ")}`
      );
    }
    return [requested];
  }

  async function filtersFor(
    plan: CanonicalSubscriptionType,
    fromTs: number,
    toTs: number
  ): Promise<AnalyticsFilters> {
    const base = await planFilterBase(plan, users[plan] as string);
    return { ...base, from_timestamp: fromTs, to_timestamp: toTs };
  }

  server.registerTool(
    "get_traffic_analytics",
    {
      title: "Get Traffic Analytics",
      description:
        "Bandwidth and request analytics over time for your proxies: bytes transferred per time bucket " +
        "(per proxy session or access point) plus total and failed request counts. " +
        "Defaults to the last 24 hours across all active plans.",
      inputSchema: windowInputSchema,
      outputSchema: outputSchemas.trafficAnalytics,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ hours, from, to, plan }) => {
      const { fromTs, toTs } = resolveWindow(hours, from, to);
      const bucketSeconds = toTs - fromTs <= 48 * 3600 ? 3600 : 86400;

      const plans = await Promise.all(
        targetPlans(plan).map(async (target) => {
          const filters = await filtersFor(target, fromTs, toTs);
          const res = await graphql<UsageResult>(USAGE_QUERY, {
            filters,
            bucketSeconds,
          });
          const usage = res.analyticsUsage.map((series) => ({
            key: series.key,
            points: series.points.map((p) => ({
              timestamp: iso(p.timestamp),
              bytes: p.bytes,
            })),
          }));
          const requests = (res.analyticsRequestSummary?.points ?? []).map((p) => ({
            timestamp: iso(p.timestamp),
            total: p.total,
            failed: p.failed,
          }));
          return {
            plan: target,
            total_bytes: res.analyticsUsage.reduce(
              (sum, series) => sum + series.points.reduce((s, p) => s + p.bytes, 0),
              0
            ),
            total_requests: requests.reduce((sum, p) => sum + p.total, 0),
            failed_requests: requests.reduce((sum, p) => sum + p.failed, 0),
            usage,
            requests,
          };
        })
      );

      return ok({
        window: { from: iso(fromTs), to: iso(toTs) },
        bucket_seconds: bucketSeconds,
        plans,
      });
    }
  );

  server.registerTool(
    "get_top_domains",
    {
      title: "Get Top Domains",
      description:
        "Top domains your proxies connected to, ranked by data volume and by request count. " +
        "Defaults to the last 24 hours across all active plans.",
      inputSchema: windowInputSchema,
      outputSchema: outputSchemas.topDomains,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ hours, from, to, plan }) => {
      const { fromTs, toTs } = resolveWindow(hours, from, to);
      const bucketSeconds = toTs - fromTs <= 48 * 3600 ? 3600 : 86400;

      const plans = await Promise.all(
        targetPlans(plan).map(async (target) => {
          const filters = await filtersFor(target, fromTs, toTs);
          const res = await graphql<TopDomainsResult>(TOP_DOMAINS_QUERY, {
            filters,
            bucketSeconds,
          });
          const byBytes = res.analyticsTopDomainsByBytes
            .map((d) => ({
              domain: d.domain,
              bytes: d.points.reduce((sum, p) => sum + p.bytes, 0),
            }))
            .filter((d) => d.bytes > 0)
            .sort((a, b) => b.bytes - a.bytes);
          const byRequests = res.analyticsTopDomainsByRequests
            .map((d) => ({
              domain: d.domain,
              requests: d.points.reduce((sum, p) => sum + p.count, 0),
            }))
            .filter((d) => d.requests > 0)
            .sort((a, b) => b.requests - a.requests);
          return { plan: target, by_bytes: byBytes, by_requests: byRequests };
        })
      );

      return ok({ window: { from: iso(fromTs), to: iso(toTs) }, plans });
    }
  );

  server.registerTool(
    "get_connection_history",
    {
      title: "Get Connection History",
      description:
        "Per-request connection log for your proxies: URL, method, status, duration, bytes up/down, " +
        "source IP, upstream carrier/geo, session, and errors. Newest first. " +
        "Defaults to the last 24 hours across all active plans. " +
        "When plan is omitted, results are merged across plans and offset applies within each plan.",
      inputSchema: {
        ...windowInputSchema,
        url_contains: z
          .string()
          .optional()
          .describe("Only requests whose URL contains this substring"),
        methods: z
          .array(z.string())
          .optional()
          .describe("Only these HTTP methods (e.g. ['GET', 'CONNECT'])"),
        status_codes: z
          .array(z.number().int())
          .optional()
          .describe("Only these response status codes"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Max entries to return (default 50)"),
        offset: z.number().int().min(0).optional().describe("Pagination offset"),
      },
      outputSchema: outputSchemas.connectionHistory,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ hours, from, to, plan, url_contains, methods, status_codes, limit, offset }) => {
      const { fromTs, toTs } = resolveWindow(hours, from, to);
      const pageLimit = limit ?? 50;

      const results = await Promise.all(
        targetPlans(plan).map(async (target) => {
          const filters = await filtersFor(target, fromTs, toTs);
          if (url_contains) filters.request_url_contains = url_contains;
          if (methods?.length) filters.request_methods = methods;
          if (status_codes?.length) filters.status_codes = status_codes;
          return graphql<EntriesResult>(ENTRIES_QUERY, {
            filters,
            page: { limit: pageLimit, offset: offset ?? 0 },
          });
        })
      );

      const entries = results
        .flatMap((res) => res.analyticsEntries.items)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, pageLimit)
        .map((item) => ({ ...item, timestamp: iso(item.timestamp) }));

      return ok({
        window: { from: iso(fromTs), to: iso(toTs) },
        total: results.reduce((sum, res) => sum + res.analyticsEntries.totalCount, 0),
        returned: entries.length,
        entries,
      });
    }
  );
}
