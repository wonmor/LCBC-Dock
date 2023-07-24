import Link from "next/link";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24 bg-gradient-to-br from-gray-900 to-black text-white">
      {/* SVG representation of protein-ligand docking */}
      <Link href="/">
        <svg
          width="300"
          height="200"
          viewBox="0 0 300 200"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Protein */}
          <rect x="20" y="20" width="120" height="30" fill="#FF5733" />
          <rect x="40" y="60" width="80" height="30" fill="#FF5733" />
          <rect x="60" y="100" width="40" height="30" fill="#FF5733" />
          {/* Ligand */}
          <rect x="200" y="70" width="60" height="30" fill="#66BB6A" />
          <rect x="230" y="110" width="20" height="30" fill="#66BB6A" />
          {/* Bond */}
          <line
            x1="120"
            y1="35"
            x2="200"
            y2="85"
            stroke="white"
            strokeWidth="2"
          />
        </svg>
      </Link>

      {/* Title */}
      <div className="flex flex-col space-y-2">
        <h1 className="text-5xl font-semibold text-center"><span className="bg-blue-300 text-black rounded-lg px-2">LCBC</span> DOCK</h1>
        <span className="text-md text-center">Developed by John Seong<br />in collaboration with <a rel="noopener noreferrer" target="_blank" className="text-blue-300 hover:underline" href="https://en.snu.ac.kr">SNU</a></span>
      </div>

      <div className="mb-32 grid text-center lg:mb-0 lg:grid-cols-4 lg:text-left">
        <Link
          href="/docking/start"
          className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800 hover:dark:bg-opacity-30"
        >
          <div className="mb-3 flex flex-row spacing-2">
            <h2 className="text-2xl text-blue-300">Start</h2>

            <ArrowForwardIcon className="text-blue-300 m-auto ml-2 inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
          </div>
          <p className="text-blue-300 m-0 max-w-[30ch] text-sm opacity-50">
            Explore interactive protein-ligand docking visualizations.
          </p>
        </Link>


        <Link
          href="/tutorials"
          className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
        >
          <div className="mb-3 flex flex-row spacing-2">
            <h2 className="text-2xl">Tutorials</h2>

            <ArrowForwardIcon className="m-auto ml-2 inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
          </div>
          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            Learn how to perform protein-ligand docking step-by-step.
          </p>
        </Link>


        <Link
          href="/about"
          className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
        >
          <div className="mb-3 flex flex-row spacing-2">
            <h2 className="text-2xl">About</h2>

            <ArrowForwardIcon className="m-auto ml-2 inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
          </div>

          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            Learn more about the protein-ligand docking process.
          </p>
        </Link>

        <Link
          href="/contact"
          className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
        >
          <div className="mb-3 flex flex-row spacing-2">
            <h2 className="text-2xl">Contact</h2>

            <ArrowForwardIcon className="m-auto ml-2 inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
          </div>
          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            Get in touch with us for any inquiries.
          </p>
        </Link>
      </div>
    </main>
  );
}
