"use client";

import { FC, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";

const API_BASE =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://api.lcbcdock.com";

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

  useEffect(() => {
    if (!jobId) return;
    axios
      .get(`${API_BASE}/api/results/${jobId}`)
      .then((r) => setResults(r.data))
      .catch((e) => setError(e.response?.data?.detail || "Could not load results."))
      .finally(() => setLoading(false));
  }, [jobId]);

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

        {/* 3D viewer via RCSB */}
        <div className="w-full aspect-square bg-white/5 rounded-2xl overflow-hidden mb-6">
          <iframe
            src={`https://www.rcsb.org/3d-view/${results.protein_pdb_id}`}
            className="w-full h-full border-0"
            title="Protein 3D View"
          />
        </div>

        {/* Best affinity */}
        <div className="border border-white/10 rounded-2xl p-6 text-center mb-4">
          <p className="text-3xl font-light text-green-400">{results.best_affinity} kcal/mol</p>
          <p className="text-[10px] text-gray-500 mt-1">Best binding affinity</p>
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

        {/* Downloads */}
        <div className="flex gap-2">
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

        <div className="flex justify-center gap-4 mt-6 text-xs">
          <Link href={`/dashboard?jobId=${jobId}`} className="text-gray-500 hover:text-white transition-colors">
            Dashboard
          </Link>
          <Link href="/docking/protein" className="text-gray-500 hover:text-white transition-colors">
            New Docking
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Results;
