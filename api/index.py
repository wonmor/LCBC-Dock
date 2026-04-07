import uuid
import logging
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
import httpx

from api.models import (
    DockingRequest, DockingJob, LigandSearchResult, ProteinSearchResult, JobStatus
)
from api.database import (
    init_db, create_job, get_job, get_job_full, get_queue_position
)
from api.worker import start_worker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="DockIt API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*", "https://lcbc-client.apps.johnseong.com", "https://lcbc-server.apps.johnseong.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    init_db()
    start_worker()
    logger.info("DockIt API started")


# ---------------------------------------------------------------------------
# Protein Search (RCSB PDB)
# ---------------------------------------------------------------------------

@app.get("/search/{search_term}")
async def search_proteins(search_term: str):
    """Search RCSB PDB for proteins (legacy endpoint)."""
    results = await _search_rcsb(search_term)
    return results


@app.get("/api/proteins/search")
async def search_proteins_v2(q: str = Query(..., min_length=1)):
    """Search RCSB PDB with detailed results."""
    pdb_ids = await _search_rcsb(q)
    results = []
    for pdb_id in pdb_ids[:20]:
        detail = await _get_protein_detail(pdb_id)
        if detail:
            results.append(detail)
        else:
            results.append({"pdb_id": pdb_id, "title": pdb_id})
    return results


