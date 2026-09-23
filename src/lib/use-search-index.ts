import { useEffect, useState } from "react";
import { loadSearchIndex } from "@/lib/search";
import type { SearchIndex } from "@/lib/types";

/**
 * Loads the title index the first time `open` turns true, and keeps it for the
 * rest of the visit. `loadSearchIndex` memoizes the request itself, so a
 * component that remounts — the search dialog remounts on every topic
 * navigation — reuses the response rather than fetching it again.
 *
 * `failed` reports a request that rejected, so the caller can offer the reader
 * something other than a spinner. The next open retries.
 */
export function useSearchIndex(open: boolean) {
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || index) return;

    let current = true;

    loadSearchIndex().then(
      (loaded) => {
        if (!current) return;
        setIndex(loaded);
        setFailed(false);
      },
      () => {
        if (current) setFailed(true);
      },
    );

    return () => {
      current = false;
    };
  }, [index, open]);

  return { failed, index };
}
