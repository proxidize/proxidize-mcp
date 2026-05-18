import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import TurndownService from "turndown";
import { JSDOM } from "jsdom";
import { get } from "../client.js";
import { ok, fail } from "../result.js";
import { config } from "../config.js";
import { outputSchemas } from "../schemas.js";
import type { Paginated } from "../schemas.js";

interface ProxyInfo {
  session_id: string;
  proxy: string;
  username: string;
  password: string;
  http_port: string;
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

turndown.remove(["script", "style", "nav", "footer", "header", "aside"]);

async function resolveProxy(
  perProxyUser: string,
  sessionId?: string
): Promise<ProxyInfo> {
  const res = await get<Paginated<ProxyInfo>>(
    `/perproxy/proxies/${perProxyUser}`,
    { page: 1, page_size: 1 }
  );
  if (!res.data.length) throw new Error("No proxies available");

  if (sessionId) {
    const match = res.data.find((p) => p.session_id === sessionId);
    if (match) return match;
    const all = await get<Paginated<ProxyInfo>>(
      `/perproxy/proxies/${perProxyUser}`,
      { page: 1, page_size: 100 }
    );
    const found = all.data.find((p) => p.session_id === sessionId);
    if (!found) throw new Error(`Proxy session ${sessionId} not found`);
    return found;
  }

  return res.data[0];
}

async function fetchThroughProxy(
  url: string,
  perProxyUser: string,
  sessionId?: string
): Promise<{ status: number; html: string }> {
  const proxy = await resolveProxy(perProxyUser, sessionId);

  const [proxyUser, proxyPass] = proxy.proxy.split(":");
  const proxyUrl = `http://${proxyUser}:${proxyPass}@${config.proxyHost}:${proxy.http_port}`;
  const agent = new HttpsProxyAgent(proxyUrl);

  const response = await axios.get(url, {
    httpAgent: agent,
    httpsAgent: agent,
    proxy: false,
    timeout: 30000,
    maxRedirects: 5,
    responseType: "text",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    validateStatus: () => true,
  });

  return { status: response.status, html: String(response.data) };
}

function htmlToMarkdown(html: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const main =
    doc.querySelector("main") ||
    doc.querySelector("article") ||
    doc.querySelector('[role="main"]') ||
    doc.body;

  if (!main) return turndown.turndown(html);

  return turndown.turndown(main.innerHTML);
}

export function registerScrapingTools(
  server: McpServer,
  perProxyUser: string
) {
  server.registerTool(
    "scrape_url",
    {
      title: "Scrape URL as Markdown",
      description:
        "Scrape a webpage through a Proxidize mobile proxy and return the main content as Markdown",
      inputSchema: {
        url: z.url().describe("The URL to scrape"),
        session_id: z
          .string()
          .optional()
          .describe("Proxy session ID to route through (uses first available if omitted)"),
      },
      outputSchema: outputSchemas.scrapeResult,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ url, session_id }) => {
      try {
        const { status, html } = await fetchThroughProxy(
          url,
          perProxyUser,
          session_id
        );
        const content = htmlToMarkdown(html);
        return ok({ url, status, content });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "scrape_html",
    {
      title: "Scrape URL as HTML",
      description:
        "Scrape a webpage through a Proxidize mobile proxy and return the raw HTML",
      inputSchema: {
        url: z.url().describe("The URL to scrape"),
        session_id: z
          .string()
          .optional()
          .describe("Proxy session ID to route through (uses first available if omitted)"),
      },
      outputSchema: outputSchemas.scrapeResult,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ url, session_id }) => {
      try {
        const { status, html } = await fetchThroughProxy(
          url,
          perProxyUser,
          session_id
        );
        return ok({ url, status, content: html });
      } catch (err) {
        return fail(err);
      }
    }
  );
}
