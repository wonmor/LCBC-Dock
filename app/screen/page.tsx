"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { API_BASE, errorText } from "@/app/lib/api";
import SiteSelector, { PrepValue, SiteValue } from "@/app/components/SiteSelector";

const EXAMPLE = `smiles name
CC(C)(C)NC(=O)[C@@H]1CN(Cc2cccnc2)CCN1C[C@@H](O)C[C@@H](Cc1ccccc1)C(=O)N[C@@H]1c2ccccc2C[C@@H]1O Indinavir
CC(C)CN(C[C@@H](O)[C@H](Cc1ccccc1)NC(=O)O[C@H]1CCOC1)S(=O)(=O)c1ccc(N)cc1 Amprenavir
CC(=O)Oc1ccccc1C(=O)O Aspirin
Cn1cnc2c1c(=O)n(C)c(=O)n2C Caffeine`;

export default function Screen() {
  const router = useRouter();
  const [protein, setProtein] = useState("1HSG");
  const [proteinCommitted, setProteinCommitted] = useState("1HSG");
  const [library, setLibrary] = useState("");
  const [name, setName] = useState("");
  const [exh, setExh] = useState(8);
  const [priv, setPriv] = useState(false);
  const [site, setSite] = useState<SiteValue>({ mode: "auto" });
  const [prep, setPrep] = useState<PrepValue>({ chains: [], keep_hetero: [], ph: 7.4 });
  const [acct, setAcct] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    axios.get(`${API_BASE}/api/account`).then((r) => setAcct(r.data)).catch(() => {});
  }, []);

  const lines = library.split("\n").filter((l) => l.trim() && !/^smiles\b/i.test(l.trim()));
  const nLigands = library.includes("$$$$") ? (library.match(/\$\$\$\$/g) || []).length : lines.length;
  const cap = acct?.limits?.max_batch_ligands ?? 0;

  const onFile = async (f: File) => {
    const text = await f.text();
    setLibrary(text);
    if (!name) setName(f.name.replace(/\.(sdf|smi|csv|txt)$/i, ""));
  };

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await axios.post(`${API_BASE}/api/batch`, {
        protein_pdb_id: proteinCommitted,
        library,
        name: name || undefined,
        site,
        prep,
        exhaustiveness: exh,
        private: priv,
        strict: true,
      });
      router.push(`/screen/${r.data.batch_id}`);
    } catch (e) {
      setErr(errorText(e, "Could not start the screen."));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center min-h-screen px-4 sm:px-6 pt-20 pb-16">
      <div className="w-full max-w-xl">
        <h1 className="text-4xl font-extralight text-center mb-1">Virtual screening</h1>
        <p className="text-xs text-gray-500 text-center mb-8">
          Dock a ligand library against one target, ranked by Vina score and ligand efficiency.
        </p>

        <div className="space-y-4">
          <div className="border border-white/10 rounded-2xl p-5">
            <label htmlFor="target" className="text-xs text-gray-500">Target — PDB ID or UniProt accession (AlphaFold)</label>
            <div className="flex gap-2 mt-2">
              <input
                id="target"
                value={protein}
                onChange={(e) => setProtein(e.target.value.trim())}
                onBlur={() => setProteinCommitted(protein)}
                onKeyDown={(e) => e.key === "Enter" && setProteinCommitted(protein)}
                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono uppercase"
              />
            </div>
          </div>

          <div className="border border-white/10 rounded-2xl p-5">
            <SiteSelector protein={proteinCommitted} site={site} onSite={setSite} prep={prep} onPrep={setPrep} />
          </div>

          <div className="border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="lib" className="text-xs text-gray-500">Ligand library</label>
              <div className="flex gap-3 text-[11px]">
                <button type="button" onClick={() => setLibrary(EXAMPLE)} className="text-gray-400 hover:text-white">
                  Example
                </button>
                <label className="text-gray-400 hover:text-white cursor-pointer">
                  Upload .smi / .csv / .sdf
                  <input
                    type="file"
                    accept=".smi,.csv,.txt,.sdf,.mol"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                  />
                </label>
              </div>
            </div>
            <textarea
              id="lib"
              value={library}
              onChange={(e) => setLibrary(e.target.value)}
              rows={8}
              placeholder={"One per line:  SMILES name\nor paste a multi-record SDF"}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[11px] font-mono placeholder-gray-600 focus:outline-none focus:border-white/30"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              {nLigands} ligand{nLigands === 1 ? "" : "s"}
              {acct && (cap ? ` | your plan screens up to ${cap} per batch` : " | sign in (free) to screen 5, Pro for 500")}
            </p>
          </div>

          <div className="border border-white/10 rounded-2xl p-5 space-y-3">
            <label className="text-xs text-gray-500 flex flex-col gap-1">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Screen vs ${proteinCommitted}`}
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <div>
              <label htmlFor="exh" className="text-xs text-gray-500">Exhaustiveness: {exh}</label>
              <input
                id="exh"
                type="range"
                min={1}
                max={32}
                value={exh}
                onChange={(e) => setExh(parseInt(e.target.value))}
                className="w-full accent-white"
              />
              {acct && exh > acct.limits.max_exhaustiveness && (
                <p className="text-[10px] text-amber-400">Above {acct.limits.max_exhaustiveness} needs Pro.</p>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
              Private batch {acct && !acct.limits.private_jobs && <span className="text-[10px] text-amber-400">Pro</span>}
            </label>
          </div>

          {err && <p className="text-xs text-red-400 text-center">{err}</p>}
          <button
            onClick={submit}
            disabled={busy || nLigands === 0 || !proteinCommitted}
            className="w-full bg-white text-black py-3 rounded-full text-sm font-medium hover:bg-gray-200 disabled:opacity-30"
          >
            {busy ? "Queuing…" : `Screen ${nLigands || ""} ligand${nLigands === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
