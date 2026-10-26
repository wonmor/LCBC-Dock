"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { API_BASE, errorText, formatUSD, getToken } from "@/app/lib/api";

interface Limits {
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

interface Catalog {
  checkout_enabled: boolean;
  trial_days: number;
  tiers: {
    free: { limits: Limits; anonymous_limits: Limits };
    pro: {
      limits: Limits;
      prices: Record<string, { plan: string; amount_cents: number; interval: string }>;
      list_prices: { monthly_cents: number; annual_cents: number };
      annual_savings_percent: number | null;
    };
    lab: { limits: Limits; min_seats: number; list_price_per_seat_year_cents: number };
  };
}

const Check = ({ on = true }: { on?: boolean }) => (
  <span className={on ? "text-emerald-400" : "text-gray-600"} aria-hidden>
    {on ? "✓" : "–"}
  </span>
);

function Row({ label, value, on = true }: { label: string; value?: string; on?: boolean }) {
  return (
    <li className="flex items-start gap-2 text-xs text-gray-300">
      <Check on={on} />
      <span className={on ? "" : "text-gray-600"}>
        {label}
        {value && <span className="text-gray-500"> | {value}</span>}
      </span>
    </li>
  );
}

export default function Pricing() {
  const [cat, setCat] = useState<Catalog | null>(null);
  const [annual, setAnnual] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [account, setAccount] = useState<any>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [quote, setQuote] = useState({ name: "", email: "", institution: "", seats: 5, message: "" });
  const [quoteState, setQuoteState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    axios.get(`${API_BASE}/api/pricing`).then((r) => setCat(r.data)).catch(() => setErr("Could not load pricing."));
    setSignedIn(!!getToken());
    axios.get(`${API_BASE}/api/account`).then((r) => setAccount(r.data)).catch(() => {});
  }, []);

  const pro = cat?.tiers.pro;
  const monthly = pro?.prices.monthly?.amount_cents ?? pro?.list_prices.monthly_cents ?? 999;
  const yearly = pro?.prices.annual?.amount_cents ?? pro?.list_prices.annual_cents ?? 7900;
  const savings = pro?.annual_savings_percent ?? Math.round(100 * (1 - yearly / (monthly * 12)));
  const planKey = annual ? pro?.prices.annual?.plan : pro?.prices.monthly?.plan;
  const isPaid = account?.tier === "pro" || account?.tier === "lab";

  const startCheckout = async () => {
    setErr(null);
    if (!getToken()) {
      window.location.href = "/account?next=/pricing";
      return;
    }
    if (!planKey) {
      setErr("Checkout opens soon — Pro prices are not live yet.");
      return;
    }
    setBusy(true);
    try {
      const r = await axios.post(`${API_BASE}/api/billing/checkout`, { plan: planKey });
      window.location.href = r.data.url;
    } catch (e) {
      setErr(errorText(e, "Could not start checkout."));
      setBusy(false);
    }
  };

