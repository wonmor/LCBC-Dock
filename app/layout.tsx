import Link from "next/link";
import React from "react";

import { Outfit } from "next/font/google";

import "./globals.css";

const outfit = Outfit({ subsets: ["latin"] });

// Site-wide SEO. Per-page metadata in each route's `generateMetadata`
// or static `metadata` export overrides the title and adds page-
// specific descriptions. The template line lets every page extend
// the brand without duplicating "— MolDock" in their own titles.
export const metadata = {
  metadataBase: new URL("https://lcbc-client.apps.johnseong.com"),
  title: {
    default: "MolDock — Free protein-ligand docking in your browser",
    template: "%s — MolDock",
  },
  description:
    "Free, instant molecular docking with AutoDock Vina. Search any protein from the PDB, any ligand from PubChem, and dock in your browser — no install, no GPU. Drug-likeness scoring (Lipinski, Veber, QED, PAINS), printable lab reports, citation export. Built for medicinal chemistry students, professors, and computational biologists.",
  applicationName: "MolDock",
  keywords: [
    "molecular docking", "AutoDock Vina", "drug discovery", "protein-ligand docking",
    "virtual screening", "PubChem", "RCSB PDB", "computational chemistry",
    "drug-likeness", "Lipinski's rule of five", "QED", "binding affinity",
    "structure-based drug design", "medicinal chemistry", "MolDock", "LCBC-Dock",
    "free docking software", "online docking server",
  ],
  authors: [{ name: "John Wonmo Seong", url: "https://johnseong.com" }],
  creator: "John Wonmo Seong",
  publisher: "John Wonmo Seong",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://lcbc-client.apps.johnseong.com",
    siteName: "MolDock",
    title: "MolDock — Free protein-ligand docking in your browser",
    description:
      "Run AutoDock Vina from any browser. Drug-likeness scoring, lab reports, citation export. Built for academia.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "MolDock — molecular docking platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MolDock — Free protein-ligand docking",
    description: "AutoDock Vina + RDKit drug-likeness in your browser. Free for academia.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  category: "science",
  formatDetection: {
    email: false,
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // SoftwareApplication structured data — gives Google rich-result
  // eligibility (price, rating, screenshots, etc.) so the listing
  // can show as a card in SERPs instead of a plain blue link.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "MolDock",
    description:
      "Browser-based molecular docking platform powered by AutoDock Vina. Includes drug-likeness scoring, citation export, and printable lab reports.",
    url: "https://lcbc-client.apps.johnseong.com",
    applicationCategory: "ScienceApplication",
    operatingSystem: "Web, iOS, Android",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    creator: {
      "@type": "Person",
      name: "John Wonmo Seong",
      affiliation: {
        "@type": "Organization",
        name: "University of California, Irvine",
      },
    },
    keywords: "molecular docking, AutoDock Vina, drug discovery, protein-ligand, computational chemistry",
    softwareVersion: "2.0",
    image: "https://lcbc-client.apps.johnseong.com/og-image.png",
    screenshot: "https://lcbc-client.apps.johnseong.com/og-image.png",
  };

  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={outfit.className}>
        <div className="min-h-screen bg-black text-white">
          <nav className="fixed top-0 w-full z-50 bg-black/80 backdrop-blur-md border-b border-white/5">
            <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2" aria-label="MolDock home">
                <span className="text-sm font-light tracking-widest">Mol</span>
                <span className="text-sm font-semibold tracking-widest">Dock</span>
              </Link>
              <div className="flex items-center gap-6 text-xs text-gray-400">
                <Link href="/docking/protein" className="hover:text-white transition-colors">Dock</Link>
                <Link href="/examples" className="hover:text-white transition-colors">Examples</Link>
                <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
                <Link href="/glossary" className="hover:text-white transition-colors">Glossary</Link>
                <Link href="/about" className="hover:text-white transition-colors">About</Link>
              </div>
            </div>
          </nav>
          <main className="pt-14">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
