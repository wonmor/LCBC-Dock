from pydantic import BaseModel, EmailStr
from typing import Optional, List
from enum import Enum


class JobStatus(str, Enum):
    QUEUED = "queued"
    PREPARING = "preparing"
    DOCKING = "docking"
    COMPLETED = "completed"
    FAILED = "failed"


class DockingRequest(BaseModel):
    protein_pdb_id: str
    ligand_cid: int
    ligand_name: str
    center_x: float = 0.0
    center_y: float = 0.0
    center_z: float = 0.0
    size_x: float = 20.0
    size_y: float = 20.0
    size_z: float = 20.0
    exhaustiveness: int = 8
    num_modes: int = 9
    energy_range: float = 3.0
    email: Optional[str] = None


class DockingJob(BaseModel):
    job_id: str
    status: JobStatus
    protein_pdb_id: str
    ligand_cid: int
    ligand_name: str
    email: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None
    error_message: Optional[str] = None
    best_affinity: Optional[float] = None
    num_poses: Optional[int] = None


class DockingResult(BaseModel):
    job_id: str
    protein_pdb_id: str
    ligand_cid: int
    ligand_name: str
    best_affinity: float
    poses: List[dict]
    output_pdbqt: str
    docked_pdb: str


class LigandSearchResult(BaseModel):
    cid: int
    name: str
    molecular_formula: str
    molecular_weight: float
    iupac_name: Optional[str] = None
    canonical_smiles: Optional[str] = None


class ProteinSearchResult(BaseModel):
    pdb_id: str
    title: Optional[str] = None
    organism: Optional[str] = None
    method: Optional[str] = None
    resolution: Optional[float] = None
