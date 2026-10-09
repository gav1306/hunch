import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/** The public pages. The app itself is per-user and stays out. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: new URL("/", base).toString(), changeFrequency: "monthly", priority: 1 },
    { url: new URL("/signup", base).toString(), changeFrequency: "yearly", priority: 0.5 },
    { url: new URL("/signin", base).toString(), changeFrequency: "yearly", priority: 0.3 },
  ];
}
