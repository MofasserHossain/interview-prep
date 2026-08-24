"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Braces,
  Blocks,
  Check,
  ChevronDown,
  ChevronRight,
  Clipboard,
  CodeXml,
  Component,
  Container,
  FileText,
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
import Link from "next/link";
import { Children, isValidElement, useEffect, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { InterviewData, Question } from "@/lib/types";

type TopicSummary = InterviewData["topics"][number];

type TrackSummary = {
  slug: string;
  title: string;
  questionCount: number;
  readingMinutes: number;
  topics: TopicSummary[];
};

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

const languageLabels: Record<string, string> = {
  bash: "Shell",
  cs: "C#",
  csharp: "C#",
  css: "CSS",
  dockerfile: "Dockerfile",
  html: "HTML",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  output: "Output",
  py: "Python",
  python: "Python",
  sh: "Shell",
  shell: "Shell",
  text: "Output",
  ts: "TypeScript",
  tsx: "TSX",
  txt: "Output",
  yaml: "YAML",
  yml: "YAML",
};

const outputLanguages = new Set(["console", "output", "text", "txt"]);

const markdownComponents: Components = {
  code({ children, className, node: _node, ...props }) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  pre({ children }) {
    return <CodeBlock>{children}</CodeBlock>;
  },
  p({ children, node: _node, ...props }) {
    const label = getStudySectionLabel(children);

    if (label) {
      return (
        <p className={`study-section-label ${label.kind}`} {...props}>
          {label.title}
        </p>
      );
    }

    return <p {...props}>{children}</p>;
  },
  table({ children, node: _node, ...props }) {
    return (
      <div className="markdown-table-wrap">
        <table {...props}>{children}</table>
      </div>
    );
  },
};

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
  const activeTrackSummary = tracks.find((track) => track.slug === activeTrack);
  const activeTopicIndex = orderedTopics.findIndex((topic) => topic.slug === activeTopicSlug);
  const previousTopic = activeTopicIndex > 0 ? orderedTopics[activeTopicIndex - 1] : undefined;
  const nextTopic =
    activeTopicIndex >= 0 && activeTopicIndex < orderedTopics.length - 1
      ? orderedTopics[activeTopicIndex + 1]
      : undefined;
  const [expandedTracks, setExpandedTracks] = useState<Set<string>>(
    () => new Set(activeTrack ? [activeTrack] : []),
  );
  const [selectedQuestionId, setSelectedQuestionId] = useState(
    activeTopicSlug
      ? getFirstQuestionId(initialData.questions, activeTopicSlug)
      : (initialData.questions[0]?.id ?? ""),
  );

  const visibleTopics = useMemo(() => {
    if (!activeTrack) return initialData.topics;

    return initialData.topics.filter((topic) => topic.trackSlug === activeTrack);
  }, [activeTrack, initialData.topics]);

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

  const totalReadingMinutes = filteredQuestions.reduce(
    (total, question) => total + question.readingMinutes,
    0,
  );
  const visibleDocumentCount = activeTopicSlug ? 1 : visibleTopics.length;

  const activeScopeLabel = activeTopicSummary
    ? `${activeTopicSummary.trackTitle} / ${activeTopicSummary.subtopicTitle}`
    : (activeTrackSummary?.title ?? "Interview topics");
  const showOverview = !activeTopicSlug && !query.trim();

  useEffect(() => {
    if (!activeTrack) {
      setExpandedTracks(new Set());
      return;
    }

    setExpandedTracks((current) => new Set(current).add(activeTrack));
  }, [activeTrack]);

  useEffect(() => {
    setSelectedQuestionId(
      activeTopicSlug
        ? getFirstQuestionId(initialData.questions, activeTopicSlug)
        : (initialData.questions[0]?.id ?? ""),
    );
    document.querySelector<HTMLElement>(".workspace")?.scrollTo({ top: 0 });
  }, [activeTopicSlug, initialData.questions]);

  useEffect(() => {
    if (!filteredQuestions.length) return;
    if (filteredQuestions.some((question) => question.id === selectedQuestionId)) {
      return;
    }

    setSelectedQuestionId(filteredQuestions[0].id);
  }, [filteredQuestions, selectedQuestionId]);

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
            <BookOpen size={22} />
          </div>
          <div>
            <p className="eyebrow">Interview Prep</p>
            <h1>Docs Library</h1>
          </div>
        </Link>

        <nav className="topic-menu" aria-label="Topic menu">
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

      <section className="workspace">
        <header className="workspace-header">
          <div className="topbar">
            <div className="workspace-title">
              <p className="eyebrow">Docs</p>
              <h2>{activeScopeLabel}</h2>
              <div className="workspace-summary" aria-label="Current library scope">
                <span>{filteredQuestions.length} sections</span>
                <span>{visibleDocumentCount} documents</span>
                <span>{totalReadingMinutes} min read</span>
              </div>
            </div>

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
              selectedQuestionId={selectedQuestionId}
            />
          </section>
        )}
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
      readingMinutes: 0,
      topics: [],
    };

    current.questionCount += topic.questionCount;
    current.readingMinutes += topic.readingMinutes;
    current.topics.push(topic);
    byTrack.set(topic.trackSlug, current);
  });

  return Array.from(byTrack.values()).sort(
    (first, second) => trackOrder.indexOf(first.slug) - trackOrder.indexOf(second.slug),
  );
}

