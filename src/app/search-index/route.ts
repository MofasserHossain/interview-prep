import { getAllSections } from "@/lib/content";

export const dynamic = "force-static";

/**
 * Every section, for search on the docs index. Prerendered at build time and
 * fetched by the browser only when someone searches.
 */
export function GET() {
  return Response.json(getAllSections());
}
