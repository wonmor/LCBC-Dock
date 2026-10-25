"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { API_BASE, downloadFile, errorText } from "@/app/lib/api";

export default function BatchResults() {
  const { batchId } = useParams() as { batchId: string };
  const [b, setB] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const load = () =>
      axios
        .get(`${API_BASE}/api/batch/${batchId}`)
        .then((r) => {
          setB(r.data);
          const c = r.data.counts;
          if (c.queued + c.preparing + c.docking === 0 && timer.current) clearInterval(timer.current);
        })
        .catch((e) => setErr(errorText(e, "Batch not found.")));
    load();
    timer.current = setInterval(load, 4000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [batchId]);

  if (err) return <p className="pt-32 text-center text-xs text-red-400">{err}</p>;
  if (!b) return <div className="pt-32 flex justify-center"><div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>;

  const c = b.counts;
  const done = c.completed + c.failed;
  const pct = b.n_ligands ? Math.round((100 * done) / b.n_ligands) : 0;
  const best = b.ligands.find((l: any) => l.rank === 1);

  return (
    <div className="flex flex-col items-center min-h-screen px-4 sm:px-6 pt-20 pb-16">
      <div className="w-full max-w-4xl">
        <h1 className="text-3xl sm:text-4xl font-extralight text-center mb-1">{b.name}</h1>
        <p className="text-xs text-gray-500 text-center mb-6">
          {b.protein_pdb_id} | {b.n_ligands} ligands | exhaustiveness {b.params.exhaustiveness} | site{" "}
          {b.params.site?.mode}
          {b.visibility === "private" && " | private"}
        </p>

        <div className="border border-white/10 rounded-2xl p-4 mb-4">
          <div className="flex justify-between text-[11px] text-gray-400 mb-1.5">
            <span>
              {done < b.n_ligands ? `Docking… ${c.docking + c.preparing} running, ${c.queued} queued` : "Finished"}
            </span>
            <span>
              {done}/{b.n_ligands}
              {c.failed > 0 && <span className="text-red-400"> | {c.failed} failed</span>}
            </span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-end mb-3">
          <button
            onClick={() => downloadFile(`${API_BASE}/api/batch/${batchId}/csv`, `moldock_${batchId}.csv`)}
            className="text-xs bg-white text-black font-medium px-4 py-2 rounded-full hover:bg-gray-200"
          >
            Download CSV
          </button>
          {best && (
            <Link href={`/results/${best.job_id}`} className="text-xs bg-white/10 px-4 py-2 rounded-full hover:bg-white/20">
              Open top hit
            </Link>
          )}
        </div>

        <div className="border border-white/10 rounded-2xl overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="border-b border-white/5 text-gray-500 text-left">
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2">Ligand</th>
                <th className="px-3 py-2 text-right">Affinity (kcal/mol)</th>
                <th className="px-3 py-2 text-right" title="−ΔG / heavy atoms">LE</th>
                <th className="px-3 py-2 text-right">HA</th>
                <th className="px-3 py-2 text-right">H-bonds</th>
                <th className="px-3 py-2">Key residues</th>
              </tr>
            </thead>
            <tbody>
              {b.ligands.map((l: any) => (
                <tr key={l.job_id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-3 py-2 text-gray-500 tabular-nums">{l.rank ?? "–"}</td>
                  <td className="px-3 py-2">
                    {l.status === "completed" ? (
                      <Link href={`/results/${l.job_id}`} className="hover:underline">{l.ligand_name}</Link>
                    ) : (
                      <span className="text-gray-400">{l.ligand_name}</span>
                    )}
                    <span className="block text-[10px] text-gray-600 font-mono truncate max-w-[220px]" title={l.ligand_smiles}>
                      {l.ligand_smiles}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${l.rank === 1 ? "text-emerald-400" : ""}`}>
                    {l.best_affinity != null ? l.best_affinity.toFixed(2) : (
                      <span className={`text-[10px] ${l.status === "failed" ? "text-red-400" : "text-gray-500"}`} title={l.error_message || ""}>
                        {l.status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.ligand_efficiency != null ? l.ligand_efficiency.toFixed(2) : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-400">{l.heavy_atoms ?? ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.hbonds ?? ""}</td>
                  <td className="px-3 py-2 text-[10px] text-gray-400">{(l.key_residues || []).join(" ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-gray-600 mt-3">
          LE = ligand efficiency (−affinity / heavy atoms; ≥ 0.3 is usually considered efficient). Vina scores rank
          poses, not measured affinities — confirm hits experimentally.
        </p>
      </div>
    </div>
  );
}
