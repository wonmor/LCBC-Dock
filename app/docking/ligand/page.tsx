"use client";

import { FC, useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";

const API_BASE =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://lcbc-server.apps.johnseong.com";

interface Molecule {
  cid: number;
  name: string;
  formula: string;
  weight: number;
  smiles: string;
}

interface Druglikeness {
  available: boolean;
  verdict?: "drug_like" | "concerns" | "fail";
  qed?: number;
  qed_label?: string;
  properties?: {
    molecular_weight: number;
    log_p: number;
    tpsa: number;
    h_bond_donors: number;
    h_bond_acceptors: number;
    rotatable_bonds: number;
    rings: number;
    aromatic_rings: number;
    heavy_atoms: number;
    formal_charge: number;
  };
  rules?: {
    lipinski: { passes: boolean; violations: string[]; max_allowed_violations: number };
    veber: { passes: boolean; violations: string[] };
    ghose: { passes: boolean; violations: string[] };
    pains: { passes: boolean; matched_filters: string[]; match_count: number };
  };
  error?: string;
}

const Ligand: FC = () => {
  const searchParams = useSearchParams();
  const proteinState = searchParams.get("proteinState") ?? "";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Molecule[]>([]);
  const [selected, setSelected] = useState<Molecule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [druglikeness, setDruglikeness] = useState<Druglikeness | null>(null);
  const [dlLoading, setDlLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch drug-likeness whenever a ligand is selected. /api/ligands/{cid}
  // already returns it inline, so this is one round-trip per selection
  // and the panel renders before the user hits "Next".
  useEffect(() => {
    if (!selected) { setDruglikeness(null); return; }
    let cancelled = false;
    setDlLoading(true);
    axios.get(`${API_BASE}/api/ligands/${selected.cid}`)
      .then((r) => { if (!cancelled) setDruglikeness(r.data?.druglikeness ?? null); })
      .catch(() => { if (!cancelled) setDruglikeness(null); })
      .finally(() => { if (!cancelled) setDlLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.cid]);

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
        timeout: 20000,
      });

      const data: Molecule[] = resp.data ?? [];
      if (data.length === 0) {
        setError("No molecules found. Try the full name (e.g. aspirin, caffeine).");
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
    debounceRef.current = setTimeout(() => search(value), 500);
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
                      CID {mol.cid} &middot; {mol.formula} &middot; {mol.weight.toFixed(1)} g/mol
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {selected && (
          <div className="flex flex-col gap-4">
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

            {/* Drug-likeness panel — Lipinski / Veber / Ghose / PAINS / QED.
                Surfaces medicinal-chemistry red flags before the user
                spends docking compute on a non-drug-like compound. */}
            {dlLoading && (
              <div className="border border-white/10 rounded-2xl p-5 text-center">
                <div className="inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <p className="text-[10px] text-gray-500 mt-2">Scoring drug-likeness…</p>
              </div>
            )}
            {!dlLoading && druglikeness?.available && druglikeness.properties && druglikeness.rules && (
              <div className="border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">Drug-likeness</p>
                  {druglikeness.verdict && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      druglikeness.verdict === "drug_like" ? "bg-emerald-500/20 text-emerald-400"
                        : druglikeness.verdict === "concerns" ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-red-500/20 text-red-400"
                    }`}>
                      {druglikeness.verdict === "drug_like" ? "Drug-like"
                        : druglikeness.verdict === "concerns" ? "Concerns"
                        : "Fails filters"}
                    </span>
                  )}
                </div>

                {/* QED — Bickerton's quantitative estimate of drug-likeness */}
                {druglikeness.qed != null && (
                  <div>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-[10px] text-gray-500">QED score</span>
                      <span className="text-xs font-mono">
                        {druglikeness.qed.toFixed(2)} · {druglikeness.qed_label}
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          druglikeness.qed >= 0.67 ? "bg-emerald-400"
                            : druglikeness.qed >= 0.5 ? "bg-green-400"
                            : druglikeness.qed >= 0.35 ? "bg-yellow-400"
                            : "bg-red-400"
                        }`}
                        style={{ width: `${druglikeness.qed * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Rule grid */}
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <RuleBadge label="Lipinski" pass={druglikeness.rules.lipinski.passes}
                             violations={druglikeness.rules.lipinski.violations} />
                  <RuleBadge label="Veber" pass={druglikeness.rules.veber.passes}
                             violations={druglikeness.rules.veber.violations} />
                  <RuleBadge label="Ghose" pass={druglikeness.rules.ghose.passes}
                             violations={druglikeness.rules.ghose.violations} />
                  <RuleBadge label="PAINS"
                             pass={druglikeness.rules.pains.passes}
                             violations={druglikeness.rules.pains.matched_filters
                               .map((f) => `Matches ${f}`)} />
                </div>

                {/* Property table */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] pt-3 border-t border-white/5">
                  <PropRow label="MW (g/mol)"   value={druglikeness.properties.molecular_weight} />
                  <PropRow label="LogP"         value={druglikeness.properties.log_p} />
                  <PropRow label="TPSA (Å²)"    value={druglikeness.properties.tpsa} />
                  <PropRow label="Rot. bonds"   value={druglikeness.properties.rotatable_bonds} />
                  <PropRow label="H-donors"     value={druglikeness.properties.h_bond_donors} />
                  <PropRow label="H-acceptors"  value={druglikeness.properties.h_bond_acceptors} />
                  <PropRow label="Heavy atoms"  value={druglikeness.properties.heavy_atoms} />
                  <PropRow label="Aromatic rings" value={druglikeness.properties.aromatic_rings} />
                </div>
              </div>
            )}

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

function RuleBadge({ label, pass, violations }: {
  label: string;
  pass: boolean;
  violations: string[];
}) {
  return (
    <div
      className={`px-2 py-1.5 rounded-lg border ${
        pass ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"
      }`}
      title={violations.join("\n") || `${label}: passes all criteria`}
    >
      <div className="flex items-center justify-between">
        <span className={pass ? "text-emerald-400" : "text-red-400"}>{label}</span>
        <span className={pass ? "text-emerald-400" : "text-red-400"}>
          {pass ? "✓" : "✗"}
        </span>
      </div>
      {!pass && violations.length > 0 && (
        <p className="text-[9px] text-gray-400 mt-0.5 line-clamp-2">
          {violations[0]}{violations.length > 1 ? ` +${violations.length - 1}` : ""}
        </p>
      )}
    </div>
  );
}

function PropRow({ label, value }: { label: string; value: number }) {
  return (
    <>
      <span className="text-gray-500">{label}</span>
      <span className="font-mono text-right">{
        Number.isInteger(value) ? value : value.toFixed(2)
      }</span>
    </>
  );
}

export default Ligand;
