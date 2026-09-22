import { FileText } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The article frame shared by topic pages and search results: the heading,
 * the rendered sections, and optional pagination. With no sections it shows
 * the empty search state instead.
 */
export function DocumentDetail({
  description,
  pagination,
  query,
  sections,
  title,
}: {
  description: string;
  pagination?: ReactNode;
  query: string;
  sections: ReactNode[];
  title: string;
}) {
  if (!sections.length) {
    return (
      <article className="detail-panel empty-state">
        <FileText size={34} />
        <h2>No matching sections</h2>
      </article>
    );
  }

  return (
    <article className="detail-panel">
      <header className="docs-article-header">
        <div className="detail-heading">
          <div className="detail-copy">
            <h1>{title}</h1>
            <p className="article-description">{description}</p>
            {query.trim() ? <p className="article-search-context">Search: {query.trim()}</p> : null}
          </div>
        </div>
      </header>

      <div className="answer-body document-body">{sections}</div>

      {pagination}
    </article>
  );
}
