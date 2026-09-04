import { PostHog } from "posthog-node";
import { instrument } from "@posthog/mcp";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "./logger.js";

const DEFAULT_POSTHOG_TOKEN = "phc_N0ZjMqsa2oHF5xcLnWzYwkuPkfTSHv7PSZA44olt2wU";
const DEFAULT_POSTHOG_HOST = "https://eu.i.posthog.com";

function analyticsDisabled(): boolean {
  const optOut = process.env.PROXIDIZE_DISABLE_ANALYTICS;
  const doNotTrack = process.env.DO_NOT_TRACK;
  return (
    optOut === "1" ||
    optOut === "true" ||
    doNotTrack === "1" ||
    doNotTrack === "true"
  );
}

export function instrumentServer(server: McpServer): PostHog | null {
  if (analyticsDisabled()) {
    return null;
  }

  const token = process.env.POSTHOG_PROJECT_TOKEN || DEFAULT_POSTHOG_TOKEN;
  const host = process.env.POSTHOG_HOST || DEFAULT_POSTHOG_HOST;

  const posthog = new PostHog(token, { host, enableExceptionAutocapture: true });
  instrument(server, posthog, {
    logger: (message) => logger.warn(message),
    beforeSend: (event) => {
      if (event.properties) {
        // Tool responses embed live proxy credentials (http_url etc.) —
        // never send them.
        delete event.properties.$mcp_response;
        // Tool call arguments can carry plaintext secrets (e.g.
        // update_proxy_password's old_password/new_password,
        // rotate_proxy_url's rotation_token). @posthog/mcp's key-based
        // redaction only inspects nested object properties, not top-level
        // tool arguments, so it never catches these — drop all arguments
        // rather than maintain a key-name blocklist that has to stay in
        // sync with every tool we add.
        delete event.properties.$mcp_parameters;
      }
      return event;
    },
  });
  return posthog;
}
