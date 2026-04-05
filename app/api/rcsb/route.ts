import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const resp = await fetch("https://search.rcsb.org/rcsbsearch/v2/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: {
          type: "terminal",
          service: "full_text",
          parameters: { value: q },
        },
        return_type: "entry",
        request_options: { results_content_type: ["experimental"] },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      return NextResponse.json([]);
    }

    const data = await resp.json();
    const ids = (data?.result_set ?? [])
      .map((r: any) => r.identifier)
      .slice(0, 12);

    return NextResponse.json(ids);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
