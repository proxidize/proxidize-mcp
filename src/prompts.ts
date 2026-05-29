import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

interface Subscriptions {
  perProxyUser: string | null;
  perGbUser: string | null;
  resiUser: string | null;
}

export function registerPrompts(server: McpServer, subs: Subscriptions) {
  const hasPerProxy = !!subs.perProxyUser;
  const hasMobile = !!subs.perGbUser;
  const hasResidential = !!subs.resiUser;

  server.registerPrompt(
    "scraping-strategy",
    {
      title: "Scraping Strategy",
      description: "Decide which Proxidize tool to use for a web scraping or browser automation task",
    },
    () => {
      const lines: string[] = [
        "# Proxidize Web Scraping Strategy",
        "",
        "Follow this decision tree before choosing a scraping tool:",
        "",
        "## Step 1: Does the target require JavaScript execution?",
        "",
        "Requires JS: React/Vue/Angular SPAs, Google Search (no server-rendered results since ~2025), pages protected by Cloudflare or DataDome.",
        "",
      ];

      if (hasPerProxy) {
        lines.push(
          "**YES → Use browser tools**",
          "",
          "One-time IP whitelist setup required (SOCKS5 does not support username/password auth):",
          "1. Call `get_outbound_ip` to get your machine's public IP",
          "2. Call `create_ip_whitelist` with that IP",
          "",
          "Then navigate and extract:",
          "- `browser_navigate` — load the page",
          "- `browser_get_text` — clean text content",
          "- `browser_snapshot` — structured list of interactive elements with refs",
          "- `browser_screenshot` — visual verification",
          "- `browser_click` / `browser_type` / `browser_fill_form` — interact with the page",
          ""
        );
      } else {
        lines.push(
          "**YES → Browser tools require a per-proxy subscription (not active on this account)**",
          ""
        );
      }

      lines.push("**NO → Continue to Step 2**", "");

      lines.push("## Step 2: What output format do you need?", "");

      if (hasPerProxy) {
        lines.push(
          "- **Readable text with links preserved** → `scrape_url` (returns Markdown)",
          "- **Raw HTML for custom parsing** → `scrape_html`",
          "",
          "Both use an HTTP proxy with auth — no IP whitelisting required.",
          ""
        );
      } else {
        lines.push(
          "HTTP scraping tools (`scrape_url`, `scrape_html`) require a per-proxy subscription (not active).",
          ""
        );
      }

      lines.push(
        "## Rules to remember",
        "",
        "- Google Search **always** requires browser automation — HTTP scraping returns a JS shell with zero results",
        "- Browser tools use SOCKS5 (tunnels raw TCP, preserves TLS fingerprint); HTTP proxy re-encrypts TLS and can trigger Google blocks",
        "- Browser tools are slower but bypass most bot detection; HTTP scraping is faster for static content"
      );

      return {
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: lines.join("\n") },
          },
        ],
      };
    }
  );

  server.registerPrompt(
    "proxy-selection",
    {
      title: "Proxy Selection",
      description: "Decide which Proxidize proxy product to use for a given task",
    },
    () => {
      const lines: string[] = [
        "# Proxidize Proxy Selection Guide",
        "",
        "Choose the right product based on what your task needs:",
        "",
      ];

      if (hasPerProxy) {
        lines.push(
          "## Per-Proxy — Dedicated Mobile Proxies",
          "",
          "Best for:",
          "- Fixed proxy URLs (external tools, scripts, or apps that need a stable address)",
          "- Browser automation via SOCKS5 (use `socks_port` field, not `http_port`)",
          "- Long sessions that need the same IP throughout",
          "- All scraping and browser tools built into this MCP",
          "",
          "Key tools: `list_proxies`, `get_proxy`, `rotate_proxy`, `set_rotation_interval`, `create_ip_whitelist`, `tag_proxy`",
          "",
          "Credential format: use the `proxy` field (`username-s-sessionId:password`), not the bare `username` field",
          ""
        );
      }

      if (hasMobile) {
        lines.push(
          "## Per-GB Mobile",
          "",
          "Best for:",
          "- Pay-as-you-go (billed per GB, not per proxy)",
          "- Location-specific targeting by country or city",
          "- Burst traffic without managing individual proxies",
          "- Mobile carrier IPs (appears as a device on LTE/5G)",
          "",
          "Key tools: `mobile_create_access_point`, `mobile_get_usage`, `mobile_list_locations`, `mobile_list_carriers`, `mobile_update_settings`",
          ""
        );
      }

      if (hasResidential) {
        lines.push(
          "## Per-GB Residential",
          "",
          "Best for:",
          "- Sites that block mobile carrier IPs",
          "- Appearing as a home ISP user",
          "- Location-specific residential IPs",
          "",
          "Key tools: `residential_create_access_point`, `residential_get_usage`, `residential_list_locations`, `residential_list_carriers`",
          "",
          "Note: country/state filters are applied client-side — the API ignores server-side filter params",
          ""
        );
      }

      if (!hasPerProxy && !hasMobile && !hasResidential) {
        lines.push(
          "⚠ No active subscriptions detected.",
          "",
          "Call `get_subscription` with `type: \"per_proxy\"` or `type: \"per_gb\"` to check what plans are on this account.",
          "Verify `PROXIDIZE_API_TOKEN` is set correctly if subscriptions are missing."
        );
      } else {
        lines.push(
          "## Need to share proxy access with an external tool?",
          "",
          "Create a dedicated access point — this generates a standalone proxy endpoint with its own credentials:",
          hasMobile ? "- Mobile: `mobile_create_access_point`" : "",
          hasResidential ? "- Residential: `residential_create_access_point`" : ""
        );
      }

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: lines.filter((l) => l !== "").join("\n"),
            },
          },
        ],
      };
    }
  );
}
