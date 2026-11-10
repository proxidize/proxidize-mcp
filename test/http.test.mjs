import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { after, before, test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

import { allPlans, startFakeApi, subscription } from "./helpers.mjs";

const API_AUDIENCE = "https://api.example.test/";
const CLIENT_ID = "mcp-client-id";
const CLIENT_SECRET = "mcp-client-secret";

let api, idp, app, mcpUrl, publicOrigin, resource, issuer, signingKey, otherKey;
const exchanges = [];
const refuseExchangeFor = new Set();

// Two customers with different plans.
const plansByApiToken = {
  "Bearer api-user-a": allPlans,
  "Bearer api-user-b": {
    per_proxy: [subscription("per_proxy_mobile", "b-proxy-user", { modem_count: 1 })],
    per_gb: [subscription("per_gb_mobile", "b-mobile-user")],
  },
};

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

function token({ sub = "auth0|user-a", aud = resource, iss = issuer, key = signingKey, exp = "10m" } = {}) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: key === signingKey ? "test-key" : "other-key" })
    .setSubject(sub)
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key.privateKey);
}

async function connect(bearer) {
  const client = new Client({ name: "http-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  await client.connect(transport);
  return client;
}

before(async () => {
  signingKey = await generateKeyPair("RS256");
  otherKey = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(signingKey.publicKey)), kid: "test-key", alg: "RS256", use: "sig" };

  // Fake Auth0: JWKS + RFC 8693 token exchange.
  idp = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/.well-known/jwks.json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    if (url.pathname === "/oauth/token" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const form = Object.fromEntries(new URLSearchParams(body));
      exchanges.push(form);
      const payload = JSON.parse(Buffer.from(form.subject_token.split(".")[1], "base64url"));
      if (refuseExchangeFor.has(payload.sub)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_grant" }));
        return;
      }
      const user = payload.sub === "auth0|user-b" ? "user-b" : "user-a";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ access_token: `api-${user}`, expires_in: 3600, token_type: "Bearer" }));
      return;
    }
    res.writeHead(404).end();
  });
  issuer = `http://127.0.0.1:${await listen(idp)}/`;

  api = await startFakeApi({ plansFor: (auth) => plansByApiToken[auth], delayMs: 20 });

  process.env.PROXIDIZE_BASE_URL = api.url;
  process.env.PROXIDIZE_MAX_RETRIES = "0";
  process.env.PROXIDIZE_DISABLE_ANALYTICS = "1";
  delete process.env.PROXIDIZE_API_TOKEN;

  const { createHttpApp } = await import("../dist/http.js");
  const placeholder = createServer();
  const port = await listen(placeholder);
  await new Promise((r) => placeholder.close(r));

  publicOrigin = `http://localhost:${port}`;
  resource = `${publicOrigin}/mcp`;
  const cfg = {
    host: "127.0.0.1",
    port,
    publicUrl: new URL(publicOrigin),
    resource,
    resourceMetadataUrl: `${publicOrigin}/.well-known/oauth-protected-resource/mcp`,
    allowedHosts: ["localhost", "127.0.0.1"],
    auth: { issuer, resource, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, apiAudience: API_AUDIENCE },
  };
  const express = createHttpApp(cfg);
  app = await new Promise((resolve) => {
    const s = express.listen(port, "127.0.0.1", () => resolve(s));
  });
  mcpUrl = `${publicOrigin}/mcp`;
});

after(async () => {
  await new Promise((r) => app.close(r));
  await new Promise((r) => idp.close(r));
  await api.close();
});

