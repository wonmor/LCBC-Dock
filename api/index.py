from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import httpx
from typing import List
from Bio.PDB import PDBParser, PDBIO
from io import StringIO
from tempfile import NamedTemporaryFile

from openbabel import openbabel as ob

app = FastAPI()

# CORS middleware to allow requests from the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*", "https://www.lcbcdock.com", "https://lcbcdock.com"],  # Update with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

from Bio.PDB import Select

class NotWaterOrHetatm(Select):
    def accept_residue(self, residue):
        return residue.get_resname() != "HOH" and not residue.id[0].startswith("H")

@app.post("/remove_water_hetatoms/")
async def remove_water_hetatoms(pdb_file: UploadFile = File(...)):
    pdb_content = (await pdb_file.read()).decode()

    # Count the number of HETATM lines that don't correspond to water molecules
    hetatom_count = sum(1 for line in pdb_content.splitlines() if line.startswith("HETATM") and "HOH" not in line)
    
    # Read the structure from the uploaded file
    parser = PDBParser()
    structure = parser.get_structure("my_protein", StringIO(pdb_content))

    # Count removed water residues
    water_molecule_count = sum(1 for model in structure for chain in model for residue in chain if residue.get_resname() == "HOH")

    # Initialize PDBIO object
    io = PDBIO()
    io.set_structure(structure)

    # Create a temporary file to save the modified structure
    with NamedTemporaryFile(delete=False, suffix=".pdb") as tmp_file:
        # Save the structure to a new PDB file, excluding water and hetatoms
        io.save(tmp_file.name, select=NotWaterOrHetatm())

        # Protonation and adding partial charges using Open Babel
        obmol = ob.OBMol()
        obConversion = ob.OBConversion()
        obConversion.SetInFormat("pdb")
        obConversion.ReadFile(obmol, tmp_file.name)
        
        # Protonate at pH 7.4
        ff = ob.OBForceField.FindForceField('mmff94')
        ff.SetLog(False)
        ff.SetLogLevel(ob.OBFF_LOGLVL_NONE)
        ff.SetParameter("pH", 7.4)
        ff.Setup(obmol)
        ff.GetAtomTypes(obmol)

        # Assign charges
        ff.MMFF94AddPartialCharges(obmol)
        
        # Save the updated molecule back to the temporary file
        obConversion.WriteFile(obmol, tmp_file.name)

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