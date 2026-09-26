import { getSearchIndex } from "@/lib/content";

export const dynamic = "force-static";

/**
 * Topic and section titles for the search dialog. Prerendered at build time
 * and fetched by the browser the first time the search opens.
 */
export function GET() {
  return Response.json(getSearchIndex());
}
