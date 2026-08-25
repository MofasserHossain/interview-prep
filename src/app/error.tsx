"use client";

import { AlertTriangle, BookOpen, ChevronRight, FileText, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { topics } from "@/lib/topics";

type ErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

type ErrorTrack = {
  slug: string;
  title: string;
  topics: typeof topics;
};

export default function Error({ error, retry }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const tracks = getErrorTracks();

  return (
    <main className="app-shell app-error-shell">
      <aside className="sidebar">
        <Link className="brand-block brand-button" href="/">
          <div className="brand-icon" aria-hidden="true">
            <BookOpen size={22} />
          </div>
          <div>
            <p className="eyebrow">Interview Prep</p>
            <h1>Docs Library</h1>
          </div>
        </Link>

        <nav className="topic-menu" aria-label="Topic menu">
          {tracks.map((track) => (
            <div className="menu-group open" key={track.slug}>
              <div className="menu-row">
                <span className="topic-icon">
                  <FileText size={18} />
                </span>
                <span className="track-copy">
                  <strong>{track.title}</strong>
                  <small>{track.topics.length} subtopics</small>
                </span>
              </div>

              <div className="submenu-list">
                {track.topics.map((topic) => (
                  <Link className="submenu-row" href={`/topics/${topic.slug}`} key={topic.slug}>
                    <span className="topic-icon">
                      <FileText size={17} />
                    </span>
                    <span>{topic.subtopicTitle}</span>
                    <ChevronRight size={14} />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div className="topbar">
            <nav className="workspace-path" aria-label="Current docs path">
              <span className="workspace-path-segment">
                <Link href="/">Docs</Link>
              </span>
              <span className="workspace-path-segment">Unable to load this view</span>
            </nav>
          </div>
        </header>

        <section className="doc-layout">
          <article className="detail-panel detail-error-state">
            <div className="system-state-icon" aria-hidden="true">
              <AlertTriangle size={24} />
            </div>
            <p className="eyebrow">Route Error</p>
            <h2>This page could not render</h2>
            <p>
              The docs navigation is still available. Retry this view, go back to the docs index, or
              choose another topic from the sidebar.
            </p>
            {error.message ? <code>{error.message}</code> : null}
            <div className="error-actions">
              <button className="state-primary-action" onClick={retry} type="button">
                <RefreshCcw size={16} />
                Try Again
              </button>
              <Link className="state-secondary-action" href="/">
                Docs Index
              </Link>
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}

function getErrorTracks() {
  const byTrack = new Map<string, ErrorTrack>();

  topics.forEach((topic) => {
    const current = byTrack.get(topic.trackSlug) ?? {
      slug: topic.trackSlug,
      title: topic.trackTitle,
      topics: [],
    };

    current.topics.push(topic);
    byTrack.set(topic.trackSlug, current);
  });

  return Array.from(byTrack.values());
}
