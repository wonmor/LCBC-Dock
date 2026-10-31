import { backend } from "./api";

// Mirrors GET /api/account (api/accounts.py account_summary).
export interface PlanLimits {
  jobs_per_day: number;
  max_active: number;
  max_exhaustiveness: number;
  max_num_modes: number;
  max_box_edge: number;
  max_batch_ligands: number;
  private_jobs: boolean;
  priority_queue: boolean;
  api_keys: boolean;
  retention_days: number | null;
  all_pose_interactions: boolean;
}

export interface AccountSummary {
  signed_in: boolean;
  user_id: string | null;
  email: string | null;
  tier: "anonymous" | "free" | "pro" | "lab";
  sources: string[];
  limits: PlanLimits;
  usage: {
    used_today: number;
    jobs_per_day: number;
    remaining_today: number;
    active: number;
    max_active: number;
    resets_at: string;
  };
  stripe: { status: string | null; period_end: string | null; has_customer: boolean };
  app_store: { product_id: string | null; expires_at: string | null };
  google_play?: { product_id: string | null; base_plan: string | null; expires_at: string | null };
  app_account_token?: string | null;
}

export interface Paywall {
  code: string;
  message: string;
  feature?: string;
  limit?: number;
}

export function isPaid(account: AccountSummary | null): boolean {
  return account?.tier === "pro" || account?.tier === "lab";
}

export function errorText(e: any, fallback: string): string {
  const detail = e?.response?.data?.detail;
  if (typeof detail === "string" && detail) return detail;
  if (e?.message === "Network Error") return "Can't reach MolDock. Check your connection.";
  return fallback;
}

export function paywallOf(e: any): Paywall | null {
  return e?.response?.data?.paywall ?? null;
}

export async function fetchAccount(): Promise<AccountSummary> {
  const resp = await backend.get("/api/account");
  return resp.data;
}

export async function requestSignInCode(email: string): Promise<void> {
  await backend.post("/api/auth/request-link", { email, client: "app" });
}

export async function verifySignInCode(email: string, code: string): Promise<string> {
  const resp = await backend.post("/api/auth/verify-code", { email, code });
  return resp.data.session_token;
}

export async function verifySignInLink(token: string): Promise<string> {
  const resp = await backend.get("/api/auth/verify", { params: { token } });
  return resp.data.session_token;
}

export async function signOutOnServer(): Promise<void> {
  try {
    await backend.post("/api/auth/logout");
  } catch {
    // Signing out locally is what matters.
  }
}

/** Permanently deletes the signed-in account on the server. Returns whether an
 *  App Store / Google Play subscription was active (it must be cancelled in the
 *  store; deleting the account cannot stop the store's billing). */
export async function deleteAccountOnServer(): Promise<{ storeSubscriptionActive: boolean }> {
  const resp = await backend.delete("/api/account");
  return { storeSubscriptionActive: !!resp.data?.store_subscription_active };
}
