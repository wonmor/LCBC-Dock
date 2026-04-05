import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.length < 2) {
    return NextResponse.json([]);
  }

  try {
    // Step 1: Autocomplete to get compound name suggestions
    const acResp = await fetch(
      `https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/${encodeURIComponent(q)}/json?limit=8`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (!acResp.ok) {
      return NextResponse.json([], { status: 200 });
    }

    const acData = await acResp.json();
    const names: string[] = acData?.dictionary_terms?.compound ?? [];

    if (names.length === 0) {
      return NextResponse.json([]);
    }

    // Step 2: Fetch properties for each suggestion (parallel, up to 6)
    const results = await Promise.all(
      names.slice(0, 6).map(async (name) => {
        try {
          const resp = await fetch(
            `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/MolecularFormula,MolecularWeight,CanonicalSMILES,CID/JSON`,
            { signal: AbortSignal.timeout(6000) }
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
          };
        } catch {
          return null;
        }
      })
    );

    return NextResponse.json(results.filter(Boolean));
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
