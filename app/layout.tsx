import Background from "./background";
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
        <div className="flex min-h-screen flex-col items-center justify-between p-24 bg-gradient-to-br from-gray-900 to-black text-white">
          <Background />
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
          {children}
        </div>
      </body>
    </html>
  );
}
