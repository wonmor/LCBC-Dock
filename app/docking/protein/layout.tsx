import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search proteins (RCSB PDB)",
  description:
    "Search any protein structure from the RCSB Protein Data Bank by name, PDB ID, or organism. Submit it directly to AutoDock Vina with one click — no installation, no scripting.",
  keywords: [
    "RCSB PDB search", "protein database lookup", "molecular docking",
    "AutoDock Vina online", "PDB ID lookup",
  ],
  alternates: { canonical: "/docking/protein" },
};

export default function ProteinLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
