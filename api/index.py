from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import httpx
from typing import List
from Bio.PDB import PDBParser, PDBIO
from io import StringIO
from tempfile import NamedTemporaryFile

app = FastAPI()

# CORS middleware to allow requests from the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*", "https://www.lcbcdock.com", "https://lcbcdock.com"],  # Update with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from Bio.PDB import Select

class NotWaterOrHetatm(Select):
    def accept_residue(self, residue):
        return residue.get_resname() != "HOH" and not residue.id[0].startswith("H")

async def fetch_search_results(search_term: str) -> List[str]:
    url = "https://search.rcsb.org/rcsbsearch/v2/query"
    json_data = {
        "query": {
            "type": "terminal",
            "service": "full_text",
            "parameters": {
                "value": search_term,
            },
        },
        "return_type": "entry",
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=json_data)
            response.raise_for_status()
            data = response.json()

            print(response.json())

        if "result_set" in data:
            return [result["identifier"] for result in data["result_set"]]
        return []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/remove_water_hetatoms/")
async def remove_water_hetatoms(pdb_file: UploadFile = File(...)):
    # Read the content from the uploaded file
    pdb_content = (await pdb_file.read()).decode()

    # Split the content into lines
    lines = pdb_content.split("\n")

    # Filter out lines containing "HETATM"
    hetatom_lines = [line for line in lines if line.startswith("HETATM")]
    filtered_lines = [line for line in lines if not line.startswith("HETATM")]

    hetatom_count = len(hetatom_lines)

    # For counting water molecules, we can still use the BioPython method
    parser = PDBParser()
    structure = parser.get_structure("my_protein", StringIO(pdb_content))
    water_molecule_count = 0

    for model in structure:
        for chain in model:
            for residue in chain:
                if residue.get_resname() == "HOH":
                    water_molecule_count += 1

    # Join the filtered lines back into a single string
    filtered_content = "\n".join(filtered_lines)

    return {
        "filename": pdb_file.filename,
        "content": filtered_content,
        "water_molecule_count": water_molecule_count,
        "hetatom_count": hetatom_count
    }


@app.get("/search/{search_term}")
async def search_proteins(search_term: str):
    try:
        return await fetch_search_results(search_term)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {"message": "LCBC Dock Backend is running!"}