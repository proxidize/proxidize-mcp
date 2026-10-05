import axios, { type AxiosError } from "axios";
import * as rax from "retry-axios";
import { config } from "./config.js";
import { logger } from "./logger.js";

const http = axios.create({
  baseURL: config.baseUrl,
  timeout: config.timeout,
  headers: {
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
    "User-Agent": "@proxidize/mcp/0.1.0",
  },
  raxConfig: {
    retry: config.maxRetries,
    retryDelay: 1000,
    backoffType: "exponential",
    statusCodesToRetry: [[500, 599]],
    httpMethodsToRetry: ["GET", "POST", "PUT", "DELETE"],
    onRetryAttempt: async (err: AxiosError) => {
      const cfg = rax.getConfig(err);
      logger.warn(`retry ${cfg?.currentRetryAttempt}/${config.maxRetries}`, {
        url: err.config?.url,
        status: err.response?.status,
      });
    },
  },
});

rax.attach(http);

const MAX_ERROR_MESSAGE_LENGTH = 500;

function formatError(err: unknown): Error {
  if (!axios.isAxiosError(err) || !err.response) {
    return err instanceof Error ? err : new Error(String(err));
  }

  const status = err.response.status;
  const body = err.response.data;
  const contentType = String(err.response.headers?.["content-type"] ?? "");

  let msg: string;
  if (typeof body === "object" && body !== null) {
    msg = String(
      (body as Record<string, unknown>).message ??
        (body as Record<string, unknown>).detail ??
        JSON.stringify(body)
    );
  } else if (contentType.includes("html") || /^\s*<(!doctype|html)/i.test(String(body))) {
    msg = /cloudflare/i.test(String(body))
      ? "blocked by Cloudflare before reaching the API (likely a bot/rate-limit challenge on the base URL's host)"
      : "server returned an HTML error page instead of JSON";
  } else {
    msg = String(body);
  }

  if (msg.length > MAX_ERROR_MESSAGE_LENGTH) {
    msg = msg.slice(0, MAX_ERROR_MESSAGE_LENGTH) + "… (truncated)";
  }

  const authHint =
    status === 401 || status === 403
      ? " (this is a credential/authorization problem — check that PROXIDIZE_API_TOKEN is set correctly; it is not an account or subscription issue)"
      : "";

  return new Error(`HTTP ${status}: ${msg}${authHint}`);
}

export async function request<T = unknown>(
  method: string,
  url: string,
  options?: { params?: Record<string, unknown>; data?: unknown }
): Promise<T> {
  try {
    const res = await http.request<T>({
      method,
      url,
      params: options?.params,
      data: options?.data,
    });
    return res.data;
  } catch (err) {
    throw formatError(err);
  }
}

export const get = <T = unknown>(
  url: string,
  params?: Record<string, unknown>
) => request<T>("GET", url, { params });

export const post = <T = unknown>(url: string, data?: unknown) =>
  request<T>("POST", url, { data });

export const put = <T = unknown>(url: string, data?: unknown) =>
  request<T>("PUT", url, { data });
