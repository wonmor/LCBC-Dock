import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Example docking jobs",
  description:
    "Pre-canned protein-ligand docking examples — known co-crystals from the PDB so you can see MolDock's output before running your own. Useful for teaching, validation, and benchmarking AutoDock Vina against published structures.",
  keywords: [
    "docking examples", "AutoDock Vina tutorial", "co-crystal validation",
    "protein-ligand benchmark", "PDB redocking",
  ],
  alternates: { canonical: "/examples" },
};

export default function ExamplesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
