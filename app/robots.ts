import { MetadataRoute } from "next";

/**
 * `/robots.txt` policy. Allows everything except per-user job pages
 * (which are indexed by opaque IDs that crawlers shouldn't fan out
 * over). The sitemap entry tells Google where to find the route list.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/results/", "/compare", "/api/"],
      },
    ],
    sitemap: "https://lcbc-client.apps.johnseong.com/sitemap.xml",
    host: "https://lcbc-client.apps.johnseong.com",
  };
}
