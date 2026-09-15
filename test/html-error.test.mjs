import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const CLOUDFLARE_BLOCK_PAGE = `<!DOCTYPE html>
<html><head><title>Attention Required! | Cloudflare</title></head>
<body><h1>Sorry, you have been blocked</h1></body></html>`;

test("surfaces a concise message when the API host returns an HTML error page", async () => {
  const api = createServer((request, response) => {
    response.writeHead(403, { "Content-Type": "text/html" });
    response.end(CLOUDFLARE_BLOCK_PAGE);
  });

  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  const address = api.address();

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
  const client = new Client({ name: "html-error-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: "get_subscription",
      arguments: {},
    });

    assert.equal(result.isError, true);
    const text = result.content?.[0]?.text ?? "";
    assert.match(text, /HTTP 403: blocked by Cloudflare/);
    assert.doesNotMatch(text, /<!DOCTYPE html>/i);
    assert.ok(text.length < 300, `expected a concise error, got ${text.length} chars`);
  } finally {
    await client.close();
    await new Promise((resolve, reject) =>
      api.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
