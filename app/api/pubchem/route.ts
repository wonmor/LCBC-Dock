import { NextRequest, NextResponse } from "next/server";

const HEADERS = {
  "User-Agent": "LCBCDock/2.0 (https://lcbc-client.apps.johnseong.com)",
  Accept: "application/json",
};

const PROPS = "MolecularFormula,MolecularWeight,IsomericSMILES";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const debug = req.nextUrl.searchParams.get("debug") === "1";
  const logs: string[] = [];

  if (q.length < 2) {
    return NextResponse.json(debug ? { results: [], logs: ["query too short"] } : []);
  }

  // 1) Try exact name lookup
  const direct = await searchByName(q, logs);
  if (direct.length > 0) {
    return NextResponse.json(debug ? { results: direct, logs } : direct);
  }

  // 2) Try autocomplete → then fetch each match
  const ac = await searchByAutocomplete(q, logs);
  if (ac.length > 0) {
    return NextResponse.json(debug ? { results: ac, logs } : ac);
  }

  // 3) Try CID if user entered a number
  if (/^\d+$/.test(q.trim())) {
    const cid = await searchByCID(parseInt(q.trim()), logs);
    if (cid.length > 0) {
      return NextResponse.json(debug ? { results: cid, logs } : cid);
    }
  }

  return NextResponse.json(debug ? { results: [], logs } : []);
}

async function searchByName(q: string, logs: string[]) {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(q)}/property/${PROPS}/JSON`;
  logs.push(`[name] GET ${url}`);

  try {
    const resp = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });

    logs.push(`[name] status=${resp.status}`);
    if (!resp.ok) return [];

    const data = await resp.json();
    const props = data?.PropertyTable?.Properties ?? [];
    logs.push(`[name] found ${props.length} results`);

    return props.slice(0, 8).map((p: any) => ({
      cid: p.CID,
      name: q,
      formula: p.MolecularFormula || "",
      weight: parseFloat(p.MolecularWeight) || 0,
      smiles: p.IsomericSMILES || p.SMILES || p.ConnectivitySMILES || "",
    }));
  } catch (e: any) {
    logs.push(`[name] error: ${e.message}`);
    return [];
  }
}

async function searchByAutocomplete(q: string, logs: string[]) {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/${encodeURIComponent(q)}/json?limit=8`;
  logs.push(`[ac] GET ${url}`);

  try {
    const resp = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });

    logs.push(`[ac] status=${resp.status}`);
    if (!resp.ok) return [];

    const data = await resp.json();
    const names: string[] = data?.dictionary_terms?.compound ?? [];
    logs.push(`[ac] suggestions: ${names.join(", ")}`);

    if (names.length === 0) return [];

    // Fetch properties for each suggestion in parallel
    const results = await Promise.all(
      names.slice(0, 6).map(async (name) => {
        const propUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/${PROPS}/JSON`;
        try {
          const r = await fetch(propUrl, {
            headers: HEADERS,
            signal: AbortSignal.timeout(8000),
            cache: "no-store",
          });
          if (!r.ok) {
            logs.push(`[ac→prop] ${name} status=${r.status}`);
            return null;
          }
          const d = await r.json();
          const p = d?.PropertyTable?.Properties?.[0];
          if (!p) return null;
          return {
            cid: p.CID,
            name,
            formula: p.MolecularFormula || "",
            weight: parseFloat(p.MolecularWeight) || 0,
            smiles: p.IsomericSMILES || p.SMILES || p.ConnectivitySMILES || "",
          };
        } catch {
          return null;
        }
      })
    );

    const filtered = results.filter(Boolean);
    logs.push(`[ac] resolved ${filtered.length}/${names.length} suggestions`);
    return filtered;
  } catch (e: any) {
    logs.push(`[ac] error: ${e.message}`);
    return [];
  }
}

async function searchByCID(cid: number, logs: string[]) {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/${PROPS}/JSON`;
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
      name: `CID ${cid}`,
      formula: p.MolecularFormula || "",
      weight: parseFloat(p.MolecularWeight) || 0,
      smiles: p.IsomericSMILES || p.SMILES || p.ConnectivitySMILES || "",
    }];
  } catch (e: any) {
    logs.push(`[cid] error: ${e.message}`);
    return [];
  }
}
