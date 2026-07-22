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

function formatError(err: unknown): Error {
  if (!axios.isAxiosError(err) || !err.response) {
    return err instanceof Error ? err : new Error(String(err));
  }

  const status = err.response.status;
  const body = err.response.data;
  const msg =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).message ||
        (body as Record<string, unknown>).detail ||
        JSON.stringify(body)
      : String(body);

  return new Error(`HTTP ${status}: ${msg}`);
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
