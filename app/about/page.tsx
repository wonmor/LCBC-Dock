import Link from "next/link";

export default function About() {
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
        <h1 className="text-5xl font-thin text-center">
          WHAT IS
          <br />
          MOLECULAR
          <br />
          DOCKING?
        </h1>
      </div>

        <p className="m-0 max-w-[30ch] text-xl leading-relaxed mt-10 opacity-75">
          Molecular docking is a computational method that predicts the
          preferred orientation of one molecule to a second when bound to each
          other to form a stable complex. Knowledge of the preferred orientation
          in turn may be used to predict the strength of association or binding
          affinity between two molecules using, for example, scoring functions.{" "}
          <br />
          <br />
          Typical applications of molecular docking include: <br />
          <br />
          <ul className="list-disc list-inside">
            <li>Drug design</li>
            <li>Protein function prediction</li>
            <li>Protein-protein interaction prediction</li>
            <li>Protein-DNA interaction prediction</li>
            <li>Protein-RNA interaction prediction</li>
          </ul>
        </p>
    </main>
  );
}
