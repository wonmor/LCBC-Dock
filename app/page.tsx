import Link from "next/link";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import Footer from "./footer";

export default function Home() {
  return (
    <main>
      {/* Title */}
      <div className="flex flex-col space-y-2">
        <h1 className="text-5xl font-semibold text-center">
          <a
            href="https://sites.google.com/view/lcbc"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="bg-blue-300 hover:bg-blue-400 text-black rounded-lg px-2 leading-relaxed">
              LCBC
            </span>
          </a>{" "}
          DOCK
        </h1>
        <span className="text-md text-center">
          Developed by John Seong
          <br />
          in collaboration with{" "}
          <a
            rel="noopener noreferrer"
            target="_blank"
            className="text-blue-300 hover:underline"
            href="https://en.snu.ac.kr"
          >
            SNU
          </a>
        </span>
      </div>

      <div className="mb-32 grid text-center lg:mb-0 lg:grid-cols-4 lg:text-left">
        <Link
          href="/docking/protein"
          className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800 hover:dark:bg-opacity-30"
        >
          <div className="mb-3 flex flex-row spacing-2">
            <h2 className="text-2xl text-blue-300">Start Docking</h2>

            <ArrowForwardIcon className="text-blue-300 m-auto ml-2 inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
          </div>
          <p className="text-blue-300 m-0 max-w-[30ch] text-sm opacity-50">
            Explore protein-ligand interactions, step-by-step.
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

      <Footer destination="/docking/protein" message="Click here to begin" />
    </main>
  );
}
