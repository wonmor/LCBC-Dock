import os
import tempfile
import subprocess
import logging
import re
from typing import Optional, Tuple, List

import httpx

logger = logging.getLogger(__name__)

VINA_EXECUTABLE = os.environ.get("VINA_PATH", "vina")


async def download_protein_pdb(pdb_id: str, work_dir: str) -> str:
    """Download protein PDB file from RCSB."""
    url = f"https://files.rcsb.org/download/{pdb_id}.pdb"
    pdb_path = os.path.join(work_dir, f"{pdb_id}.pdb")

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(url)
        response.raise_for_status()

    with open(pdb_path, "w") as f:
        f.write(response.text)

    return pdb_path


async def download_ligand_sdf(cid: int, work_dir: str) -> str:
    """Download ligand 3D SDF from PubChem."""
    url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{cid}/SDF?record_type=3d"
    sdf_path = os.path.join(work_dir, f"ligand_{cid}.sdf")

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(url)
        response.raise_for_status()

    with open(sdf_path, "w") as f:
        f.write(response.text)

    return sdf_path


def clean_protein_pdb(pdb_path: str, work_dir: str) -> str:
    """Remove water molecules and non-standard residues from PDB."""
    clean_path = os.path.join(work_dir, "protein_clean.pdb")

    with open(pdb_path, "r") as f:
        lines = f.readlines()

    with open(clean_path, "w") as f:
        for line in lines:
            if line.startswith("HETATM"):
                continue
            if line.startswith("ATOM") and line[17:20].strip() == "HOH":
                continue
            f.write(line)

    return clean_path


def prepare_protein_pdbqt(pdb_path: str, work_dir: str) -> str:
    """Convert protein PDB to PDBQT format using prepare_receptor or obabel."""
    pdbqt_path = os.path.join(work_dir, "protein.pdbqt")

    # Try using Open Babel (more commonly available)
    try:
        result = subprocess.run(
            ["obabel", pdb_path, "-O", pdbqt_path, "-xr"],
            capture_output=True, text=True, timeout=120
        )
        if os.path.exists(pdbqt_path) and os.path.getsize(pdbqt_path) > 0:
            return pdbqt_path
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Fallback: try ADFRsuite's prepare_receptor
    try:
        result = subprocess.run(
            ["prepare_receptor", "-r", pdb_path, "-o", pdbqt_path, "-A", "hydrogens"],
            capture_output=True, text=True, timeout=120
        )
        if os.path.exists(pdbqt_path) and os.path.getsize(pdbqt_path) > 0:
            return pdbqt_path
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Last resort: manual conversion (basic PDBQT from PDB)
    pdbqt_path = _manual_pdb_to_pdbqt(pdb_path, work_dir, "protein")
    return pdbqt_path


def prepare_ligand_pdbqt(sdf_path: str, work_dir: str) -> str:
    """Convert ligand SDF to PDBQT format."""
    pdbqt_path = os.path.join(work_dir, "ligand.pdbqt")

    # Try meeko first
    try:
        mol2_path = os.path.join(work_dir, "ligand.mol2")
        subprocess.run(
            ["obabel", sdf_path, "-O", mol2_path, "--gen3d"],
            capture_output=True, text=True, timeout=60
        )
        result = subprocess.run(
            ["mk_prepare_ligand.py", "-i", mol2_path, "-o", pdbqt_path],
            capture_output=True, text=True, timeout=60
        )
        if os.path.exists(pdbqt_path) and os.path.getsize(pdbqt_path) > 0:
            return pdbqt_path
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Fallback: Open Babel
    try:
        result = subprocess.run(
            ["obabel", sdf_path, "-O", pdbqt_path, "--gen3d"],
            capture_output=True, text=True, timeout=60
        )
        if os.path.exists(pdbqt_path) and os.path.getsize(pdbqt_path) > 0:
            return pdbqt_path
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    raise RuntimeError("Could not convert ligand to PDBQT. Ensure Open Babel or Meeko is installed.")


