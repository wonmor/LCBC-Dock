"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import axios from "axios";

const API_BASE =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://lcbc-server.apps.johnseong.com";

interface Stats {
  queue_length: number;
  active_jobs: number;
  completed_jobs: number;
  total_jobs: number;
  est_wait_minutes: number;
}

interface Example {
  protein: string;
  proteinName: string;
  ligandCid: number;
  ligandName: string;
  category: string;
  description: string;
}

const EXAMPLES: Example[] = [
  { protein: "1IEP", proteinName: "BCR-ABL Kinase", ligandCid: 5291, ligandName: "Imatinib", category: "Cancer", description: "First targeted tyrosine kinase inhibitor for chronic myeloid leukemia." },
  { protein: "4HG7", proteinName: "MDM2", ligandCid: 11433190, ligandName: "Nutlin-3a", category: "Cancer", description: "Reactivates p53 tumor suppressor by inhibiting MDM2." },
  { protein: "5IKR", proteinName: "COX-2", ligandCid: 2244, ligandName: "Aspirin", category: "Pain & Inflammation", description: "World's most widely used drug. Inhibits cyclooxygenase." },
  { protein: "3RFM", proteinName: "Adenosine A2A Receptor", ligandCid: 2519, ligandName: "Caffeine", category: "Neuroscience", description: "Blocks adenosine receptors, preventing drowsiness." },
  { protein: "1UDT", proteinName: "PDE5", ligandCid: 5212, ligandName: "Sildenafil", category: "Cardiovascular", description: "PDE5 inhibitor. Originally for hypertension, famously repurposed." },
  { protein: "2HT8", proteinName: "Neuraminidase", ligandCid: 65028, ligandName: "Oseltamivir", category: "Antiviral", description: "Tamiflu — frontline influenza antiviral." },
  { protein: "7BV2", proteinName: "RNA-dependent RNA Polymerase", ligandCid: 121304016, ligandName: "Remdesivir", category: "Antiviral", description: "COVID-19 drug. Terminates viral RNA replication." },
  { protein: "1MUI", proteinName: "HIV-1 Protease", ligandCid: 92727, ligandName: "Lopinavir", category: "Antiviral", description: "HIV protease inhibitor for antiretroviral therapy." },
  { protein: "1JFF", proteinName: "Tubulin", ligandCid: 36314, ligandName: "Paclitaxel", category: "Cancer", description: "Taxol — stabilizes microtubules to halt cell division." },
  { protein: "4CFF", proteinName: "AMPK", ligandCid: 4091, ligandName: "Metformin", category: "Metabolic", description: "Most prescribed diabetes drug globally." },
  { protein: "3ERT", proteinName: "Estrogen Receptor \u03b1", ligandCid: 2733526, ligandName: "Tamoxifen", category: "Cancer", description: "Selective estrogen receptor modulator for breast cancer." },
  { protein: "2RG6", proteinName: "Acetylcholinesterase", ligandCid: 3152, ligandName: "Donepezil", category: "Neuroscience", description: "Aricept — first-line Alzheimer's treatment." },
  { protein: "3NYA", proteinName: "EGFR Kinase", ligandCid: 176870, ligandName: "Erlotinib", category: "Cancer", description: "EGFR inhibitor for non-small cell lung cancer." },
  { protein: "3OGP", proteinName: "HMG-CoA Reductase", ligandCid: 60823, ligandName: "Atorvastatin", category: "Cardiovascular", description: "Lipitor — best-selling drug in history." },
  { protein: "2ITO", proteinName: "Dihydrofolate Reductase", ligandCid: 126941, ligandName: "Methotrexate", category: "Cancer", description: "Antimetabolite chemotherapy. Blocks folate metabolism." },
  { protein: "1PWC", proteinName: "Penicillin-Binding Protein", ligandCid: 5904, ligandName: "Penicillin G", category: "Antibiotic", description: "Started the antibiotic revolution." },
];

