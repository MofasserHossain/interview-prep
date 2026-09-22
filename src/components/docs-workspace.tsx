"use client";

import { Search, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { ReactNode } from "react";
import { useDocsSearch } from "@/components/docs-search";
import { TopicDocument } from "@/components/topic-document";
import type { TopicArticle } from "@/components/topic-document";
import { WorkspaceErrorBoundary } from "@/components/workspace-error-boundary";
import { loadSearchSections } from "@/lib/search";

// Search on the docs index renders Markdown in the browser; its code loads on
// the first search instead of with every page.
const SearchResults = dynamic(() =>
  import("@/components/search-results").then((module) => module.SearchResults),
);

type DocsWorkspaceProps = {
  /** A topic page's document, rendered on the server. */
  article?: TopicArticle;
  footer: ReactNode;
  headerPath: string[];
  /** The docs index, shown on the home page while the search is empty. */
  overview?: ReactNode;
};

/**
 * The scrolling column beside the sidebar: the breadcrumb and search field,
 * then the topic document, the docs index, or search results. The server
 * renders the content it is given; this component only switches between them
 * and handles search.
 */
export function DocsWorkspace({ article, footer, headerPath, overview }: DocsWorkspaceProps) {
  const { query, setQuery } = useDocsSearch();

  return (
    <section className="workspace">
      <header className="workspace-header">
        <div className="topbar">
          <nav className="workspace-path" aria-label="Current docs path">
            {headerPath.map((segment, index) => (
              <span className="workspace-path-segment" key={`${index}-${segment}`}>
                {index === 0 ? (
                  <Link href="/" onClick={() => setQuery("")}>
                    {segment}
                  </Link>
                ) : (
                  segment
                )}
              </span>
            ))}
          </nav>

          <div className="search-field">
            <Search size={18} />
            <input
              aria-label="Search interview documents"
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => void loadSearchSections(article?.topicSlug)}
              placeholder="Search docs"
              value={query}
            />
            {query ? (
              <button
                className="clear-search"
                onClick={() => setQuery("")}
                title="Clear search"
                type="button"
              >
                <X size={16} />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <WorkspaceErrorBoundary resetKey={query}>
        {article ? (
          <TopicDocument article={article} query={query} />
        ) : query.trim() ? (
          <SearchResults query={query} />
        ) : (
          overview
        )}
      </WorkspaceErrorBoundary>

      {footer}
    </section>
  );
}
