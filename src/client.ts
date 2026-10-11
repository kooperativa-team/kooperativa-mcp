/**
 * Thin HTTP client for the Kooperativa API (https://kooperativa.io/api/v1).
 *
 * The API key comes from KOOPERATIVA_API_KEY or ~/.kooperativa/config.json (see credentials.ts)
 * and is never logged or echoed back to the model. Every request attaches it as a Bearer token.
 */

import { missingKeyMessage, resolveApiKey } from "./credentials.js";

export const BASE_URL = "https://kooperativa.io/api/v1";

export class KooperativaApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "KooperativaApiError";
    this.status = status;
    this.code = code;
  }
}

function getApiKey(): string {
  const resolved = resolveApiKey();
  if (resolved.key === null) throw new Error(missingKeyMessage(resolved.problem));
  return resolved.key;
}

function buildQuery(params: Record<string, unknown> | undefined): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.append(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

async function request<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  options: { query?: Record<string, unknown>; body?: unknown } = {},
): Promise<T> {
  const url = `${BASE_URL}${path}${buildQuery(options.query)}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // non-JSON response body, fall through with raw text below
    }
  }

  if (!res.ok) {
    const errObj = json as { error?: string; code?: string } | undefined;
    const message = errObj?.error ?? text ?? `Request failed with status ${res.status}`;
    throw new KooperativaApiError(res.status, message, errObj?.code);
  }

  return json as T;
}

export const kooperativa = {
  get: <T>(path: string, query?: Record<string, unknown>) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  del: <T>(path: string, query?: Record<string, unknown>) => request<T>("DELETE", path, { query }),
};
