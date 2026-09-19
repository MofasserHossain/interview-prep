import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * Served at /robots.txt.
 *
 * Everything here is public documentation, so crawling is fully allowed. The
 * Next.js build output under /_next/ is deliberately not disallowed — crawlers
 * need the CSS and JS to render the page for indexing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
