export default function About() {
  return (
    <div className="flex flex-col items-center min-h-screen px-6 pt-24">
      <div className="max-w-lg">
        <h1 className="text-4xl font-extralight text-center mb-10">About</h1>

        <div className="space-y-6 text-sm text-gray-400 leading-relaxed">
          <p>
            <strong className="text-white">LCBC Dock</strong> is an online molecular docking
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

        <div className="mt-12 border border-white/10 rounded-2xl p-6">
          <p className="text-sm text-gray-400 leading-relaxed">
            A big shoutout to <strong className="text-white">Professor Juyong Lee</strong> at
            Seoul National University Computational Drug Discovery Lab for the inspiration
            and providing me a valuable opportunity to intern at your lab.
          </p>
        </div>

        <footer className="mt-10 text-center text-xs text-gray-600">
          Built by John Wonmo Seong &middot; Seoul National University
        </footer>
      </div>
    </div>
  );
}
