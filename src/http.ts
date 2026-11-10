#!/usr/bin/env node

// Hosted server: `node dist/http.js`. Serves MCP over Streamable HTTP at
// <MCP_PUBLIC_URL>/mcp for ChatGPT, Claude, Cursor and other remote clients,
// with each user signed in through Auth0. Runs behind a TLS reverse proxy and
// binds to loopback by default. The local npm server (index.ts) is unaffected.

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { Request, Response, NextFunction } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AuthError, createAuth, hashToken, type VerifiedToken } from "./auth.js";
import { runWithToken, setMode } from "./context.js";
import { logger } from "./logger.js";
import { shutdownTelemetry } from "./telemetry.js";
import { buildServer, discoverPlans, type Plans } from "./server.js";

const PLANS_TTL_MS = 5 * 60 * 1000;
const PLANS_CACHE_MAX = 10_000;
const EMPTY_PLANS_TTL_MS = 30 * 1000;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the hosted server`);
  return value;
}

function httpsUrl(name: string, value: string, opts: { trailingSlash?: boolean } = {}): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} is not a valid URL: ${value}`);
  }
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error(`${name} must be an https URL: ${value}`);
  }
  if (opts.trailingSlash && !value.endsWith("/")) {
    throw new Error(`${name} must end with "/" (it is used as a base URL): ${value}`);
  }
  return url;
}

export function loadHttpConfig() {
  const publicUrl = httpsUrl("MCP_PUBLIC_URL", required("MCP_PUBLIC_URL").replace(/\/+$/, ""));
  const resource = `${publicUrl.origin}/mcp`;
  const issuer = required("AUTH0_ISSUER");
  httpsUrl("AUTH0_ISSUER", issuer, { trailingSlash: true });
  return {
    host: process.env.MCP_HOST || "127.0.0.1",
    port: parseInt(process.env.MCP_PORT || "8096", 10),
    publicUrl,
    resource,
    resourceMetadataUrl: `${publicUrl.origin}/.well-known/oauth-protected-resource/mcp`,
    allowedHosts: [publicUrl.hostname, "localhost", "127.0.0.1"],
    auth: {
      issuer,
      resource,
      clientId: required("MCP_AUTH0_CLIENT_ID"),
      clientSecret: required("MCP_AUTH0_CLIENT_SECRET"),
      apiAudience: required("PROXIDIZE_API_AUDIENCE"),
      exchangeScope: process.env.MCP_AUTH0_EXCHANGE_SCOPE?.trim() || undefined,
    },
  };
}

type HttpConfig = ReturnType<typeof loadHttpConfig>;

export function createHttpApp(cfg: HttpConfig, deps: { fetchImpl?: typeof fetch } = {}) {
  setMode("http");
  const auth = createAuth(cfg.auth, deps.fetchImpl);
  const plansCache = new Map<string, { plans: Plans; expiresAt: number }>();

  async function plansFor(sub: string): Promise<Plans> {
    const now = Date.now();
    const hit = plansCache.get(sub);
    if (hit && hit.expiresAt > now) return hit.plans;
    const plans = await discoverPlans();
    // Discovery swallows API errors and returns "no plan", so an empty result
    // may be a blip: keep it briefly rather than hiding tools for 5 minutes.
    const empty = !plans.perProxyUser && !plans.perGbUser && !plans.resiUser;
    if (plansCache.size >= PLANS_CACHE_MAX) plansCache.clear();
    plansCache.set(sub, { plans, expiresAt: now + (empty ? EMPTY_PLANS_TTL_MS : PLANS_TTL_MS) });
    return plans;
  }

  const app = createMcpExpressApp({ host: cfg.host, allowedHosts: cfg.allowedHosts });
  app.disable("x-powered-by");

  // RFC 9728 protected resource metadata: tells clients which authorization
  // server issues tokens for this resource. Served at both the path-suffixed
  // and the root well-known URL, since clients try either.
  const prm = {
    resource: cfg.resource,
    authorization_servers: [cfg.auth.issuer],
    bearer_methods_supported: ["header"],
    resource_name: "Proxidize",
    resource_documentation: "https://github.com/proxidize/proxidize-mcp",
  };
  app.get(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"], (_req, res) => {
    res.json(prm);
  });

  app.get("/healthz", (_req, res) => {
    res.type("text/plain").send("ok");
  });

  function challenge(res: Response, status: 401 | 500, error?: string, description?: string) {
    if (status === 401) {
      const parts = [`resource_metadata="${cfg.resourceMetadataUrl}"`];
      if (error) parts.push(`error="${error}"`);
      if (description) parts.push(`error_description="${description}"`);
      res.set("WWW-Authenticate", `Bearer ${parts.join(", ")}`);
    }
    res.status(status).json({
      error: error ?? (status === 401 ? "unauthorized" : "server_error"),
      error_description: description,
    });
  }

  async function requireUser(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization ?? "";
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) {
      challenge(res, 401);
      return;
    }
    try {
      const verified = await auth.verifyAccessToken(match[1]);
      res.locals.user = verified;
      next();
    } catch (err) {
      if (err instanceof AuthError && err.kind === "invalid_token") {
        challenge(res, 401, "invalid_token", "The access token is invalid or expired");
      } else {
        logger.error("token verification failed", { error: String(err) });
        challenge(res, 500);
      }
    }
  }

  app.post("/mcp", requireUser, async (req: Request, res: Response) => {
    const user = res.locals.user as VerifiedToken;
    const userTag = hashToken(user.sub).slice(0, 12);

    let apiToken: string;
    try {
      apiToken = await auth.exchangeForApiToken(user);
    } catch (err) {
      if (err instanceof AuthError && err.kind === "invalid_token") {
        challenge(res, 401, "invalid_token", "Sign in to Proxidize again");
      } else {
        logger.error("token exchange failed", { user: userTag, error: String(err) });
        challenge(res, 500);
      }
      return;
    }

    await runWithToken(apiToken, async () => {
      const plans = await plansFor(user.sub);
      const { server } = buildServer(plans, "http");
      // Stateless: a fresh server + transport per request, no session ids,
      // so nothing from one user's request is kept for another's.
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        logger.error("mcp request failed", { user: userTag, error: String(err) });
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          });
        }
      }
    });
  });

  // Stateless server: no server-initiated stream and no sessions to delete.
  const notAllowed = (_req: Request, res: Response) => {
    res.status(405).set("Allow", "POST").json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  };
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);

  // Last-resort error handler (e.g. malformed JSON body). Express's default
  // handler would print a stack trace unless NODE_ENV=production.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as { status?: number })?.status;
    if (status !== 400) logger.error("unhandled error", { error: String(err) });
    if (res.headersSent) return;
    res.status(status === 400 ? 400 : 500).json({
      jsonrpc: "2.0",
      error: { code: status === 400 ? -32700 : -32603, message: status === 400 ? "Parse error" : "Internal server error" },
      id: null,
    });
  });

  return app;
}

async function main() {
  const cfg = loadHttpConfig();
  const app = createHttpApp(cfg);
  const listener = app.listen(cfg.port, cfg.host, () => {
    logger.info(`hosted MCP listening on ${cfg.host}:${cfg.port}, resource ${cfg.resource}`);
  });
  const stop = () => {
    void shutdownTelemetry();
    listener.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

// Only start listening when run directly (tests import createHttpApp).
const entry = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : "";
if (import.meta.url === entry) {
  main().catch((err) => {
    logger.error("fatal:", err);
    process.exit(1);
  });
}
