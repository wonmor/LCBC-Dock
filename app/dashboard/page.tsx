"use client";

import { FC, useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";

const API_BASE =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://lcbc-server.apps.johnseong.com";

const statusLabel: Record<string, string> = {
  queued: "In Queue",
  preparing: "Preparing",
  docking: "Docking",
  completed: "Done",
  failed: "Failed",
};

const Dashboard: FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const jobId = searchParams.get("jobId") ?? "";

  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputId, setInputId] = useState("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      try {
        const resp = await axios.get(`${API_BASE}/api/jobs/${jobId}`);
        setJob(resp.data);
        if (resp.data.status === "completed" || resp.data.status === "failed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch {
        setError("Job not found.");
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [jobId]);

  if (!jobId) {
    return (
      <div className="flex flex-col items-center min-h-screen px-6 pt-24">
        <div className="w-full max-w-md text-center">
          <h1 className="text-4xl font-extralight mb-8">Dashboard</h1>
          <input
            type="text"
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && inputId.trim()) {
                router.push(`/dashboard?jobId=${inputId.trim()}`);
              }
            }}
            placeholder="Paste job ID..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm
                       placeholder-gray-600 focus:outline-none focus:border-white/30"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen px-6 pt-24">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-extralight text-center mb-1">Dashboard</h1>
        <p className="text-xs text-gray-500 text-center font-mono mb-10">
          {jobId.slice(0, 8)}...
        </p>

        {error && <p className="text-xs text-red-400 text-center">{error}</p>}

        {!job && !error && (
          <div className="flex justify-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {job && (
          <div className="space-y-4">
            <div className="border border-white/10 rounded-2xl p-6 text-center">
              {job.status === "completed" ? (
                <p className="text-green-400 text-lg font-light">Complete</p>
              ) : job.status === "failed" ? (
                <p className="text-red-400 text-lg font-light">Failed</p>
              ) : (
                <>
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-gray-400">
                    {statusLabel[job.status] || job.status}
                  </p>
                </>
              )}
            </div>

            <div className="border border-white/10 rounded-2xl p-5 space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Protein</span>
                <span className="font-mono">{job.protein_pdb_id?.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Ligand</span>
                <span>{job.ligand_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Submitted</span>
                <span>{new Date(job.created_at).toLocaleString()}</span>
              </div>
              {job.best_affinity != null && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Best Affinity</span>
                  <span className="text-green-400 font-medium">{job.best_affinity} kcal/mol</span>
                </div>
              )}
            </div>

            {job.status === "completed" && (
              <Link
                href={`/results/${jobId}`}
                className="block w-full bg-white text-black py-3 rounded-full text-sm font-medium text-center hover:bg-gray-200 transition-colors"
              >
                View Results
              </Link>
            )}

            {job.status === "failed" && job.error_message && (
              <p className="text-xs text-red-400 text-center">{job.error_message}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
