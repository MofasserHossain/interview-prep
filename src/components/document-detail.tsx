import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import Link from "next/link";
import { DocumentSection } from "@/components/content/document-section";
import type { TopicSummary } from "@/lib/tracks";
import type { Question } from "@/lib/types";

export function DocumentDetail({
  activeTopic,
  nextTopic,
  onNavigate,
  previousTopic,
  query,
  questions,
}: {
  activeTopic?: TopicSummary;
  nextTopic?: TopicSummary;
  onNavigate: () => void;
  previousTopic?: TopicSummary;
  query: string;
  questions: Question[];
}) {
  if (!questions.length) {
    return (
      <article className="detail-panel empty-state">
        <FileText size={34} />
        <h2>No matching sections</h2>
      </article>
    );
  }

  const firstQuestion = questions[0];
  const title = activeTopic
    ? activeTopic.subtopicTitle
    : query.trim()
      ? "Search results"
      : firstQuestion.subtopicTitle;
  const description = activeTopic?.description ?? "Sections matching the current search query.";

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

      <div className="answer-body document-body">
        {questions.map((section) => (
          <DocumentSection key={section.id} section={section} />
        ))}
      </div>

      {activeTopic ? (
        <nav className="doc-pagination" aria-label="Previous and next documents">
          {previousTopic ? (
            <Link href={`/topics/${previousTopic.slug}`} onClick={onNavigate}>
              <ArrowLeft size={17} />
              <div>
                <span>Previous</span>
                <strong>{previousTopic.subtopicTitle}</strong>
              </div>
            </Link>
          ) : (
            <span />
          )}

          {nextTopic ? (
            <Link className="next" href={`/topics/${nextTopic.slug}`} onClick={onNavigate}>
              <div>
                <span>Next</span>
                <strong>{nextTopic.subtopicTitle}</strong>
              </div>
              <ArrowRight size={17} />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </article>
  );
}
