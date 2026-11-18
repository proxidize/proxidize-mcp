import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

// The local (npx) server must expose exactly what it exposed before the hosted
// server was added: same tools, schemas, descriptions, annotations, server info
// and instructions. The fixture is the output of a fresh `npm install @proxidize/mcp@0.1.13`
// (resolving SDK 1.32.2, zod 4.6.7, axios 1.21.1), i.e. what npx users run. Re-capture it
// from the published package whenever a release intentionally changes the tool surface.
test("stdio server output is identical to the pre-hosting baseline", () => {
  const now = JSON.parse(execFileSync("node", ["test/snapshot-stdio-tools.mjs"], { encoding: "utf8" }));
  const baseline = JSON.parse(readFileSync("test/fixtures/stdio-tools.json", "utf8"));
  assert.deepEqual(now, baseline);
});
