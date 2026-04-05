import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.length < 2) {
    return NextResponse.json([]);
  }

  // Try multiple sources in order
  let results = await searchPubChemDirect(q);
  if (results.length > 0) return NextResponse.json(results);

  results = await searchChEMBL(q);
  if (results.length > 0) return NextResponse.json(results);

  results = await searchPubChemAutocomplete(q);
  if (results.length > 0) return NextResponse.json(results);

  return NextResponse.json([]);
}

// Strategy 1: PubChem direct name → properties (works for exact/close names)
async function searchPubChemDirect(q: string) {
  try {
    const resp = await fetch(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(q)}/property/MolecularFormula,MolecularWeight,CanonicalSMILES,CID/JSON`,
      { signal: AbortSignal.timeout(8000), cache: "no-store" }
    );
    if (!resp.ok) return [];

    const data = await resp.json();
    const props = data?.PropertyTable?.Properties ?? [];
    return props.slice(0, 8).map((p: any) => ({
      cid: p.CID,
      name: q,
      formula: p.MolecularFormula || "",
      weight: p.MolecularWeight || 0,
      smiles: p.CanonicalSMILES || "",
      source: "PubChem",
    }));
  } catch {
    return [];
  }
}

// Strategy 2: ChEMBL molecule search (EBI — reliable, free, no auth)
async function searchChEMBL(q: string) {
  try {
    const resp = await fetch(
      `https://www.ebi.ac.uk/chembl/api/data/molecule/search.json?q=${encodeURIComponent(q)}&limit=8`,
      {
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
        headers: { Accept: "application/json" },
      }
    );
    if (!resp.ok) return [];

    const data = await resp.json();
    const molecules = data?.molecules ?? [];

    return molecules
      .filter((m: any) => m.molecule_properties)
      .slice(0, 8)
      .map((m: any) => ({
        cid: m.molecule_chembl_id,
        name: m.pref_name || m.molecule_chembl_id,
        formula: m.molecule_properties?.full_molformula || "",
        weight: parseFloat(m.molecule_properties?.full_mwt || "0"),
        smiles: m.molecule_structures?.canonical_smiles || "",
        source: "ChEMBL",
      }));
  } catch {
    return [];
  }
}

// Strategy 3: PubChem autocomplete → then lookup each
async function searchPubChemAutocomplete(q: string) {
  try {
    const acResp = await fetch(
      `https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/${encodeURIComponent(q)}/json?limit=6`,
      { signal: AbortSignal.timeout(8000), cache: "no-store" }
    );
    if (!acResp.ok) return [];

    const acData = await acResp.json();
    const names: string[] = acData?.dictionary_terms?.compound ?? [];
    if (names.length === 0) return [];

    const results = await Promise.all(
      names.slice(0, 4).map(async (name) => {
        try {
          const resp = await fetch(
            `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/MolecularFormula,MolecularWeight,CanonicalSMILES,CID/JSON`,
            { signal: AbortSignal.timeout(6000), cache: "no-store" }
          );
          if (!resp.ok) return null;
          const data = await resp.json();
          const p = data?.PropertyTable?.Properties?.[0];
          if (!p) return null;
          return {
            cid: p.CID,
            name,
            formula: p.MolecularFormula || "",
            weight: p.MolecularWeight || 0,
            smiles: p.CanonicalSMILES || "",
            source: "PubChem",
          };
        } catch {
          return null;
        }
      })
    );

    return results.filter(Boolean);
  } catch {
    return [];
  }
}
