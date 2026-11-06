import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";
import { ok } from "../result.js";

const ISSUES_NEW_URL = "https://github.com/proxidize/proxidize-mcp/issues/new";
const MAX_URL_LENGTH = 6000;

const REDACTED = "[redacted]";

/**
 * Best-effort backstop that strips anything that looks like a secret or an
 * identifier from free text. The tool description tells the agent not to include
 * such data in the first place; this catches mistakes. The user also reviews the
 * pre-filled issue before submitting it.
 */
export function redact(text: string): string {
  const proxyHost = config.proxyHost.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    text
      // credentials embedded in URLs: scheme://user:pass@host
      .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]*@[^\s]+/gi, REDACTED)
      // Authorization-style headers / bearer tokens
      .replace(/\bbearer\s+[A-Za-z0-9._~+/=-]+/gi, REDACTED)
      // key=value / key: value secrets
      .replace(
        /\b(api[_-]?key|token|secret|password|passwd|pwd|authorization|rotation[_-]?token)\b\s*[:=]\s*\S+/gi,
        `$1=${REDACTED}`
      )
      // emails
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, REDACTED)
      // IPv4 (optionally with port)
      .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?\b/g, REDACTED)
      // IPv6 (loose)
      .replace(/\b(?:[A-Fa-f0-9]{1,4}:){2,7}[A-Fa-f0-9]{1,4}\b/g, REDACTED)
      // gateway host and any host:port pointing at it
      .replace(new RegExp(`\\b[\\w.-]*${proxyHost}(?::\\d{1,5})?`, "gi"), REDACTED)
      // UUIDs
      .replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
        REDACTED
      )
      // long opaque strings (tokens, hashes, keys)
      .replace(/\b[A-Za-z0-9_-]{24,}\b/g, REDACTED)
      // username:password pairs
      .replace(/\b[\w.-]{3,}:[^\s:@]{3,}\b(?!\/\/)/g, (m) =>
        /^(https?|socks5?|ftp)$/i.test(m.split(":")[0]) ? m : REDACTED
      )
  );
}

export interface FeatureRequest {
  title: string;
  missing_capability: string;
  use_case: string;
  suggested_behavior?: string;
  related_tools?: string[];
}

export function buildFeatureRequestUrl(input: FeatureRequest): {
  url: string;
  title: string;
  body: string;
} {
  const title = redact(input.title).replace(/\s+/g, " ").trim();

  const sections = [
    `### Missing capability\n${redact(input.missing_capability).trim()}`,
    `### Use case\n${redact(input.use_case).trim()}`,
  ];
  if (input.suggested_behavior?.trim()) {
    sections.push(
      `### Suggested behavior\n${redact(input.suggested_behavior).trim()}`
    );
  }
  if (input.related_tools?.length) {
    const tools = input.related_tools
      .map((t) => t.replace(/[^\w-]/g, ""))
      .filter(Boolean)
      .map((t) => `\`${t}\``)
      .join(", ");
    if (tools) sections.push(`### Related tools\n${tools}`);
  }
  sections.push("_Drafted by an AI agent from a conversation; reviewed by the user before submitting._");

  let body = sections.join("\n\n");

  const build = (b: string) => {
    const params = new URLSearchParams({
      title: `[Feature request] ${title}`,
      body: b,
      labels: "enhancement,agent-requested",
    });
    return `${ISSUES_NEW_URL}?${params.toString()}`;
  };

  let url = build(body);
  while (url.length > MAX_URL_LENGTH && body.length > 200) {
    body = body.slice(0, Math.floor(body.length * 0.8)).trimEnd() + "…";
    url = build(body);
  }

  return { url, title, body };
}

export function registerFeedbackTools(server: McpServer) {
  server.registerTool(
    "request_feature",
    {
      title: "Request Feature",
      description:
        "Draft a GitHub feature request for something this server cannot do. Returns a pre-filled " +
        "issue link for the USER to review and submit; nothing is posted automatically.\n\n" +
        "Use ONLY when (1) the user wants something none of the available tools can do, AND " +
        "(2) you have checked the tool list and confirmed no existing tool covers it, AND " +
        "(3) the user agrees to file a request. Ask first.\n\n" +
        "Describe ONLY the missing capability, generically, based on what was asked in the conversation. " +
        "The issue is public. NEVER include anything sensitive or about the user: no names, emails, " +
        "usernames, passwords, API tokens, proxy credentials, IP addresses, hostnames, ports, account " +
        "or subscription IDs, proxy IDs, domains they visit, company names, or quotes from the conversation. " +
        "Use placeholders like <proxy> or <location> if an example is needed.",
      inputSchema: {
        title: z
          .string()
          .min(5)
          .max(100)
          .describe("Short summary of the missing feature, e.g. 'Filter connection history by status code'"),
        missing_capability: z
          .string()
          .min(10)
          .max(1000)
          .describe("What the server cannot do today. Generic; no user data."),
        use_case: z
          .string()
          .min(10)
          .max(1000)
          .describe("Why someone would want it, in general terms. No personal or account details."),
        suggested_behavior: z
          .string()
          .max(1000)
          .optional()
          .describe("Optional: how the tool/parameters could work. No real values."),
        related_tools: z
          .array(z.string().max(60))
          .max(10)
          .optional()
          .describe("Optional: names of existing tools that are close but insufficient."),
      },
      outputSchema: {
        issue_url: z.string(),
        title: z.string(),
        body: z.string(),
        instructions: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
      const { url, title, body } = buildFeatureRequestUrl(input);
      return ok({
        issue_url: url,
        title: `[Feature request] ${title}`,
        body,
        instructions:
          "Show the user the title and body above and the link. Nothing has been submitted. " +
          "They can open the link, edit anything, and click 'Submit new issue' on GitHub. " +
          "If the body contains anything sensitive or personal, do not share the link; redraft it.",
      });
    }
  );
}
