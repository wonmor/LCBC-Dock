"use client";

import { FC } from "react";
import { useSearchParams } from "next/navigation";
import { MolStarWrapper } from "@/app/wrapper";

import axios from "axios";
import AsyncSelect from "react-select/async";
import ProgressBar from "@/app/progressBar";

const Marinate: FC = () => {
  const searchParams = useSearchParams();

  const proteinState = searchParams.get("proteinState") ?? null;

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
            <MolStarWrapper value={proteinState} />
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
