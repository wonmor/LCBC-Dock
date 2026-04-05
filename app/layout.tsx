import Link from "next/link";
import React from "react";

import { Outfit } from "next/font/google";

import "./globals.css";

const outfit = Outfit({ subsets: ["latin"] });

export const metadata = {
  title: "LCBC Dock",
  description: "Protein-Ligand Docking. Reimagined.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={outfit.className}>
        <div className="min-h-screen bg-black text-white">
          <nav className="fixed top-0 w-full z-50 bg-black/80 backdrop-blur-md border-b border-white/5">
            <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2">
                <span className="text-sm font-light tracking-widest">LCBC</span>
                <span className="text-sm font-semibold tracking-widest">DOCK</span>
              </Link>
              <div className="flex items-center gap-6 text-xs text-gray-400">
                <Link href="/docking/protein" className="hover:text-white transition-colors">Dock</Link>
                <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
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
