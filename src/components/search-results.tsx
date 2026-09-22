"use client";

import { Search } from "lucide-react";
import { useMemo } from "react";
import { DocumentSection } from "@/components/content/document-section";
import { DocumentDetail } from "@/components/document-detail";
import { QuestionToc } from "@/components/question-toc";
import { matchesQuery, useSearchSections } from "@/lib/search";
import { useActiveSection } from "@/lib/use-active-section";

/**
 * Search results across every topic, for the docs index. Matching sections are
 * rendered from Markdown in the browser, so this component and the Markdown
 * renderer load only once someone searches.
 */
export function SearchResults({ query }: { query: string }) {
  const normalizedQuery = query.trim().toLowerCase();
  const { failed, sections } = useSearchSections(undefined, normalizedQuery);

  const results = useMemo(
    () => sections?.filter((section) => matchesQuery(section, normalizedQuery)) ?? [],
    [normalizedQuery, sections],
  );
  const { selectedId, selectSection } = useActiveSection(results);

  if (!sections) {
    return (
      <section className="doc-layout">
        <article className="detail-panel empty-state">
          <Search size={34} />
          <h2>{failed ? "Search is unavailable" : "Loading search"}</h2>
        </article>
      </section>
    );
  }

  return (
    <section className="doc-layout">
      <DocumentDetail
        description="Sections matching the current search query."
        query={query}
        sections={results.map((section) => (
          <DocumentSection key={section.id} section={section} />
        ))}
        title="Search results"
      />
      <QuestionToc
        onSelectQuestion={selectSection}
        questions={results}
        selectedQuestionId={selectedId}
      />
    </section>
  );
}
