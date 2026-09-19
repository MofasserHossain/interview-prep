import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { TopicIcon, TrackIcon } from "@/components/topic-icon";
import type { TrackSummary } from "@/lib/tracks";

export function TopicOverview({
  onNavigate,
  tracks,
}: {
  onNavigate: () => void;
  tracks: TrackSummary[];
}) {
  const totalTopics = tracks.reduce((total, track) => total + track.topics.length, 0);
  const totalSections = tracks.reduce((total, track) => total + track.questionCount, 0);
  const totalReadingMinutes = tracks.reduce((total, track) => total + track.readingMinutes, 0);

  return (
    <section className="topic-overview" aria-label="Interview topic overview">
      <article className="docs-index-page">
        <header className="docs-article-header docs-index-header">
          <p className="eyebrow">Interview Prep Documentation</p>
          <h1>Interview Prep Docs</h1>
          <p className="article-description">
            A structured interview question library organized like developer documentation. Pick a
            topic from the index or sidebar, then read the sections as one continuous guide.
          </p>
          <div className="article-meta" aria-label="Documentation summary">
            <span>{tracks.length} tracks</span>
            <span>{totalTopics} documents</span>
            <span>{totalSections} sections</span>
            <span>{totalReadingMinutes} min read</span>
          </div>
        </header>

        <div className="docs-index-body">
          {tracks.map((track) => (
            <section className="docs-index-section" id={track.slug} key={track.slug}>
              <div className="docs-index-section-heading">
                <TrackIcon slug={track.slug} />
                <div>
                  <h2>{track.title}</h2>
                  <p>
                    {track.topics.length} documents / {track.questionCount} sections /{" "}
                    {track.readingMinutes} min read
                  </p>
                </div>
              </div>

              <div className="docs-link-list">
                {track.topics.map((topic) => (
                  <Link
                    className="docs-link-row"
                    href={`/topics/${topic.slug}`}
                    key={topic.slug}
                    onClick={onNavigate}
                  >
                    <TopicIcon slug={topic.slug} />
                    <span className="docs-link-copy">
                      <strong>{topic.subtopicTitle}</strong>
                      <small>{topic.description}</small>
                    </span>
                    <span className="docs-link-meta">
                      <span>{topic.questionCount} sections</span>
                      <span>{topic.readingMinutes} min</span>
                    </span>
                    <ChevronRight size={16} />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </section>
  );
}
