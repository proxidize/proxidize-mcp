import assert from "node:assert/strict";
import test from "node:test";

process.env.PROXIDIZE_API_TOKEN = "test-token";
const { redact, buildFeatureRequestUrl } = await import("../dist/tools/feedback.js");

test("redacts secrets and identifiers", () => {
  const input =
    "mail me at jo@example.com, ip 203.0.113.7:8080, host pg.proxi.es:1234, " +
    "token=abcd1234, http://user:pass@pg.proxi.es:9000, Bearer abc.def.ghi, " +
    "id 123e4567-e89b-12d3-a456-426614174000, key AbCdEfGhIjKlMnOpQrStUvWxYz123456";
  const out = redact(input);
  for (const leak of [
    "jo@example.com", "203.0.113.7", "proxi.es", "abcd1234", "user:pass",
    "abc.def.ghi", "123e4567", "AbCdEfGhIjKlMnOpQrStUvWxYz123456",
  ]) {
    assert.ok(!out.includes(leak), `leaked ${leak}: ${out}`);
  }
});

test("builds a GitHub new-issue link without posting anything", () => {
  const { url, body } = buildFeatureRequestUrl({
    title: "Filter connection history by status code",
    missing_capability: "get_connection_history cannot filter by HTTP status.",
    use_case: "Debugging failing requests across many domains.",
    related_tools: ["get_connection_history", "bad name!"],
  });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, "https://github.com/proxidize/proxidize-mcp/issues/new");
  assert.match(u.searchParams.get("title"), /^\[Feature request\] /);
  assert.match(body, /`get_connection_history`/);
  assert.match(body, /`badname`/);
});

test("caps URL length", () => {
  const { url } = buildFeatureRequestUrl({
    title: "Long one",
    missing_capability: "x ".repeat(5000),
    use_case: "y ".repeat(5000),
  });
  assert.ok(url.length <= 6000);
});
