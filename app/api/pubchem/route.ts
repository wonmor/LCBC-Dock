import { NextRequest, NextResponse } from "next/server";

const HEADERS = {
  "User-Agent": "LCBCDock/2.0 (https://lcbc-client.apps.johnseong.com; mailto:wonmos@uci.edu)",
  Accept: "application/json",
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const debug = req.nextUrl.searchParams.get("debug") === "1";

  if (q.length < 2) {
    return NextResponse.json([]);
  }

  const logs: string[] = [];

  // 1) Try exact name lookup — works for "aspirin", "caffeine", "nutlin-3a", PDB IDs
  const direct = await searchByName(q, logs);
  if (direct.length > 0) {
    return NextResponse.json(debug ? { results: direct, logs } : direct);
  }

  // 2) Try autocomplete for partial names — "asp" → aspirin, aspartame...
  const ac = await searchByAutocomplete(q, logs);
  if (ac.length > 0) {
    return NextResponse.json(debug ? { results: ac, logs } : ac);
  }

  // 3) Try CID lookup — if user entered a number
  if (/^\d+$/.test(q.trim())) {
    const cid = await searchByCID(parseInt(q.trim()), logs);
    if (cid.length > 0) {
      return NextResponse.json(debug ? { results: cid, logs } : cid);
    }
  }

  return NextResponse.json(debug ? { results: [], logs } : []);
}

async function searchByName(q: string, logs: string[]) {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(q)}/property/MolecularFormula,MolecularWeight,CanonicalSMILES,IUPACName,CID/JSON`;
  logs.push(`[name] GET ${url}`);

  try {
    const resp = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });

    logs.push(`[name] status=${resp.status}`);
    if (!resp.ok) return [];

    const text = await resp.text();
    logs.push(`[name] body length=${text.length}`);

    const data = JSON.parse(text);
    const props = data?.PropertyTable?.Properties ?? [];

    return props.slice(0, 8).map((p: any) => ({
      cid: p.CID,
      name: p.IUPACName || q,
      formula: p.MolecularFormula || "",
      weight: p.MolecularWeight || 0,
      smiles: p.CanonicalSMILES || "",
    }));
  } catch (e: any) {
    logs.push(`[name] error: ${e.message || e}`);
    return [];
  }
}

async function searchByAutocomplete(q: string, logs: string[]) {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/${encodeURIComponent(q)}/json?limit=8`;
  logs.push(`[autocomplete] GET ${url}`);

  try {
    const resp = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });

    logs.push(`[autocomplete] status=${resp.status}`);
    if (!resp.ok) return [];

    const text = await resp.text();
    logs.push(`[autocomplete] body length=${text.length}`);

    const data = JSON.parse(text);
    const names: string[] = data?.dictionary_terms?.compound ?? [];
    logs.push(`[autocomplete] found ${names.length} suggestions: ${names.slice(0, 3).join(", ")}`);

    if (names.length === 0) return [];

    // Fetch properties for each name in parallel
    const results = await Promise.all(
      names.slice(0, 6).map(async (name) => {
        try {
          const propUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/MolecularFormula,MolecularWeight,CanonicalSMILES,CID/JSON`;
          const r = await fetch(propUrl, {
            headers: HEADERS,
            signal: AbortSignal.timeout(8000),
            cache: "no-store",
          });
          if (!r.ok) {
            logs.push(`[autocomplete→prop] ${name} status=${r.status}`);
            return null;
          }
          const d = await r.json();
          const p = d?.PropertyTable?.Properties?.[0];
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

    return results.filter(Boolean);
  } catch (e: any) {
    logs.push(`[autocomplete] error: ${e.message || e}`);
    return [];
  }
}

async function searchByCID(cid: number, logs: string[]) {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/MolecularFormula,MolecularWeight,CanonicalSMILES,IUPACName,CID/JSON`;
  logs.push(`[cid] GET ${url}`);

  try {
    const resp = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });

    logs.push(`[cid] status=${resp.status}`);
    if (!resp.ok) return [];

    const data = await resp.json();
    const p = data?.PropertyTable?.Properties?.[0];
    if (!p) return [];

    return [{
      cid: p.CID,
      name: p.IUPACName || `CID ${cid}`,
      formula: p.MolecularFormula || "",
      weight: p.MolecularWeight || 0,
      smiles: p.CanonicalSMILES || "",
    }];
  } catch (e: any) {
    logs.push(`[cid] error: ${e.message || e}`);
    return [];
  }
}