const CATEGORIES = ["All", ...Array.from(new Set(EXAMPLES.map((e) => e.category)))];

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  useEffect(() => {
    axios
      .get(`${API_BASE}/api/stats`, { timeout: 5000 })
      .then((r) => setStats(r.data))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    return EXAMPLES.filter((ex) => {
      const matchCat = category === "All" || ex.category === category;
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        ex.ligandName.toLowerCase().includes(q) ||
        ex.proteinName.toLowerCase().includes(q) ||
        ex.protein.toLowerCase().includes(q) ||
        ex.category.toLowerCase().includes(q) ||
        ex.description.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [search, category]);

  return (
    <div className="flex flex-col items-center min-h-screen px-6 pt-24 pb-12">
      <div className="w-full max-w-2xl">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-6xl sm:text-8xl font-extralight tracking-tight mb-4">
            LCBC <span className="font-semibold">DOCK</span>
          </h1>
          <p className="text-gray-400 text-lg mb-8">
            Molecular docking on the go.
            <br />
            Powered by AutoDock Vina.
          </p>

          {/* Live stats */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <div className="border border-white/10 rounded-2xl p-4 text-center">
                <p className="text-2xl font-light">{stats.total_jobs}</p>
                <p className="text-[10px] text-gray-500 mt-1">Total Jobs</p>
              </div>
              <div className="border border-white/10 rounded-2xl p-4 text-center">
                <p className="text-2xl font-light">{stats.completed_jobs}</p>
                <p className="text-[10px] text-gray-500 mt-1">Completed</p>
              </div>
              <div className="border border-white/10 rounded-2xl p-4 text-center">
                <p className="text-2xl font-light text-yellow-400">
                  {stats.queue_length + stats.active_jobs}
                </p>
                <p className="text-[10px] text-gray-500 mt-1">In Queue</p>
              </div>
              <div className="border border-white/10 rounded-2xl p-4 text-center">
                <p className="text-2xl font-light">
                  {stats.est_wait_minutes === 0 ? "<1" : `~${stats.est_wait_minutes}`}
                </p>
                <p className="text-[10px] text-gray-500 mt-1">Est. Wait (min)</p>
              </div>
            </div>
          )}
        </div>

        {/* Examples section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-light">Famous Dockings</h2>
            <Link
              href="/docking/protein"
              className="text-xs bg-white/10 text-white px-4 py-2 rounded-full hover:bg-white/20 transition-colors"
            >
              Custom Docking
            </Link>
          </div>

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search examples (e.g. cancer, aspirin, kinase...)"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm
                       placeholder-gray-600 focus:outline-none focus:border-white/30 transition-colors mb-3"
          />

          {/* Category pills */}
          <div className="flex flex-wrap gap-2 mb-4">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`text-[11px] px-3 py-1.5 rounded-full transition-colors ${
                  category === cat
                    ? "bg-white text-black"
                    : "bg-white/5 text-gray-400 hover:bg-white/10"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Example cards */}
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {filtered.map((ex) => (
              <Link
                key={`${ex.protein}-${ex.ligandCid}`}
                href={`/docking/cook?proteinState=${ex.protein}&ligandCid=${ex.ligandCid}&ligandName=${encodeURIComponent(ex.ligandName)}`}
                className="flex items-center gap-4 border border-white/10 rounded-2xl p-4 hover:border-white/25 hover:bg-white/[0.02] transition-all"
              >
                <img
                  src={`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${ex.ligandCid}/PNG?image_size=80x80`}
                  alt={ex.ligandName}
                  className="w-12 h-12 rounded-lg bg-white shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium">{ex.ligandName}</span>
                    <span className="text-[10px] bg-white/5 text-gray-400 px-2 py-0.5 rounded-full">
                      {ex.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 truncate">
                    {ex.protein} · {ex.proteinName}
                  </p>
                  <p className="text-[11px] text-gray-600 truncate">
                    {ex.description}
                  </p>
                </div>
              </Link>
            ))}

            {filtered.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-8">
                No examples match your search.
              </p>
            )}
          </div>
        </div>

        <footer className="text-center text-xs text-gray-600 mt-4">
          Built by John Seong &middot; Seoul National University
        </footer>
      </div>
    </div>
  );
}
