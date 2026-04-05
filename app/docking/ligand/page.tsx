"use client";

import { FC, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";

interface Molecule {
  cid: number | string;
  name: string;
  formula: string;
  weight: number;
  smiles: string;
  source?: string;
}

const Ligand: FC = () => {
  const searchParams = useSearchParams();
  const proteinState = searchParams.get("proteinState") ?? "";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Molecule[]>([]);
  const [selected, setSelected] = useState<Molecule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const search = async (term: string) => {
    if (!term || term.trim().length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const resp = await axios.get("/api/pubchem", {
        params: { q: term },
        timeout: 15000,
      });

      const data: Molecule[] = resp.data ?? [];
      if (data.length === 0) {
        setError("No molecules found. Try a different name.");
      }
      setResults(data);
    } catch {
      setError("Search failed. Please try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 400);
  };

  return (
    <div className="flex flex-col items-center min-h-screen px-6 pt-24 pb-32">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-extralight text-center mb-1">
          {selected ? selected.name : "Ligand"}
        </h1>
        <p className="text-center text-xs text-gray-500 mb-8">
          {selected
            ? `${selected.source || "PubChem"} \u00B7 ${selected.cid} \u00B7 ${selected.formula}`
            : "Search PubChem + ChEMBL \u2014 millions of compounds"}
        </p>

        {!selected && (
          <>
            <input
              type="text"
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              placeholder="Search by name (e.g. aspirin, caffeine, nutlin-3a)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm
                         placeholder-gray-600 focus:outline-none focus:border-white/30 transition-colors"
              autoFocus
            />

            {loading && (
              <div className="flex flex-col items-center mt-6">
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <p className="text-xs text-gray-500 mt-2">Searching PubChem...</p>
              </div>
            )}

            {error && !loading && (
              <p className="text-xs text-red-400 text-center mt-4">{error}</p>
            )}

            {results.length > 0 && !loading && (
              <div className="mt-3 border border-white/10 rounded-xl overflow-hidden">
                {results.map((mol) => (
                  <button
                    key={mol.cid}
                    onClick={() => setSelected(mol)}
                    className="w-full text-left px-4 py-3 hover:bg-white/5
                               border-b border-white/5 last:border-0 transition-colors"
                  >
                    <span className="text-sm">{mol.name}</span>
                    <span className="text-xs text-gray-500 ml-2">
                      {mol.formula} &middot; {mol.weight.toFixed(1)} g/mol
                      {mol.source && <span className="text-gray-600"> &middot; {mol.source}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {selected && (
          <div className="flex flex-col gap-4">
            {typeof selected.cid === "number" && (
              <div className="bg-white rounded-2xl p-4 flex justify-center">
                <img
                  src={`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${selected.cid}/PNG?image_size=300x300`}
                  alt={selected.name}
                  className="max-w-[280px]"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}
            {typeof selected.cid === "string" && selected.source === "ChEMBL" && (
              <div className="bg-white rounded-2xl p-4 flex justify-center">
                <img
                  src={`https://www.ebi.ac.uk/chembl/api/data/image/${selected.cid}.svg`}
                  alt={selected.name}
                  className="max-w-[280px]"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}

            <div className="border border-white/10 rounded-2xl p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-gray-500">PubChem CID</span>
                  <p className="text-sm font-mono mt-0.5">{selected.cid}</p>
                </div>
                <div>
                  <span className="text-gray-500">Formula</span>
                  <p className="text-sm mt-0.5">{selected.formula}</p>
                </div>
                <div>
                  <span className="text-gray-500">Weight</span>
                  <p className="text-sm mt-0.5">{selected.weight.toFixed(2)} g/mol</p>
                </div>
              </div>
              {selected.smiles && (
                <div className="text-xs">
                  <span className="text-gray-500">SMILES</span>
                  <p className="font-mono text-[10px] bg-white/5 rounded-lg p-2 mt-1 break-all">
                    {selected.smiles}
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setSelected(null);
                setQuery("");
                setResults([]);
              }}
              className="text-xs text-gray-500 hover:text-white transition-colors text-center"
            >
              Search again
            </button>
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
                  i === 2 ? "bg-white text-black" : "bg-white/5 text-gray-500"
                }`}
              >
                {step}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Link
              href={`/docking/marinate?proteinState=${proteinState}`}
              className="text-xs text-gray-500 hover:text-white px-3 py-2 transition-colors"
            >
              Back
            </Link>
            {selected && proteinState && (
              <Link
                href={`/docking/cook?proteinState=${proteinState}&ligandCid=${selected.cid}&ligandName=${encodeURIComponent(selected.name)}`}
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

export default Ligand;
