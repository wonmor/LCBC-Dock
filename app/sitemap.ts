import { MetadataRoute } from "next";

/**
 * Sitemap for crawlers. Next.js serves this at `/sitemap.xml`
 * automatically when this file lives in `app/`.
 *
 * `/results/[jobId]` and `/results/[jobId]/report` are excluded —
 * they're per-user and either ephemeral or protected by an opaque
 * job ID, so search engines indexing them adds noise without value.
 * `/compare` is also dynamic on query string only.
 */
const BASE = "https://lcbc-client.apps.johnseong.com";

export default function sitemap(): MetadataRoute.Sitemap {
  // Older Next.js MetadataRoute.Sitemap types only support url +
  // lastModified. Newer versions add changeFrequency / priority but
  // we keep this minimal so the build doesn't fail across versions —
  // Google reads url + last-modified anyway.
  const lastModified = new Date();
  return [
    { url: `${BASE}/`,                lastModified },
    { url: `${BASE}/docking/protein`, lastModified },
    { url: `${BASE}/docking/ligand`,  lastModified },
    { url: `${BASE}/dashboard`,       lastModified },
    { url: `${BASE}/examples`,        lastModified },
    { url: `${BASE}/tutorials`,       lastModified },
    { url: `${BASE}/glossary`,        lastModified },
    { url: `${BASE}/about`,           lastModified },
    { url: `${BASE}/contact`,         lastModified },
  ];
}