  const sendQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuoteState("sending");
    try {
      await axios.post(`${API_BASE}/api/lab-quote`, quote);
      setQuoteState("sent");
    } catch {
      setQuoteState("error");
    }
  };

  const free = cat?.tiers.free.limits;
  const anon = cat?.tiers.free.anonymous_limits;
  const pl = pro?.limits;
  const lab = cat?.tiers.lab;

  return (
    <div className="flex flex-col items-center min-h-screen px-4 sm:px-6 pt-20 pb-16">
      <div className="w-full max-w-5xl">
        <h1 className="text-4xl sm:text-5xl font-extralight text-center mb-2">Pricing</h1>
        <p className="text-sm text-gray-400 text-center mb-8">
          Docking stays free. Pro is for screening, publication-grade runs and automation.
        </p>

        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-white/5 rounded-full p-1 text-xs" role="tablist" aria-label="Billing period">
            <button
              role="tab"
              aria-selected={!annual}
              onClick={() => setAnnual(false)}
              className={`px-4 py-1.5 rounded-full ${!annual ? "bg-white text-black" : "text-gray-400"}`}
            >
              Monthly
            </button>
            <button
              role="tab"
              aria-selected={annual}
              onClick={() => setAnnual(true)}
              className={`px-4 py-1.5 rounded-full ${annual ? "bg-white text-black" : "text-gray-400"}`}
            >
              Annual {savings > 0 && <span className="text-emerald-500">−{savings}%</span>}
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {/* Free */}
          <div className="border border-white/10 rounded-2xl p-6 flex flex-col">
            <h2 className="text-lg font-light">Free</h2>
            <p className="text-3xl font-light mt-2">$0</p>
            <p className="text-[11px] text-gray-500 mb-5">for students and quick checks</p>
            <ul className="space-y-2 flex-1">
              <Row label={`${free?.jobs_per_day ?? 5} dockings a day`} value={`${anon?.jobs_per_day ?? 3} without an account`} />
              <Row label={`Exhaustiveness up to ${free?.max_exhaustiveness ?? 8}`} value={`${free?.max_num_modes ?? 9} poses`} />
              <Row label="Co-crystal ligand, residue and pocket box placement" />
              <Row label="Redocking RMSD + interaction map (best pose)" />
              <Row label="Exports: PDB, PDBQT, SDF, PyMOL, ChimeraX, CSV" />
              <Row label="Methods paragraph + BibTeX" />
              <Row label={`Batch screening`} value={`${free?.max_batch_ligands ?? 5} ligands with an account`} />
              <Row label={`Results kept ${free?.retention_days ?? 30} days, public link`} />
            </ul>
            <Link
              href="/docking/protein"
              className="mt-6 text-center bg-white/10 hover:bg-white/20 text-sm py-2.5 rounded-full"
            >
              Start docking
            </Link>
          </div>

          {/* Pro */}
          <div className="border border-emerald-400/40 rounded-2xl p-6 flex flex-col relative bg-emerald-400/[0.03]">
            <span className="absolute -top-3 left-6 bg-emerald-400 text-black text-[10px] font-medium px-2.5 py-1 rounded-full">
              For researchers
            </span>
            <h2 className="text-lg font-light">Pro</h2>
            <p className="text-3xl font-light mt-2">
              {annual ? formatUSD(yearly) : formatUSD(monthly)}
              <span className="text-sm text-gray-500"> / {annual ? "year" : "month"}</span>
            </p>
            <p className="text-[11px] text-gray-500 mb-5">
              {annual ? `${formatUSD(Math.round(yearly / 12))}/month billed yearly` : "cancel any time"}
              {cat?.trial_days ? ` | ${cat.trial_days}-day free trial` : ""}
            </p>
            <ul className="space-y-2 flex-1">
              <Row label={`${pl?.jobs_per_day ?? 300} dockings a day`} value="priority queue" />
              <Row label={`Exhaustiveness up to ${pl?.max_exhaustiveness ?? 32}`} value={`${pl?.max_num_modes ?? 20} poses, ${pl?.max_box_edge ?? 40} Å boxes`} />
              <Row label={`Virtual screening`} value={`${pl?.max_batch_ligands ?? 500} ligands per batch, ranked CSV`} />
              <Row label="Interactions for every pose" />
              <Row label="Private jobs and batches" />
              <Row label="Results kept until you delete them" />
              <Row label="REST API keys" value="scripts & notebooks" />
              <Row label="Same plan in the MolDock iPhone, iPad and Mac apps" />
            </ul>
            {isPaid ? (
              <Link href="/account" className="mt-6 text-center bg-white text-black text-sm font-medium py-2.5 rounded-full">
                Manage subscription
              </Link>
            ) : (
              <button
                onClick={startCheckout}
                disabled={busy}
                className="mt-6 bg-white text-black text-sm font-medium py-2.5 rounded-full hover:bg-gray-200 disabled:opacity-50"
              >
                {busy ? "Opening checkout…" : signedIn ? "Upgrade to Pro" : "Sign in to upgrade"}
              </button>
            )}
            {err && <p className="text-[11px] text-red-400 mt-2 text-center">{err}</p>}
          </div>

          {/* Lab */}
          <div className="border border-white/10 rounded-2xl p-6 flex flex-col">
            <h2 className="text-lg font-light">Lab / Institution</h2>
            <p className="text-3xl font-light mt-2">
              {formatUSD(lab?.list_price_per_seat_year_cents ?? 6900)}
              <span className="text-sm text-gray-500"> / seat / year</span>
            </p>
            <p className="text-[11px] text-gray-500 mb-5">
              from {lab?.min_seats ?? 5} seats | invoiced, PO accepted
            </p>
            <ul className="space-y-2 flex-1">
              <Row label="Everything in Pro for every seat" />
              <Row label={`${lab?.limits.jobs_per_day ?? 1000} dockings a day per seat`} value="highest priority" />
              <Row label={`Up to ${lab?.limits.max_batch_ligands ?? 2000} ligands per batch`} />
              <Row label="Shared private results inside the lab" />
              <Row label="PI manages seats from the account page" />
              <Row label="Course / classroom licences" />
            </ul>
            <a href="#lab-quote" className="mt-6 text-center bg-white/10 hover:bg-white/20 text-sm py-2.5 rounded-full">
              Request a quote
            </a>
          </div>
        </div>

        {/* Lab quote form */}
        <form
          id="lab-quote"
          onSubmit={sendQuote}
          className="mt-12 max-w-xl mx-auto border border-white/10 rounded-2xl p-6"
        >
          <h2 className="text-lg font-light mb-1">Lab or institution quote</h2>
          <p className="text-[11px] text-gray-500 mb-4">Your quote arrives by email right away. Reply to it to get an invoice.</p>
          {quoteState === "sent" ? (
            <p className="text-sm text-emerald-400">Your quote is on its way to {quote.email}. Reply to it when you&apos;re ready for an invoice.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {(["name", "email", "institution"] as const).map((k) => (
                <label key={k} className="text-[11px] text-gray-400 flex flex-col gap-1">
                  {k === "name" ? "Your name" : k === "email" ? "Work email" : "Institution / lab"}
                  <input
                    required
                    type={k === "email" ? "email" : "text"}
                    value={quote[k]}
                    onChange={(e) => setQuote({ ...quote, [k]: e.target.value })}
                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
                  />
                </label>
              ))}
              <label className="text-[11px] text-gray-400 flex flex-col gap-1">
                Seats
                <input
                  type="number"
                  min={1}
                  value={quote.seats}
                  onChange={(e) => setQuote({ ...quote, seats: parseInt(e.target.value || "1") })}
                  className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
                />
              </label>
              <label className="text-[11px] text-gray-400 flex flex-col gap-1 sm:col-span-2">
                Anything we should know (course, grant, PO process)
                <textarea
                  rows={3}
                  value={quote.message}
                  onChange={(e) => setQuote({ ...quote, message: e.target.value })}
                  className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30 resize-none"
                />
              </label>
              <button
                type="submit"
                disabled={quoteState === "sending"}
                className="sm:col-span-2 bg-white text-black text-sm font-medium py-2.5 rounded-full hover:bg-gray-200 disabled:opacity-50"
              >
                {quoteState === "sending" ? "Sending…" : "Request quote"}
              </button>
              {quoteState === "error" && (
                <p className="sm:col-span-2 text-[11px] text-red-400">Could not send — please try again in a minute.</p>
              )}
            </div>
          )}
        </form>

        <p className="text-[11px] text-gray-600 text-center mt-8">
          Prices in USD. Payments by Stripe; in the iOS and Mac apps via the App Store. Academic and
          classroom discounts on request.
        </p>
      </div>
    </div>
  );
}

