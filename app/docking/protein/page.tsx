"use client";

import { FC, useState, useRef } from "react";
import Link from "next/link";
import axios from "axios";

const Protein: FC = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const searchRCSB = async (term: string) => {
    if (!term || term.trim().length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const resp = await axios.post(
        "https://search.rcsb.org/rcsbsearch/v2/query",
        {
          query: {
            type: "terminal",
            service: "full_text",
            parameters: { value: term },
          },
          return_type: "entry",
          request_options: { results_content_type: ["experimental"] },
        },
        { timeout: 10000 }
      );

      const ids =
        resp.data?.result_set?.map((r: any) => r.identifier) ?? [];
      setResults(ids.slice(0, 12));
    } catch {
      setError("Search failed. Try a PDB ID like 4HG7.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchRCSB(value), 400);
  };

  const handleSelect = (pdbId: string) => {
    setSelected(pdbId);
    setResults([]);
  };

  return (
    <div className="flex flex-col items-center min-h-screen px-6 pt-24 pb-32">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-extralight text-center mb-1">
          {selected ? selected.toUpperCase() : "Protein"}
        </h1>
        <p className="text-center text-xs text-gray-500 mb-8">
          {selected ? "Selected from RCSB PDB" : "Search the RCSB Protein Data Bank"}
        </p>

        {!selected && (
          <>
            <input
              type="text"
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              placeholder="Search by name or PDB ID (e.g. 4HG7, insulin)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm
                         placeholder-gray-600 focus:outline-none focus:border-white/30 transition-colors"
              autoFocus
            />

            {loading && (
              <p className="text-xs text-gray-500 text-center mt-4">Searching...</p>
            )}

            {error && (
              <p className="text-xs text-red-400 text-center mt-4">{error}</p>
            )}

            {results.length > 0 && (
              <div className="mt-3 border border-white/10 rounded-xl overflow-hidden">
                {results.map((pdbId) => (
                  <button
                    key={pdbId}
                    onClick={() => handleSelect(pdbId)}
                    className="w-full text-left px-4 py-3 text-sm font-mono hover:bg-white/5
                               border-b border-white/5 last:border-0 transition-colors"
                  >
                    {pdbId}
                  </button>
                ))}
              </div>
            )}

            {!loading && results.length === 0 && query.length >= 2 && !error && (
              <p className="text-xs text-gray-600 text-center mt-4">No results</p>
            )}
          </>
        )}

        {selected && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-full aspect-square bg-white/5 rounded-2xl overflow-hidden">
              <iframe
                src={`https://www.rcsb.org/3d-view/${selected}`}
                className="w-full h-full border-0"
                title="Protein 3D View"
              />
            </div>

            <button
              onClick={() => {
                setSelected(null);
                setQuery("");
              }}
              className="text-xs text-gray-500 hover:text-white transition-colors"
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
                  i === 0
                    ? "bg-white text-black"
                    : "bg-white/5 text-gray-500"
                }`}
              >
                {step}
              </span>
            ))}
          </div>
          {selected && (
            <Link
              href={`/docking/marinate?proteinState=${selected}`}
              className="bg-white text-black text-xs font-medium px-4 py-2 rounded-full hover:bg-gray-200 transition-colors"
            >
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default Protein;
