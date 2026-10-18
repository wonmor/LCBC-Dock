from pydantic import BaseModel, EmailStr
from typing import Optional, List
from enum import Enum


class JobStatus(str, Enum):
    QUEUED = "queued"
    PREPARING = "preparing"
    DOCKING = "docking"
    COMPLETED = "completed"
    FAILED = "failed"


class SiteOptions(BaseModel):
    """How to place the search box. mode: auto | manual | ligand | residues | pocket"""
    mode: str = "auto"
    ligand: Optional[str] = None      # co-crystallised ligand "MK1" or "MK1:B:902"
    residues: Optional[str] = None    # "A:25, B:25" or "ASP25"
    pocket_rank: int = 1


class PrepOptions(BaseModel):
    chains: Optional[List[str]] = None       # None → all chains
    keep_hetero: Optional[List[str]] = None  # e.g. ["ZN", "HEM"]
    ph: float = 7.4


class DockingRequest(BaseModel):
    # Protein: 4-char PDB ID or a UniProt accession (→ AlphaFold model)
    protein_pdb_id: str
    # Ligand: PubChem CID, or SMILES, or a single SDF/MOL record
    ligand_cid: int = 0
    ligand_name: str = "ligand"
    ligand_smiles: Optional[str] = None
    ligand_sdf: Optional[str] = None
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
    site: Optional[SiteOptions] = None
    prep: Optional[PrepOptions] = None
    reference_ligand: Optional[str] = None  # "MK1[:chain[:resseq]]" → redocking RMSD
    seed: Optional[int] = None
    private: bool = False
    # strict=True (web client) → 402 instead of silently clamping to the plan
    strict: bool = False


class BatchRequest(BaseModel):
    protein_pdb_id: str
    library: str                      # SMILES list ("SMILES name" per line) or multi-record SDF
    name: Optional[str] = None
    site: Optional[SiteOptions] = None
    prep: Optional[PrepOptions] = None
    center_x: float = 0.0
    center_y: float = 0.0
    center_z: float = 0.0
    size_x: float = 20.0
    size_y: float = 20.0
    size_z: float = 20.0
    exhaustiveness: int = 8
    num_modes: int = 9
    energy_range: float = 3.0
    seed: Optional[int] = None
    private: bool = False
    strict: bool = True


class DockingJob(BaseModel):
    job_id: str
    deduplicated: bool = False
    adjustments: List[str] = []
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
