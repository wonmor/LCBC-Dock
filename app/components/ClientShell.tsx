"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE, Paywall, getToken, installInterceptors } from "@/app/lib/api";

installInterceptors();

/** Nav account chip: "Sign in" or the current plan. */
export function NavAccount() {
  const [tier, setTier] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const load = () => {
      if (!getToken()) {
        setSignedIn(false);
        setTier(null);
        return;
      }
      axios
        .get(`${API_BASE}/api/account`, { timeout: 5000 })
        .then((r) => {
          setSignedIn(r.data.signed_in);
          setTier(r.data.tier);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("moldock:auth", load);
    return () => window.removeEventListener("moldock:auth", load);
  }, []);

  if (!signedIn) {
    return (
      <Link href="/account" className="hover:text-white transition-colors">
        Sign in
      </Link>
    );
  }
  const paid = tier === "pro" || tier === "lab";
  return (
    <Link
      href="/account"
      className={`px-2.5 py-1 rounded-full text-[11px] ${
        paid ? "bg-emerald-400/15 text-emerald-300" : "bg-white/10 text-gray-300"
      }`}
    >
      {tier === "lab" ? "Lab" : tier === "pro" ? "Pro" : "Account"}
    </Link>
  );
}

const FEATURE_COPY: Record<string, string> = {
  exhaustiveness: "Search harder: exhaustiveness up to 32 on Pro.",
  num_modes: "Keep up to 20 poses per run on Pro.",
  box_size: "Bigger search boxes (40 Å per side) on Pro.",
  private: "Private jobs — results only you (and your lab) can open.",
  batch: "Screen a ligand library against one target and rank the hits.",
  batch_size: "Screen up to 500 ligands per batch on Pro.",
  daily_jobs: "Pro runs 300 dockings a day, with priority in the queue.",
  concurrency: "Pro keeps up to 25 jobs in the queue at once.",
  pose_interactions: "Interaction maps and residue tables for every pose.",
  api: "REST API keys for scripted and notebook workflows.",
};

/** Global paywall modal — opened by any 401/402/429 with a paywall payload. */
export function PaywallModal() {
  const [pw, setPw] = useState<Paywall | null>(null);

  useEffect(() => {
    const onPw = (e: Event) => setPw((e as CustomEvent<Paywall>).detail);
    window.addEventListener("moldock:paywall", onPw);
    return () => window.removeEventListener("moldock:paywall", onPw);
  }, []);

  if (!pw) return null;
  const needsSignIn = pw.code === "sign_in_required";
  const pitch = (pw.feature && FEATURE_COPY[pw.feature]) || "MolDock Pro lifts the free-tier limits.";

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={() => setPw(null)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
    >
      <div
        className="bg-zinc-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] uppercase tracking-widest text-emerald-300 mb-2">
          {needsSignIn ? "Free account" : "MolDock Pro"}
        </p>
        <h2 id="paywall-title" className="text-lg font-light text-white mb-2">
          {pw.message}
        </h2>
        <p className="text-xs text-gray-400 mb-5">{pitch}</p>
        {pw.code === "quota_exceeded" && pw.resets_at && (
          <p className="text-[11px] text-gray-500 mb-4">
            Used {pw.used_today}/{pw.jobs_per_day} today · resets{" "}
            {new Date(pw.resets_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
        <div className="flex flex-col gap-2">
          {needsSignIn ? (
            <Link
              href={`/account?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`}
              onClick={() => setPw(null)}
              className="text-center bg-white text-black text-sm font-medium py-2.5 rounded-full hover:bg-gray-200"
            >
              Sign in free
            </Link>
          ) : (
            <Link
              href="/pricing"
              onClick={() => setPw(null)}
              className="text-center bg-white text-black text-sm font-medium py-2.5 rounded-full hover:bg-gray-200"
            >
              See MolDock Pro
            </Link>
          )}
          <button
            onClick={() => setPw(null)}
            className="text-xs text-gray-500 hover:text-white py-2"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
