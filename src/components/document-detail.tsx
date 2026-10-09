import type { ReactNode } from "react";
import { PracticeModeToggle } from "@/components/practice-mode";

/** A topic's article: the heading, the rendered sections, and pagination. */
export function DocumentDetail({
  description,
  pagination,
  sections,
  title,
}: {
  description: string;
  pagination: ReactNode;
  sections: ReactNode;
  title: string;
}) {
  return (
    <article className="detail-panel">
      <header className="docs-article-header">
        <div className="detail-heading">
          <div className="detail-copy">
            <h1>{title}</h1>
            <p className="article-description">{description}</p>
          </div>
        </div>
        <div className="article-actions">
          <PracticeModeToggle />
          <span className="practice-hint">Answers stay hidden until you reveal them.</span>
        </div>
      </header>

      <div className="answer-body document-body">{sections}</div>

      {pagination}
    </article>
  );
}
