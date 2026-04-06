"use client";

import { FC, useState, useMemo } from "react";
import Link from "next/link";

interface Example {
  protein: string;
  proteinName: string;
  ligandCid: number;
  ligandName: string;
  category: string;
  description: string;
}

const EXAMPLES: Example[] = [
  {
    protein: "1IEP",
    proteinName: "BCR-ABL Kinase",
    ligandCid: 5291,
    ligandName: "Imatinib",
    category: "Cancer",
    description:
      "Revolutionary cancer drug for chronic myeloid leukemia. First targeted tyrosine kinase inhibitor.",
  },
  {
    protein: "4HG7",
    proteinName: "MDM2",
    ligandCid: 11433190,
    ligandName: "Nutlin-3a",
    category: "Cancer",
    description:
      "Inhibits p53-MDM2 interaction, reactivating tumor suppressor p53 in cancer cells.",
  },
  {
    protein: "5IKR",
    proteinName: "COX-2",
    ligandCid: 2244,
    ligandName: "Aspirin",
    category: "Pain & Inflammation",
    description:
      "The world's most widely used drug. Inhibits cyclooxygenase to reduce pain and inflammation.",
  },
  {
    protein: "3RFM",
    proteinName: "Adenosine A2A Receptor",
    ligandCid: 2519,
    ligandName: "Caffeine",
    category: "Neuroscience",
    description:
      "Blocks adenosine receptors in the brain, preventing drowsiness and promoting alertness.",
  },
  {
    protein: "1UDT",
    proteinName: "PDE5",
    ligandCid: 5212,
    ligandName: "Sildenafil",
    category: "Cardiovascular",
    description:
      "Inhibits phosphodiesterase type 5. Originally developed for hypertension, famously repurposed.",
  },
  {
    protein: "2HT8",
    proteinName: "Neuraminidase",
    ligandCid: 65028,
    ligandName: "Oseltamivir",
    category: "Antiviral",
    description:
      "Tamiflu — the frontline antiviral for influenza. Blocks viral release from host cells.",
  },
  {
    protein: "7BV2",
    proteinName: "RNA-dependent RNA Polymerase",
    ligandCid: 121304016,
    ligandName: "Remdesivir",
    category: "Antiviral",
    description:
      "Developed for COVID-19. Mimics adenosine and terminates viral RNA replication.",
  },
  {
    protein: "1MUI",
    proteinName: "HIV-1 Protease",
    ligandCid: 92727,
    ligandName: "Lopinavir",
    category: "Antiviral",
    description:
      "HIV protease inhibitor used in combination antiretroviral therapy for AIDS treatment.",
  },
  {
    protein: "1JFF",
    proteinName: "Tubulin",
    ligandCid: 36314,
    ligandName: "Paclitaxel",
    category: "Cancer",
    description:
      "Taxol — derived from Pacific yew tree bark. Stabilizes microtubules to halt cancer cell division.",
  },
  {
    protein: "4CFF",
    proteinName: "AMPK",
    ligandCid: 4091,
    ligandName: "Metformin",
    category: "Metabolic",
    description:
      "The most prescribed diabetes drug globally. Activates AMP-activated protein kinase.",
  },
  {
    protein: "3ERT",
    proteinName: "Estrogen Receptor α",
    ligandCid: 2733526,
    ligandName: "Tamoxifen",
    category: "Cancer",
    description:
      "Selective estrogen receptor modulator for breast cancer. Blocks estrogen-driven tumor growth.",
  },
  {
    protein: "2RG6",
    proteinName: "Acetylcholinesterase",
    ligandCid: 3152,
    ligandName: "Donepezil",
    category: "Neuroscience",
    description:
      "Aricept — first-line treatment for Alzheimer's disease. Inhibits acetylcholine breakdown.",
  },
  {
    protein: "3NYA",
    proteinName: "EGFR Kinase",
    ligandCid: 176870,
    ligandName: "Erlotinib",
    category: "Cancer",
    description:
      "Targets epidermal growth factor receptor in non-small cell lung cancer.",
  },
  {
    protein: "3OGP",
    proteinName: "HMG-CoA Reductase",
    ligandCid: 60823,
    ligandName: "Atorvastatin",
    category: "Cardiovascular",
    description:
      "Lipitor — the best-selling drug in history. Lowers cholesterol by inhibiting its synthesis.",
  },
  {
    protein: "2ITO",
    proteinName: "Dihydrofolate Reductase",
    ligandCid: 126941,
    ligandName: "Methotrexate",
    category: "Cancer",
    description:
      "Antimetabolite chemotherapy drug. Blocks folate metabolism essential for DNA synthesis.",
  },
  {
    protein: "1PWC",
    proteinName: "Penicillin-Binding Protein",
    ligandCid: 5904,
    ligandName: "Penicillin G",
    category: "Antibiotic",
    description:
      "The drug that started the antibiotic revolution. Disrupts bacterial cell wall synthesis.",
  },
];

const CATEGORIES = ["All", ...Array.from(new Set(EXAMPLES.map((e) => e.category)))];

const Examples: FC = () => {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

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
        <h1 className="text-4xl font-extralight text-center mb-1">Examples</h1>
        <p className="text-center text-xs text-gray-500 mb-8">
          Famous protein-ligand dockings — tap to start
        </p>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search examples (e.g. cancer, aspirin, kinase...)"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm
                     placeholder-gray-600 focus:outline-none focus:border-white/30 transition-colors mb-4"
        />

        {/* Category pills */}
        <div className="flex flex-wrap gap-2 mb-6">
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

        {/* Results */}
        <div className="space-y-3">
          {filtered.map((ex) => (
            <Link
              key={`${ex.protein}-${ex.ligandCid}`}
              href={`/docking/cook?proteinState=${ex.protein}&ligandCid=${ex.ligandCid}&ligandName=${encodeURIComponent(ex.ligandName)}`}
              className="block border border-white/10 rounded-2xl p-5 hover:border-white/25 hover:bg-white/[0.02] transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{ex.ligandName}</span>
                    <span className="text-[10px] bg-white/5 text-gray-400 px-2 py-0.5 rounded-full">
                      {ex.category}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mb-2">
                    <span className="font-mono">{ex.protein}</span>
                    <span className="mx-1.5">·</span>
                    {ex.proteinName}
                    <span className="mx-1.5">·</span>
                    CID {ex.ligandCid}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {ex.description}
                  </p>
                </div>
                <div className="shrink-0 mt-1">
                  <img
                    src={`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${ex.ligandCid}/PNG?image_size=80x80`}
                    alt={ex.ligandName}
                    className="w-14 h-14 rounded-lg bg-white"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              </div>
            </Link>
          ))}

          {filtered.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-8">
              No examples match your search.
            </p>
          )}
        </div>

        <p className="text-[10px] text-gray-600 text-center mt-8">
          {EXAMPLES.length} curated examples · Tap to skip straight to docking
        </p>
      </div>
    </div>
  );
};

export default Examples;
