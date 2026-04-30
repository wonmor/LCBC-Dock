"use client";

import { FC, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import ProteinViewer from "@/app/components/ProteinViewer";

const API_BASE =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://lcbc-server.apps.johnseong.com";

interface Pose {
  model: number;
  affinity: number;
}

const Results: FC = () => {
  const params = useParams();
  const jobId = params.jobId as string;

  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [citeOpen, setCiteOpen] = useState(false);
  const [citeFormat, setCiteFormat] = useState<"bibtex" | "ris" | "text">("bibtex");
  const [citeText, setCiteText] = useState("");
  const [citeLoading, setCiteLoading] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    axios
      .get(`${API_BASE}/api/results/${jobId}`)
      .then((r) => {
        setResults(r.data);
        setNotes(r.data.notes || "");
        setTags(r.data.tags || "");
      })
      .catch((e) => setError(e.response?.data?.detail || "Could not load results."))
      .finally(() => setLoading(false));
  }, [jobId]);

  const saveMetadata = async () => {
    setSavingMeta(true);
    try {
      await axios.patch(`${API_BASE}/api/jobs/${jobId}`, { notes, tags });
      setSavedAt(Date.now());
    } catch {
      /* swallow — saving notes is best-effort */
    } finally {
      setSavingMeta(false);
    }
  };

  const fetchCitation = async (format: "bibtex" | "ris" | "text") => {
    setCiteFormat(format);
    setCiteLoading(true);
    try {
      const r = await axios.get(`${API_BASE}/api/results/${jobId}/citation`, {
        params: { format },
        responseType: "text",
      });
      setCiteText(typeof r.data === "string" ? r.data : JSON.stringify(r.data));
    } catch {
      setCiteText("Could not generate citation.");
    } finally {
      setCiteLoading(false);
    }
  };

  // Score interpretation. AutoDock Vina kcal/mol — these thresholds
  // come from the docking literature (e.g., -7 is generally considered
  // a strong hit for drug-like ligands).
  const interpretScore = (a: number | null | undefined) => {
    if (a == null) return null;
    if (a <= -10) return { tier: "Excellent", color: "text-emerald-400", desc: "Sub-nanomolar regime — exceptional in silico hit." };
    if (a <= -8)  return { tier: "Strong",    color: "text-green-400",   desc: "Likely meaningful binding; worth experimental follow-up." };
    if (a <= -6)  return { tier: "Moderate",  color: "text-yellow-400",  desc: "Reasonable docking; refine pocket / ligand and re-run." };
    if (a <= -4)  return { tier: "Weak",      color: "text-orange-400",  desc: "Loose fit; consider a larger box or alternative ligand." };
    return         { tier: "Poor",      color: "text-red-400",     desc: "Unfavourable — review grid placement and protonation states." };
  };
  const interp = results ? interpretScore(results.best_affinity) : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center min-h-screen px-6 pt-24">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center min-h-screen px-6 pt-24 text-center">
        <h1 className="text-4xl font-extralight mb-4">Results</h1>
        <p className="text-xs text-red-400">{error}</p>
        <Link href={`/dashboard?jobId=${jobId}`} className="text-xs text-gray-500 mt-4 hover:text-white">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (!results) return null;

  return (
    <div className="flex flex-col items-center min-h-screen px-6 pt-24 pb-12">
      <div className="w-full max-w-lg">
        <h1 className="text-4xl font-extralight text-center mb-1">Results</h1>
        <p className="text-xs text-gray-500 text-center mb-10">
          {results.protein_pdb_id?.toUpperCase()} + {results.ligand_name}
        </p>

        {/* 3D viewer with docked ligand */}
        <div className="mb-6">
          <ProteinViewer
            pdbId={results.protein_pdb_id}
            ligandPdb={results.docked_pdb}
            height="450px"
          />
          <p className="text-[10px] text-gray-600 text-center mt-2">
            Protein (rainbow) + docked ligand (green). Toggle style below.
          </p>
        </div>

        {/* Best affinity + plain-English interpretation */}
        <div className="border border-white/10 rounded-2xl p-6 text-center mb-4">
          <p className={`text-3xl font-light ${interp?.color ?? "text-green-400"}`}>
            {results.best_affinity} kcal/mol
          </p>
          <p className="text-[10px] text-gray-500 mt-1">Best binding affinity</p>
          {interp && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <p className={`text-xs font-medium ${interp.color}`}>{interp.tier}</p>
              <p className="text-[10px] text-gray-500 mt-1">{interp.desc}</p>
            </div>
          )}
          <Link
            href="/glossary#binding-affinity"
            className="inline-block mt-3 text-[10px] text-gray-500 underline decoration-dotted underline-offset-2 hover:text-white"
          >
            What does this number mean?
          </Link>
        </div>

        {/* Poses table */}
        {results.poses?.length > 0 && (
          <div className="border border-white/10 rounded-2xl overflow-hidden mb-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 text-gray-500">
                  <th className="text-left px-4 py-2">Pose</th>
                  <th className="text-right px-4 py-2">Affinity (kcal/mol)</th>
                </tr>
              </thead>
              <tbody>
                {results.poses.map((pose: Pose, i: number) => (
                  <tr key={pose.model} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-2 font-mono">
                      Model {pose.model}
                      {i === 0 && (
                        <span className="ml-2 bg-green-400/20 text-green-400 text-[9px] px-1.5 py-0.5 rounded-full">
                          BEST
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-2 text-right ${i === 0 ? "text-green-400" : ""}`}>
                      {pose.affinity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Lab notebook — notes + tags. Saved per-job; visible to
            anyone with the link, so suitable for class assignments
            but not private journaling. */}
        <div className="border border-white/10 rounded-2xl p-4 mb-4">
          <p className="text-xs text-gray-400 mb-3">Lab notebook</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Hypothesis, expected interactions, observations…"
            rows={4}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-white/30 resize-none"
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Tags, comma-separated (e.g. ochem-201, thesis, kinase)"
            className="w-full mt-2 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-white/30"
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-[10px] text-gray-600">
              {savedAt ? "Saved" : "Unsaved changes don't persist after reload"}
            </span>
            <button
              onClick={saveMetadata}
              disabled={savingMeta}
              className="bg-white/10 hover:bg-white/20 text-white text-xs px-4 py-1.5 rounded-full disabled:opacity-50"
            >
              {savingMeta ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {/* Downloads + academic exports */}
        <div className="flex gap-2 mb-2">
          <a
            href={`${API_BASE}/api/results/${jobId}/download/pdb`}
            className="flex-1 text-center bg-white text-black text-xs font-medium py-2.5 rounded-full hover:bg-gray-200 transition-colors"
          >
            Download PDB
          </a>
          <a
            href={`${API_BASE}/api/results/${jobId}/download/pdbqt`}
            className="flex-1 text-center bg-white/10 text-white text-xs font-medium py-2.5 rounded-full hover:bg-white/20 transition-colors"
          >
            Download PDBQT
          </a>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setCiteOpen(true); fetchCitation("bibtex"); }}
            className="flex-1 text-center bg-white/10 text-white text-xs font-medium py-2.5 rounded-full hover:bg-white/20 transition-colors"
          >
            Cite
          </button>
          <Link
            href={`/results/${jobId}/report`}
            className="flex-1 text-center bg-white/10 text-white text-xs font-medium py-2.5 rounded-full hover:bg-white/20 transition-colors"
          >
            Lab Report
          </Link>
        </div>

        <div className="flex justify-center gap-4 mt-6 text-xs">
          <Link href={`/dashboard?jobId=${jobId}`} className="text-gray-500 hover:text-white transition-colors">
            Dashboard
          </Link>
          <Link href="/docking/protein" className="text-gray-500 hover:text-white transition-colors">
            New Docking
          </Link>
          <Link href="/glossary" className="text-gray-500 hover:text-white transition-colors">
            Glossary
          </Link>
        </div>
      </div>

      {/* Citation modal */}
      {citeOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setCiteOpen(false)}
        >
          <div
            className="bg-zinc-900 border border-white/10 rounded-2xl p-6 max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-light text-white">Cite this run</h2>
              <button
                onClick={() => setCiteOpen(false)}
                className="text-gray-500 hover:text-white text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              {(["bibtex", "ris", "text"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => fetchCitation(f)}
                  className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                    citeFormat === f
                      ? "bg-white text-black"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <pre className="bg-black/50 border border-white/5 rounded-lg p-3 text-[11px] text-gray-300 whitespace-pre-wrap max-h-72 overflow-auto font-mono">
              {citeLoading ? "Generating…" : citeText}
            </pre>
            <button
              onClick={() => navigator.clipboard?.writeText(citeText)}
              disabled={citeLoading || !citeText}
              className="mt-3 w-full bg-white text-black text-xs font-medium py-2 rounded-full hover:bg-gray-200 disabled:opacity-50"
            >
              Copy to clipboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Results;
