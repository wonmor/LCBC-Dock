import axios from "axios";

// Mobile apps don't have CORS restrictions, so we call APIs directly
const BACKEND_BASE = "https://lcbc-server.apps.johnseong.com";

const RCSB_SEARCH = "https://search.rcsb.org/rcsbsearch/v2/query";
const PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest";
const PUBCHEM_PROPS = "MolecularFormula,MolecularWeight,IsomericSMILES";

const HEADERS = {
  "User-Agent": "DockMole/2.0-mobile",
  Accept: "application/json",
};

export interface Molecule {
  cid: number;
  name: string;
  formula: string;
  weight: number;
  smiles: string;
}

// --- RCSB PDB Search ---

export async function searchProteins(q: string): Promise<string[]> {
  if (q.length < 2) return [];

  try {
    const resp = await axios.post(
      RCSB_SEARCH,
      {
        query: {
          type: "terminal",
          service: "full_text",
          parameters: { value: q },
        },
        return_type: "entry",
        request_options: { results_content_type: ["experimental"] },
      },
      { timeout: 10000 }
    );

    return (resp.data?.result_set ?? [])
      .map((r: any) => r.identifier)
      .slice(0, 12);
  } catch {
    return [];
  }
}

// --- PubChem Search (3-tier strategy) ---

export async function searchMolecules(q: string): Promise<Molecule[]> {
  if (q.length < 2) return [];

  // 1) Exact name lookup
  const direct = await searchByName(q);
  if (direct.length > 0) return direct;

  // 2) Autocomplete
  const ac = await searchByAutocomplete(q);
  if (ac.length > 0) return ac;

  // 3) CID if numeric
  if (/^\d+$/.test(q.trim())) {
    return searchByCID(parseInt(q.trim()));
  }

  return [];
}

async function searchByName(q: string): Promise<Molecule[]> {
  try {
    const resp = await axios.get(
      `${PUBCHEM_BASE}/pug/compound/name/${encodeURIComponent(q)}/property/${PUBCHEM_PROPS}/JSON`,
      { headers: HEADERS, timeout: 10000 }
    );
    const props = resp.data?.PropertyTable?.Properties ?? [];
    return props.slice(0, 8).map((p: any) => ({
      cid: p.CID,
      name: q,
      formula: p.MolecularFormula || "",
      weight: parseFloat(p.MolecularWeight) || 0,
      smiles: p.IsomericSMILES || "",
    }));
  } catch {
    return [];
  }
}

async function searchByAutocomplete(q: string): Promise<Molecule[]> {
  try {
    const resp = await axios.get(
      `${PUBCHEM_BASE}/autocomplete/compound/${encodeURIComponent(q)}/json?limit=8`,
      { headers: HEADERS, timeout: 10000 }
    );
    const names: string[] = resp.data?.dictionary_terms?.compound ?? [];
    if (names.length === 0) return [];

    const results = await Promise.all(
      names.slice(0, 6).map(async (name) => {
        try {
          const r = await axios.get(
            `${PUBCHEM_BASE}/pug/compound/name/${encodeURIComponent(name)}/property/${PUBCHEM_PROPS}/JSON`,
            { headers: HEADERS, timeout: 8000 }
          );
          const p = r.data?.PropertyTable?.Properties?.[0];
          if (!p) return null;
          return {
            cid: p.CID,
            name,
            formula: p.MolecularFormula || "",
            weight: parseFloat(p.MolecularWeight) || 0,
            smiles: p.IsomericSMILES || "",
          };
        } catch {
          return null;
        }
      })
    );

    return results.filter((r): r is Molecule => r !== null);
  } catch {
    return [];
  }
}

async function searchByCID(cid: number): Promise<Molecule[]> {
  try {
    const resp = await axios.get(
      `${PUBCHEM_BASE}/pug/compound/cid/${cid}/property/${PUBCHEM_PROPS}/JSON`,
      { headers: HEADERS, timeout: 8000 }
    );
    const p = resp.data?.PropertyTable?.Properties?.[0];
    if (!p) return [];
    return [
      {
        cid: p.CID,
        name: `CID ${cid}`,
        formula: p.MolecularFormula || "",
        weight: parseFloat(p.MolecularWeight) || 0,
        smiles: p.IsomericSMILES || "",
      },
    ];
  } catch {
    return [];
  }
}

// --- Backend API ---

export async function submitDockingJob(params: {
  protein_pdb_id: string;
  ligand_cid: number;
  ligand_name: string;
  exhaustiveness: number;
  email?: string;
}) {
  const resp = await axios.post(`${BACKEND_BASE}/api/dock`, {
    ...params,
    center_x: 0,
    center_y: 0,
    center_z: 0,
    size_x: 20,
    size_y: 20,
    size_z: 20,
    num_modes: 9,
    energy_range: 3.0,
    email: params.email || null,
  });
  return resp.data;
}

export async function getJobStatus(jobId: string) {
  const resp = await axios.get(`${BACKEND_BASE}/api/jobs/${jobId}`);
  return resp.data;
}

export async function getResults(jobId: string) {
  const resp = await axios.get(`${BACKEND_BASE}/api/results/${jobId}`);
  return resp.data;
}

export function getDownloadUrl(jobId: string, format: "pdb" | "pdbqt") {
  return `${BACKEND_BASE}/api/results/${jobId}/download/${format}`;
}

export function getProtein3DViewUrl(pdbId: string) {
  return `https://www.rcsb.org/3d-view/${pdbId}`;
}

export function getMoleculeImageUrl(cid: number) {
  return `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG?image_size=300x300`;
}

export interface Stats {
  queue_length: number;
  active_jobs: number;
  completed_jobs: number;
  total_jobs: number;
  est_wait_minutes: number;
}

export async function getStats(): Promise<Stats> {
  const resp = await axios.get(`${BACKEND_BASE}/api/stats`, { timeout: 5000 });
  return resp.data;
}
