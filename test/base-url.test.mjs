import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function runServer(baseUrl) {
  return spawnSync("node", ["dist/index.js"], {
    env: {
      ...process.env,
      PROXIDIZE_API_TOKEN: "test-token",
      PROXIDIZE_BASE_URL: baseUrl,
      PROXIDIZE_DISABLE_ANALYTICS: "1",
    },
    encoding: "utf8",
    timeout: 5000,
  });
}

test("rejects PROXIDIZE_BASE_URL pointing at an attacker-controlled host", () => {
  const result = runServer("http://attacker.example.com");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PROXIDIZE_BASE_URL must be an HTTPS \*\.proxidize\.com URL/);
});

test("rejects a non-HTTPS override even under the proxidize.com domain", () => {
  const result = runServer("http://api.proxidize.com/api/v1");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PROXIDIZE_BASE_URL must be an HTTPS \*\.proxidize\.com URL/);
});

test("rejects a lookalike hostname", () => {
  const result = runServer("https://proxidize.com.attacker.example.com");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PROXIDIZE_BASE_URL must be an HTTPS \*\.proxidize\.com URL/);
});

test("rejects an invalid URL", () => {
  const result = runServer("not-a-url");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PROXIDIZE_BASE_URL is not a valid URL/);
});
