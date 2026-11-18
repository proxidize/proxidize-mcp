import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Who the current request is acting for.
 *
 * - stdio: one user per process; the token comes from PROXIDIZE_API_TOKEN and
 *   is set once at startup with setStdioToken().
 * - http: many users per process; each incoming MCP request runs inside
 *   runWithToken() with that user's own upstream token, so one user's token
 *   can never be used for another user's request.
 */
export type Mode = "stdio" | "http";

interface RequestContext {
  token: string;
}

const storage = new AsyncLocalStorage<RequestContext>();
let stdioToken: string | null = null;
let mode: Mode = "stdio";

export function setMode(next: Mode) {
  mode = next;
}

export function getMode(): Mode {
  return mode;
}

export function setStdioToken(token: string) {
  stdioToken = token;
}

export function runWithToken<T>(token: string, fn: () => T): T {
  return storage.run({ token }, fn);
}

/** The upstream API token for the current request. Throws if there is none. */
export function currentToken(): string {
  const ctx = storage.getStore();
  if (ctx) return ctx.token;
  if (mode === "stdio" && stdioToken) return stdioToken;
  // In http mode there is deliberately no fallback: a request outside
  // runWithToken() must fail rather than borrow anyone's token.
  throw new Error("no API token in scope for this request");
}
