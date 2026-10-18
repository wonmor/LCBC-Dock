"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "@/app/lib/api";

export interface SiteValue {
  mode: "auto" | "ligand" | "residues" | "pocket";
  ligand?: string;
  residues?: string;
  pocket_rank?: number;
}

export interface PrepValue {
  chains: string[];
  keep_hetero: string[];
  ph: number;
}

interface Inspect {
  source: { source: string; id: string };
  chains: { chain: string; residues: number }[];
  hetero: { resname: string; chain: string; resseq: string; n_atoms: number; label: string; metal: boolean }[];
}

/** Binding-site + protein-prep controls shared by Dock and Screen. */
export default function SiteSelector({
  protein,
  site,
  onSite,
  prep,
  onPrep,
}: {
  protein: string;
  site: SiteValue;
  onSite: (s: SiteValue) => void;
  prep: PrepValue;
  onPrep: (p: PrepValue) => void;
}) {
  const [info, setInfo] = useState<Inspect | null>(null);
  const [pockets, setPockets] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!protein || protein.length < 4) return;
    setLoading(true);
    setErr(null);
    axios
      .get(`${API_BASE}/api/structure/${protein}/inspect`, { timeout: 30000 })
      .then((r) => {
        setInfo(r.data);
        const ligs = (r.data.hetero || []).filter((h: any) => !h.metal);
        if (ligs.length && site.mode === "auto") {
          const h = ligs[0];
          onSite({ mode: "ligand", ligand: `${h.resname}:${h.chain}:${h.resseq}` });
        }
      })
      .catch(() => setErr("Could not read this structure."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protein]);

  const findPockets = () => {
    setPockets(null);
    axios
      .get(`${API_BASE}/api/structure/${protein}/pockets`, { timeout: 60000 })
      .then((r) => setPockets(r.data.pockets))
      .catch(() => setPockets([]));
  };

  const ligands = (info?.hetero || []).filter((h) => !h.metal);
  const metals = (info?.hetero || []).filter((h) => h.metal);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-gray-500 mb-2">Binding site</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5" role="radiogroup" aria-label="Binding site mode">
          {(
            [
              ["ligand", "Co-crystal ligand"],
              ["pocket", "Find pockets"],
              ["residues", "Residues"],
              ["auto", "Whole protein"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={site.mode === m}
              disabled={m === "ligand" && ligands.length === 0}
              onClick={() => {
                if (m === "pocket") {
                  onSite({ mode: "pocket", pocket_rank: 1 });
                  if (!pockets) findPockets();
                } else if (m === "ligand" && ligands[0]) {
                  onSite({ mode: "ligand", ligand: `${ligands[0].resname}:${ligands[0].chain}:${ligands[0].resseq}` });
                } else onSite({ ...site, mode: m });
              }}
              className={`text-[11px] px-2 py-2 rounded-lg transition-colors disabled:opacity-30 ${
                site.mode === m ? "bg-white text-black" : "bg-white/5 text-gray-400 hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {loading && <p className="text-[10px] text-gray-500 mt-2">Reading structure…</p>}
        {err && <p className="text-[10px] text-red-400 mt-2">{err}</p>}

        {site.mode === "ligand" && ligands.length > 0 && (
          <select
            value={site.ligand}
            onChange={(e) => onSite({ mode: "ligand", ligand: e.target.value })}
            className="mt-2 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs"
            aria-label="Co-crystallised ligand"
          >
            {ligands.map((h) => (
              <option key={h.label} value={`${h.resname}:${h.chain}:${h.resseq}`}>
                {h.label} · {h.n_atoms} atoms
              </option>
            ))}
          </select>
        )}
        {site.mode === "residues" && (
          <input
            value={site.residues || ""}
            onChange={(e) => onSite({ mode: "residues", residues: e.target.value })}
            placeholder="e.g. A:25, B:25, ASP29"
            className="mt-2 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs placeholder-gray-600"
            aria-label="Residues defining the site"
          />
        )}
        {site.mode === "pocket" && (
          <div className="mt-2 space-y-1">
            {pockets === null && <p className="text-[10px] text-gray-500">Scanning the surface for buried pockets…</p>}
            {pockets?.length === 0 && <p className="text-[10px] text-red-400">No pocket found — try residues.</p>}
            {pockets?.map((p) => (
              <button
                type="button"
                key={p.rank}
                onClick={() => onSite({ mode: "pocket", pocket_rank: p.rank })}
                className={`w-full text-left text-[11px] px-3 py-2 rounded-lg border ${
                  site.pocket_rank === p.rank ? "border-white/40 bg-white/5" : "border-white/10"
                }`}
              >
                Pocket {p.rank} · {Math.round(p.volume_A3)} Å³ · buried {Math.round(p.buriedness * 100)}%
                <span className="block text-gray-500 truncate">{p.residues.slice(0, 8).join(" ")}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-[11px] text-gray-500 flex flex-col gap-1">
          Protonation pH
          <input
            type="number"
            step="0.1"
            min={0}
            max={14}
            value={prep.ph}
            onChange={(e) => onPrep({ ...prep, ph: parseFloat(e.target.value || "7.4") })}
            className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
          />
        </label>
        <div className="text-[11px] text-gray-500 flex flex-col gap-1">
          Chains
          <div className="flex flex-wrap gap-1">
            {(info?.chains || []).map((c) => {
              const on = prep.chains.length === 0 || prep.chains.includes(c.chain);
              return (
                <button
                  type="button"
                  key={c.chain}
                  aria-pressed={on}
                  onClick={() => {
                    const all = (info?.chains || []).map((x) => x.chain);
                    const cur = prep.chains.length ? prep.chains : all;
                    const nextChains = on ? cur.filter((x) => x !== c.chain) : [...cur, c.chain];
                    onPrep({ ...prep, chains: nextChains.length === all.length ? [] : nextChains });
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs ${on ? "bg-white/15 text-white" : "bg-white/5 text-gray-600"}`}
                >
                  {c.chain}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {metals.length > 0 && (
        <label className="flex items-center gap-2 text-[11px] text-gray-400">
          <input
            type="checkbox"
            checked={prep.keep_hetero.length > 0}
            onChange={(e) =>
              onPrep({ ...prep, keep_hetero: e.target.checked ? Array.from(new Set(metals.map((m) => m.resname))) : [] })
            }
          />
          Keep metal ions ({Array.from(new Set(metals.map((m) => m.resname))).join(", ")})
        </label>
      )}
      <p className="text-[10px] text-gray-600">
        Waters and other hetero groups are removed; hydrogens are added for the pH with Gasteiger charges (Open Babel).
        {info?.source?.source === "alphafold" && " AlphaFold model: check pLDDT around the site before trusting scores."}
      </p>
    </div>
  );
}
