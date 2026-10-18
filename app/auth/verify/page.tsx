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

  useEffect(() => {
    if (started.current) return; // links are one-shot; StrictMode runs effects twice
    started.current = true;
    const token = params.get("token");
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
  }, [params, router]);

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
