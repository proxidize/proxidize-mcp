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
      }
      return event;
    },
  });
  return posthog;
}
