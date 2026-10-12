import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/**
 * The landing and the sign-in pages are public; everything behind sign-in is
 * one person's experiments and has nothing for a crawler.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/home", "/hunch/", "/security", "/2fa"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl()).toString(),
  };
}
