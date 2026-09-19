"use client";

import { BookOpen, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DocumentDetail } from "@/components/document-detail";
import { QuestionToc } from "@/components/question-toc";
import { SiteFooter } from "@/components/site-footer";
import { TopicOverview } from "@/components/topic-overview";
import { TopicIcon, TrackIcon } from "@/components/topic-icon";
import { WorkspaceErrorBoundary } from "@/components/workspace-error-boundary";
import { buildTrackSummaries } from "@/lib/tracks";
import type { InterviewData } from "@/lib/types";

type InterviewAppProps = {
  activeTopicSlug?: string;
  initialData: InterviewData;
};

export function InterviewApp({ activeTopicSlug = "", initialData }: InterviewAppProps) {
  const [query, setQuery] = useState("");
  const tracks = useMemo(() => buildTrackSummaries(initialData.topics), [initialData.topics]);
  const orderedTopics = useMemo(() => tracks.flatMap((track) => track.topics), [tracks]);
  const activeTopicSummary = initialData.topics.find((topic) => topic.slug === activeTopicSlug);
  const activeTrack = activeTopicSummary?.trackSlug ?? "";
  const activeTopicIndex = orderedTopics.findIndex((topic) => topic.slug === activeTopicSlug);
  const previousTopic = activeTopicIndex > 0 ? orderedTopics[activeTopicIndex - 1] : undefined;
  const nextTopic =
    activeTopicIndex >= 0 && activeTopicIndex < orderedTopics.length - 1
      ? orderedTopics[activeTopicIndex + 1]
      : undefined;
  const [expandedTracks, setExpandedTracks] = useState<Set<string>>(() => new Set());
  const [selectedQuestionId, setSelectedQuestionId] = useState("");

  const filteredQuestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return initialData.questions.filter((question) => {
      const matchesTrack = !activeTrack || question.trackSlug === activeTrack;
      const matchesTopic = !activeTopicSlug || question.topicSlug === activeTopicSlug;
      const matchesQuery =
        !normalizedQuery ||
        [
          question.question,
          question.answer,
          question.topicTitle,
          question.trackTitle,
          question.subtopicTitle,
          question.category,
          question.tags.join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesTrack && matchesTopic && matchesQuery;
    });
  }, [activeTrack, activeTopicSlug, initialData.questions, query]);

  const headerPath = activeTopicSummary
    ? ["Docs", activeTopicSummary.trackTitle, activeTopicSummary.subtopicTitle]
    : ["Docs"];
  const showOverview = !activeTopicSlug && !query.trim();
  const visibleSelectedQuestionId = filteredQuestions.some(
    (question) => question.id === selectedQuestionId,
  )
    ? selectedQuestionId
    : (filteredQuestions[0]?.id ?? "");

  useEffect(() => {
    if (!filteredQuestions.length || showOverview) return;

    const workspace = document.querySelector<HTMLElement>(".workspace");
    let animationFrame = 0;

    function updateActiveSection() {
      animationFrame = 0;

      const sections = filteredQuestions
        .map((question) => document.getElementById(question.id))
        .filter((section): section is HTMLElement => Boolean(section));

      if (!sections.length) return;

      const workspaceTop = workspace?.getBoundingClientRect().top ?? 0;
      const readingAnchor = workspaceTop + 130;
      let activeSection = sections[0];

      for (const section of sections) {
        if (section.getBoundingClientRect().top <= readingAnchor) {
          activeSection = section;
        } else {
          break;
        }
      }

      setSelectedQuestionId((current) =>
        current === activeSection.id ? current : activeSection.id,
      );
    }

    function scheduleUpdate() {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(updateActiveSection);
    }

    scheduleUpdate();
    workspace?.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }

      workspace?.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [filteredQuestions, showOverview]);

  function toggleTrack(trackSlug: string) {
    setExpandedTracks((current) => {
      const next = new Set(current);

      if (next.has(trackSlug)) {
        next.delete(trackSlug);
      } else {
        next.add(trackSlug);
      }

      return next;
    });
  }

  function resetSearch() {
    setQuery("");
  }

  function selectQuestion(questionId: string) {
    setSelectedQuestionId(questionId);
    window.requestAnimationFrame(() => {
      document.getElementById(questionId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand-block brand-button" href="/" onClick={resetSearch}>
          <div className="brand-icon" aria-hidden="true">
            <BookOpen size={20} />
          </div>
          <div>
            <h1>Docs Library</h1>
          </div>
        </Link>

        <nav className="topic-menu" aria-label="Topic menu">
          {tracks.map((track) => {
            const isActiveTrack = activeTrack === track.slug;
            const isExpanded = isActiveTrack || expandedTracks.has(track.slug);

            return (
              <div
                className={["menu-group", isActiveTrack ? "active" : "", isExpanded ? "open" : ""]
                  .filter(Boolean)
                  .join(" ")}
                key={track.slug}
              >
                <button
                  aria-expanded={isExpanded}
                  className={isActiveTrack ? "menu-row active" : "menu-row"}
                  onClick={() => toggleTrack(track.slug)}
                  type="button"
                >
                  <TrackIcon slug={track.slug} />
                  <span className="track-copy">
                    <strong>{track.title}</strong>
                    <small>{track.topics.length} subtopics</small>
                  </span>
                  <span className="menu-count">{track.questionCount}</span>
                  <span className="menu-chevron" aria-hidden="true">
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                </button>

                <div className="submenu-list">
                  {track.topics.map((topic) => (
                    <Link
                      className={
                        activeTopicSlug === topic.slug ? "submenu-row active" : "submenu-row"
                      }
                      href={`/topics/${topic.slug}`}
                      key={topic.slug}
                      onClick={resetSearch}
                    >
                      <TopicIcon slug={topic.slug} />
                      <span>{topic.subtopicTitle}</span>
                      <small>{topic.questionCount}</small>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      <section className="workspace" key={activeTopicSlug || "overview"}>
        <header className="workspace-header">
          <div className="topbar">
            <nav className="workspace-path" aria-label="Current docs path">
              {headerPath.map((segment, index) => (
                <span className="workspace-path-segment" key={`${index}-${segment}`}>
                  {index === 0 ? (
                    <Link href="/" onClick={resetSearch}>
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

        <WorkspaceErrorBoundary resetKey={`${activeTopicSlug}:${query}:${showOverview}`}>
          {showOverview ? (
            <TopicOverview tracks={tracks} onNavigate={resetSearch} />
          ) : (
            <section className="doc-layout">
              <DocumentDetail
                activeTopic={activeTopicSummary}
                nextTopic={nextTopic}
                onNavigate={resetSearch}
                previousTopic={previousTopic}
                query={query}
                questions={filteredQuestions}
              />
              <QuestionToc
                onSelectQuestion={selectQuestion}
                questions={filteredQuestions}
                selectedQuestionId={visibleSelectedQuestionId}
              />
            </section>
          )}
        </WorkspaceErrorBoundary>

        <SiteFooter />
      </section>
    </main>
  );
}
