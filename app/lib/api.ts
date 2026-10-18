"use client";

import axios from "axios";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://lcbc-server.apps.johnseong.com");

const TOKEN_KEY = "moldock.session";

export function getToken(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode — session lasts for this tab only */
  }
  window.dispatchEvent(new Event("moldock:auth"));
}

export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export interface Paywall {
  code: string;
  message: string;
  feature?: string;
  limit?: number;
  used_today?: number;
  jobs_per_day?: number;
  resets_at?: string;
  tier?: string;
}

export function showPaywall(p: Paywall) {
  window.dispatchEvent(new CustomEvent<Paywall>("moldock:paywall", { detail: p }));
}

/** Error text from an API error (detail is always a string). */
export function errorText(err: any, fallback = "Something went wrong."): string {
  const d = err?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0]?.msg) return d[0].msg;
  return fallback;
}

// One global interceptor: every existing page that uses axios against the
// MolDock API gets the session header, and any 401/402/429 that carries a
// `paywall` payload opens the paywall modal.
let installed = false;
export function installInterceptors() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  axios.interceptors.request.use((config) => {
    const url = config.url || "";
    if (url.startsWith(API_BASE)) {
      const t = getToken();
      if (t) {
        config.headers = config.headers || {};
        (config.headers as any).Authorization = `Bearer ${t}`;
      }
    }
    return config;
  });
  axios.interceptors.response.use(
    (r) => r,
    (err) => {
      const pw = err?.response?.data?.paywall;
      if (pw && !(err.config as any)?.silentPaywall) showPaywall(pw);
      return Promise.reject(err);
    },
  );
}
installInterceptors();

/** Download an authenticated API file (private jobs need the header). */
export async function downloadFile(url: string, filename: string) {
  const resp = await axios.get(url, { responseType: "blob" });
  const href = URL.createObjectURL(resp.data);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}

export function formatUSD(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
