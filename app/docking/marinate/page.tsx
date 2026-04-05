"use client";

import axios, { AxiosResponse } from "axios";

import ProgressBar from "@/app/progressBar";
import Minimap from "react-simple-minimap";
import CloudDoneIcon from "@mui/icons-material/CloudDone";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RotatingTriangles } from "react-loader-spinner";

interface PdbResponse {
  content: string;
  water_molecule_count: number;
  hetatom_count: number;
}

// Function to convert PDB data to FormData
function pdbDataToFormData(pdbData: string): FormData {
  const blob = new Blob([pdbData], { type: "text/plain" });
  const formData = new FormData();
  formData.append("pdb_file", blob);
  return formData;
}

const Marinate: React.FC = () => {
  const searchParams = useSearchParams();
  const proteinState = searchParams.get("proteinState") ?? null;

  const [waterMoleculeCount, setWaterMoleculeCount] = useState<number | null>(
    null
  );
  const [hetatomCount, setHetatomCount] = useState<number | null>(null);
  const [proteinData, setProteinData] = useState<string | null>(null);
  const [processedProteinData, setProcessedProteinData] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response: AxiosResponse<string> = await axios.get(
          `https://files.rcsb.org/download/${proteinState}.pdb`
        );
        setProteinData(response.data);

        const serverUrl: string =
          "https://helper.lcbcdock.com/api/remove-water-hetatoms/";

        const formData: FormData = pdbDataToFormData(response.data);
        const processedResponse: AxiosResponse<PdbResponse> = await axios.post(
          serverUrl,
          formData
        );
        const processedData: string = processedResponse.data.content;

        console.log("Processed data: ", processedData);

        setProcessedProteinData(processedData);
        setWaterMoleculeCount(processedResponse.data.water_molecule_count);
        setHetatomCount(processedResponse.data.hetatom_count);

        setLoading(false);
      } catch (error: any) {
        console.error(`Error fetching PDB file: ${error}`);
      } finally {
        setLoading(false);
      }
    };

    if (proteinState) {
      fetchData();
    }
  }, [proteinState]);

  const pageContent = () => {
    return (
      <div className="pb-40">
        {proteinState && (
          <>
            <div className="text-center mb-5">
              <h1 className="text-6xl font-thin mb-6">
                <span className="font-semibold">PREPARE</span>
                <br />
                {proteinState}
              </h1>

              <p className="text-xl">
                {waterMoleculeCount && hetatomCount ? (
                  <>
                    <span className="text-rose-300">{waterMoleculeCount}</span>{" "}
                    water molecules and
                    <span className="text-rose-300"> {hetatomCount}</span>{" "}
                    heteroatoms have been removed.
                  </>
                ) : (
                  "Water molecules and heteroatoms have been removed."
                )}
              </p>

              <br />

              <p className="text-xl text-green-300">
                It has also gone through protonation state changes —<br />
                now pH 7.4 — with partial charges added.
              </p>
            </div>

            <div
              id="wrapper"
              className="text-center flex items-center justify-center"
            >
              {loading && (
                <div className="flex flex-col justify-center items-center text-center">
                  <RotatingTriangles />
                  <p>
                    Fixing the PDB,
                    <br />
                    this might take a while...
                  </p>
                </div>
              )}

              {/*Display PDB file data once it is fetched*/}
              {!loading && processedProteinData && (
                <div className="pdb-data flex flex-col justify-center items-center gap-4">
                  <CloudDoneIcon className="text-green-300" style={{ fontSize: "100" }} />
                  <pre>{processedProteinData}</pre>
                </div>
              )}
            </div>
          </>
        )}
        {!loading && processedProteinData ? (
          <ProgressBar
            pointer={2}
            backLink={(proteinState ? "/docking/protein" : null) as string}
            backLinkParams={
              {} as {
                [key: string]: string;
              }
            }
            nextLink={proteinState ? "/docking/ligand" : (null as any)}
            nextLinkParams={
              proteinState ? { proteinState: proteinState } : (null as any)
            }
          />
        ) : (
          <ProgressBar
            pointer={2}
            backLink={(proteinState ? "/docking/protein" : null) as string}
            backLinkParams={
              {} as {
                [key: string]: string;
              }
            }
          />
        )}
      </div>
    );
  };

  return (
    <main>
      <div className="fill-width-available hidden md:block">
        <Minimap of={pageContent()} />
      </div>
      {pageContent()}
    </main>
  );
};

export default Marinate;
