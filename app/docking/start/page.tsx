"use client";

import { FC, useState } from "react";
import { MolStarWrapper } from "@/app/wrapper";

import axios from "axios";
import AsyncSelect from "react-select/async";

const Docking: FC = () => {
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
    <main>
      {!proteinState ? (
        <div className="text-center">
          <h1 className="text-6xl font-thin mb-6">
            SEARCH
            <br />
            <span className="font-semibold">PROTEIN</span>
          </h1>
        </div>
      ) : (
        <div className="text-center">
          <h1 className="text-6xl font-thin mb-6">
          <span className="font-semibold">PROTEIN</span>
            <br />
            {proteinState.toUpperCase()}
          </h1>
        </div>
      )}

      {!proteinState && (
        <div style={{ filter: "invert(1)", zIndex: 40 }}>
          <AsyncSelect
            cacheOptions
            placeholder="Enter a PDB ID"
            loadOptions={loadOptions}
            onChange={handleChange}
            defaultOptions
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
      )}

      {proteinState && (
        <div id="wrapper">
          <MolStarWrapper value={proteinState} />
        </div>
      )}
    </main>
  );
};

export default Docking;
