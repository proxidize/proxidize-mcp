import { PostHog } from "posthog-node";
import { instrument } from "@posthog/mcp";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "./logger.js";

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

  const token = process.env.POSTHOG_PROJECT_TOKEN;
  const host = process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com";

  if (!token) {
    if (process.env.NODE_ENV !== "production") {
      logger.warn(
        "POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, " +
          "this causes events to be silently missed. " +
          "This error stops appearing once POSTHOG_PROJECT_TOKEN is configured"
      );
    }
    return null;
  }

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
