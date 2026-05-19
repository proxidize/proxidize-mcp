import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { chromium, type Browser, type Page, type Response } from "playwright";
import { get } from "../client.js";
import { ok, fail } from "../result.js";
import { config } from "../config.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Paginated } from "../schemas.js";

interface ProxyInfo {
  proxy: string;
  http_port: string;
  socks_port: string;
}

interface DomElement {
  ref: string;
  role: string;
  name: string;
  url: string;
}

class BrowserSession {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private requests = new Map<string, { method: string; url: string; status?: number; statusText?: string }>();
  private proxyServer: string;

  constructor(proxyServer: string) {
    this.proxyServer = proxyServer;
  }

  async getPage(): Promise<Page> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        channel: "chromium",
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-first-run",
          "--no-default-browser-check",
        ],
        proxy: { server: this.proxyServer },
      });
      this.browser.on("disconnected", () => {
        this.browser = null;
        this.page = null;
      });
    }

    if (!this.page) {
      const probe = await this.browser.newContext();
      const probePage = await probe.newPage();
      const rawUA = await probePage.evaluate(() => navigator.userAgent);
      await probe.close();

      const userAgent = rawUA.replace("HeadlessChrome", "Chrome");
      const major = userAgent.match(/Chrome\/(\d+)/)?.[1] ?? "148";
      const full = userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? "148.0.0.0";

      const context =
        this.browser.contexts()[0] ??
        (await this.browser.newContext({
          userAgent,
          viewport: { width: 1920, height: 1080 },
          screen: { width: 1920, height: 1080 },
          locale: "en-US",
          timezoneId: "America/New_York",
        }));

      await context.addInitScript(
        ({ major, full }: { major: string; full: string }) => {
          if (!(window as any).chrome) {
            (window as any).chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
          } else if (!(window as any).chrome.runtime) {
            (window as any).chrome.runtime = {};
          }

          const brands = [
            { brand: "Google Chrome", version: major },
            { brand: "Chromium", version: major },
            { brand: "Not_A Brand", version: "24" },
          ];
          const fullBrands = [
            { brand: "Google Chrome", version: full },
            { brand: "Chromium", version: full },
            { brand: "Not_A Brand", version: "24.0.0.0" },
          ];
          Object.defineProperty(navigator, "userAgentData", {
            get: () => ({
              brands,
              mobile: false,
              platform: navigator.platform?.includes("Mac") ? "macOS" : "Windows",
              getHighEntropyValues: () =>
                Promise.resolve({
                  brands: fullBrands,
                  mobile: false,
                  platform: navigator.platform?.includes("Mac") ? "macOS" : "Windows",
                  platformVersion: "15.0.0",
                  architecture: navigator.platform?.includes("Mac") ? "arm" : "x86",
                  bitness: "64",
                  model: "",
                  uaFullVersion: full,
                  fullVersionList: fullBrands,
                }),
            }),
          });

          const origQuery = window.navigator.permissions.query.bind(
            window.navigator.permissions
          );
          Object.defineProperty(window.navigator.permissions, "query", {
            value: (params: any) =>
              params.name === "notifications"
                ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
                : origQuery(params),
          });
        },
        { major, full }
      );

      this.page = context.pages()[0] ?? (await context.newPage());
      this.page.on("request", (req) => {
        this.requests.set(req.url() + req.method(), {
          method: req.method(),
          url: req.url(),
        });
      });
      this.page.on("response", (res: Response) => {
        const key = res.url() + res.request().method();
        const entry = this.requests.get(key);
        if (entry) {
          entry.status = res.status();
          entry.statusText = res.statusText();
        }
      });
      this.page.once("close", () => {
        this.page = null;
      });
    }

    return this.page;
  }

  async captureSnapshot(): Promise<{
    url: string;
    title: string;
    elements: DomElement[];
  }> {
    const page = await this.getPage();
    const title = await page.title();
    const url = page.url();

    const elements = await page.evaluate(() => {
      const selectors = [
        "a[href]", "button", "input", "select", "textarea", "option",
        '[role="button"]', '[role="link"]', '[role="checkbox"]',
        '[role="radio"]', '[role="tab"]', '[role="menuitem"]',
        '[role="switch"]', '[role="combobox"]', '[role="textbox"]',
        "[onclick]", "[tabindex]",
      ];
      const nodes = document.querySelectorAll(selectors.join(","));
      const result: { ref: string; role: string; name: string; url: string }[] = [];
      let counter = 0;

      const collapse = (t: string | null) =>
        (t ?? "").replace(/\s+/g, " ").trim();

      const getLabel = (el: Element): string => {
        const label = el.closest("label");
        if (label) return collapse(label.textContent);
        const id = el.id?.trim();
        if (id) {
          const forLabel = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (forLabel) return collapse(forLabel.textContent);
        }
        return "";
      };

      for (const el of nodes) {
        const style = window.getComputedStyle(el);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.pointerEvents === "none"
        )
          continue;

        const rect = el.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) continue;

        let name =
          collapse(el.getAttribute("aria-label")) ||
          collapse(el.getAttribute("title")) ||
          collapse(el.getAttribute("alt")) ||
          collapse(el.getAttribute("placeholder")) ||
          getLabel(el) ||
          collapse((el as HTMLElement).innerText || el.textContent || "") ||
          collapse(el.getAttribute("name"));

        if (name.length > 80) name = name.slice(0, 77) + "...";

        const href = (el as HTMLAnchorElement).href ?? "";
        if (!name && !href) continue;

        const ref = `ref-${++counter}`;
        (el as HTMLElement).dataset.proxyRef = ref;

        result.push({
          ref,
          role: el.getAttribute("role") ?? el.tagName.toLowerCase(),
          name,
          url: href,
        });
      }
      return result;
    });

    return { url, title, elements };
  }

  refLocator(ref: string) {
    if (!this.page) throw new Error("No page open");
    return this.page.locator(`[data-proxy-ref="${ref}"]`).first();
  }

  getRequests() {
    return Array.from(this.requests.values());
  }

  clearRequests() {
    this.requests.clear();
  }

  async close() {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
      this.requests.clear();
    }
  }
}

