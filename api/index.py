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
        return residue.get_resname() != "HOH"

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
    # Read the structure from the uploaded file
    parser = PDBParser()
    structure = parser.get_structure("my_protein", StringIO((await pdb_file.read()).decode()))

    # Count removed residues
    water_molecule_count = 0
    hetatom_count = 0

    for model in structure:
        for chain in model:
            for residue in chain:
                if residue.get_resname() == "HOH":
                    water_molecule_count += 1
                elif residue.id[0].startswith("H"):
                    hetatom_count += 1

    # Initialize PDBIO object
    io = PDBIO()
    io.set_structure(structure)

    # Create a temporary file to save the modified structure
    with NamedTemporaryFile(delete=False, suffix=".pdb") as tmp_file:
        # Save the structure to a new PDB file, excluding water and hetatoms
        io.save(tmp_file.name, select=NotWaterOrHetatm())

        # Read the contents of the temporary file and return as response
        return {
            "filename": pdb_file.filename,
            "content": open(tmp_file.name).read(),
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