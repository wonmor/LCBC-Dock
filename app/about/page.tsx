export default function About() {
  return (
    <div className="flex flex-col items-center min-h-screen px-6 pt-24">
      <div className="max-w-lg">
        <h1 className="text-4xl font-extralight text-center mb-10">About</h1>

        <div className="space-y-6 text-sm text-gray-400 leading-relaxed">
          <p>
            <strong className="text-white">MolDock</strong> is an online molecular docking
            platform powered by AutoDock Vina. It lets you search for proteins and small
            molecules from public databases, configure docking parameters, and visualize
            results — entirely in your browser.
          </p>

          <p>
            <strong className="text-white">Molecular docking</strong> predicts how a small
            molecule (ligand) binds to a protein target. This is fundamental to drug discovery,
            helping researchers identify promising drug candidates before expensive lab experiments.
          </p>

          <div>
            <p className="text-white text-xs font-medium mb-2">Data Sources</p>
            <ul className="space-y-1 text-xs">
              <li>Proteins &mdash; RCSB Protein Data Bank (200,000+ structures)</li>
              <li>Molecules &mdash; PubChem (100M+ compounds)</li>
            </ul>
          </div>

          <div>
            <p className="text-white text-xs font-medium mb-2">Applications</p>
            <ul className="space-y-1 text-xs">
              <li>Drug design and virtual screening</li>
              <li>Protein function prediction</li>
              <li>Protein-ligand interaction studies</li>
              <li>Computational chemistry education</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border border-white/10 rounded-2xl p-6">
          <p className="text-white text-xs font-medium mb-2">A Note on Exhaustiveness</p>
          <p className="text-xs text-gray-400 leading-relaxed">
            Docking jobs currently run with a default exhaustiveness of 4 to keep wait times
            short on our current server. Higher exhaustiveness (8&ndash;32) produces more
            accurate results but takes significantly longer. With additional funding, we plan
            to upgrade to more powerful compute infrastructure to support higher exhaustiveness
            and faster turnaround for all users.
          </p>
        </div>

        <div className="mt-4 border border-white/10 rounded-2xl p-6">
          <p className="text-sm text-gray-400 leading-relaxed">
            A big shoutout to <strong className="text-white">Professor Juyong Lee</strong> at
            Seoul National University Computational Drug Discovery Lab for the inspiration
            and providing me a valuable opportunity to intern at your lab.
          </p>
        </div>

        <div className="mt-4 border border-white/10 rounded-2xl p-6">
          <p className="text-white text-xs font-medium mb-2">Funding &amp; Research Inquiries</p>
          <p className="text-xs text-gray-400 leading-relaxed">
            If you are interested in supporting this project, collaborating on research,
            or have funding inquiries, please reach out:
          </p>
          <a href="mailto:john@orchestrsim.com" className="text-sm text-blue-400 hover:text-blue-300 mt-2 inline-block">
            john@orchestrsim.com
          </a>
        </div>

        <footer className="mt-10 text-center text-xs text-gray-600">
          Built by John Wonmo Seong &middot; UC Irvine &times; Seoul National University
        </footer>
      </div>
    </div>
  );
}
