"use client";

import { FC, useState } from "react";
import { MolStarWrapper } from "@/app/wrapper";

import axios from "axios";
import ProgressBar from "@/app/progressBar";

const Ligand: FC = () => {
  const [proteinState, setProteinState] = useState(null) as any;

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

  const handleChange = (selectedOption: any) => {
    setProteinState(selectedOption.value);
    scrolltoHash("wrapper");
  };

  return (
    <main className="pb-40">
     <div className="text-center">
          <h1 className="text-6xl font-thin mb-6">
            SEARCH
            <br />
            <span className="font-semibold">LIGAND</span>
          </h1>
        </div>

      {!proteinState && (
        <div className="flex flex-col gap-4">
          <iframe src="https://electronvisual.org/?searchbar=true&fullscreen=true" width="480" height="480" className="mx-auto" allowFullScreen></iframe>

          <span className="text-md text-center">
            <span className="bg-blue-300 text-black font-semibold p-1 mr-2 rounded-md">EXAMPLE</span>Try entering nutlin-3A
          </span>
        </div>
      )}

      {proteinState && (
        <div id="wrapper">
          <MolStarWrapper value={proteinState} />
        </div>
      )}
      
      <ProgressBar
        pointer={3}
        backLink={(proteinState ? "/docking/marinate" : null) as string}
        backLinkParams={
          (proteinState ? { proteinState: proteinState } : null) as {
            [key: string]: string;
          }
        }
      />
    </main>
  );
};

export default Ligand;
