<div align="center">
  <img src="https://imagedelivery.net/r4caA8hJ3Ww3j8uyC_NNCA/95a9137a-43fd-48d4-7243-983f3f4a3d00/public" alt="Proxidize" height="60" />

  <h1>Proxidize MCP Server</h1>

  <p>
    <strong>Manage your mobile and residential proxies from any AI agent.</strong><br/>
    Rotate IPs, switch locations, monitor usage, tag proxies, and control access — all through natural language.
  </p>

  <p>
    <a href="https://www.npmjs.com/package/@proxidize/mcp">
      <img src="https://img.shields.io/npm/v/@proxidize/mcp?style=for-the-badge&color=blue" alt="npm version"/>
    </a>
    <a href="LICENSE">
      <img src="https://img.shields.io/badge/license-MIT-purple?style=for-the-badge" alt="License"/>
    </a>
  </p>

  <p>
    <a href="#quick-start">Quick Start</a> &bull;
    <a href="#available-tools">Tools</a> &bull;
    <a href="#configuration">Configuration</a> &bull;
    <a href="#supported-clients">Clients</a>
  </p>
</div>

---

## Overview

MCP server for the [Proxidize](https://proxidize.com) API. Gives Claude, Cursor, and other MCP clients direct access to your proxy infrastructure — no dashboard tab-switching required.

On startup it checks which Proxidize subscriptions are active on your account and registers only the relevant tools. Per Proxy plan gets proxy management tools, Per GB gets usage and access point tools, and so on.

---

## Quick Start

Requires [Node.js](https://nodejs.org) 18 or later.

### Claude Code

Pick one scope and run its command.

**Local** (default) — this project only, private to you:

```bash
claude mcp add proxidize -e PROXIDIZE_API_TOKEN=YOUR_API_TOKEN -- npx -y @proxidize/mcp
```

**User** — all your projects, private to you:

```bash
claude mcp add proxidize --scope user -e PROXIDIZE_API_TOKEN=YOUR_API_TOKEN -- npx -y @proxidize/mcp
```

**Project** — shared with your team via `.mcp.json`. Set `PROXIDIZE_API_TOKEN` in your environment and reference it with `${VAR}` expansion so the token stays out of version control:

```bash
claude mcp add --scope project proxidize -- npx -y @proxidize/mcp
```

Run `/mcp` inside Claude Code to verify the connection.

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "proxidize": {
      "command": "npx",
      "args": ["-y", "@proxidize/mcp"],
      "env": {
        "PROXIDIZE_API_TOKEN": "YOUR_API_TOKEN"
      }
    }
  }
}
```

### Cursor / Windsurf / VS Code

Add to `.mcp.json` or your IDE's MCP config:

```json
{
  "mcpServers": {
    "proxidize": {
      "command": "npx",
      "args": ["-y", "@proxidize/mcp"],
      "env": {
        "PROXIDIZE_API_TOKEN": "YOUR_API_TOKEN"
      }
    }
  }
}
```

### Get your API token

1. Log in to the [Proxidize Dashboard](https://app.proxidize.com)
2. Click the avatar dropdown → **Settings**
3. Copy your API token

---

## Available Tools

### Account

| Tool | Description |
|------|-------------|
| `get_subscription` | List active subscriptions, optionally filtered to one plan type |
| `get_outbound_ip` | Get the public IP of the machine running this MCP server (for IP whitelisting) |

### Per Proxy (Dedicated Mobile Proxies)

| Tool | Description |
|------|-------------|
| `list_proxies` | List all proxies with IPs, ready-to-use connection URLs, speeds, usage, and tags |
| `get_proxy` | Get details of a single proxy by session ID |
| `rotate_proxy` | Rotate a proxy's IP and get the old and new IP back, optionally locked to a city or carrier |
| `rotate_proxy_url` | Rotate a proxy using its rotation token |
| `set_rotation_interval` | Set auto-rotation (60s to 7 days) or disable with -1 |
| `update_proxy_password` | Change the password for all proxies |
| `list_proxy_locations` | List available U.S. cities with average speeds |
| `list_proxy_carriers` | List available mobile carriers, filterable by location |
| `create_ip_whitelist` | Whitelist source IPs for proxy access |
| `list_tags` | List all proxy tags |
| `create_tag` | Create a new tag |
| `delete_tag` | Delete a tag (unassigns from all proxies) |
| `tag_proxy` | Assign a tag to a proxy session |
| `untag_proxy` | Remove a tag from a proxy session |

### Per GB Mobile Proxies

Prefixed with `mobile_`. Only registered if you have an active Per GB mobile subscription.

| Tool | Description |
|------|-------------|
| `mobile_get_usage` | Data balance — bytes used and available |
| `mobile_list_locations` | Available cities with speeds, filterable by carrier, country, or state |
| `mobile_list_carriers` | Available carriers, filterable by country |
| `mobile_get_settings` | Access point proxy settings |
| `mobile_list_access_points` | List sub-users sharing your data pool |
| `mobile_create_access_point` | Create a new sub-user |
| `mobile_create_ip_whitelist` | Whitelist IPs with location/carrier/protocol options |
| `mobile_update_ip_whitelist` | Update an existing whitelist entry |
| `mobile_update_settings` | Update access point routing (city, carrier, protocol) |

### Analytics

Registered when at least one plan is active. Backed by the Proxidize analytics service; the query surface may evolve.

| Tool | Description |
|------|-------------|
| `get_traffic_analytics` | Bandwidth and request/failure counts over time, per proxy session or access point |
| `get_top_domains` | Top destination domains ranked by data volume and by request count |
| `get_connection_history` | Per-request log: URL, method, status, duration, bytes, source IP, upstream geo, errors |

### Per GB Residential Proxies

Same as mobile, prefixed with `residential_`. Only registered with an active residential subscription.

| Tool | Description |
|------|-------------|
| `residential_get_usage` | Residential data balance |
| `residential_list_locations` | Available residential locations, filterable by carrier, country, or state |
| `residential_list_carriers` | Available residential carriers, filterable by country |
| `residential_get_settings` | Access point settings |
| `residential_list_access_points` | List residential sub-users |
| `residential_create_access_point` | Create a residential sub-user |
| `residential_create_ip_whitelist` | Whitelist IPs for residential proxies |
| `residential_update_ip_whitelist` | Update a residential whitelist entry |
| `residential_update_settings` | Update access point routing (city, carrier, protocol) |

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PROXIDIZE_API_TOKEN` | Yes | — | Your Proxidize API token |
| `PROXIDIZE_BASE_URL` | No | `https://api.proxidize.com/api/v1` | API base URL |
| `PROXIDIZE_PROXY_HOST` | No | `pg.proxi.es` | Proxy gateway host used in connection URLs |
| `PROXIDIZE_TIMEOUT` | No | `30000` | Request timeout in milliseconds |
| `PROXIDIZE_MAX_RETRIES` | No | `2` | Max retries on server errors (0-5) |
| `PROXIDIZE_DISABLE_ANALYTICS` | No | — | Set to `1` to disable anonymous usage analytics (`DO_NOT_TRACK=1` also works) |

