"use client";

import { FC, useState } from "react";
import { useRouter } from 'next/navigation'

import axios from "axios";
import AsyncSelect from "react-select/async";
import Link from "next/link";

const Docking: FC = () => {
  const [selectedOption, setSelectedOption] = useState<any>(null);
  
  const router = useRouter()

  const loadOptions = (inputValue: string, callback: (options: any) => void) => {
    if (!inputValue || inputValue.trim() === "") {
      callback([]);
      return;
    }

    setTimeout(async () => {
      try {
        const response = await axios.get(`http://localhost:8000/search/${inputValue}`);
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
    setSelectedOption(selectedOption);

    router.push('/docking/viewer');
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-24 bg-gradient-to-br from-gray-900 to-black text-white">
      {/* SVG representation of protein-ligand docking */}
      <Link href="/">
        <svg
          width="300"
          height="200"
          viewBox="0 0 300 200"
          xmlns="http://www.w3.org/2000/svg"
          className="mb-8 cursor-pointer"
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

      {/* Title */}
      <div className="text-center">
        <h1 className="text-6xl font-thin mb-6">SEARCH PROTEIN</h1>
      </div>

      <AsyncSelect
        cacheOptions
        loadOptions={loadOptions}
        onChange={handleChange}
        defaultOptions
        styles={{
          option: (provided) => ({
            ...provided,
            color: 'black'
          }),
          singleValue: (provided) => ({
            ...provided,
            color: 'black'
          })
        }}
      />
    </main>
  );
}

export default Docking;
