"use client";

import { FC, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";

const API_BASE =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://lcbc-server.apps.johnseong.com";

/**
 * Side-by-side comparison view for up to eight docking jobs. Loaded
 * via `/compare?jobs=<id1>,<id2>,...`. Useful when a class compares
 * different ligands against the same target, or the same ligand
 * across pose-refinement parameter sweeps.
 */
const Compare: FC = () => {
  const params = useSearchParams();
  const jobsParam = params.get("jobs") || "";
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobsParam) { setLoading(false); return; }
    axios.get(`${API_BASE}/api/compare`, { params: { jobs: jobsParam } })
      .then((r) => setJobs(r.data.jobs || []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [jobsParam]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!jobs.length) {
    return (
      <div className="min-h-screen px-6 pt-24">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl font-extralight mb-3">Compare runs</h1>
          <p className="text-xs text-gray-500 mb-6">
            Pass job IDs as a comma-separated list:
            <span className="block mt-1 font-mono text-gray-400">/compare?jobs=abc123,def456</span>
          </p>
          <Link href="/dashboard" className="text-xs text-gray-500 hover:text-white">
            ← Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Best (most negative) affinity sets the bar reference.
  const completed = jobs.filter((j) => j.best_affinity != null);
  const minAffinity = completed.length
    ? Math.min(...completed.map((j) => j.best_affinity))
    : -10;
  const barWidth = (a: number | null) =>
    a == null ? 0 : Math.min(100, Math.max(5, (a / minAffinity) * 100));

  return (
    <div className="min-h-screen px-6 pt-24 pb-20">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-extralight text-center mb-2">Compare runs</h1>
        <p className="text-xs text-gray-500 text-center mb-10">
          {jobs.length} job{jobs.length === 1 ? "" : "s"} loaded
        </p>

        {/* Affinity bar chart */}
        <div className="border border-white/10 rounded-2xl p-5 mb-8">
          <p className="text-xs text-gray-400 mb-4">Best binding affinity (more negative = stronger)</p>
          <div className="space-y-3">
            {jobs.map((j) => (
              <div key={j.job_id}>
                <div className="flex items-baseline justify-between text-xs mb-1">
                  <Link href={`/results/${j.job_id}`}
                        className="text-white hover:underline truncate max-w-[60%]">
                    {j.protein_pdb_id?.toUpperCase()} + {j.ligand_name}
                  </Link>
                  <span className="font-mono text-gray-300">
                    {j.best_affinity != null ? `${j.best_affinity} kcal/mol` : j.status}
                  </span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full transition-all"
                    style={{ width: `${barWidth(j.best_affinity)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Parameter table */}
        <div className="border border-white/10 rounded-2xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-white/10 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Field</th>
                {jobs.map((j) => (
                  <th key={j.job_id} className="text-left px-4 py-3 font-medium">
                    <Link href={`/results/${j.job_id}`} className="hover:underline text-white">
                      {j.protein_pdb_id?.toUpperCase()}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label="Ligand"          jobs={jobs} get={(j) => j.ligand_name} />
              <Row label="Status"          jobs={jobs} get={(j) => j.status} mono />
              <Row label="Best affinity"   jobs={jobs} get={(j) => j.best_affinity != null ? `${j.best_affinity} kcal/mol` : "—"} />
              <Row label="Poses"           jobs={jobs} get={(j) => j.num_poses ?? "—"} mono />
              <Row label="Exhaustiveness"  jobs={jobs} get={(j) => j.exhaustiveness} mono />
              <Row label="Modes"           jobs={jobs} get={(j) => j.num_modes} mono />
              <Row label="Energy range"    jobs={jobs} get={(j) => j.energy_range} mono />
              <Row label="Search box"      jobs={jobs} get={(j) => `${j.size_x?.toFixed(0)}×${j.size_y?.toFixed(0)}×${j.size_z?.toFixed(0)} Å`} mono />
              <Row label="Tags"            jobs={jobs} get={(j) => j.tags || "—"} />
            </tbody>
          </table>
        </div>

        <div className="text-center mt-8">
          <Link href="/dashboard" className="text-xs text-gray-500 hover:text-white">
            ← Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};

function Row({ label, jobs, get, mono }: { label: string; jobs: any[]; get: (j: any) => any; mono?: boolean }) {
  return (
    <tr className="border-t border-white/5">
      <td className="px-4 py-2 text-gray-400">{label}</td>
      {jobs.map((j) => (
        <td key={j.job_id} className={`px-4 py-2 ${mono ? "font-mono" : ""} text-white`}>
          {String(get(j) ?? "—")}
        </td>
      ))}
    </tr>
  );
}

export default Compare;