function formatSnapshot(elements: DomElement[]): string {
  return elements
    .map((el) => {
      const parts = [`[${el.ref}]`, el.role];
      if (el.name) parts.push(`"${el.name}"`);
      if (el.url && !el.url.startsWith("javascript:"))
        parts.push(`-> ${el.url.length > 60 ? el.url.slice(0, 57) + "..." : el.url}`);
      return parts.join(" ");
    })
    .join("\n");
}

let session: BrowserSession | null = null;

async function requireSession(
  perProxyUser: string
): Promise<BrowserSession> {
  if (session) return session;

  const res = await get<Paginated<ProxyInfo>>(
    `/perproxy/proxies/${perProxyUser}`,
    { page: 1, page_size: 1 }
  );
  if (!res.data.length) throw new Error("No proxies available");

  const proxy = res.data[0];
  const server = `socks5://${config.proxyHost}:${proxy.socks_port}`;

  session = new BrowserSession(server);
  return session;
}

export function registerBrowserTools(
  server: McpServer,
  perProxyUser: string
) {
  server.registerTool(
    "browser_navigate",
    {
      title: "Browser Navigate",
      description:
        "Open a headless browser routed through the Proxidize proxy and navigate to a URL",
      inputSchema: {
        url: z.url().describe("The URL to navigate to"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ url }) => {
      try {
        const s = await requireSession(perProxyUser);
        const page = await s.getPage();
        s.clearRequests();
        await page.goto(url, { timeout: 60000, waitUntil: "domcontentloaded" });
        return ok({
          message: `Navigated to ${url}`,
          title: await page.title(),
          url: page.url(),
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "browser_go_back",
    {
      title: "Browser Go Back",
      description: "Navigate to the previous page in browser history",
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async () => {
      try {
        const page = await (await requireSession(perProxyUser)).getPage();
        await page.goBack();
        return ok({ title: await page.title(), url: page.url() });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "browser_go_forward",
    {
      title: "Browser Go Forward",
      description: "Navigate to the next page in browser history",
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async () => {
      try {
        const page = await (await requireSession(perProxyUser)).getPage();
        await page.goForward();
        return ok({ title: await page.title(), url: page.url() });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "browser_snapshot",
    {
      title: "Browser Snapshot",
      description:
        "Capture a snapshot of all interactive elements on the current page with refs for clicking/typing",
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const s = await requireSession(perProxyUser);
        const snapshot = await s.captureSnapshot();
        const text = [
          `Page: ${snapshot.url}`,
          `Title: ${snapshot.title}`,
          "",
          `Interactive Elements (${snapshot.elements.length}):`,
          formatSnapshot(snapshot.elements),
        ].join("\n");
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "browser_click",
    {
      title: "Browser Click",
      description:
        "Click an element by its ref from browser_snapshot. Use browser_snapshot first to get refs.",
      inputSchema: {
        ref: z.string().describe('The ref from the snapshot (e.g., "ref-5")'),
        element: z.string().describe("Description of the element being clicked"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ ref, element }) => {
      try {
        const s = await requireSession(perProxyUser);
        const locator = s.refLocator(ref);
        await locator.click({ timeout: 5000 });
        return ok({ message: `Clicked: ${element} (${ref})` });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "browser_type",
    {
      title: "Browser Type",
      description:
        "Type text into an element by its ref from browser_snapshot. Optionally submit the form.",
      inputSchema: {
        ref: z.string().describe('The ref from the snapshot (e.g., "ref-3")'),
        element: z.string().describe("Description of the element"),
        text: z.string().describe("Text to type"),
        submit: z
          .boolean()
          .optional()
          .describe("Press Enter after typing to submit the form"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ ref, element, text, submit }) => {
      try {
        const s = await requireSession(perProxyUser);
        const locator = s.refLocator(ref);
        await locator.fill(text);
        if (submit) await locator.press("Enter");
        const suffix = submit ? " and submitted" : "";
        return ok({ message: `Typed "${text}" into ${element} (${ref})${suffix}` });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "browser_screenshot",
    {
      title: "Browser Screenshot",
      description: "Take a screenshot of the current page",
      inputSchema: {
        full_page: z
          .boolean()
          .optional()
          .describe("Capture the full scrollable page (default: false, viewport only)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ full_page }): Promise<CallToolResult> => {
      try {
        const page = await (await requireSession(perProxyUser)).getPage();
        const buffer = await page.screenshot({ fullPage: full_page ?? false });
        const base64 = buffer.toString("base64");
        return {
          content: [{ type: "image", data: base64, mimeType: "image/png" }],
        };
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "browser_get_text",
    {
      title: "Browser Get Text",
      description: "Get the text content of the current page",
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const page = await (await requireSession(perProxyUser)).getPage();
        const text = await page.$eval("body", (body) => body.innerText);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "browser_get_html",
    {
      title: "Browser Get HTML",
      description: "Get the HTML content of the current page body",
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const page = await (await requireSession(perProxyUser)).getPage();
        const html = await page.$eval("body", (body) => body.innerHTML);
        return { content: [{ type: "text" as const, text: html }] };
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "browser_scroll",
    {
      title: "Browser Scroll",
      description: "Scroll the page to the bottom",
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async () => {
      try {
        const page = await (await requireSession(perProxyUser)).getPage();
        await page.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight)
        );
        return ok({ message: "Scrolled to bottom" });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "browser_scroll_to_ref",
    {
      title: "Browser Scroll to Element",
      description:
        "Scroll to a specific element by its ref from browser_snapshot",
      inputSchema: {
        ref: z.string().describe("The ref from the snapshot"),
        element: z.string().describe("Description of the element"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ ref, element }) => {
      try {
        const s = await requireSession(perProxyUser);
        const locator = s.refLocator(ref);
        await locator.scrollIntoViewIfNeeded();
        return ok({ message: `Scrolled to ${element} (${ref})` });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "browser_wait_for",
    {
      title: "Browser Wait for Element",
      description:
        "Wait for an element to become visible by its ref from browser_snapshot",
      inputSchema: {
        ref: z.string().describe("The ref from the snapshot"),
        element: z.string().describe("Description of the element"),
        timeout: z
          .number()
          .int()
          .optional()
          .describe("Max wait time in ms (default: 30000)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ ref, element, timeout }) => {
      try {
        const s = await requireSession(perProxyUser);
        const locator = s.refLocator(ref);
        await locator.waitFor({ timeout: timeout ?? 30000 });
        return ok({ message: `Element visible: ${element} (${ref})` });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "browser_network_requests",
    {
      title: "Browser Network Requests",
      description:
        "List network requests made since navigating to the current page",
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const s = await requireSession(perProxyUser);
        const requests = s.getRequests();
        if (!requests.length)
          return { content: [{ type: "text" as const, text: "No network requests recorded." }] };

        const lines = requests.map((r) => {
          const status = r.status ? ` => [${r.status}] ${r.statusText}` : "";
          return `[${r.method}] ${r.url}${status}`;
        });
        const text = `Network Requests (${lines.length} total):\n\n${lines.join("\n")}`;
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "browser_fill_form",
    {
      title: "Browser Fill Form",
      description:
        "Fill multiple form fields at once by their refs from browser_snapshot",
      inputSchema: {
        fields: z
          .array(
            z.object({
              ref: z.string().describe("Ref from snapshot"),
              name: z.string().describe("Human-readable field name"),
              type: z
                .enum(["textbox", "checkbox", "radio", "combobox"])
                .describe("Field type"),
              value: z
                .string()
                .describe(
                  'Value to fill. For checkbox: "true"/"false". For combobox: option text.'
                ),
            })
          )
          .describe("Fields to fill"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ fields }) => {
      try {
        const s = await requireSession(perProxyUser);
        const results: string[] = [];
        for (const field of fields) {
          const locator = s.refLocator(field.ref);
          if (field.type === "textbox") {
            await locator.fill(field.value);
            results.push(`Filled ${field.name} with "${field.value}"`);
          } else if (field.type === "checkbox" || field.type === "radio") {
            await locator.setChecked(field.value === "true");
            results.push(
              `Set ${field.name} to ${field.value === "true" ? "checked" : "unchecked"}`
            );
          } else if (field.type === "combobox") {
            await locator.selectOption({ label: field.value });
            results.push(`Selected "${field.value}" in ${field.name}`);
          }
        }
        return ok({ message: "Form filled:\n" + results.join("\n") });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "browser_close",
    {
      title: "Browser Close",
      description:
        "Close the browser and clear all cookies/state. The next browser tool call will start a fresh session. Use this after rotating a proxy IP or when a site blocks the current session.",
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async () => {
      try {
        if (session) {
          await session.close();
          session = null;
        }
        return ok({ message: "Browser closed. Next navigation will start a fresh session." });
      } catch (err) {
        return fail(err);
      }
    }
  );
}
