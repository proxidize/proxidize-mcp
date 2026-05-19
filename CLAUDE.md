# Proxidize MCP Server

MCP server for the Proxidize API. In active development for public release — not yet published.

**This file (`CLAUDE.md`) is for internal development only. Never commit it.**

## Staging

Develop and test against staging (`https://api-staging.proxidize.com/api/v1`). Never commit staging URLs — all code and docs must reference the production URL (`https://api.proxidize.com/api/v1`).

## Architecture

- `src/index.ts` — entry point, discovers subscriptions at startup, conditionally registers tools
- `src/client.ts` — HTTP client with exponential backoff retries on 5xx
- `src/tools/` — tool definitions, split by product (account, per-proxy, per-gb)

## Rules

- Proxy Builder endpoints are DEPRECATED — do not add tools for them
- Never retry 4xx errors — only 5xx
- Tool annotations (`readOnlyHint`, `destructiveHint`, etc.) must be accurate
- Use `registerTool()` not `server.tool()` (deprecated in SDK v1.29+)

## Adding this MCP to Claude Code

Use `claude mcp add` with options **before** the server name and `--` before the command:

```
claude mcp add [--scope local|project|user] [--env KEY=VALUE ...] <name> -- <command> [args...]
```

Example:

```
claude mcp add --scope user -e PROXIDIZE_API_TOKEN=YOUR_TOKEN -e PROXIDIZE_BASE_URL=https://api-staging.proxidize.com/api/v1 proxidize -- node /path/to/proxidize-mcp/dist/index.js
```

Scopes: `local` (default, current project, private), `project` (shared via `.mcp.json`), `user` (all projects, private).

## Proxy gateway hosts

Production and staging use **different** proxy gateway hostnames:

- Production: `pg.proxi.es` (default in `config.ts`)
- Staging: `pg-staging.proxi.es` — set via `PROXIDIZE_PROXY_HOST` env var

Using the wrong host returns "invalid credentials" on every request. This is the most common cause of proxy connection failures during development.

## Browser tools — stealth setup

The browser tools use `rebrowser-playwright` (npm alias in package.json) which patches Playwright's CDP `Runtime.Enable` leak at the binary level. This is critical — without it, Cloudflare, DataDome, and Google detect automation immediately.

The browser connects via **SOCKS5** (port from `socks_port` field), not HTTP proxy. SOCKS5 tunnels raw TCP so the browser's TLS handshake reaches the target site unmodified. The HTTP proxy (port from `http_port`) terminates and re-encrypts TLS, which changes the TLS fingerprint and causes Google to silently drop the connection.

SOCKS5 in Chromium does not support authentication — it requires IP whitelisting. Before first browser tool use, call `get_outbound_ip` to get the machine's public IP, then `create_ip_whitelist` with that IP. This is a one-time setup per IP. The scraping tools still use HTTP proxy with auth via `https-proxy-agent` and need no whitelisting.

On launch, the browser probes its own UA, strips `HeadlessChrome` → `Chrome`, and injects `navigator.userAgentData` brands matching the detected version. All three are required for Google — missing any one triggers blocking.

## Proxy credential format

The API returns a `proxy` field like `username-s-sessionId:password`. Split on `:` to get user and pass. The `username` field is the bare username without the session suffix — use `proxy` field for auth, not `username`.

## API quirks

- **Residential `proxy_type` can be `null`**: Access points created without a protocol set return `null`. The Zod schema must use `.nullable()` on the enum.
- **Residential locations/carriers ignore server-side filters**: The `country` and `state` params are silently ignored. Client-side filtering is applied after fetch.
- **`total_bytes == bytes_used`** in the proxy response is a cumulative counter, NOT a bandwidth cap indicator.

## Testing

Use the `.env` file (gitignored) for staging credentials:

```
PROXIDIZE_API_TOKEN=<token>
PROXIDIZE_BASE_URL=https://api-staging.proxidize.com/api/v1
PROXIDIZE_PROXY_HOST=pg-staging.proxi.es
```

Test the MCP by calling tools through Claude Code after `claude mcp add`. The MCP server process caches the build — restart it (or switch models) to pick up new `dist/` changes.

Direct API testing with curl through the proxy:
```bash
curl -x socks5h://user-s-session:pass@pg-staging.proxi.es:20002 https://httpbin.org/ip
```

## Google Search specifically

Google requires JS execution for all search results (no server-rendered HTML since ~2025). HTTP-only scraping tools (axios, curl, Python requests) get a JS shell with zero results. Browser automation is the only path.

Google blocks headless Chromium via: TLS fingerprint (JA3/JA4), `HeadlessChrome` in UA, missing `Google Chrome` brand in `navigator.userAgentData`, and `navigator.webdriver === true`. The current browser.ts setup addresses all four.

## Reference docs

Fetch the full documentation index at `https://code.claude.com/docs/llms.txt` to discover all available pages. Key references:

- `https://code.claude.com/docs/en/mcp.md` — Claude Code MCP integration
- `https://modelcontextprotocol.io/llms.txt` — MCP protocol spec
