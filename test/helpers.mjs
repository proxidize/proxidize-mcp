import { createServer } from "node:http";

export function subscription(typeName, username, extra = {}) {
  return {
    id: `${typeName}-id`,
    status: "active",
    from_date: "2026-01-01T00:00:00Z",
    to_date: "2027-01-01T00:00:00Z",
    subscription_type_name: typeName,
    modem_count: 0,
    meta_data: { username },
    ...extra,
  };
}

export const allPlans = {
  per_proxy: [subscription("per_proxy_mobile", "per-proxy-user", { modem_count: 1 })],
  per_gb: [subscription("per_gb_mobile", "mobile-user")],
  residential_per_gb: [subscription("per_gb_residential", "residential-user")],
};

/**
 * Fake Proxidize API. `plansFor(authHeader)` decides which plans a caller has,
 * so tests can give two users different accounts. Records every request.
 */
export async function startFakeApi({ plansFor = () => allPlans, delayMs = 0 } = {}) {
  const requests = [];
  const api = createServer(async (request, response) => {
    if (delayMs) await new Promise((r) => setTimeout(r, Math.random() * delayMs));
    const url = new URL(request.url ?? "/", "http://localhost");
    requests.push({ method: request.method, path: url.pathname, query: url.search, auth: request.headers.authorization });
    if (request.method === "GET" && url.pathname === "/subscription") {
      const data = (plansFor(request.headers.authorization) ?? {})[url.searchParams.get("type")] ?? [];
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ page: 1, perPage: 20, total: data.length, data }));
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    // Echo the caller's credential so tests can check which token reached the API.
    const echo = { path: url.pathname, auth: request.headers.authorization ?? null };
    if (url.pathname.startsWith("/perproxy/proxy/")) {
      // A fresh IP each time so rotate_proxy does not wait for a change.
      echo.ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
    }
    if (url.pathname.endsWith("/user-info")) {
      // Valid per-GB user shape so tools with an outputSchema accept it.
      Object.assign(echo, {
        id: 1, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
        username: "u", password: "p", enabled: true, bytes_used: 0, bytes_available: 0,
        super_user: null, is_sub_user: false, type: "mobile", byte_sum: 0,
        is_kyc_verified: true, is_crypto_payment: false,
      });
    }
    response.end(JSON.stringify(echo));
  });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${api.address().port}`,
    requests,
    close: () => new Promise((resolve, reject) => api.close((e) => (e ? reject(e) : resolve()))),
  };
}
