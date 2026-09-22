"use client";

import { usePathname } from "next/navigation";
import { createContext, use, useMemo, useState } from "react";
import type { ReactNode } from "react";

type DocsSearch = {
  query: string;
  setQuery: (query: string) => void;
};

const DocsSearchContext = createContext<DocsSearch>({ query: "", setQuery: () => {} });

/**
 * The search query, shared by the search field and the sidebar links that
 * clear it. A query belongs to the page it was typed on, so navigating to
 * another page starts with an empty search.
 */
export function DocsSearchProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [search, setSearch] = useState({ pathname, query: "" });

  if (search.pathname !== pathname) {
    setSearch({ pathname, query: "" });
  }

  const value = useMemo(
    () => ({
      query: search.pathname === pathname ? search.query : "",
      setQuery: (query: string) => setSearch({ pathname, query }),
    }),
    [pathname, search],
  );

  return <DocsSearchContext value={value}>{children}</DocsSearchContext>;
}

export function useDocsSearch() {
  return use(DocsSearchContext);
}
