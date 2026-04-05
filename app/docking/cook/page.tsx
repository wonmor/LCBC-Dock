"use client";

import { FC, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import axios from "axios";
import ProgressBar from "@/app/progressBar";
import { RotatingTriangles } from "react-loader-spinner";

const API_BASE =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://api.lcbcdock.com";

const Cook: FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  const proteinState = searchParams.get("proteinState") ?? "";
  const ligandCid = searchParams.get("ligandCid") ?? "";
  const ligandName = searchParams.get("ligandName") ?? "";

  const [email, setEmail] = useState("");
  const [centerX, setCenterX] = useState(0);
  const [centerY, setCenterY] = useState(0);
  const [centerZ, setCenterZ] = useState(0);
  const [sizeX, setSizeX] = useState(20);
  const [sizeY, setSizeY] = useState(20);
  const [sizeZ, setSizeZ] = useState(20);
  const [exhaustiveness, setExhaustiveness] = useState(8);
  const [numModes, setNumModes] = useState(9);
  const [energyRange, setEnergyRange] = useState(3.0);
  const [submitting, setSubmitting] = useState(false);
  const [loadingCenter, setLoadingCenter] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auto-compute grid center from protein
  useEffect(() => {
    if (proteinState) {
      axios
        .get(`${API_BASE}/api/proteins/${proteinState}/center`)
        .then((resp) => {
          setCenterX(resp.data.center_x);
          setCenterY(resp.data.center_y);
          setCenterZ(resp.data.center_z);
          setLoadingCenter(false);
        })
        .catch(() => {
          setLoadingCenter(false);
        });
    }
  }, [proteinState]);

  const handleSubmit = async () => {
    if (!proteinState || !ligandCid) {
      setError("Missing protein or ligand selection.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const resp = await axios.post(`${API_BASE}/api/dock`, {
        protein_pdb_id: proteinState,
        ligand_cid: parseInt(ligandCid),
        ligand_name: ligandName,
        center_x: centerX,
        center_y: centerY,
        center_z: centerZ,
        size_x: sizeX,
        size_y: sizeY,
        size_z: sizeZ,
        exhaustiveness: exhaustiveness,
        num_modes: numModes,
        energy_range: energyRange,
        email: email || null,
      });

      const jobId = resp.data.job_id;
      router.push(`/dashboard?jobId=${jobId}`);
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Failed to submit docking job. Please try again."
      );
      setSubmitting(false);
    }
  };

  return (
    <main className="pb-40">
      <div className="text-center mb-8">
        <h1 className="text-6xl font-thin mb-2">
          <span className="font-semibold">DOCK</span>
        </h1>
        <p className="text-xl opacity-75">
          {proteinState.toUpperCase()} + {ligandName}
        </p>
      </div>

      {submitting ? (
        <div className="flex flex-col items-center justify-center gap-4">
          <RotatingTriangles />
          <p className="text-xl">Submitting docking job...</p>
        </div>
      ) : (
        <div className="w-full max-w-lg mx-auto flex flex-col gap-6">
          {/* Summary */}
          <div className="bg-gray-900 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4 text-blue-300">
              Docking Summary
            </h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-400">Protein</span>
                <p className="font-mono text-lg">{proteinState.toUpperCase()}</p>
              </div>
              <div>
                <span className="text-gray-400">Ligand</span>
                <p className="text-lg">{ligandName}</p>
                <p className="text-xs text-gray-500">CID: {ligandCid}</p>
              </div>
            </div>
          </div>

          {/* Grid Box Configuration */}
          <div className="bg-gray-900 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4 text-blue-300">
              Grid Box
            </h2>

            {loadingCenter ? (
              <p className="text-sm text-gray-400">
                Auto-computing grid center from protein...
              </p>
            ) : (
              <>
                <p className="text-xs text-gray-400 mb-4">
                  Grid center auto-computed from protein geometry. Adjust if targeting a specific binding site.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-400">Center X</label>
                    <input
                      type="number"
                      step="0.1"
                      value={centerX}
                      onChange={(e) => setCenterX(parseFloat(e.target.value))}
                      className="w-full bg-gray-800 rounded-lg p-2 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Center Y</label>
                    <input
                      type="number"
                      step="0.1"
                      value={centerY}
                      onChange={(e) => setCenterY(parseFloat(e.target.value))}
                      className="w-full bg-gray-800 rounded-lg p-2 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Center Z</label>
                    <input
                      type="number"
                      step="0.1"
                      value={centerZ}
                      onChange={(e) => setCenterZ(parseFloat(e.target.value))}
                      className="w-full bg-gray-800 rounded-lg p-2 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">
                      Size X (&#197;)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={sizeX}
                      onChange={(e) => setSizeX(parseFloat(e.target.value))}
                      className="w-full bg-gray-800 rounded-lg p-2 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">
                      Size Y (&#197;)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={sizeY}
                      onChange={(e) => setSizeY(parseFloat(e.target.value))}
                      className="w-full bg-gray-800 rounded-lg p-2 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">
                      Size Z (&#197;)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={sizeZ}
                      onChange={(e) => setSizeZ(parseFloat(e.target.value))}
                      className="w-full bg-gray-800 rounded-lg p-2 text-sm mt-1"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Docking Parameters */}
          <div className="bg-gray-900 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4 text-blue-300">
              Docking Parameters
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-400">Exhaustiveness</label>
                <input
                  type="number"
                  min="1"
                  max="32"
                  value={exhaustiveness}
                  onChange={(e) => setExhaustiveness(parseInt(e.target.value))}
                  className="w-full bg-gray-800 rounded-lg p-2 text-sm mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Higher = more thorough
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-400">Num Modes</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={numModes}
                  onChange={(e) => setNumModes(parseInt(e.target.value))}
                  className="w-full bg-gray-800 rounded-lg p-2 text-sm mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">Poses to generate</p>
              </div>
              <div>
                <label className="text-xs text-gray-400">
                  Energy Range (kcal/mol)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="10"
                  value={energyRange}
                  onChange={(e) => setEnergyRange(parseFloat(e.target.value))}
                  className="w-full bg-gray-800 rounded-lg p-2 text-sm mt-1"
                />
              </div>
            </div>
          </div>

          {/* Email Notification */}
          <div className="bg-gray-900 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4 text-blue-300">
              Email Notification
            </h2>
            <p className="text-xs text-gray-400 mb-3">
              Get notified when your docking job completes. Optional.
            </p>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-800 rounded-lg p-3 text-sm"
            />
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-500 rounded-xl p-4 text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={!proteinState || !ligandCid || loadingCenter}
            className="w-full bg-blue-400 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed
                       text-black font-semibold py-4 rounded-2xl text-lg transition-colors"
          >
            Start Docking
          </button>

          <p className="text-center text-xs text-gray-500">
            Docking is powered by AutoDock Vina. Jobs are processed in order.
            <br />
            You can close this page — we&apos;ll email you when it&apos;s done.
          </p>
        </div>
      )}

      <ProgressBar
        pointer={4}
        backLink="/docking/ligand"
        backLinkParams={
          proteinState
            ? { proteinState: proteinState }
            : ({} as { [key: string]: string })
        }
      />
    </main>
  );
};

export default Cook;
