"use client";

import { FC, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import AsyncSelect from "react-select/async";
import ProgressBar from "@/app/progressBar";
import debounce from "lodash/debounce";

const API_BASE =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://api.lcbcdock.com";

interface LigandResult {
  cid: number;
  name: string;
  molecular_formula: string;
  molecular_weight: number;
  iupac_name?: string;
  canonical_smiles?: string;
}

interface LigandDetail extends LigandResult {
  synonyms?: string[];
  image_url?: string;
  sdf_url?: string;
}

const Ligand: FC = () => {
  const searchParams = useSearchParams();
  const proteinState = searchParams.get("proteinState") ?? null;

  const [selectedLigand, setSelectedLigand] = useState<LigandDetail | null>(
    null
  );

  const loadOptions = useCallback(
    debounce(
      (inputValue: string, callback: (options: any) => void) => {
        if (!inputValue || inputValue.trim().length < 2) {
          callback([]);
          return;
        }

        axios
          .get(`${API_BASE}/api/ligands/search`, {
            params: { q: inputValue },
          })
          .then((response) => {
            const options = response.data.map((r: LigandResult) => ({
              value: r,
              label: `${r.name} (CID: ${r.cid}) — ${r.molecular_formula}`,
            }));
            callback(options);
          })
          .catch((error) => {
            console.error("Error searching ligands:", error);
            callback([]);
          });
      },
      400
    ),
    []
  );

  const handleChange = async (selectedOption: any) => {
    const ligand = selectedOption.value as LigandResult;

    try {
      const detailResp = await axios.get(
        `${API_BASE}/api/ligands/${ligand.cid}`
      );
      setSelectedLigand(detailResp.data);
    } catch {
      setSelectedLigand({
        ...ligand,
        image_url: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${ligand.cid}/PNG`,
        sdf_url: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${ligand.cid}/SDF?record_type=3d`,
      });
    }
  };

  return (
    <main className="pb-40">
      <div className="text-center">
        <h1 className="text-6xl font-thin mb-6">
          {selectedLigand ? (
            <>
              <span className="font-semibold">LIGAND</span>
              <br />
              {selectedLigand.name.toUpperCase()}
            </>
          ) : (
            <>
              SEARCH
              <br />
              <span className="font-semibold">LIGAND</span>
            </>
          )}
        </h1>
      </div>

      {!selectedLigand && (
        <div className="flex flex-col gap-4">
          <div style={{ filter: "invert(1)", zIndex: 40 }}>
            <AsyncSelect
              cacheOptions
              placeholder="Search molecules (e.g. aspirin, caffeine, nutlin-3a)..."
              loadOptions={loadOptions}
              onChange={handleChange}
              styles={{
                option: (provided) => ({
                  ...provided,
                  color: "black",
                  cursor: "pointer",
                }),
                singleValue: (provided) => ({
                  ...provided,
                  color: "black",
                  cursor: "pointer",
                }),
              }}
            />
          </div>
          <span className="text-md text-center">
            <span className="bg-gray-700 p-1 mr-2 rounded-md">TIP</span>
            Search by molecule name, SMILES, or common drug name
          </span>
          <span className="text-md text-center">
            <span className="bg-blue-300 text-black font-semibold p-1 mr-2 rounded-md">
              EXAMPLE
            </span>
            Try entering aspirin, caffeine, or nutlin-3a
          </span>
          <p className="text-center text-sm opacity-50 mt-2">
            Powered by PubChem — over 100 million compounds
          </p>
        </div>
      )}

      {selectedLigand && (
        <div className="flex flex-col items-center gap-6 mt-4">
          {/* 2D Structure Image */}
          <div className="bg-white rounded-2xl p-4">
            <img
              src={selectedLigand.image_url}
              alt={selectedLigand.name}
              className="max-w-[300px] max-h-[300px]"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>

          {/* Molecule Info Card */}
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-lg">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-gray-400 text-sm">PubChem CID</span>
                <p className="text-lg font-mono">{selectedLigand.cid}</p>
              </div>
              <div>
                <span className="text-gray-400 text-sm">Molecular Formula</span>
                <p className="text-lg">{selectedLigand.molecular_formula}</p>
              </div>
              <div>
                <span className="text-gray-400 text-sm">Molecular Weight</span>
                <p className="text-lg">
                  {selectedLigand.molecular_weight?.toFixed(2)} g/mol
                </p>
              </div>
              <div>
                <span className="text-gray-400 text-sm">IUPAC Name</span>
                <p className="text-sm break-words">
                  {selectedLigand.iupac_name || "N/A"}
                </p>
              </div>
            </div>

            {selectedLigand.canonical_smiles && (
              <div className="mt-4">
                <span className="text-gray-400 text-sm">SMILES</span>
                <p className="text-xs font-mono bg-gray-800 p-2 rounded mt-1 break-all">
                  {selectedLigand.canonical_smiles}
                </p>
              </div>
            )}

            {selectedLigand.synonyms && selectedLigand.synonyms.length > 1 && (
              <div className="mt-4">
                <span className="text-gray-400 text-sm">Also known as</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {selectedLigand.synonyms.slice(1, 6).map((s, i) => (
                    <span
                      key={i}
                      className="bg-gray-800 text-xs px-2 py-1 rounded"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setSelectedLigand(null)}
            className="text-blue-300 hover:text-blue-400 transition-colors text-sm"
          >
            Search for a different ligand
          </button>
        </div>
      )}

      <ProgressBar
        pointer={3}
        backLink="/docking/marinate"
        backLinkParams={
          proteinState ? { proteinState: proteinState } : ({} as any)
        }
        nextLink={
          selectedLigand && proteinState ? "/docking/cook" : (null as any)
        }
        nextLinkParams={
          selectedLigand && proteinState
            ? {
                proteinState: proteinState,
                ligandCid: String(selectedLigand.cid),
                ligandName: selectedLigand.name,
              }
            : (null as any)
        }
      />
    </main>
  );
};

export default Ligand;
