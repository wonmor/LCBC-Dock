"use client";

import { FC, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import axios from "axios";

const API_BASE =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://lcbc-server.apps.johnseong.com";

const Cook: FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  const proteinState = searchParams.get("proteinState") ?? "";
  const ligandCid = searchParams.get("ligandCid") ?? "";
  const ligandName = searchParams.get("ligandName") ?? "";

  const [email, setEmail] = useState("");
  const [exhaustiveness, setExhaustiveness] = useState(8);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const resp = await axios.post(`${API_BASE}/api/dock`, {
        protein_pdb_id: proteinState,
        ligand_cid: parseInt(ligandCid),
        ligand_name: ligandName,
        center_x: 0,
        center_y: 0,
        center_z: 0,
        size_x: 20,
        size_y: 20,
        size_z: 20,
        exhaustiveness,
        num_modes: 9,
        energy_range: 3.0,
        email: email || null,
      });

      router.push(`/dashboard?jobId=${resp.data.job_id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to submit. Is the backend running?");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-center min-h-screen px-6 pt-24 pb-32">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-extralight text-center mb-1">Dock</h1>
        <p className="text-xs text-gray-500 text-center mb-10">
          {proteinState.toUpperCase()} + {ligandName}
        </p>

        <div className="space-y-4">
          {/* Summary */}
          <div className="border border-white/10 rounded-2xl p-5">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-500">Protein</span>
                <p className="text-sm font-mono mt-0.5">{proteinState.toUpperCase()}</p>
              </div>
              <div>
                <span className="text-gray-500">Ligand</span>
                <p className="text-sm mt-0.5">{ligandName}</p>
              </div>
            </div>
          </div>

          {/* Exhaustiveness */}
          <div className="border border-white/10 rounded-2xl p-5">
            <label className="text-xs text-gray-500">Exhaustiveness (1-32)</label>
            <input
              type="range"
              min="1"
              max="32"
              value={exhaustiveness}
              onChange={(e) => setExhaustiveness(parseInt(e.target.value))}
              className="w-full mt-2 accent-white"
            />
            <p className="text-right text-xs text-gray-400 mt-1">{exhaustiveness}</p>
          </div>

          {/* Email */}
          <div className="border border-white/10 rounded-2xl p-5">
            <label className="text-xs text-gray-500">Email (optional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Notify me when done"
              className="w-full bg-transparent border-b border-white/10 py-2 text-sm
                         placeholder-gray-600 focus:outline-none focus:border-white/30 mt-1"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || !proteinState || !ligandCid}
            className="w-full bg-white text-black py-3 rounded-full text-sm font-medium
                       hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {submitting ? "Submitting..." : "Start Docking"}
          </button>

          <p className="text-[10px] text-gray-600 text-center">
            Grid center auto-computed from protein. Powered by AutoDock Vina.
          </p>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md border-t border-white/5">
        <div className="max-w-md mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex gap-1">
            {["Protein", "Prepare", "Ligand", "Dock"].map((step, i) => (
              <span
                key={step}
                className={`text-[10px] px-2 py-1 rounded-full ${
                  i === 3
                    ? "bg-white text-black"
                    : "bg-white/5 text-gray-500"
                }`}
              >
                {step}
              </span>
            ))}
          </div>
          <a
            href={`/docking/ligand?proteinState=${proteinState}`}
            className="text-xs text-gray-500 hover:text-white px-3 py-2 transition-colors"
          >
            Back
          </a>
        </div>
      </div>
    </div>
  );
};

export default Cook;
