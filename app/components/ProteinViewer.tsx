"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  pdbId?: string;
  pdbData?: string;
  ligandPdb?: string;
  height?: string;
}

declare global {
  interface Window {
    $3Dmol: any;
  }
}

export default function ProteinViewer({ pdbId, pdbData, ligandPdb, height = "100%" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [style, setStyle] = useState<"cartoon" | "stick" | "surface">("cartoon");
  const [spinning, setSpinning] = useState(true);

  // Load 3Dmol.js from CDN
  useEffect(() => {
    if (window.$3Dmol) {
      setLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://3Dmol.org/build/3Dmol-min.js";
    script.onload = () => setLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Initialize viewer
  useEffect(() => {
    if (!loaded || !containerRef.current) return;

    const viewer = window.$3Dmol.createViewer(containerRef.current, {
      backgroundColor: "0x0a0a0a",
      antialias: true,
      cartoonQuality: 8,
    });
    viewerRef.current = viewer;

    const loadStructure = async () => {
      let proteinData = pdbData;

      if (!proteinData && pdbId) {
        try {
          const resp = await fetch(`https://files.rcsb.org/download/${pdbId}.pdb`);
          proteinData = await resp.text();
        } catch {
          return;
        }
      }

      if (!proteinData) return;

      // Add protein
      const model = viewer.addModel(proteinData, "pdb");

      // Remove water
      viewer.removeAllModels();
      const cleanedLines = proteinData
        .split("\n")
        .filter((l: string) => !l.startsWith("HETATM") || l.substring(17, 20).trim() !== "HOH")
        .join("\n");
      viewer.addModel(cleanedLines, "pdb");

      applyStyle(viewer, style);

      // Add docked ligand if provided
      if (ligandPdb) {
        viewer.addModel(ligandPdb, "pdb");
        viewer.setStyle({ model: 1 }, {
          stick: {
            colorscheme: "greenCarbon",
            radius: 0.15,
          },
          sphere: {
            colorscheme: "greenCarbon",
            scale: 0.3,
          },
        });
      }

      viewer.zoomTo();
      viewer.spin(spinning);
      viewer.render();
    };

    loadStructure();

    return () => {
      viewer.clear();
    };
  }, [loaded, pdbId, pdbData, ligandPdb]);

  // Update style
  useEffect(() => {
    if (!viewerRef.current) return;
    applyStyle(viewerRef.current, style);
    viewerRef.current.render();
  }, [style]);

  // Update spin
  useEffect(() => {
    if (!viewerRef.current) return;
    viewerRef.current.spin(spinning);
  }, [spinning]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Controls */}
      <div className="absolute bottom-3 left-3 flex gap-1.5">
        {(["cartoon", "stick", "surface"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStyle(s)}
            className={`text-[10px] px-2.5 py-1 rounded-full transition-all backdrop-blur-md ${
              style === s
                ? "bg-white text-black"
                : "bg-black/50 text-gray-400 hover:text-white"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <button
          onClick={() => setSpinning(!spinning)}
          className={`text-[10px] px-2.5 py-1 rounded-full backdrop-blur-md transition-all ${
            spinning
              ? "bg-white/20 text-white"
              : "bg-black/50 text-gray-400 hover:text-white"
          }`}
        >
          {spinning ? "Stop" : "Spin"}
        </button>
      </div>
    </div>
  );
}

function applyStyle(viewer: any, style: "cartoon" | "stick" | "surface") {
  viewer.setStyle({ model: 0 }, {});

  switch (style) {
    case "cartoon":
      viewer.setStyle({ model: 0 }, {
        cartoon: {
          color: "spectrum",
          thickness: 0.4,
          opacity: 1.0,
        },
      });
      break;
    case "stick":
      viewer.setStyle({ model: 0 }, {
        stick: {
          colorscheme: "Jmol",
          radius: 0.12,
        },
      });
      break;
    case "surface":
      viewer.setStyle({ model: 0 }, {
        cartoon: {
          color: "spectrum",
          opacity: 0.5,
          thickness: 0.3,
        },
      });
      viewer.addSurface(
        window.$3Dmol.SurfaceType.VDW,
        {
          opacity: 0.7,
          color: "white",
          voldata: null,
        },
        { model: 0 }
      );
      break;
  }
}