function getFirstQuestionId(questions: Question[], topicSlug: string) {
  return questions.find((question) => question.topicSlug === topicSlug)?.id ?? "";
}

function TopicOverview({ onNavigate, tracks }: { onNavigate: () => void; tracks: TrackSummary[] }) {
  const totalTopics = tracks.reduce((total, track) => total + track.topics.length, 0);
  const totalSections = tracks.reduce((total, track) => total + track.questionCount, 0);
  const totalReadingMinutes = tracks.reduce((total, track) => total + track.readingMinutes, 0);

  return (
    <section className="topic-overview" aria-label="Interview topic overview">
      <article className="docs-index-page">
        <nav className="docs-breadcrumb" aria-label="Breadcrumb">
          <span>Docs</span>
        </nav>

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

function QuestionToc({
  onSelectQuestion,
  questions,
  selectedQuestionId,
}: {
  onSelectQuestion: (questionId: string) => void;
  questions: Question[];
  selectedQuestionId?: string;
}) {
  return (
    <aside className="toc-panel" aria-label="Sections in this document">
      <div className="toc-heading">
        <p className="eyebrow">On this page</p>
        <h2>{questions.length} sections</h2>
      </div>

      {questions.length ? (
        <div className="toc-list">
          {questions.map((question) => (
            <button
              className={selectedQuestionId === question.id ? "active" : ""}
              key={question.id}
              onClick={() => onSelectQuestion(question.id)}
              type="button"
            >
              <span>{question.number}</span>
              <strong>{question.question}</strong>
            </button>
          ))}
        </div>
      ) : (
        <div className="toc-empty">No matching sections.</div>
      )}
    </aside>
  );
}

function DocumentDetail({
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
  const subtitle = activeTopic
    ? `${activeTopic.trackTitle} / ${activeTopic.subtopicTitle}`
    : "Interview Prep Docs";
  const description = activeTopic?.description ?? "Sections matching the current search query.";
  const readingMinutes = questions.reduce((total, question) => total + question.readingMinutes, 0);
  const topicSlug = activeTopic?.slug ?? firstQuestion.topicSlug;

  return (
    <article className="detail-panel">
      <header className="docs-article-header">
        <nav className="docs-breadcrumb" aria-label="Breadcrumb">
          <Link href="/" onClick={onNavigate}>
            Docs
          </Link>
          <ChevronRight size={14} />
          <span>{activeTopic?.trackTitle ?? firstQuestion.trackTitle}</span>
          <ChevronRight size={14} />
          <span>{title}</span>
        </nav>

        <div className="detail-heading">
          <TopicIcon className="detail-topic-icon" slug={topicSlug} />
          <div className="detail-copy">
            <p className="eyebrow">{subtitle}</p>
            <h1>{title}</h1>
            <p className="article-description">{description}</p>
            <div className="article-meta" aria-label="Selected document context">
              <span>{questions.length} sections</span>
              <span>{readingMinutes} min read</span>
              {activeTopic ? <span>{activeTopic.file}</span> : null}
              {query.trim() ? <span>Search: {query.trim()}</span> : null}
            </div>
          </div>
        </div>
      </header>

      <div className="answer-body document-body">
        {questions.map((question) => (
          <section className="document-section" id={question.id} key={question.id}>
            <p className="eyebrow">
              {question.trackTitle} / {question.subtopicTitle}
            </p>
            <h2>
              {question.number}. {question.question}
            </h2>
            <div className="section-context" aria-label="Section context">
              <span>{capitalize(question.difficulty)}</span>
              <span>{question.readingMinutes} min</span>
              {question.tags.slice(0, 4).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
              {question.answer}
            </ReactMarkdown>
          </section>
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

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const codeElement = Children.toArray(children).find(
    (child): child is ReactElement<{ children?: ReactNode; className?: string }> =>
      isValidElement(child),
  );
  const className = codeElement?.props.className ?? "";
  const language = getCodeLanguage(className);
  const isOutput = outputLanguages.has(language);
  const languageLabel = languageLabels[language] ?? language.toUpperCase();
  const showLanguageLabel = !isOutput && language !== "plain";
  const code = getCodeText(codeElement?.props.children ?? children).replace(/\n$/, "");
  const lines = code.split("\n");
  const lineNumberWidth = String(lines.length).length;
  const showLineNumbers = !isOutput && lines.length > 1;
  const CodeIcon = isOutput ? Terminal : CodeXml;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={[
        "code-panel",
        isOutput ? "output-code" : "source-code",
        showLineNumbers ? "with-line-numbers" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="code-panel-header">
        <div className="code-panel-title">
          <CodeIcon size={15} />
          <span>{isOutput ? "Output" : "Code"}</span>
          {showLanguageLabel ? <span className="code-language">{languageLabel}</span> : null}
        </div>
        <button
          aria-label={copied ? "Copied code" : "Copy code"}
          className="code-copy-button"
          onClick={() => void copyCode()}
          type="button"
        >
          {copied ? <Check size={14} /> : <Clipboard size={14} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      <pre className="code-panel-pre">
        <code className={className}>
          {lines.map((line, index) => (
            <span className="code-line" key={`${index}-${line}`}>
              {showLineNumbers ? (
                <span className="code-line-number">
                  {String(index + 1).padStart(lineNumberWidth, " ")}
                </span>
              ) : null}
              <span className="code-line-content">{line || " "}</span>
            </span>
          ))}
        </code>
      </pre>
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

function getCodeLanguage(className?: string) {
  return className?.match(/language-([a-zA-Z0-9_-]+)/)?.[1].toLowerCase() ?? "plain";
}

function getCodeText(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((child) => getCodeText(child)).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(value)) {
    return getCodeText(value.props.children);
  }

  return "";
}

function getStudySectionLabel(value: ReactNode) {
  const text = getCodeText(value).trim();
  const normalized = text.replace(/:$/, "").toLowerCase();
  const labels: Record<string, { kind: string; title: string }> = {
    benefits: { kind: "benefit", title: "Benefits" },
    "benefit over traditional callbacks": {
      kind: "benefit",
      title: "Benefit Over Traditional Callbacks",
    },
    "benefit over promise.all()": {
      kind: "benefit",
      title: "Benefit Over Promise.all",
    },
    "benefits over .then() chains": {
      kind: "benefit",
      title: "Benefits Over .then() Chains",
    },
    "callback style": { kind: "example", title: "Callback Style" },
    concurrent: { kind: "example", title: "Concurrent" },
    example: { kind: "example", title: "Example" },
    important: { kind: "important", title: "Important" },
    "interview notes": { kind: "interview", title: "Interview Notes" },
    "promise chain": { kind: "example", title: "Promise Chain" },
    "promise style": { kind: "example", title: "Promise Style" },
    sequential: { kind: "example", title: "Sequential" },
    "strong answer": { kind: "interview", title: "Strong Interview Answer" },
    "use cases": { kind: "benefit", title: "Use Cases" },
    "when .then() is still fine": {
      kind: "important",
      title: "When .then() Is Still Fine",
    },
    "when not to use promise.all()": {
      kind: "important",
      title: "When Not To Use Promise.all",
    },
    "why this is good": { kind: "benefit", title: "Why This Is Good" },
  };

  return labels[normalized] ?? null;
}
