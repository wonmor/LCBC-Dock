"use client"

import { FC, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { MolStarWrapper } from "@/app/wrapper";
import axios from "axios";
import ProgressBar from "@/app/progressBar";
import { RotatingLines } from 'react-loader-spinner'; //Importing the loader/spinner library

const Marinate: FC = () => {
  const searchParams = useSearchParams();

  const proteinState = searchParams.get("proteinState") ?? null;

  const [proteinData, setProteinData] = useState(null); //State to store the fetched PDB file data
  const [loading, setLoading] = useState(false); //State to control the spinner

  const scrolltoHash = function (element_id: string) {
    const element = document.getElementById(element_id);
    element?.scrollIntoView({
      behavior: "smooth",
      block: "end",
      inline: "nearest",
    });
  };

  const loadOptions = (
    inputValue: string,
    callback: (options: any) => void
  ) => {
    if (!inputValue || inputValue.trim() === "") {
      callback([]);
      return;
    }

    setTimeout(async () => {
      try {
        const response = await axios.get(
          `${
            process.env.NODE_ENV === "development"
              ? "http://localhost:8000"
              : "https://api.lcbcdock.com"
          }/search/${inputValue}`
        );
        const options = response.data.map((result: string) => ({
          value: result,
          label: result,
        }));
        callback(options);
      } catch (error) {
        console.error(`Error searching PDB: ${error}`);
      }
    }, 500);
  };

  // useEffect to fetch the PDB file data once the component is loaded
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true); //Set loading to true to show the spinner
      try {
        const response = await axios.get(
          `https://files.rcsb.org/download/${proteinState}.pdb`
        );
        setProteinData(response.data);
      } catch (error) {
        console.error(`Error fetching PDB file: ${error}`);
      } finally {
        setLoading(false); //Hide the spinner after data is fetched
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
              MARINATE
              <br />
              <span className="font-semibold">{proteinState}</span>
            </h1>
          </div>

          <div id="wrapper">
            {/*Show spinner while loading the data*/}
            {loading && <RotatingLines />}
            
            {/*Display PDB file data once it is fetched*/}
            {!loading && proteinData && 
              <div className="pdb-data">
                <pre>{proteinData}</pre>
              </div>
            }
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
