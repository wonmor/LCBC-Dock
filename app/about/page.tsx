export default function About() {
  return (
    <main>
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
        Molecular docking is a computational method that predicts the preferred
        orientation of one molecule to a second when bound to each other to form
        a stable complex. Knowledge of the preferred orientation in turn may be
        used to predict the strength of association or binding affinity between
        two molecules using, for example, scoring functions. <br />
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
