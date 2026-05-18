const token = process.env.PROXIDIZE_API_TOKEN;
if (!token) {
  throw new Error(
    "PROXIDIZE_API_TOKEN is required. Get yours from the Proxidize dashboard: Settings > API Token"
  );
}

export const config = {
  token,
  baseUrl:
    process.env.PROXIDIZE_BASE_URL || "https://api.proxidize.com/api/v1",
  proxyHost: process.env.PROXIDIZE_PROXY_HOST || "pg.proxi.es",
  timeout: parseInt(process.env.PROXIDIZE_TIMEOUT || "30000", 10),
  maxRetries: Math.min(
    parseInt(process.env.PROXIDIZE_MAX_RETRIES || "2", 10),
    5
  ),
} as const;
