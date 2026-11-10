/**
 * Reads and validates PROXIDIZE_API_TOKEN. Only the stdio (local) server uses
 * it; the hosted HTTP server gets a token per user from OAuth instead.
 */
export function readStdioToken(): string {
  const rawToken = process.env.PROXIDIZE_API_TOKEN;
  if (!rawToken) {
    throw new Error(
      "PROXIDIZE_API_TOKEN is required. Get yours from the Proxidize dashboard: Settings > API Token"
    );
  }

  const token = rawToken.trim().replace(/^bearer\s+/i, "");
  if (/\s/.test(token)) {
    throw new Error(
      "PROXIDIZE_API_TOKEN contains whitespace or a newline — check for stray quotes or formatting issues when it was copied into your MCP config."
    );
  }
  return token;
}
