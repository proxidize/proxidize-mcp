import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

// The local (npx) server must expose exactly what it exposed before the hosted
// server was added: same tools, schemas, descriptions, annotations, server info
// and instructions. The fixture was captured from main @ e75ad85 (0.1.11).
test("stdio server output is identical to the pre-hosting baseline", () => {
  const now = JSON.parse(execFileSync("node", ["test/snapshot-stdio-tools.mjs"], { encoding: "utf8" }));
  const baseline = JSON.parse(readFileSync("test/fixtures/stdio-tools.json", "utf8"));
  assert.deepEqual(now, baseline);
});
