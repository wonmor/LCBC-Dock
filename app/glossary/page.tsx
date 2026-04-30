"use client";

import Link from "next/link";

/**
 * Plain-English glossary keyed by anchor IDs so other pages can deep
 * link (e.g., `/glossary#binding-affinity`). Aimed at undergrads who
 * just ran their first docking job and want to know what the numbers
 * mean before writing them up.
 */
export default function Glossary() {
  return (
    <div className="min-h-screen px-6 pt-24 pb-20">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-extralight text-center mb-2">Glossary</h1>
        <p className="text-xs text-gray-500 text-center mb-12">
          What the numbers mean — written for students, not specialists.
        </p>

        <Section
          id="binding-affinity"
          title="Binding affinity (kcal/mol)"
          body={
            <>
              <p>
                The score AutoDock Vina returns for each pose. <strong>More
                negative is better</strong> — a lower (more negative) number
                means a more energetically favourable interaction between
                ligand and receptor.
              </p>
              <ScoreScale />
              <p className="mt-3">
                These thresholds are rules of thumb, not laws. Affinity for
                drug-like molecules typically clusters around −7 to −9
                kcal/mol; metallic cofactors and tight covalent inhibitors
                push lower, while large flexible ligands look worse than
                they really are because Vina rewards rigid hits.
              </p>
            </>
          }
        />

        <Section
          id="exhaustiveness"
          title="Exhaustiveness"
          body={
            <p>
              How many independent search runs Vina performs. Higher
              numbers mean more thorough sampling of the conformational
              space — and slower runtime. The default of <strong>8</strong> is
              a reasonable trade-off for most undergraduate work; bump to
              16 or 32 for publication-quality results, or for ligands with
              many rotatable bonds.
            </p>
          }
        />

        <Section
          id="num-modes"
          title="Number of modes"
          body={
            <p>
              The maximum number of binding poses Vina returns. Even if you
              ask for nine, it only returns that many if it can find that
              many distinct poses within the energy range. Reduce to one
              if you only care about the best fit; raise to twenty if
              you're surveying the binding landscape.
            </p>
          }
        />

        <Section
          id="energy-range"
          title="Energy range"
          body={
            <p>
              The maximum kcal/mol gap between the best pose and the worst
              pose returned. With the default of 3.0, a job whose best
              pose is −8.5 will only return poses with affinities above
              about −5.5 kcal/mol. Tighten this (e.g., 1.0) if you only
              want very-similar poses; loosen it (e.g., 6.0) to see more
              alternative geometries.
            </p>
          }
        />

        <Section
          id="search-box"
          title="Search box (grid box)"
          body={
            <p>
              The 3D rectangle in which Vina is allowed to place the
              ligand. DockIt computes the geometric centre of the protein
              by default — you almost always want to <em>narrow</em> this to
              a known binding pocket once you've got an initial result, so
              the search doesn't waste time on the surface. Box sizes
              between 18 and 25 Å per side cover most pockets.
            </p>
          }
        />

        <Section
          id="pdbqt"
          title="PDBQT"
          body={
            <p>
              AutoDock's extended PDB format. Each atom carries an
              additional Gasteiger partial charge plus an autodock atom
              type (e.g. C.ar for aromatic carbon). DockIt produces this
              automatically when you submit, but you can download the
              docked PDBQT and feed it back into other AutoDock-family
              tools.
            </p>
          }
        />

        <Section
          id="autodock-vina"
          title="AutoDock Vina"
          body={
            <p>
              The open-source docking engine DockIt wraps. Vina was
              published by Trott &amp; Olson in 2010 and uses an iterated
              local search global optimiser with an empirical scoring
              function. It's fast (seconds to minutes per ligand) and
              <em> good enough</em> for triage / teaching, though dedicated
              physics-based methods (e.g. FEP) outperform it in absolute
              accuracy.
            </p>
          }
        />

        <div className="mt-12 text-center text-xs">
          <Link href="/" className="text-gray-500 hover:text-white">
            ← Back home
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, body }: { id: string; title: string; body: React.ReactNode }) {
  return (
    <section id={id} className="mb-10 scroll-mt-24">
      <h2 className="text-lg font-light mb-3">{title}</h2>
      <div className="text-sm text-gray-300 leading-relaxed space-y-2">{body}</div>
    </section>
  );
}

function ScoreScale() {
  const rows: { range: string; tier: string; color: string }[] = [
    { range: "≤ −10",      tier: "Excellent",   color: "text-emerald-400" },
    { range: "−10 to −8",  tier: "Strong",      color: "text-green-400" },
    { range: "−8 to −6",   tier: "Moderate",    color: "text-yellow-400" },
    { range: "−6 to −4",   tier: "Weak",        color: "text-orange-400" },
    { range: "> −4",       tier: "Poor",        color: "text-red-400" },
  ];
  return (
    <div className="my-3 border border-white/10 rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <tbody>
          {rows.map((r) => (
            <tr key={r.range} className="border-b border-white/5 last:border-0">
              <td className="px-3 py-2 font-mono text-gray-400">{r.range} kcal/mol</td>
              <td className={`px-3 py-2 ${r.color} font-medium`}>{r.tier}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
