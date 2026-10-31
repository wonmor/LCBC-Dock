"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import { API_BASE, errorText, getToken, setToken } from "@/app/lib/api";

function SignIn({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setState("sending");
    try {
      const r = await axios.post(`${API_BASE}/api/auth/request-link`, { email, next });
      setDevLink(r.data.dev_link ?? null);
      setState("sent");
    } catch (e2) {
      setErr(errorText(e2, "Could not send the link."));
      setState("idle");
    }
  };

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-4xl font-extralight text-center mb-2">Sign in</h1>
      <p className="text-xs text-gray-500 text-center mb-8">
        No password — we email you a one-time link. A free account raises your daily limit and unlocks batch screening.
      </p>
      {state === "sent" ? (
        <div className="border border-white/10 rounded-2xl p-5 text-center">
          <p className="text-sm">Check {email} for your sign-in link.</p>
          <p className="text-[11px] text-gray-500 mt-2">It works once and expires in 30 minutes.</p>
          {devLink && (
            <a href={devLink.replace(/^https?:\/\/[^/]+/, "")} className="block mt-4 text-xs text-emerald-400 underline">
              Development: open sign-in link
            </a>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label htmlFor="email" className="sr-only">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@university.edu"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm placeholder-gray-600 focus:outline-none focus:border-white/30"
          />
          <button
            type="submit"
            disabled={state === "sending"}
            className="w-full bg-white text-black py-3 rounded-full text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            {state === "sending" ? "Sending…" : "Email me a sign-in link"}
          </button>
          {err && <p className="text-xs text-red-400 text-center">{err}</p>}
        </form>
      )}
    </div>
  );
}

function UsageBar({ used, total }: { used: number; total: number }) {
  const pct = total ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden" role="progressbar" aria-valuenow={used} aria-valuemax={total}>
      <div className={`h-full ${pct >= 100 ? "bg-red-400" : "bg-emerald-400"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function AccountView() {
  const params = useSearchParams();
  const [acct, setAcct] = useState<any>(null);
  const [jobs, setJobs] = useState<any>({ jobs: [], batches: [] });
  const [keys, setKeys] = useState<any[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    axios.get(`${API_BASE}/api/account`).then((r) => setAcct(r.data)).catch(() => {});
    axios.get(`${API_BASE}/api/account/jobs`).then((r) => setJobs(r.data)).catch(() => {});
    axios.get(`${API_BASE}/api/account/api-keys`).then((r) => setKeys(r.data.keys)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    if (params.get("checkout") === "success") {
      setMsg("Payment received — welcome to MolDock Pro. It can take a few seconds to activate.");
      const t = setTimeout(load, 4000);
      return () => clearTimeout(t);
    }
  }, [load, params]);

  if (!acct) return <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />;

  const paid = acct.tier === "pro" || acct.tier === "lab";
  const isOrgOwner = acct.org && acct.org.owner_email === acct.email;

  const openPortal = async () => {
    try {
      const r = await axios.post(`${API_BASE}/api/billing/portal`);
      window.location.href = r.data.url;
    } catch (e) {
      setMsg(errorText(e, "Billing portal unavailable."));
    }
  };
  const createKey = async () => {
    try {
      const r = await axios.post(`${API_BASE}/api/account/api-keys`, { label: "web" });
      setNewKey(r.data.key);
      load();
    } catch {
      /* paywall modal handles 402 */
    }
  };
  const revokeKey = async (id: string) => {
    await axios.delete(`${API_BASE}/api/account/api-keys/${id}`);
    load();
  };
  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/api/account/org/members`, { email: memberEmail });
      setMemberEmail("");
      load();
    } catch (e2) {
      setMsg(errorText(e2));
    }
  };
  const signOut = async () => {
    await axios.post(`${API_BASE}/api/auth/logout`).catch(() => {});
    setToken(null);
    window.location.href = "/";
  };
  const deleteAccount = async () => {
    if (!window.confirm("Permanently delete your MolDock account, API keys and saved jobs? A subscription bought through the App Store or Google Play must be cancelled there.")) return;
    try {
      await axios.delete(`${API_BASE}/api/account`);
      setToken(null);
      window.location.href = "/";
    } catch (e) {
      window.alert(errorText(e, "Couldn't delete your account. Try again."));
    }
  };

  return (
    <div className="w-full max-w-2xl space-y-4">
      <div className="text-center mb-6">
        <h1 className="text-4xl font-extralight mb-1">Account</h1>
        <p className="text-xs text-gray-500">{acct.email ?? "App Store account"}</p>
      </div>
      {msg && <p className="text-xs text-emerald-300 text-center">{msg}</p>}

      <div className="border border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Plan</p>
            <p className="text-2xl font-light capitalize">{acct.tier}</p>
            {acct.sources?.length > 0 && (
              <p className="text-[10px] text-gray-500">via {acct.sources.join(", ").replace("app_store", "App Store")}</p>
            )}
          </div>
          {paid ? (
            acct.stripe?.has_customer && (
              <button onClick={openPortal} className="text-xs bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full">
                Manage billing
              </button>
            )
          ) : (
            <Link href="/pricing" className="text-xs bg-white text-black px-4 py-2 rounded-full font-medium">
              Upgrade to Pro
            </Link>
          )}
        </div>
        <div className="flex justify-between text-[11px] text-gray-400 mb-1.5">
          <span>Dockings today</span>
          <span>
            {acct.usage.used_today} / {acct.usage.jobs_per_day}
          </span>
        </div>
        <UsageBar used={acct.usage.used_today} total={acct.usage.jobs_per_day} />
        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          {[
            ["Exhaustiveness", `≤ ${acct.limits.max_exhaustiveness}`],
            ["Batch size", acct.limits.max_batch_ligands ? `${acct.limits.max_batch_ligands}` : "—"],
            ["Retention", acct.limits.retention_days ? `${acct.limits.retention_days} d` : "kept"],
          ].map(([k, v]) => (
            <div key={k} className="bg-white/[0.03] rounded-xl py-2">
              <p className="text-sm font-light">{v}</p>
              <p className="text-[10px] text-gray-500">{k}</p>
            </div>
          ))}
        </div>
      </div>

      {/* API keys */}
      <div className="border border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm">REST API keys</p>
          <button onClick={createKey} className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full">
            {acct.limits.api_keys ? "New key" : "New key (Pro)"}
          </button>
        </div>
        {newKey && (
          <div className="bg-emerald-400/10 border border-emerald-400/30 rounded-lg p-3 mb-3">
            <p className="text-[11px] text-emerald-300 mb-1">Copy this key now — it is shown once.</p>
            <code className="text-[11px] break-all">{newKey}</code>
          </div>
        )}
        {keys.length === 0 ? (
          <p className="text-[11px] text-gray-500">No keys yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {keys.map((k) => (
              <li key={k.key_id} className="flex items-center justify-between py-2 text-xs">
                <span className="font-mono">{k.prefix}…</span>
                <span className="text-gray-500">{k.last_used_at ? `used ${k.last_used_at.slice(0, 10)}` : "never used"}</span>
                <button onClick={() => revokeKey(k.key_id)} className="text-red-400 hover:text-red-300">Revoke</button>
              </li>
            ))}
          </ul>
        )}
        <pre className="mt-3 bg-black/50 border border-white/5 rounded-lg p-3 text-[10px] text-gray-400 overflow-x-auto">{`curl -X POST ${API_BASE}/api/dock \\
  -H "X-API-Key: mdk_..." -H "Content-Type: application/json" \\
  -d '{"protein_pdb_id":"1HSG","ligand_cid":5362440,"ligand_name":"Indinavir",
       "site":{"mode":"ligand","ligand":"MK1"},"reference_ligand":"MK1",
       "exhaustiveness":16,"seed":42,"strict":true}'
# then GET /api/jobs/{id}, /api/results/{id}, /api/results/{id}/export/zip
# full reference: ${API_BASE}/docs`}</pre>
      </div>

      {/* Lab seats */}
      {acct.org && (
        <div className="border border-white/10 rounded-2xl p-5">
          <p className="text-sm mb-1">{acct.org.name}</p>
          <p className="text-[11px] text-gray-500 mb-3">
            {acct.org.members.length} / {acct.org.seats} seats used
          </p>
          <ul className="text-xs text-gray-300 space-y-1 mb-3">
            {acct.org.members.map((m: string) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          {isOrgOwner && (
            <form onSubmit={addMember} className="flex gap-2">
              <input
                type="email"
                required
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                placeholder="student@university.edu"
                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-white/30"
              />
              <button className="text-xs bg-white text-black px-4 rounded-full">Add seat</button>
            </form>
          )}
        </div>
      )}

      {/* History */}
      <div className="border border-white/10 rounded-2xl p-5">
        <p className="text-sm mb-3">Your work</p>
        {jobs.batches.length > 0 && (
          <ul className="mb-3 space-y-1">
            {jobs.batches.map((b: any) => (
              <li key={b.batch_id} className="flex justify-between text-xs">
                <Link href={`/screen/${b.batch_id}`} className="hover:text-white text-gray-300">
                  {b.name} <span className="text-gray-500">| {b.n_ligands} ligands</span>
                </Link>
                <span className="text-gray-600">{b.created_at.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
        {jobs.jobs.length === 0 && jobs.batches.length === 0 ? (
          <p className="text-[11px] text-gray-500">Jobs you submit while signed in appear here.</p>
        ) : (
          <ul className="space-y-1">
            {jobs.jobs.slice(0, 25).map((j: any) => (
              <li key={j.job_id} className="flex justify-between text-xs">
                <Link
                  href={j.status === "completed" ? `/results/${j.job_id}` : `/dashboard?jobId=${j.job_id}`}
                  className="hover:text-white text-gray-300"
                >
                  {j.protein_pdb_id} + {j.ligand_name}
                  {j.visibility === "private" && <span className="ml-1 text-[9px] text-gray-500">private</span>}
                </Link>
                <span className="text-gray-500">{j.best_affinity != null ? `${j.best_affinity} kcal/mol` : j.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button onClick={signOut} className="block mx-auto text-xs text-gray-500 hover:text-white pt-2">
        Sign out
      </button>
      <button onClick={deleteAccount} className="block mx-auto text-xs text-red-400 hover:text-red-300 underline">
        Delete account
      </button>
    </div>
  );
}

function AccountInner() {
  const params = useSearchParams();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    setSignedIn(!!getToken());
    const f = () => setSignedIn(!!getToken());
    window.addEventListener("moldock:auth", f);
    return () => window.removeEventListener("moldock:auth", f);
  }, []);
  const next = params.get("next") || "/account";
  return (
    <div className="flex flex-col items-center min-h-screen px-4 sm:px-6 pt-20 pb-16">
      {signedIn === null ? null : signedIn ? <AccountView /> : <SignIn next={next} />}
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountInner />
    </Suspense>
  );
}
