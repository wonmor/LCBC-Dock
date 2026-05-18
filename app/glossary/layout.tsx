import { Metadata } from "next";

// SEO note: this file exists purely to host route-level `metadata`.
// The page itself is a client component (interactive anchor scrolling)
// and Next.js disallows metadata exports from "use client" files.
export const metadata: Metadata = {
  title: "Molecular docking glossary",
  description:
    "Plain-English explanations of binding affinity (kcal/mol), exhaustiveness, search box, PDBQT, and AutoDock Vina — written for chemistry students writing up their first docking results.",
  keywords: [
    "molecular docking glossary", "binding affinity kcal/mol",
    "AutoDock Vina exhaustiveness", "PDBQT format", "search grid box",
    "drug discovery terms", "computational chemistry definitions",
  ],
  alternates: { canonical: "/glossary" },
  openGraph: {
    title: "Molecular docking glossary — MolDock",
    description: "Plain-English docking terms for medicinal chemistry students.",
    url: "/glossary",
  },
};

export default function GlossaryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
