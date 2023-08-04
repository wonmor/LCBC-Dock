"use client";

import axios from "axios";
import ProgressBar from "@/app/progressBar";

import { useEffect, useState } from "react";
import { diffLines } from "diff"; // Import diffLines function
import { useSearchParams } from "next/navigation";
import { RotatingTriangles } from "react-loader-spinner";

// Function to convert PDB data to FormData
function pdbDataToFormData(pdbData) {
  const blob = new Blob([pdbData], { type: "text/plain" });
  const formData = new FormData();
  formData.append("pdb_file", blob);
  return formData;
}

const Marinate = () => {
  const searchParams = useSearchParams();

  const proteinState = searchParams.get("proteinState") ?? null;

  const [proteinData, setProteinData] = useState(null);
  const [processedProteinData, setProcessedProteinData] = useState(null);
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await axios.get(
          `https://files.rcsb.org/download/${proteinState}.pdb`
        );
        setProteinData(response.data);

        const serverUrl =
          process.env.NODE_ENV === "development"
            ? "http://localhost:8000/remove_water_hetatoms/"
            : "https://api.lcbcdock.com/remove_water_hetatoms/";

        const formData = pdbDataToFormData(response.data);
        const processedResponse = await axios.post(serverUrl, formData);
        const processedData = processedResponse.data.content;
        setProcessedProteinData(processedData);

        const computedDiff = diffLines(response.data, processedData);
        setDiff(computedDiff);
      } catch (error) {
        console.error(`Error fetching PDB file: ${error}`);
      } finally {
        setLoading(false);
      }
    };

    if (proteinState) {
      fetchData();
    }
  }, [proteinState]);

  return (
    <main className="pb-40">
      {proteinState && (
        <>
          <div className="text-center">
            <h1 className="text-6xl font-thin mb-6">
              <span className="font-semibold">MARINATE</span>
              <br />
              {proteinState}
            </h1>
          </div>

          <div
            id="wrapper"
            className="text-center flex items-center justify-center"
          >
            {loading && <RotatingTriangles />}

            {/*Display PDB file data once it is fetched*/}
            {!loading && proteinData && diff && (
              <div className="pdb-data">
                <pre>
                  {diff.map(({ value, removed }, i) =>
                    removed ? (
                      <span key={i} style={{ color: "red" }}>
                        {value}
                      </span>
                    ) : (
                      value
                    )
                  )}
                </pre>
              </div>
            )}
          </div>
        </>
      )}
      <ProgressBar
        pointer={2}
        backLink={(proteinState ? "/docking/protein" : null) as string}
        backLinkParams={
          {} as {
            [key: string]: string;
          }
        }
      />
    </main>
  );
};

export default Marinate;
