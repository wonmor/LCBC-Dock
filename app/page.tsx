import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div className="text-center max-w-2xl">
        <h1 className="text-6xl sm:text-8xl font-extralight tracking-tight mb-4">
          LCBC <span className="font-semibold">DOCK</span>
        </h1>
        <p className="text-gray-400 text-lg mb-12">
          Molecular docking in your browser.
          <br />
          Powered by AutoDock Vina.
        </p>

        <Link
          href="/docking/protein"
          className="inline-block bg-white text-black px-8 py-3 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors mb-16"
        >
          Start Docking
        </Link>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          <div className="border border-white/10 rounded-2xl p-5">
            <h3 className="text-sm font-medium mb-2">Search</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              200K+ proteins from RCSB PDB. 100M+ molecules from PubChem.
            </p>
          </div>
          <div className="border border-white/10 rounded-2xl p-5">
            <h3 className="text-sm font-medium mb-2">Dock</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Configure grid box, submit to queue, get email when done.
            </p>
          </div>
          <div className="border border-white/10 rounded-2xl p-5">
            <h3 className="text-sm font-medium mb-2">View</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Interactive 3D viewer. Download PDB or PDBQT results.
            </p>
          </div>
        </div>
      </div>

      <footer className="absolute bottom-6 text-xs text-gray-600">
        Built by John Seong &middot; Seoul National University
      </footer>
    </div>
  );
}
