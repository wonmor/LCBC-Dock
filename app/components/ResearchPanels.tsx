"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE, downloadFile } from "@/app/lib/api";

const TYPE_LABEL: Record<string, string> = {
  hbond: "H-bond",
  hydrophobic: "Hydrophobic",
  pi_stacking: "π-stacking",
  salt_bridge: "Salt bridge",
  metal: "Metal",
};

export function RmsdCard({ analysis }: { analysis: any }) {
  const r = analysis?.rmsd;
  if (!r) return null;
  const top = r.values?.[0];
  const ok = top != null && top < 2;
  return (
    <div className="border border-white/10 rounded-2xl p-5 mb-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-gray-400">Redocking validation</p>
        <p className="text-[10px] text-gray-500">vs crystal {r.reference}</p>
      </div>
      {top == null ? (
        <p className="text-xs text-gray-500 mt-2">{r.note || "RMSD not available."}</p>
      ) : (
        <>
          <p className={`text-3xl font-light mt-2 ${ok ? "text-emerald-400" : "text-amber-400"}`}>
            {top.toFixed(2)} Å
          </p>
          <p className="text-[10px] text-gray-500 mt-1">
            Heavy-atom RMSD of the top pose (element-matched Hungarian assignment, no fitting).{" "}
            {ok ? "Below 2 Å — the protocol reproduces the crystal pose." : "Above 2 Å — the top pose differs from the crystal pose; check the box and protonation."}
          </p>
          <div className="flex flex-wrap gap-1 mt-3">
            {r.values.map((v: number | null, i: number) => (
              <span
                key={i}
                className={`text-[10px] px-2 py-0.5 rounded-full ${v != null && v < 2 ? "bg-emerald-400/15 text-emerald-300" : "bg-white/5 text-gray-400"}`}
              >
                #{i + 1} {v != null ? v.toFixed(2) : "–"}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function InteractionsPanel({ jobId, numPoses, analysis }: { jobId: string; numPoses: number; analysis: any }) {
  const [pose, setPose] = useState(1);
  const [data, setData] = useState<any>(null);
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    setLocked(false);
    setData(null);
    setSvgUrl(null);
    axios
      .get(`${API_BASE}/api/results/${jobId}/interactions`, { params: { pose } })
      .then((r) => setData(r.data))
      .catch((e) => {
        if (e?.response?.status === 402) setLocked(true);
      });
    axios
      .get(`${API_BASE}/api/results/${jobId}/interactions.svg`, {
        params: { pose },
        responseType: "blob",
        // the JSON call above already opens the paywall once
        silentPaywall: true,
      } as any)
      .then((r) => {
        url = URL.createObjectURL(r.data);
        setSvgUrl(url);
      })
      .catch(() => {});
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [jobId, pose]);

  const lockedPoses = new Set(
    (analysis?.poses || []).map((p: any, i: number) => (p?.locked ? i + 1 : 0)).filter(Boolean),
  );

  return (
    <div className="border border-white/10 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-400">Protein–ligand interactions</p>
        <div className="flex flex-wrap gap-1 justify-end" role="tablist" aria-label="Pose">
          {Array.from({ length: numPoses }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={pose === p}
              onClick={() => setPose(p)}
              className={`text-[10px] w-6 h-6 rounded-full ${
                pose === p ? "bg-white text-black" : "bg-white/5 text-gray-400 hover:bg-white/10"
              }`}
              title={lockedPoses.has(p) ? "Pro" : `Pose ${p}`}
            >
              {lockedPoses.has(p) ? "🔒" : p}
            </button>
          ))}
        </div>
      </div>
      {locked ? (
        <div className="text-center py-10">
          <p className="text-sm">Interactions for every pose are part of MolDock Pro.</p>
          <a href="/pricing" className="inline-block mt-3 text-xs bg-white text-black px-4 py-2 rounded-full">See Pro</a>
        </div>
      ) : (
        <>
          {svgUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={svgUrl} alt={`2D interaction diagram for pose ${pose}`} className="w-full rounded-xl bg-white" />
          ) : (
            <div className="aspect-square w-full rounded-xl bg-white/5 animate-pulse" />
          )}
          {data?.counts && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {Object.entries(data.counts).map(([k, v]) =>
                (v as number) > 0 ? (
                  <span key={k} className="text-[10px] bg-white/5 text-gray-300 px-2 py-0.5 rounded-full">
                    {TYPE_LABEL[k] ?? k} × {v as number}
                  </span>
                ) : null,
              )}
            </div>
          )}
          {data?.residues?.length > 0 && (
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-gray-500 border-b border-white/5">
                    <th className="text-left py-1.5">Residue</th>
                    <th className="text-right">H-bond</th>
                    <th className="text-right">Hydrophobic</th>
                    <th className="text-right">π</th>
                    <th className="text-right">Salt br.</th>
                    <th className="text-right">Min d (Å)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.residues.map((r: any) => (
                    <tr key={r.residue} className="border-b border-white/5 last:border-0">
                      <td className="py-1.5 font-mono">{r.residue}</td>
                      <td className="text-right">{r.hbond || ""}</td>
                      <td className="text-right">{r.hydrophobic || ""}</td>
                      <td className="text-right">{r.pi_stacking || ""}</td>
                      <td className="text-right">{r.salt_bridge || ""}</td>
                      <td className="text-right tabular-nums">{r.min_distance.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[10px] text-gray-600 mt-2">
            Geometric detection (H-bond ≤ 3.5 Å with D–H···A ≥ 120°, hydrophobic C···C ≤ 4.0 Å, π-stacking ≤ 5.5 Å, salt bridge ≤ 5.5 Å).
          </p>
        </>
      )}
    </div>
  );
}

const EXPORTS: [string, string, string][] = [
  ["zip", "Everything (.zip)", "zip"],
  ["sdf", "Poses SDF", "sdf"],
  ["complex", "Complex PDB", "pdb"],
  ["pymol", "PyMOL session", "pml"],
  ["chimerax", "ChimeraX script", "cxc"],
  ["csv", "Poses CSV", "csv"],
  ["interactions-csv", "Interactions CSV", "csv"],
  ["params", "params.json", "json"],
];

export function ExportsPanel({ jobId, hasReceptor }: { jobId: string; hasReceptor: boolean }) {
  return (
    <div className="border border-white/10 rounded-2xl p-5 mb-4">
      <p className="text-xs text-gray-400 mb-3">Export</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {EXPORTS.filter(([f]) => hasReceptor || f !== "complex").map(([fmt, label, ext]) => (
          <button
            key={fmt}
            onClick={() =>
              downloadFile(`${API_BASE}/api/results/${jobId}/export/${fmt}`, `moldock_${jobId.slice(0, 8)}_${fmt}.${ext}`)
            }
            className={`text-[11px] py-2 rounded-full transition-colors ${
              fmt === "zip" ? "bg-white text-black font-medium hover:bg-gray-200" : "bg-white/10 hover:bg-white/20"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MethodsPanel({ methods, repro, jobId }: { methods: string | null; repro: any; jobId: string }) {
  const [copied, setCopied] = useState(false);
  if (!methods) return null;
  return (
    <div className="border border-white/10 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400">Methods paragraph</p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(methods);
              setCopied(true);
            }}
            className="text-[10px] bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={() => downloadFile(`${API_BASE}/api/results/${jobId}/export/bibtex`, `moldock_${jobId.slice(0, 8)}.bib`)}
            className="text-[10px] bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full"
          >
            BibTeX
          </button>
        </div>
      </div>
      <p className="text-[11px] text-gray-300 leading-relaxed">{methods}</p>
      {repro && (
        <details className="mt-3">
          <summary className="text-[10px] text-gray-500 cursor-pointer">Reproducibility record</summary>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] mt-2">
            <dt className="text-gray-500">AutoDock Vina</dt><dd>{repro.vina_version}</dd>
            <dt className="text-gray-500">Open Babel</dt><dd>{repro.obabel_version}</dd>
            <dt className="text-gray-500">RDKit</dt><dd>{repro.rdkit_version}</dd>
            <dt className="text-gray-500">Seed</dt><dd>{repro.seed}</dd>
            <dt className="text-gray-500">Runtime</dt><dd>{repro.runtime_s} s</dd>
          </dl>
          {repro.command && (
            <pre className="mt-2 bg-black/50 rounded-lg p-2 text-[10px] text-gray-400 whitespace-pre-wrap break-all">{repro.command}</pre>
          )}
        </details>
      )}
    </div>
  );
}