### Tool discovery

On startup the server queries the subscription API to discover your active plans. Tools are registered per plan:

- **`per_proxy_mobile`** → 14 proxy management tools
- **`per_gb_mobile`** → 9 mobile tools
- **`per_gb_residential`** → 9 residential tools
- **Any active plan** → 3 analytics tools
- **Always loaded** → `get_subscription`, `get_outbound_ip`

No subscription, no subscription-specific tools. Nothing is exposed that your account can't use.

### Usage analytics

The server collects anonymous usage analytics (which tools are called, latency, and error rates) via [PostHog](https://posthog.com) to help us improve it. Tool responses and tool call arguments are never sent — only the tool name, timing, and success/failure. Opt out at any time by setting `PROXIDIZE_DISABLE_ANALYTICS=1` (or the standard `DO_NOT_TRACK=1`) in the server's environment.

---

## Supported Clients

Works with any MCP-compatible client:

- [Claude Code](https://code.claude.com) (CLI, Desktop, Web)
- [Claude Desktop](https://claude.ai/download)
- [Cursor](https://cursor.sh)
- [Windsurf](https://windsurf.com)
- [VS Code](https://code.visualstudio.com) (with MCP extension)

---

## Troubleshooting

### "PROXIDIZE_API_TOKEN is required"

Set the environment variable in your MCP server config. See [Quick Start](#quick-start).

### Server connects but only shows `get_subscription` and `get_outbound_ip`

Subscription discovery failed or found no active plans. Check that your API token is valid (regenerate it from the Proxidize dashboard under Settings) and that your account has an active subscription.

### Tools return "HTTP 401: Invalid token"

Double-check the token hasn't been regenerated since you configured the server.

### Timeout errors

Increase the timeout: set `PROXIDIZE_TIMEOUT` to `60000` in your env config.

---

## Development

To run from source instead of npm:

```bash
git clone https://github.com/proxidize/proxidize-mcp.git
cd proxidize-mcp
npm install
npm run build
```

Then point your MCP client at the build output — e.g. `claude mcp add proxidize -e PROXIDIZE_API_TOKEN=YOUR_API_TOKEN -- node /path/to/proxidize-mcp/dist/index.js`.

Run the test suite with `npm test` (no credentials needed — it boots the server against a mock API).

---

## License

MIT