def _manual_pdb_to_pdbqt(pdb_path: str, work_dir: str, name: str) -> str:
    """Basic PDB to PDBQT conversion (adds Gasteiger charges placeholder)."""
    pdbqt_path = os.path.join(work_dir, f"{name}.pdbqt")
    with open(pdb_path, "r") as f:
        lines = f.readlines()

    with open(pdbqt_path, "w") as f:
        for line in lines:
            if line.startswith("ATOM") or line.startswith("HETATM"):
                # Pad to 77 chars and add charge + atom type
                padded = line.rstrip().ljust(77)
                atom_name = line[12:16].strip()
                atom_type = atom_name[0] if atom_name else "C"
                f.write(f"{padded}  0.000 {atom_type:>2}\n")
            elif line.startswith("END"):
                f.write(line)

    return pdbqt_path


def run_vina(receptor_pdbqt: str, ligand_pdbqt: str, work_dir: str,
             center_x: float, center_y: float, center_z: float,
             size_x: float, size_y: float, size_z: float,
             exhaustiveness: int = 8, num_modes: int = 9,
             energy_range: float = 3.0) -> Tuple[str, List[dict]]:
    """Run AutoDock Vina and return output PDBQT path and parsed poses."""
    output_path = os.path.join(work_dir, "docked_output.pdbqt")
    log_path = os.path.join(work_dir, "vina_log.txt")

    cmd = [
        VINA_EXECUTABLE,
        "--receptor", receptor_pdbqt,
        "--ligand", ligand_pdbqt,
        "--center_x", str(center_x),
        "--center_y", str(center_y),
        "--center_z", str(center_z),
        "--size_x", str(size_x),
        "--size_y", str(size_y),
        "--size_z", str(size_z),
        "--exhaustiveness", str(exhaustiveness),
        "--num_modes", str(num_modes),
        "--energy_range", str(energy_range),
        "--out", output_path,
        "--log", log_path,
    ]

    logger.info(f"Running Vina: {' '.join(cmd)}")

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)

    if result.returncode != 0:
        error_msg = result.stderr or result.stdout or "Vina exited with non-zero status"
        raise RuntimeError(f"Vina failed: {error_msg}")

    if not os.path.exists(output_path):
        raise RuntimeError("Vina did not produce output file")

    poses = parse_vina_output(output_path)
    return output_path, poses


def parse_vina_output(pdbqt_path: str) -> List[dict]:
    """Parse Vina output PDBQT to extract poses and affinities."""
    poses = []
    current_pose = []
    current_model = 0
    affinity = None

    with open(pdbqt_path, "r") as f:
        for line in f:
            if line.startswith("MODEL"):
                current_model = int(line.split()[1])
                current_pose = []
            elif line.startswith("REMARK VINA RESULT"):
                parts = line.split()
                affinity = float(parts[3])
            elif line.startswith("ENDMDL"):
                poses.append({
                    "model": current_model,
                    "affinity": affinity,
                    "pdbqt": "".join(current_pose),
                })
            elif line.startswith("ATOM") or line.startswith("HETATM"):
                current_pose.append(line)

    return poses


def pdbqt_to_pdb(pdbqt_path: str, work_dir: str) -> str:
    """Convert PDBQT output to PDB for visualization."""
    pdb_path = os.path.join(work_dir, "docked_output.pdb")

    # Try obabel
    try:
        subprocess.run(
            ["obabel", pdbqt_path, "-O", pdb_path],
            capture_output=True, text=True, timeout=60
        )
        if os.path.exists(pdb_path) and os.path.getsize(pdb_path) > 0:
            return pdb_path
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Manual conversion: strip PDBQT-specific columns
    with open(pdbqt_path, "r") as f:
        lines = f.readlines()

    with open(pdb_path, "w") as f:
        for line in lines:
            if line.startswith("ATOM") or line.startswith("HETATM"):
                f.write(line[:66].rstrip() + "\n")
            elif line.startswith("MODEL") or line.startswith("ENDMDL") or line.startswith("END"):
                f.write(line)

    return pdb_path


def compute_grid_center(pdb_path: str) -> Tuple[float, float, float]:
    """Compute the geometric center of a PDB file for grid box placement."""
    xs, ys, zs = [], [], []

    with open(pdb_path, "r") as f:
        for line in f:
            if line.startswith("ATOM"):
                try:
                    x = float(line[30:38])
                    y = float(line[38:46])
                    z = float(line[46:54])
                    xs.append(x)
                    ys.append(y)
                    zs.append(z)
                except ValueError:
                    continue

    if not xs:
        return 0.0, 0.0, 0.0

    return (
        round(sum(xs) / len(xs), 3),
        round(sum(ys) / len(ys), 3),
        round(sum(zs) / len(zs), 3),
    )
