const rawToken = process.env.PROXIDIZE_API_TOKEN;
if (!rawToken) {
  throw new Error(
    "PROXIDIZE_API_TOKEN is required. Get yours from the Proxidize dashboard: Settings > API Token"
  );
}

const token = rawToken.trim().replace(/^bearer\s+/i, "");
if (/\s/.test(token)) {
  throw new Error(
    "PROXIDIZE_API_TOKEN contains whitespace or a newline — check for stray quotes or formatting issues when it was copied into your MCP config."
  );
}

const DEFAULT_BASE_URL = "https://api.proxidize.com/api/v1";
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function resolveBaseUrl(): string {
  const override = process.env.PROXIDIZE_BASE_URL;
  if (!override) return DEFAULT_BASE_URL;

  let parsed: URL;
  try {
    parsed = new URL(override);
  } catch {
    throw new Error(`PROXIDIZE_BASE_URL is not a valid URL: ${override}`);
  }

  const isProxidizeDomain =
    parsed.protocol === "https:" &&
    (parsed.hostname === "proxidize.com" ||
      parsed.hostname.endsWith(".proxidize.com"));
  const isLoopback = LOOPBACK_HOSTNAMES.has(parsed.hostname);

  if (!isProxidizeDomain && !isLoopback) {
    throw new Error(
      `PROXIDIZE_BASE_URL must be an HTTPS *.proxidize.com URL (or a loopback address for local testing); the API token is never sent elsewhere. Got: ${override}`
    );
  }

  return override;
}

export const config = {
  token,
  baseUrl: resolveBaseUrl(),
  proxyHost: process.env.PROXIDIZE_PROXY_HOST || "pg.proxi.es",
  timeout: parseInt(process.env.PROXIDIZE_TIMEOUT || "30000", 10),
  maxRetries: Math.min(
    parseInt(process.env.PROXIDIZE_MAX_RETRIES || "2", 10),
    5
  ),
} as const;
