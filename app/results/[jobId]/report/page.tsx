"use client";

import { FC, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";

const API_BASE =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://lcbc-server.apps.johnseong.com";

interface Pose { model: number; affinity: number; }

/**
 * Printable lab report. Designed to look right in `Cmd+P → Save as PDF`
 * — paper-sized layout, black-on-white, no nav chrome. Auto-generates
 * an abstract / methods / results / parameters block from the job
 * data, ready to drop into a coursework write-up or supplementary
 * material.
 */
const LabReport: FC = () => {
  const params = useParams();
  const jobId = params.jobId as string;
  const [r, setR] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) return;
    axios.get(`${API_BASE}/api/results/${jobId}`)
      .then((res) => setR(res.data))
      .catch(() => setR(null))
      .finally(() => setLoading(false));
  }, [jobId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-black">
        <div className="w-6 h-6 border-2 border-black/20 border-t-black rounded-full animate-spin" />
      </div>
    );
  }
  if (!r) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-black px-6 text-center">
        <p>Could not load report.</p>
      </div>
    );
  }

  const completedAt = r.completed_at ? new Date(r.completed_at).toLocaleString() : "—";
  const createdAt = r.created_at ? new Date(r.created_at).toLocaleString() : "—";

  const interpret = (a: number) => {
    if (a <= -10) return "an exceptional in silico hit (sub-nanomolar regime)";
    if (a <= -8) return "a strong putative binder warranting experimental follow-up";
    if (a <= -6) return "a moderate fit; refinement of the search space or ligand may be warranted";
    if (a <= -4) return "a weak fit, suggesting the chosen pocket is suboptimal";
    return "an unfavourable fit, indicating the grid placement or protonation state should be reconsidered";
  };

  const tagList = (r.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean);

  return (
    <>
      {/* Print-friendly stylesheet — kept inline so the report works
          without touching the global tailwind config. */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
        @page { size: letter; margin: 1in; }
      `}</style>

      <div className="bg-white text-black min-h-screen">
        {/* Toolbar — hidden in print */}
        <div className="no-print sticky top-0 z-40 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <Link href={`/results/${jobId}`} className="text-xs text-gray-600 hover:text-black">
            ← Back to results
          </Link>
          <button
            onClick={() => window.print()}
            className="bg-black text-white text-xs px-4 py-1.5 rounded-full hover:bg-gray-800"
          >
            Print / Save as PDF
          </button>
        </div>

        <article className="max-w-3xl mx-auto px-8 py-10 text-sm leading-relaxed">
          {/* Header */}
          <header className="mb-8 pb-6 border-b border-gray-300">
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">DockIt Lab Report</p>
            <h1 className="text-3xl font-light mb-1">
              Molecular docking of {r.ligand_name} to {r.protein_pdb_id?.toUpperCase()}
            </h1>
            <p className="text-xs text-gray-600">
              Job ID <span className="font-mono">{r.job_id}</span> · Completed {completedAt}
            </p>
            {tagList.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {tagList.map((t: string) => (
                  <span key={t} className="text-[10px] bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </header>

          {/* Abstract */}
          <section className="mb-6">
            <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Abstract</h2>
            <p>
              The small molecule <strong>{r.ligand_name}</strong> (PubChem CID {r.ligand_cid})
              was docked into the structure <strong>{r.protein_pdb_id?.toUpperCase()}</strong>
              {" "}using AutoDock Vina via the DockIt platform. The lowest-energy pose
              returned a binding affinity of <strong>{r.best_affinity} kcal/mol</strong>,
              {" "}consistent with {interpret(r.best_affinity)}. Across {r.num_poses ?? r.poses?.length ?? "n"} sampled poses,
              the algorithm explored a {r.size_x?.toFixed(0)}×{r.size_y?.toFixed(0)}×{r.size_z?.toFixed(0)} Å
              {" "}search box centred on the geometric centre of the asymmetric unit.
            </p>
          </section>

          {/* Methods */}
          <section className="mb-6">
            <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Methods</h2>
            <p>
              Receptor coordinates were retrieved from the RCSB Protein Data Bank
              (<a href={`https://www.rcsb.org/structure/${r.protein_pdb_id?.toUpperCase()}`}
                  className="underline">{r.protein_pdb_id?.toUpperCase()}</a>) and ligand
              coordinates from PubChem (CID {r.ligand_cid}). Both were converted to
              PDBQT format with Open Babel; protein hydrogens were added at default
              protonation, and the ligand was assigned Gasteiger charges. Docking
              was performed with AutoDock Vina at exhaustiveness {r.exhaustiveness},
              requesting {r.num_modes} binding modes within an energy range of {r.energy_range} kcal/mol
              of the best score.
            </p>
            <table className="mt-4 w-full text-xs border border-gray-200">
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="px-3 py-2 text-gray-500 w-1/3">Search box centre</td>
                  <td className="px-3 py-2 font-mono">
                    ({r.center_x?.toFixed(2)}, {r.center_y?.toFixed(2)}, {r.center_z?.toFixed(2)}) Å
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-3 py-2 text-gray-500">Search box size</td>
                  <td className="px-3 py-2 font-mono">
                    {r.size_x?.toFixed(0)} × {r.size_y?.toFixed(0)} × {r.size_z?.toFixed(0)} Å
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-3 py-2 text-gray-500">Exhaustiveness</td>
                  <td className="px-3 py-2 font-mono">{r.exhaustiveness}</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-3 py-2 text-gray-500">Modes requested</td>
                  <td className="px-3 py-2 font-mono">{r.num_modes}</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 text-gray-500">Energy range</td>
                  <td className="px-3 py-2 font-mono">{r.energy_range} kcal/mol</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Results */}
          <section className="mb-6">
            <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Results</h2>
            <p className="mb-3">
              The best pose (Model 1) bound with <strong>{r.best_affinity} kcal/mol</strong>.
              {" "}A summary of all returned poses follows.
            </p>
            {r.poses?.length > 0 && (
              <table className="w-full text-xs border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Pose</th>
                    <th className="text-right px-3 py-2 font-medium">Affinity (kcal/mol)</th>
                    <th className="text-right px-3 py-2 font-medium">Δ vs. best</th>
                  </tr>
                </thead>
                <tbody>
                  {r.poses.map((p: Pose, i: number) => (
                    <tr key={p.model} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-mono">Model {p.model}{i === 0 && " (best)"}</td>
                      <td className="px-3 py-2 text-right font-mono">{p.affinity}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {i === 0 ? "—" : `+${(p.affinity - r.best_affinity).toFixed(2)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Discussion / notes */}
          {r.notes && (
            <section className="mb-6">
              <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Notes</h2>
              <p className="whitespace-pre-wrap">{r.notes}</p>
            </section>
          )}

          {/* References */}
          <section className="mb-6">
            <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-2">References</h2>
            <ol className="list-decimal pl-5 space-y-1 text-xs">
              <li>
                Trott, O.; Olson, A. J. <em>AutoDock Vina: improving the speed and
                accuracy of docking with a new scoring function, efficient
                optimization, and multithreading.</em> J. Comput. Chem. 31 (2010), 455–461.
              </li>
              <li>
                Berman, H. M.; Westbrook, J.; Feng, Z.; Gilliland, G.; Bhat, T. N.;
                Weissig, H.; Shindyalov, I. N.; Bourne, P. E. <em>The Protein Data
                Bank.</em> Nucleic Acids Res. 28 (2000), 235–242.
              </li>
              <li>
                Kim, S.; Chen, J.; Cheng, T.; et al. <em>PubChem 2023 update.</em>
                Nucleic Acids Res. 51 (D1) (2023), D1373–D1380.
              </li>
            </ol>
          </section>

          {/* Footer */}
          <footer className="pt-6 border-t border-gray-300 text-xs text-gray-500">
            <p>
              Generated by <strong>DockIt</strong> · job submitted {createdAt}
            </p>
          </footer>
        </article>
      </div>
    </>
  );
};

export default LabReport;
