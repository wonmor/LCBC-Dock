"use client";

import { FC, useState, useEffect, useRef, createRef } from "react";
import { useParams } from "next/navigation";
import axios from "axios";
import Link from "next/link";
import { RotatingTriangles } from "react-loader-spinner";
import DownloadIcon from "@mui/icons-material/Download";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

const API_BASE =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://api.lcbcdock.com";

interface Pose {
  model: number;
  affinity: number;
  pdbqt: string;
}

interface DockingResults {
  job_id: string;
  protein_pdb_id: string;
  ligand_cid: number;
  ligand_name: string;
  best_affinity: number;
  num_poses: number;
  poses: Pose[];
  docked_pdb: string;
  output_pdbqt: string;
}

const ResultsViewer: FC = () => {
  const params = useParams();
  const jobId = params.jobId as string;

  const [results, setResults] = useState<DockingResults | null>(null);
  const [selectedPose, setSelectedPose] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const viewerRef = createRef<HTMLDivElement>();
  const pluginRef = useRef<any>(null);

  useEffect(() => {
    if (!jobId) return;

    axios
      .get(`${API_BASE}/api/results/${jobId}`)
      .then((resp) => {
        setResults(resp.data);
        setLoading(false);
      })
      .catch((err) => {
        setError(
          err.response?.data?.detail || "Could not load results."
        );
        setLoading(false);
      });
  }, [jobId]);

  // Initialize Mol* viewer when results are loaded
  useEffect(() => {
    if (!results || !viewerRef.current || viewerReady) return;

    async function initViewer() {
      try {
        const { PluginSpec } = await import("molstar/lib/mol-plugin/spec");
        const { createPluginUI } = await import("molstar/lib/mol-plugin-ui");

        const spec: any = {
          actions: [],
          behaviors: [],
          layout: {
            initial: {
              isExpanded: false,
              showControls: true,
            },
          },
          animations: [],
        };

        const plugin = await createPluginUI(
          viewerRef.current as HTMLDivElement,
          spec
        );
        pluginRef.current = plugin;

        // Load protein structure
        const proteinData = await plugin.builders.data.download(
          {
            url: `https://files.rcsb.org/download/${results!.protein_pdb_id}.pdb`,
          },
          { state: { isGhost: true } }
        );
        const proteinTraj =
          await plugin.builders.structure.parseTrajectory(
            proteinData,
            "pdb"
          );
        await plugin.builders.structure.hierarchy.applyPreset(
          proteinTraj,
          "default"
        );

        // Load docked ligand PDB if available
        if (results!.docked_pdb) {
          const blob = new Blob([results!.docked_pdb], {
            type: "text/plain",
          });
          const url = URL.createObjectURL(blob);

          const ligandData = await plugin.builders.data.download(
            { url },
            { state: { isGhost: true } }
          );
          const ligandTraj =
            await plugin.builders.structure.parseTrajectory(
              ligandData,
              "pdb"
            );
          await plugin.builders.structure.hierarchy.applyPreset(
            ligandTraj,
            "default"
          );

          URL.revokeObjectURL(url);
        }

        setViewerReady(true);
      } catch (e) {
        console.error("Failed to initialize Mol* viewer:", e);
      }
    }

    initViewer();

    return () => {
      if (pluginRef.current) {
        pluginRef.current.dispose();
        pluginRef.current = null;
      }
    };
  }, [results]);

  const handleDownloadPDBQT = () => {
    window.open(
      `${API_BASE}/api/results/${jobId}/download/pdbqt`,
      "_blank"
    );
  };

  const handleDownloadPDB = () => {
    window.open(
      `${API_BASE}/api/results/${jobId}/download/pdb`,
      "_blank"
    );
  };

  if (loading) {
    return (
      <main className="pb-40">
        <div className="flex flex-col items-center gap-4">
          <RotatingTriangles />
          <p>Loading docking results...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="pb-40">
        <div className="text-center">
          <h1 className="text-6xl font-thin mb-6">
            <span className="font-semibold">RESULTS</span>
          </h1>
          <div className="max-w-lg mx-auto bg-red-900/50 border border-red-500 rounded-xl p-4 text-red-300">
            {error}
          </div>
          <Link
            href={`/dashboard?jobId=${jobId}`}
            className="inline-block mt-4 text-blue-300 hover:text-blue-400"
          >
            <ArrowBackIcon className="mr-1" />
            Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  if (!results) return null;

  return (
    <main className="pb-40">
      <div className="text-center mb-6">
        <h1 className="text-5xl font-thin mb-2">
          DOCKING <span className="font-semibold">RESULTS</span>
        </h1>
        <p className="text-lg opacity-75">
          {results.protein_pdb_id.toUpperCase()} + {results.ligand_name}
        </p>
      </div>

      {/* 3D Viewer */}
      <div className="w-full mb-6">
        <div
          ref={viewerRef}
          style={{
            position: "relative",
            width: "100%",
            height: "500px",
            borderRadius: "16px",
            overflow: "hidden",
            background: "#1a1a1a",
          }}
        />
        {!viewerReady && (
          <div className="flex items-center justify-center mt-2">
            <RotatingTriangles width="40" height="40" />
            <span className="ml-2 text-sm text-gray-400">
              Loading 3D viewer...
            </span>
          </div>
        )}
      </div>

      {/* Binding Affinity Summary */}
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div className="bg-gray-900 rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4 text-green-300">
            Binding Affinities
          </h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <span className="text-gray-400 text-sm">Best Affinity</span>
              <p className="text-3xl font-semibold text-green-300">
                {results.best_affinity} kcal/mol
              </p>
            </div>
            <div>
              <span className="text-gray-400 text-sm">Total Poses</span>
              <p className="text-3xl font-semibold">{results.num_poses}</p>
            </div>
          </div>

          {/* Poses Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2">Pose</th>
                  <th className="text-left py-2">Affinity (kcal/mol)</th>
                  <th className="text-left py-2">Rank</th>
                </tr>
              </thead>
              <tbody>
                {results.poses.map((pose, i) => (
                  <tr
                    key={pose.model}
                    className={`border-b border-gray-800 cursor-pointer transition-colors
                      ${
                        selectedPose === i
                          ? "bg-blue-900/30"
                          : "hover:bg-gray-800"
                      }`}
                    onClick={() => setSelectedPose(i)}
                  >
                    <td className="py-2 font-mono">Model {pose.model}</td>
                    <td
                      className={`py-2 font-semibold ${
                        i === 0 ? "text-green-300" : ""
                      }`}
                    >
                      {pose.affinity}
                    </td>
                    <td className="py-2">
                      {i === 0 ? (
                        <span className="bg-green-400 text-black text-xs px-2 py-0.5 rounded-full font-semibold">
                          BEST
                        </span>
                      ) : (
                        `#${i + 1}`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Download Options */}
        <div className="bg-gray-900 rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4 text-blue-300">
            Download Results
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleDownloadPDB}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-400 hover:bg-blue-500
                         text-black font-semibold py-3 rounded-xl transition-colors"
            >
              <DownloadIcon />
              Download PDB
            </button>
            <button
              onClick={handleDownloadPDBQT}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600
                         text-white font-semibold py-3 rounded-xl transition-colors"
            >
              <DownloadIcon />
              Download PDBQT
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-3 text-center">
            PDB format works with most visualization tools. PDBQT includes
            partial charges and atom types.
          </p>
        </div>

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={`/dashboard?jobId=${jobId}`}
            className="flex items-center justify-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowBackIcon fontSize="small" />
            Back to Dashboard
          </Link>
          <Link
            href="/docking/protein"
            className="flex items-center justify-center gap-2 text-blue-300 hover:text-blue-400 transition-colors"
          >
            Start New Docking
          </Link>
        </div>
      </div>
    </main>
  );
};

export default ResultsViewer;
