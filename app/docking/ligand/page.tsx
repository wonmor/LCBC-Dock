"use client";

import { FC, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";

interface Molecule {
  cid: number;
  name: string;
  formula: string;
  weight: number;
  smiles: string;
}

const Ligand: FC = () => {
  const searchParams = useSearchParams();
  const proteinState = searchParams.get("proteinState") ?? "";

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selected, setSelected] = useState<Molecule | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const searchPubChem = async (term: string) => {
    if (!term || term.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use autocomplete — works with partial input, always reliable
      const resp = await axios.get(
        `https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/${encodeURIComponent(term)}/json`,
        { params: { limit: 10 }, timeout: 8000 }
      );

      const names: string[] =
        resp.data?.dictionary_terms?.compound ?? [];

      if (names.length === 0) {
        setSuggestions([]);
        setError("No molecules found.");
      } else {
        setSuggestions(names);
      }
    } catch {
      setError("Search failed. Check your connection and try again.");
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (name: string) => {
    setLoadingDetail(true);
    setError(null);

    try {
      const resp = await axios.get(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/MolecularFormula,MolecularWeight,CanonicalSMILES,CID/JSON`,
        { timeout: 10000 }
      );

      const p = resp.data?.PropertyTable?.Properties?.[0];
      if (!p) {
        setError("Could not load molecule details.");
        setLoadingDetail(false);
        return;
      }

      setSelected({
        cid: p.CID,
        name: name,
        formula: p.MolecularFormula || "",
        weight: p.MolecularWeight || 0,
        smiles: p.CanonicalSMILES || "",
      });
      setSuggestions([]);
    } catch {
      setError("Failed to load details for this molecule.");
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchPubChem(value), 400);
  };

  return (
    <div className="flex flex-col items-center min-h-screen px-6 pt-24 pb-32">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-extralight text-center mb-1">
          {selected ? selected.name : "Ligand"}
        </h1>
        <p className="text-center text-xs text-gray-500 mb-8">
          {selected
            ? `CID ${selected.cid} \u00B7 ${selected.formula}`
            : "Search PubChem \u2014 100M+ compounds"}
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
              <p className="text-xs text-gray-500 text-center mt-4">Searching PubChem...</p>
            )}

            {loadingDetail && (
              <div className="flex flex-col items-center mt-6">
                <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <p className="text-xs text-gray-500 mt-2">Loading molecule...</p>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-400 text-center mt-4">{error}</p>
            )}

            {suggestions.length > 0 && !loadingDetail && (
              <div className="mt-3 border border-white/10 rounded-xl overflow-hidden">
                {suggestions.map((name) => (
                  <button
                    key={name}
                    onClick={() => handleSelect(name)}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-white/5
                               border-b border-white/5 last:border-0 transition-colors"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}

            {!loading && suggestions.length === 0 && query.length >= 2 && !error && !loadingDetail && (
              <p className="text-xs text-gray-600 text-center mt-4">Type to search</p>
            )}
          </>
        )}

        {selected && (
          <div className="flex flex-col gap-4">
            {/* 2D structure from PubChem */}
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

            <div className="border border-white/10 rounded-2xl p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
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
                setSuggestions([]);
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
                  i === 2
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
