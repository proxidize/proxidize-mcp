import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function subscription(typeName, username, extra = {}) {
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

const subscriptionsByLegacyType = {
  per_proxy: [subscription("per_proxy_mobile", "per-proxy-user", { modem_count: 1 })],
  per_gb: [
    subscription("per_gb_mobile", "mobile-user"),
    subscription("per_gb_residential", "residential-user"),
  ],
};
const freeFallback = [subscription("Free", undefined, { meta_data: {} })];

test("discovers tools via legacy wire filters with canonical responses", async () => {
  const requestedTypes = [];
  const authorizationHeaders = [];
  const api = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    authorizationHeaders.push(request.headers.authorization);

    if (request.method !== "GET" || url.pathname !== "/subscription") {
      response.writeHead(404).end();
      return;
    }

    const type = url.searchParams.get("type");
    requestedTypes.push(type);
    const data = subscriptionsByLegacyType[type] ?? freeFallback;

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        page: 1,
        perPage: 20,
        total: data.length,
        data,
      })
    );
  });

  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  const address = api.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    env: {
      ...process.env,
      PROXIDIZE_API_TOKEN: "test-token",
      PROXIDIZE_BASE_URL: `http://127.0.0.1:${address.port}`,
      PROXIDIZE_MAX_RETRIES: "0",
      PROXIDIZE_DISABLE_ANALYTICS: "1",
    },
  });
  const client = new Client({
    name: "canonical-subscription-test",
    version: "1.0.0",
  });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const subscriptionTool = tools.find(
      (tool) => tool.name === "get_subscription"
    );

    assert.equal(tools.length, 37);
    assert.ok(tools.some((tool) => tool.name === "get_traffic_analytics"));
    assert.ok(tools.some((tool) => tool.name === "get_top_domains"));
    assert.ok(tools.some((tool) => tool.name === "get_connection_history"));
    assert.deepEqual(requestedTypes.sort(), ["per_gb", "per_gb", "per_proxy"]);
    assert.ok(
      authorizationHeaders.every((header) => header === "Bearer test-token")
    );
    assert.deepEqual(subscriptionTool?.inputSchema.properties?.type?.enum, [
      "per_proxy_mobile",
      "per_gb_mobile",
      "per_gb_residential",
    ]);

    const allPlans = await client.callTool({
      name: "get_subscription",
      arguments: {},
    });
    assert.equal(allPlans.isError, undefined);
    assert.deepEqual(
      allPlans.structuredContent.data
        .map((sub) => sub.subscription_type_name)
        .sort(),
      ["per_gb_mobile", "per_gb_residential", "per_proxy_mobile"]
    );
    assert.equal(allPlans.structuredContent.total, 3);

    const onePlan = await client.callTool({
      name: "get_subscription",
      arguments: { type: "per_gb_residential" },
    });
    assert.deepEqual(
      onePlan.structuredContent.data.map((sub) => sub.subscription_type_name),
      ["per_gb_residential"]
    );
  } finally {
    await client.close();
    await new Promise((resolve, reject) =>
      api.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
