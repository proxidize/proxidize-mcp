// Prints the stdio server's full tool list (names, descriptions, schemas, annotations)
// as JSON, for the "stdio unchanged" regression fixture.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startFakeApi } from "./helpers.mjs";

const api = await startFakeApi();
const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env, PROXIDIZE_API_TOKEN: "test-token", PROXIDIZE_BASE_URL: api.url, PROXIDIZE_MAX_RETRIES: "0", PROXIDIZE_DISABLE_ANALYTICS: "1" },
  stderr: "ignore",
});
const client = new Client({ name: "snapshot", version: "1.0.0" });
await client.connect(transport);
const { tools } = await client.listTools();
const info = client.getServerVersion();
const instructions = client.getInstructions();
await client.close();
await api.close();
process.stdout.write(JSON.stringify({ serverInfo: info, instructions, tools }, null, 2) + "\n");