@app.get("/api/proteins/{pdb_id}")
async def get_protein_detail(pdb_id: str):
    """Get detailed info for a protein from RCSB."""
    detail = await _get_protein_detail(pdb_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Protein not found")
    return detail


@app.get("/api/proteins/{pdb_id}/center")
async def get_protein_center(pdb_id: str):
    """Compute geometric center of a protein for grid box placement."""
    from api.docking import compute_grid_center
    import tempfile

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"https://files.rcsb.org/download/{pdb_id}.pdb")
            resp.raise_for_status()

        with tempfile.NamedTemporaryFile(mode="w", suffix=".pdb", delete=False) as f:
            f.write(resp.text)
            pdb_path = f.name

        cx, cy, cz = compute_grid_center(pdb_path)
        import os
        os.unlink(pdb_path)

        return {"center_x": cx, "center_y": cy, "center_z": cz}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _search_rcsb(search_term: str) -> List[str]:
    url = "https://search.rcsb.org/rcsbsearch/v2/query"
    json_data = {
        "query": {
            "type": "terminal",
            "service": "full_text",
            "parameters": {"value": search_term},
        },
        "return_type": "entry",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(url, json=json_data)
            response.raise_for_status()
            data = response.json()

        if "result_set" in data:
            return [result["identifier"] for result in data["result_set"]]
        return []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _get_protein_detail(pdb_id: str) -> Optional[dict]:
    url = f"https://data.rcsb.org/rest/v1/core/entry/{pdb_id}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return None
            data = resp.json()

        struct = data.get("struct", {})
        exptl = data.get("exptl", [{}])[0] if data.get("exptl") else {}
        refine = data.get("refine", [{}])[0] if data.get("refine") else {}
        source = data.get("rcsb_entity_source_organism", [{}])
        organism = source[0].get("ncbi_scientific_name", "") if source else ""

        return {
            "pdb_id": pdb_id,
            "title": struct.get("title", ""),
            "organism": organism,
            "method": exptl.get("method", ""),
            "resolution": refine.get("ls_d_res_high"),
        }
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Ligand / Molecule Search (PubChem)
# ---------------------------------------------------------------------------

@app.get("/api/ligands/search")
async def search_ligands(q: str = Query(..., min_length=1)):
    """Search PubChem for small molecules/ligands."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Search by name
            url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{q}/property/MolecularFormula,MolecularWeight,IsomericSMILES,CID/JSON"
            resp = await client.get(url)

            if resp.status_code == 200:
                data = resp.json()
                props = data.get("PropertyTable", {}).get("Properties", [])
                results = []
                for p in props[:20]:
                    results.append({
                        "cid": p.get("CID"),
                        "name": q,
                        "molecular_formula": p.get("MolecularFormula", ""),
                        "molecular_weight": p.get("MolecularWeight", 0),
                        "iupac_name": "",
                        "canonical_smiles": p.get("IsomericSMILES", p.get("SMILES", "")),
                    })
                return results

            # Fallback: autocomplete search
            ac_url = f"https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/{q}/json?limit=10"
            ac_resp = await client.get(ac_url)

            if ac_resp.status_code == 200:
                ac_data = ac_resp.json()
                suggestions = ac_data.get("dictionary_terms", {}).get("compound", [])
                results = []
                for name in suggestions[:10]:
                    detail = await _get_ligand_by_name(client, name)
                    if detail:
                        results.append(detail)
                return results

            return []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ligands/{cid}")
async def get_ligand_detail(cid: int):
    """Get detailed information for a ligand by PubChem CID."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{cid}/property/MolecularFormula,MolecularWeight,IsomericSMILES/JSON"
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()

        props = data.get("PropertyTable", {}).get("Properties", [{}])[0]

        # Also get synonyms for the common name
        async with httpx.AsyncClient(timeout=10) as client:
            syn_url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{cid}/synonyms/JSON"
            syn_resp = await client.get(syn_url)
            synonyms = []
            if syn_resp.status_code == 200:
                syn_data = syn_resp.json()
                info = syn_data.get("InformationList", {}).get("Information", [{}])
                if info:
                    synonyms = info[0].get("Synonym", [])[:10]

        return {
            "cid": cid,
            "name": synonyms[0] if synonyms else f"CID {cid}",
            "molecular_formula": props.get("MolecularFormula", ""),
            "molecular_weight": props.get("MolecularWeight", 0),
            "iupac_name": "",
            "canonical_smiles": props.get("IsomericSMILES", props.get("SMILES", "")),
            "synonyms": synonyms,
            "image_url": f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{cid}/PNG",
            "sdf_url": f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{cid}/SDF?record_type=3d",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ligands/{cid}/sdf")
async def get_ligand_sdf(cid: int):
    """Get 3D SDF structure for a ligand."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{cid}/SDF?record_type=3d"
            resp = await client.get(url)
            resp.raise_for_status()
        return PlainTextResponse(resp.text, media_type="chemical/x-mdl-sdfile")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ligands/{cid}/mol2")
async def get_ligand_mol2(cid: int):
    """Get MOL2 format for a ligand (for Mol* viewer)."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # PubChem provides SDF, we'll return it as-is; frontend can handle SDF
            url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{cid}/SDF?record_type=3d"
            resp = await client.get(url)
            resp.raise_for_status()
        return PlainTextResponse(resp.text, media_type="chemical/x-mdl-sdfile")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _get_ligand_by_name(client: httpx.AsyncClient, name: str) -> Optional[dict]:
    try:
        url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{name}/property/MolecularFormula,MolecularWeight,IsomericSMILES,CID/JSON"
        resp = await client.get(url, timeout=10)
        if resp.status_code != 200:
            return None
        data = resp.json()
        props = data.get("PropertyTable", {}).get("Properties", [{}])[0]
        return {
            "cid": props.get("CID"),
            "name": name,
            "molecular_formula": props.get("MolecularFormula", ""),
            "molecular_weight": props.get("MolecularWeight", 0),
            "iupac_name": "",
            "canonical_smiles": props.get("IsomericSMILES", props.get("SMILES", "")),
        }
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Docking Jobs
# ---------------------------------------------------------------------------

@app.post("/api/dock", response_model=DockingJob)
async def submit_docking_job(request: DockingRequest):
    """Submit a new docking job to the queue."""
    job_id = str(uuid.uuid4())

    job = create_job(
        job_id=job_id,
        protein_pdb_id=request.protein_pdb_id,
        ligand_cid=request.ligand_cid,
        ligand_name=request.ligand_name,
        email=request.email,
        center_x=request.center_x,
        center_y=request.center_y,
        center_z=request.center_z,
        size_x=request.size_x,
        size_y=request.size_y,
        size_z=request.size_z,
        exhaustiveness=request.exhaustiveness,
        num_modes=request.num_modes,
        energy_range=request.energy_range,
    )

    queue_pos = get_queue_position(job_id)
    logger.info(f"Job {job_id} submitted, queue position: {queue_pos}")

    return job


@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Get the status of a docking job."""
    job_data = get_job_full(job_id)
    if not job_data:
        raise HTTPException(status_code=404, detail="Job not found")

    queue_pos = get_queue_position(job_id) if job_data["status"] in (JobStatus.QUEUED,) else 0

    return {
        "job_id": job_data["job_id"],
        "status": job_data["status"],
        "protein_pdb_id": job_data["protein_pdb_id"],
        "ligand_cid": job_data["ligand_cid"],
        "ligand_name": job_data["ligand_name"],
        "created_at": job_data["created_at"],
        "completed_at": job_data.get("completed_at"),
        "error_message": job_data.get("error_message"),
        "best_affinity": job_data.get("best_affinity"),
        "num_poses": job_data.get("num_poses"),
        "status_message": job_data.get("status_message", ""),
        "queue_position": queue_pos,
    }


@app.get("/api/results/{job_id}")
async def get_docking_results(job_id: str):
    """Get full docking results including poses."""
    job_data = get_job_full(job_id)
    if not job_data:
        raise HTTPException(status_code=404, detail="Job not found")

    if job_data["status"] != JobStatus.COMPLETED:
        raise HTTPException(status_code=400, detail=f"Job status is {job_data['status']}, not completed")

    from api.docking import parse_vina_output
    import tempfile, os

    # Parse poses from stored PDBQT
    poses = []
    if job_data.get("output_pdbqt"):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".pdbqt", delete=False) as f:
            f.write(job_data["output_pdbqt"])
            tmp_path = f.name
        poses = parse_vina_output(tmp_path)
        os.unlink(tmp_path)

    return {
        "job_id": job_id,
        "protein_pdb_id": job_data["protein_pdb_id"],
        "ligand_cid": job_data["ligand_cid"],
        "ligand_name": job_data["ligand_name"],
        "best_affinity": job_data["best_affinity"],
        "num_poses": job_data["num_poses"],
        "poses": poses,
        "docked_pdb": job_data.get("docked_pdb", ""),
        "output_pdbqt": job_data.get("output_pdbqt", ""),
    }


@app.get("/api/results/{job_id}/download/pdbqt")
async def download_pdbqt(job_id: str):
    """Download docked output as PDBQT."""
    job_data = get_job_full(job_id)
    if not job_data or job_data["status"] != JobStatus.COMPLETED:
        raise HTTPException(status_code=404, detail="Results not available")
    return PlainTextResponse(
        job_data["output_pdbqt"],
        media_type="chemical/x-pdbqt",
        headers={"Content-Disposition": f"attachment; filename=docked_{job_id[:8]}.pdbqt"}
    )


@app.get("/api/results/{job_id}/download/pdb")
async def download_pdb(job_id: str):
    """Download docked output as PDB."""
    job_data = get_job_full(job_id)
    if not job_data or job_data["status"] != JobStatus.COMPLETED:
        raise HTTPException(status_code=404, detail="Results not available")
    return PlainTextResponse(
        job_data.get("docked_pdb", ""),
        media_type="chemical/x-pdb",
        headers={"Content-Disposition": f"attachment; filename=docked_{job_id[:8]}.pdb"}
    )


@app.get("/api/stats")
async def get_stats():
    """Get live queue stats for the homepage."""
    from api.database import get_db
    conn = get_db()

    queued = conn.execute(
        "SELECT COUNT(*) as c FROM docking_jobs WHERE status IN ('queued', 'preparing')"
    ).fetchone()["c"]

    active = conn.execute(
        "SELECT COUNT(*) as c FROM docking_jobs WHERE status = 'docking'"
    ).fetchone()["c"]

    completed = conn.execute(
        "SELECT COUNT(*) as c FROM docking_jobs WHERE status = 'completed'"
    ).fetchone()["c"]

    total = conn.execute(
        "SELECT COUNT(*) as c FROM docking_jobs"
    ).fetchone()["c"]

    # Estimate wait time: ~3 min per queued job on average
    est_wait_min = (queued + active) * 3

    conn.close()

    return {
        "queue_length": queued,
        "active_jobs": active,
        "completed_jobs": completed,
        "total_jobs": total,
        "est_wait_minutes": est_wait_min,
    }


@app.get("/")
async def root():
    return {"message": "DockIt API v2.0 is running!", "docs": "/docs"}
