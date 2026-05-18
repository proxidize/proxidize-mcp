<div align="center">
  <img src="https://proxidize.com/wp-content/uploads/2026/02/logo-1.svg" alt="Proxidize" height="60" />

  <h1>Proxidize MCP Server</h1>

  <p>
    <strong>Manage your mobile and residential proxies from any AI agent.</strong><br/>
    Rotate IPs, switch locations, monitor usage, tag proxies, and control access — all through natural language.
  </p>

  <p>
    <a href="https://www.npmjs.com/package/@proxidize/mcp">
      <img src="https://img.shields.io/npm/v/@proxidize/mcp?style=for-the-badge&color=blue" alt="npm version"/>
    </a>
    <a href="https://github.com/niceprogramming/proxidize-mcp/blob/main/LICENSE">
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

### Claude Code

```bash
claude mcp add -e PROXIDIZE_API_TOKEN=YOUR_API_TOKEN proxidize -- node /path/to/proxidize-mcp/dist/index.js
```

Or with JSON:

```bash
claude mcp add-json proxidize '{"type":"stdio","command":"node","args":["/path/to/proxidize-mcp/dist/index.js"],"env":{"PROXIDIZE_API_TOKEN":"YOUR_API_TOKEN"}}'
```

Run `/mcp` inside Claude Code to verify the connection.

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "proxidize": {
      "command": "node",
      "args": ["/path/to/proxidize-mcp/dist/index.js"],
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
      "command": "node",
      "args": ["/path/to/proxidize-mcp/dist/index.js"],
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
| `get_subscription` | Get active subscriptions, plan type, status, dates, and proxy username |

### Per Proxy (Dedicated Mobile Proxies)

| Tool | Description |
|------|-------------|
| `list_proxies` | List all proxies with IPs, ports, speeds, usage, and tags |
| `get_proxy` | Get details of a single proxy by session ID |
| `rotate_proxy` | Rotate a proxy's IP, optionally locked to a city or carrier |
| `rotate_proxy_url` | Rotate a proxy using its rotation token |
| `set_rotation_interval` | Set auto-rotation (60s to 7 days) or disable with -1 |
| `update_proxy_password` | Change the password for all proxies |
| `list_proxy_locations` | List available U.S. cities with average speeds |
| `list_proxy_carriers` | List carriers (T-Mobile, AT&T, Verizon), filterable by location |
| `create_ip_whitelist` | Whitelist source IPs for proxy access |
| `list_tags` | List all proxy tags |
| `create_tag` | Create a new tag |
| `delete_tag` | Delete a tag (unassigns from all proxies) |
| `tag_proxy` | Assign a tag to a proxy session |
| `untag_proxy` | Remove a tag from a proxy session |
### Scraping

Routes requests through your Proxidize proxy. Only registered with an active Per Proxy subscription.

| Tool | Description |
|------|-------------|
| `scrape_url` | Scrape a webpage through the proxy and return Markdown |
| `scrape_html` | Scrape a webpage through the proxy and return raw HTML |

### Browser Automation

Headless Chromium browser routed through your Proxidize proxy via Playwright. Use `browser_snapshot` to discover interactive elements, then interact by ref. Only registered with an active Per Proxy subscription.

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate the browser to a URL |
| `browser_snapshot` | Capture all interactive elements with refs for clicking/typing |
| `browser_click` | Click an element by its ref |
| `browser_type` | Type text into an element by its ref, optionally submit |
| `browser_fill_form` | Fill multiple form fields at once by their refs |
| `browser_screenshot` | Take a screenshot of the current page |
| `browser_get_text` | Get the text content of the current page |
| `browser_get_html` | Get the HTML content of the current page body |
| `browser_go_back` | Navigate to the previous page in browser history |
| `browser_go_forward` | Navigate to the next page in browser history |
| `browser_scroll` | Scroll the page to the bottom |
| `browser_scroll_to_ref` | Scroll to a specific element by its ref |
| `browser_wait_for` | Wait for an element to become visible by its ref |
| `browser_network_requests` | List network requests since navigating to the current page |

### Per GB Mobile Proxies

Prefixed with `mobile_`. Only registered if you have an active Per GB mobile subscription.

| Tool | Description |
|------|-------------|
| `mobile_get_usage` | Data balance — bytes used and available |
| `mobile_list_locations` | Available cities with speeds |
| `mobile_list_carriers` | Available carriers by location |
| `mobile_get_settings` | Access point proxy settings |
| `mobile_list_access_points` | List sub-users sharing your data pool |
| `mobile_create_access_point` | Create a new sub-user |
| `mobile_create_ip_whitelist` | Whitelist IPs with location/carrier/protocol options |
| `mobile_update_ip_whitelist` | Update an existing whitelist entry |
| `mobile_update_settings` | Update access point routing (city, carrier, protocol) |

### Per GB Residential Proxies

Same as mobile, prefixed with `residential_`. Only registered with an active residential subscription.

| Tool | Description |
|------|-------------|
| `residential_get_usage` | Residential data balance |
| `residential_list_locations` | Available residential locations |
| `residential_list_carriers` | Available residential carriers |
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
| `PROXIDIZE_PROXY_HOST` | No | `pg.proxi.es` | Proxy gateway hostname (used by scraping and browser tools) |
| `PROXIDIZE_TIMEOUT` | No | `30000` | Request timeout in milliseconds |
| `PROXIDIZE_MAX_RETRIES` | No | `2` | Max retries on server errors (0-5) |

### Tool discovery

On startup the server hits the subscription API to see what you have. Tools are registered per plan:

- **Per Proxy** → 29 proxy management, scraping, and browser tools
- **Per GB Mobile** → 9 mobile tools
- **Per GB Residential** → 9 residential tools
- **Always loaded** → `get_subscription`

No subscription, no tools. Nothing is exposed that your account can't use.

---

## Supported Clients

Works with any MCP-compatible client:

- [Claude Code](https://code.claude.com) (CLI, Desktop, Web)
- [Claude Desktop](https://claude.ai/download)
- [Cursor](https://cursor.sh)
- [Windsurf](https://codeium.com/windsurf)
- [VS Code](https://code.visualstudio.com) (with MCP extension)

---

## Troubleshooting

### "PROXIDIZE_API_TOKEN is required"

Set the environment variable in your MCP server config. See [Quick Start](#quick-start).

### Server connects but shows 0 tools

Your API token may be invalid or expired. Regenerate it from the Proxidize dashboard under Settings.

### Tools return "HTTP 401: Invalid token"

Double-check the token hasn't been regenerated since you configured the server.

### Timeout errors

Increase the timeout: set `PROXIDIZE_TIMEOUT` to `60000` in your env config.

---

## License

MIT