test("serves protected resource metadata pointing at the issuer", async () => {
  for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
    const res = await fetch(`${publicOrigin}${path}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.resource, resource);
    assert.deepEqual(body.authorization_servers, [issuer]);
  }
});

test("no token: 401 with a resource_metadata challenge", async () => {
  const res = await fetch(mcpUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "unauthorized");
  assert.match(res.headers.get("www-authenticate"), /^Bearer resource_metadata="http:\/\/localhost:\d+\/\.well-known\/oauth-protected-resource\/mcp"/);
});

test("rejects tokens not issued for this server", async () => {
  const cases = {
    "API-audience token (passthrough attempt)": await token({ aud: API_AUDIENCE }),
    "wrong issuer": await token({ iss: "https://evil.example/" }),
    "expired": await token({ exp: Math.floor(Date.now() / 1000) - 120 }),
    "signed by another key": await token({ key: otherKey }),
    "not a JWT": "api-user-a",
  };
  const before = exchanges.length;
  for (const [name, bad] of Object.entries(cases)) {
    const res = await fetch(mcpUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${bad}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    assert.equal(res.status, 401, name);
    assert.match(res.headers.get("www-authenticate"), /error="invalid_token"/, name);
  }
  assert.equal(exchanges.length, before, "no rejected token may reach the token exchange");
});

test("valid user: hosted tool list = stdio list minus get_outbound_ip; API sees only the exchanged token", async () => {
  const userToken = await token();
  const client = await connect(userToken);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 37);
    assert.ok(!tools.some((t) => t.name === "get_outbound_ip"));
    assert.ok(tools.some((t) => t.name === "list_proxies"));
    assert.doesNotMatch(client.getInstructions(), /get_outbound_ip/);

    const result = await client.callTool({ name: "get_subscription", arguments: {} });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.total, 3);
  } finally {
    await client.close();
  }
  assert.ok(api.requests.length > 0);
  for (const r of api.requests) {
    assert.notEqual(r.auth, `Bearer ${userToken}`, "the user's MCP token must never reach the API");
  }

  const ex = exchanges.find((e) => e.subject_token === userToken);
  assert.ok(ex, "token was exchanged");
  assert.equal(ex.grant_type, "urn:ietf:params:oauth:grant-type:token-exchange");
  assert.equal(ex.subject_token_type, "urn:ietf:params:oauth:token-type:access_token");
  assert.equal(ex.requested_token_type, "urn:ietf:params:oauth:token-type:access_token");
  assert.equal(ex.audience, API_AUDIENCE);
  assert.equal(ex.client_id, CLIENT_ID);
  assert.equal(ex.client_secret, CLIENT_SECRET);
  assert.equal(exchanges.filter((e) => e.subject_token === userToken).length, 1, "exchange result is cached");
});

test("two users at once: each request reaches the API with its own user's token only", async () => {
  const a = await connect(await token({ sub: "auth0|user-a" }));
  const b = await connect(await token({ sub: "auth0|user-b" }));
  const owner = { "per-proxy-user": "Bearer api-user-a", "b-proxy-user": "Bearer api-user-b" };
  const from = api.requests.length;
  try {
    const bTools = (await b.listTools()).tools.map((t) => t.name);
    assert.ok(!bTools.includes("residential_get_usage"), "user B has no residential plan");
    assert.ok(bTools.includes("rotate_proxy"));

    // rotate_proxy makes several API calls with network waits in between
    // (read IP, rotate, read IP again), so a token shared across requests
    // would show up as one user's call carrying the other user's token.
    const calls = [];
    for (let i = 0; i < 15; i++) {
      calls.push(a.callTool({ name: "rotate_proxy", arguments: { session_id: `a${i}` } }));
      calls.push(b.callTool({ name: "rotate_proxy", arguments: { session_id: `b${i}` } }));
      calls.push(a.callTool({ name: "mobile_get_usage", arguments: {} }).then((r) => ["a", r]));
      calls.push(b.callTool({ name: "mobile_get_usage", arguments: {} }).then((r) => ["b", r]));
    }
    for (const out of await Promise.all(calls)) {
      if (!Array.isArray(out)) continue;
      const [who, r] = out;
      assert.equal(r.isError, undefined, JSON.stringify(r.content));
      assert.equal(r.structuredContent.auth, `Bearer api-user-${who}`, `user ${who} got another user's token`);
    }
  } finally {
    await a.close();
    await b.close();
  }

  const proxyCalls = api.requests.slice(from).filter((r) => r.path.startsWith("/perproxy/proxy/"));
  assert.ok(proxyCalls.length >= 60, `expected many per-proxy reads, got ${proxyCalls.length}`);
  for (const r of proxyCalls) {
    const username = r.path.split("/")[3];
    assert.equal(r.auth, owner[username], `${r.path} was called with another user's token`);
  }
  const rotations = api.requests.slice(from).filter((r) => r.path === "/perproxy/rotate");
  assert.equal(rotations.length, 30);
});

test("Auth0 refusing the exchange asks the client to sign in again", async () => {
  refuseExchangeFor.add("auth0|user-c");
  const res = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await token({ sub: "auth0|user-c" })}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(res.status, 401);
  assert.match(res.headers.get("www-authenticate"), /error="invalid_token"/);
});

test("unknown Host header is refused", async () => {
  const port = new URL(publicOrigin).port;
  const status = await new Promise((resolve, reject) => {
    const r = request({ host: "127.0.0.1", port, path: "/healthz", headers: { Host: "evil.example" } }, (resp) => {
      resp.resume();
      resolve(resp.statusCode);
    });
    r.on("error", reject);
    r.end();
  });
  assert.equal(status, 403);
});

test("GET /mcp is 405 and a malformed body is a JSON 400 with no stack trace", async () => {
  const get = await fetch(mcpUrl, { headers: { Authorization: `Bearer ${await token()}` } });
  assert.equal(get.status, 405);

  const bad = await fetch(mcpUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: "{not json",
  });
  assert.equal(bad.status, 400);
  const text = await bad.text();
  assert.doesNotMatch(text, /at .*\.js|node_modules/);
  assert.equal(JSON.parse(text).error.message, "Parse error");
});
