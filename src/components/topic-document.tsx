"use client";

import { Fragment, useMemo } from "react";
import type { ReactNode } from "react";
import { DocumentDetail } from "@/components/document-detail";
import { QuestionToc } from "@/components/question-toc";
import { matchesQuery, useSearchSections } from "@/lib/search";
import type { TocEntry } from "@/lib/types";
import { useActiveSection } from "@/lib/use-active-section";

export type TopicArticle = {
  description: string;
  pagination: ReactNode;
  sections: { content: ReactNode; entry: TocEntry }[];
  title: string;
  topicSlug: string;
};

/**
 * A topic page's document. Its sections arrive rendered on the server, so no
 * Markdown code runs here. Searching fetches the topic's search index and
 * keeps the sections that match; until it arrives, every section stays shown.
 */
export function TopicDocument({ article, query }: { article: TopicArticle; query: string }) {
  const normalizedQuery = query.trim().toLowerCase();
  const { sections: searchSections } = useSearchSections(article.topicSlug, normalizedQuery);

  const visibleSections = useMemo(() => {
    if (!normalizedQuery || !searchSections) return article.sections;

    const matchingIds = new Set(
      searchSections
        .filter((section) => matchesQuery(section, normalizedQuery))
        .map((section) => section.id),
    );

    return article.sections.filter(({ entry }) => matchingIds.has(entry.id));
  }, [article.sections, normalizedQuery, searchSections]);

  const entries = useMemo(() => visibleSections.map(({ entry }) => entry), [visibleSections]);
  const { selectedId, selectSection } = useActiveSection(entries);

  return (
    <section className="doc-layout">
      <DocumentDetail
        description={article.description}
        pagination={article.pagination}
        query={query}
        sections={visibleSections.map(({ content, entry }) => (
          <Fragment key={entry.id}>{content}</Fragment>
        ))}
        title={article.title}
      />
      <QuestionToc
        onSelectQuestion={selectSection}
        questions={entries}
        selectedQuestionId={selectedId}
      />
    </section>
  );
}
