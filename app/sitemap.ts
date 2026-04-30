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
  const lastModified = new Date();
  return [
    { url: `${BASE}/`,                lastModified, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${BASE}/docking/protein`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/docking/ligand`,  lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/dashboard`,       lastModified, changeFrequency: "weekly",  priority: 0.6 },
    { url: `${BASE}/examples`,        lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/tutorials`,       lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/glossary`,        lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/about`,           lastModified, changeFrequency: "yearly",  priority: 0.4 },
    { url: `${BASE}/contact`,         lastModified, changeFrequency: "yearly",  priority: 0.3 },
  ];
}
