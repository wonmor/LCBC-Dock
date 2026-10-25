"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { API_BASE, errorText, setToken } from "@/app/lib/api";

function Verify() {
  const params = useSearchParams();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);
  const token = params.get("token");
  // Requested from the phone app: hand the one-shot token to the app
  // instead of spending it here, unless the visitor chooses the web.
  const [appHandoff, setAppHandoff] = useState(params.get("app") === "1");
  const appUrl = token ? `dockit://auth?token=${encodeURIComponent(token)}` : "";

  useEffect(() => {
    if (appHandoff && appUrl) window.location.href = appUrl;
  }, [appHandoff, appUrl]);

  useEffect(() => {
    if (appHandoff) return;
    if (started.current) return; // links are one-shot; StrictMode runs effects twice
    started.current = true;
    const next = params.get("next");
    if (!token) {
      setErr("Missing sign-in token.");
      return;
    }
    axios
      .get(`${API_BASE}/api/auth/verify`, { params: { token } })
      .then((r) => {
        setToken(r.data.session_token);
        router.replace(next && next.startsWith("/") ? next : "/account");
      })
      .catch((e) => setErr(errorText(e, "This link is invalid or expired.")));
  }, [params, router, token, appHandoff]);

  if (appHandoff && token) {
    return (
      <div className="flex flex-col items-center min-h-screen px-6 pt-32 text-center">
        <p className="text-sm text-gray-300 mb-6">Open MolDock on this device to finish signing in.</p>
        <a href={appUrl} className="px-6 py-3 rounded-full bg-white text-black text-sm font-semibold mb-4">
          Open the MolDock app
        </a>
        <p className="text-xs text-gray-500 mb-6 max-w-xs">
          Reading this on another device? Enter the 6-digit code from the email in the app instead.
        </p>
        <button onClick={() => setAppHandoff(false)} className="text-xs text-gray-400 underline">
          Sign in on this website instead
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen px-6 pt-32 text-center">
      {err ? (
        <>
          <p className="text-sm text-red-400 mb-4">{err}</p>
          <a href="/account" className="text-xs text-gray-400 underline">Request a new link</a>
        </>
      ) : (
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <Verify />
    </Suspense>
  );
}
