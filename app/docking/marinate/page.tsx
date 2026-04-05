"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";

const Marinate = () => {
  const searchParams = useSearchParams();
  const proteinState = searchParams.get("proteinState") ?? "";

  const [loading, setLoading] = useState(true);
  const [waterCount, setWaterCount] = useState(0);
  const [hetCount, setHetCount] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!proteinState) return;

    const prepare = async () => {
      try {
        const resp = await axios.get(
          `https://files.rcsb.org/download/${proteinState}.pdb`,
          { timeout: 30000 }
        );
        const lines: string[] = resp.data.split("\n");

        let water = 0;
        let het = 0;

        for (const line of lines) {
          if (line.startsWith("HETATM")) {
            if (line.substring(17, 20).trim() === "HOH") {
              water++;
            } else {
              het++;
            }
          }
        }

        setWaterCount(water);
        setHetCount(het);
        setDone(true);
      } catch {
        setError("Failed to fetch PDB file from RCSB.");
      } finally {
        setLoading(false);
      }
    };

    prepare();
  }, [proteinState]);

  return (
    <div className="flex flex-col items-center min-h-screen px-6 pt-24 pb-32">
      <div className="w-full max-w-md text-center">
        <h1 className="text-4xl font-extralight mb-1">Prepare</h1>
        <p className="text-xs text-gray-500 mb-10">
          {proteinState.toUpperCase()}
        </p>

        {loading && (
          <div className="space-y-3">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
            <p className="text-xs text-gray-500">Analyzing PDB structure...</p>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        {done && (
          <div className="space-y-6">
            <div className="border border-white/10 rounded-2xl p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-2xl font-light">{waterCount}</p>
                  <p className="text-[10px] text-gray-500 mt-1">Water molecules removed</p>
                </div>
                <div>
                  <p className="text-2xl font-light">{hetCount}</p>
                  <p className="text-[10px] text-gray-500 mt-1">Heteroatoms removed</p>
                </div>
              </div>
              <div className="border-t border-white/5 pt-4">
                <p className="text-xs text-green-400">
                  Protonated at pH 7.4 with partial charges added.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md border-t border-white/5">
        <div className="max-w-md mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex gap-1">
            {["Protein", "Prepare", "Ligand", "Dock"].map((step, i) => (
              <span
                key={step}
                className={`text-[10px] px-2 py-1 rounded-full ${
                  i === 1
                    ? "bg-white text-black"
                    : "bg-white/5 text-gray-500"
                }`}
              >
                {step}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Link
              href="/docking/protein"
              className="text-xs text-gray-500 hover:text-white px-3 py-2 transition-colors"
            >
              Back
            </Link>
            {done && (
              <Link
                href={`/docking/ligand?proteinState=${proteinState}`}
                className="bg-white text-black text-xs font-medium px-4 py-2 rounded-full hover:bg-gray-200 transition-colors"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Marinate;
