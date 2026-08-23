"use client";

import {
  BookOpen,
  Braces,
  Blocks,
  ChevronDown,
  ChevronRight,
  CodeXml,
  Component,
  Container,
  FileText,
  Filter,
  Layers3,
  Library,
  Router,
  Search,
  Server,
  Smartphone,
  Terminal,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { InterviewData, Question } from "@/lib/types";

type DifficultyFilter = "all" | Question["difficulty"];
type TopicSummary = InterviewData["topics"][number];

type TrackSummary = {
  slug: string;
  title: string;
  questionCount: number;
  topics: TopicSummary[];
};

const difficultyOptions: DifficultyFilter[] = [
  "all",
  "beginner",
  "intermediate",
  "senior",
  "mixed",
];

const trackOrder = [
  "backend",
  "javascript",
  "react",
  "system-design",
  "devops",
  "dotnet",
  "python",
  "mobile",
  "frontend-architecture",
];

const trackIcons = {
  all: Library,
  backend: Server,
  javascript: Braces,
  react: Component,
  "system-design": Workflow,
  devops: Container,
  dotnet: Blocks,
  python: Terminal,
  mobile: Smartphone,
  "frontend-architecture": Layers3,
};

const topicIcons = {
  backend: Server,
  "nodejs-backend": Terminal,
  javascript: Braces,
  "javascript-promises-async": Workflow,
  "javascript-event-loop-runtime": Router,
  "javascript-this-functions": Braces,
  "javascript-prototypes-objects": Blocks,
  "javascript-collections-iteration": Library,
  "javascript-scope-hoisting-closures": Layers3,
  "javascript-types-equality-copying": CodeXml,
  "frontend-react-next": Component,
  "react-performance": Zap,
  "machine-coding": CodeXml,
  "system-design-microservices": Workflow,
  "devops-docker-kubernetes": Container,
  "nginx-web-infrastructure": Router,
  "dotnet-csharp": Blocks,
  "python-backend-frameworks": Terminal,
  "mobile-react-native": Smartphone,
  "frontend-architecture-micro-frontends": Layers3,
};

export function InterviewApp({ initialData }: { initialData: InterviewData }) {
  const [query, setQuery] = useState("");
  const [activeTrack, setActiveTrack] = useState("all");
  const [activeTopic, setActiveTopic] = useState("all");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [expandedTracks, setExpandedTracks] = useState<Set<string>>(() => new Set());
  const [selectedQuestionId, setSelectedQuestionId] = useState(initialData.questions[0]?.id ?? "");

  const tracks = useMemo(() => buildTrackSummaries(initialData.topics), [initialData.topics]);
  const activeTrackSummary = tracks.find((track) => track.slug === activeTrack);
  const activeTopicSummary = initialData.topics.find((topic) => topic.slug === activeTopic);

  const visibleTopics = useMemo(() => {
    if (activeTrack === "all") return initialData.topics;

    return initialData.topics.filter((topic) => topic.trackSlug === activeTrack);
  }, [activeTrack, initialData.topics]);

  const filteredQuestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return initialData.questions.filter((question) => {
      const matchesTrack = activeTrack === "all" || question.trackSlug === activeTrack;
      const matchesTopic = activeTopic === "all" || question.topicSlug === activeTopic;
      const matchesDifficulty = difficulty === "all" || question.difficulty === difficulty;
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

      return matchesTrack && matchesTopic && matchesDifficulty && matchesQuery;
    });
  }, [activeTrack, activeTopic, difficulty, initialData.questions, query]);

  const selectedQuestion =
    filteredQuestions.find((question) => question.id === selectedQuestionId) ??
    filteredQuestions[0];

  const selectedIndex = Math.max(
    0,
    filteredQuestions.findIndex((question) => question.id === selectedQuestion?.id),
  );

  const totalReadingMinutes = filteredQuestions.reduce(
    (total, question) => total + question.readingMinutes,
    0,
  );
  const visibleDocumentCount = activeTopic === "all" ? visibleTopics.length : 1;

  const hasActiveFilters =
    query.trim() || activeTrack !== "all" || activeTopic !== "all" || difficulty !== "all";

  const activeFilterLabels = [
    activeTrack !== "all" ? activeTrackSummary?.title : null,
    activeTopic !== "all"
      ? initialData.topics.find((topic) => topic.slug === activeTopic)?.subtopicTitle
      : null,
    difficulty !== "all" ? capitalize(difficulty) : null,
    query.trim() ? `"${query.trim()}"` : null,
  ].filter(Boolean);

  useEffect(() => {
    if (!filteredQuestions.length) return;
    if (filteredQuestions.some((question) => question.id === selectedQuestionId)) {
      return;
    }

    setSelectedQuestionId(filteredQuestions[0].id);
  }, [filteredQuestions, selectedQuestionId]);

  function selectTrack(trackSlug: string) {
    setActiveTrack(trackSlug);
    setActiveTopic("all");
    setExpandedTracks((current) => {
      if (trackSlug === "all") return new Set();

      const next = new Set(current);
      if (next.has(trackSlug)) {
        next.delete(trackSlug);
      } else {
        next.add(trackSlug);
      }

      return next;
    });
  }

  function selectTopic(topic: TopicSummary) {
    setActiveTrack(topic.trackSlug);
    setActiveTopic(topic.slug);
    setExpandedTracks((current) => new Set(current).add(topic.trackSlug));
  }

  function resetFilters() {
    setQuery("");
    setActiveTrack("all");
    setActiveTopic("all");
    setDifficulty("all");
    setExpandedTracks(new Set());
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-icon" aria-hidden="true">
            <BookOpen size={22} />
          </div>
          <div>
            <p className="eyebrow">Interview Prep</p>
            <h1>Docs Library</h1>
          </div>
        </div>

        <div className="library-total">
          <span>{initialData.topics.length} documents</span>
          <strong>{initialData.questions.length}</strong>
          <span>readable interview sections</span>
        </div>

        <nav className="topic-menu" aria-label="Topic menu">
          <button
            className={activeTrack === "all" ? "menu-row active" : "menu-row"}
            onClick={() => selectTrack("all")}
            type="button"
          >
            <TrackIcon slug="all" />
            <span className="track-copy">
              <strong>All Topics</strong>
              <small>Complete library</small>
            </span>
            <span className="menu-count">{initialData.questions.length}</span>
          </button>

          {tracks.map((track) => {
            const isActiveTrack = activeTrack === track.slug;
            const isExpanded = expandedTracks.has(track.slug);

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
                  onClick={() => selectTrack(track.slug)}
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
                    <button
                      className={activeTopic === topic.slug ? "submenu-row active" : "submenu-row"}
                      key={topic.slug}
                      onClick={() => selectTopic(topic)}
                      type="button"
                    >
                      <TopicIcon slug={topic.slug} />
                      <span>{topic.subtopicTitle}</span>
                      <small>{topic.questionCount}</small>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div className="topbar">
            <div>
              <p className="eyebrow">Reading Workspace</p>
              <h2>
                {activeTopicSummary
                  ? `${activeTopicSummary.trackTitle} / ${activeTopicSummary.subtopicTitle}`
                  : (activeTrackSummary?.title ?? "All interview topics")}
              </h2>
            </div>

            <div className="search-field">
              <Search size={18} />
              <input
                aria-label="Search interview documents"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search questions, answers, tags, or topics"
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

          <section className="filter-panel" aria-label="Library filters">
            <div className="filter-row">
              <span className="facet-label">
                <Filter size={15} />
                Level
              </span>
              <div className="chip-group">
                {difficultyOptions.map((value) => (
                  <button
                    className={difficulty === value ? "active" : ""}
                    key={value}
                    onClick={() => setDifficulty(value)}
                    type="button"
                  >
                    {capitalize(value)}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="active-filter-row">
            <span className="result-count">{filteredQuestions.length} sections</span>
            {activeFilterLabels.map((label) => (
              <span className="active-filter" key={label}>
                {label}
              </span>
            ))}
            {hasActiveFilters ? (
              <button className="clear-filters" onClick={resetFilters} type="button">
                Clear filters
              </button>
            ) : null}
          </div>
        </header>

        <section className="summary-grid">
          <Metric label="Documents" value={visibleDocumentCount} />
          <Metric label="Sections" value={filteredQuestions.length} />
          <Metric label="Reading Time" value={`${totalReadingMinutes} min`} />
        </section>

        <section className="reader-layout">
          <div className="section-list" aria-label="Document sections">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Contents</p>
                <h2>{filteredQuestions.length} sections</h2>
              </div>
              <span className="small-pill">{filteredQuestions.length ? selectedIndex + 1 : 0}</span>
            </div>

            <div className="section-stack">
              {filteredQuestions.length ? (
                filteredQuestions.map((question) => (
                  <QuestionListItem
                    key={question.id}
                    onClick={() => setSelectedQuestionId(question.id)}
                    question={question}
                    selected={selectedQuestion?.id === question.id}
                  />
                ))
              ) : (
                <div className="empty-results">
                  <FileText size={28} />
                  <strong>No sections found</strong>
                  <span>Try another topic, subtopic, level, or search term.</span>
                </div>
              )}
            </div>
          </div>

          <QuestionDetail question={selectedQuestion} />
        </section>
      </section>
    </main>
  );
}

function buildTrackSummaries(topics: TopicSummary[]) {
  const byTrack = new Map<string, TrackSummary>();

  topics.forEach((topic) => {
    const current = byTrack.get(topic.trackSlug) ?? {
      slug: topic.trackSlug,
      title: topic.trackTitle,
      questionCount: 0,
      topics: [],
    };

    current.questionCount += topic.questionCount;
    current.topics.push(topic);
    byTrack.set(topic.trackSlug, current);
  });

  return Array.from(byTrack.values()).sort(
    (first, second) => trackOrder.indexOf(first.slug) - trackOrder.indexOf(second.slug),
  );
}

function QuestionListItem({
  onClick,
  question,
  selected,
}: {
  onClick: () => void;
  question: Question;
  selected: boolean;
}) {
  return (
    <button
      className={selected ? "section-item active" : "section-item"}
      onClick={onClick}
      type="button"
    >
      <span className="section-number">{question.number}</span>
      <span className="section-copy">
        <span className="section-path">
          {question.trackTitle} / {question.subtopicTitle} / {capitalize(question.difficulty)}
        </span>
        <strong>{question.question}</strong>
        <span>{question.excerpt}</span>
      </span>
    </button>
  );
}

function QuestionDetail({ question }: { question?: Question }) {
  if (!question) {
    return (
      <article className="detail-panel empty-state">
        <FileText size={34} />
        <h2>No section selected</h2>
      </article>
    );
  }

  return (
    <article className="detail-panel">
      <div className="detail-heading">
        <TopicIcon className="detail-topic-icon" slug={question.topicSlug} />
        <div>
          <p className="eyebrow">
            {question.trackTitle} / {question.subtopicTitle}
          </p>
          <h2>{question.question}</h2>
          <div className="tag-row">
            <span>{capitalize(question.difficulty)}</span>
            <span>{question.readingMinutes} min read</span>
            {question.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="answer-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{question.answer}</ReactMarkdown>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TrackIcon({ slug }: { slug: string }) {
  const Icon = trackIcons[slug as keyof typeof trackIcons] ?? Library;

  return (
    <span className="topic-icon">
      <Icon size={18} />
    </span>
  );
}

function TopicIcon({
  className,
  size = 17,
  slug,
}: {
  className?: string;
  size?: number;
  slug: string;
}) {
  const Icon = topicIcons[slug as keyof typeof topicIcons] ?? Library;

  return (
    <span className={className ? `topic-icon ${className}` : "topic-icon"}>
      <Icon size={size} />
    </span>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
