"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BotMessageSquare,
  BookOpen,
  BrainCircuit,
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
  RefreshCcw,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import {
  Children,
  cloneElement,
  Component as ReactComponent,
  isValidElement,
  useEffect,
  useMemo,
  useState,
} from "react";
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

type TocGroup = {
  children: Question[];
  overview?: Question;
  title: string;
};

type GroupedToc = {
  groups: TocGroup[];
  standalone: Question[];
};

const trackOrder = [
  "role-prep",
  "backend",
  "nodejs",
  "javascript",
  "react",
  "ai-engineering",
  "system-design",
  "devops",
  "dotnet",
  "python",
  "mobile",
  "frontend-architecture",
];

const trackIcons = {
  all: Library,
  "role-prep": FileText,
  backend: Server,
  nodejs: Terminal,
  javascript: Braces,
  react: Component,
  "ai-engineering": BrainCircuit,
  "system-design": Workflow,
  devops: Container,
  dotnet: Blocks,
  python: Terminal,
  mobile: Smartphone,
  "frontend-architecture": Layers3,
};

const topicIcons = {
  "senior-full-stack-saas-job-prep": FileText,
  backend: Server,
  "senior-api-database-performance": Zap,
  "nodejs-backend": Terminal,
  "nodejs-event-loop-runtime": Router,
  javascript: Braces,
  "javascript-modules-import-export": CodeXml,
  "javascript-promises-async": Workflow,
  "javascript-event-loop-runtime": Router,
  "javascript-this-functions": Braces,
  "javascript-prototypes-objects": Blocks,
  "javascript-collections-iteration": Library,
  "javascript-loops-array-methods": Workflow,
  "javascript-scope-hoisting-closures": Layers3,
  "javascript-types-equality-copying": CodeXml,
  "frontend-react-next": Component,
  "typescript-react-architecture": Braces,
  "react-performance": Zap,
  "react-core-through-17": Component,
  "react-18-features": Workflow,
  "react-19-features": Component,
  "react-compiler": Zap,
  "senior-frontend-react-scenarios": Workflow,
  "machine-coding": CodeXml,
  "ai-frontend-engineering": BotMessageSquare,
  "system-design-microservices": Workflow,
  "kafka-event-streaming": Workflow,
  "rabbitmq-message-broker": Workflow,
  "mqtt-iot-messaging": Router,
  "design-patterns": Blocks,
  "devops-docker-kubernetes": Container,
  "aws-saas-observability": Workflow,
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
const jsLikeLanguages = new Set(["js", "javascript", "jsx", "ts", "tsx"]);
const shellLanguages = new Set(["bash", "sh", "shell"]);
const dataLanguages = new Set(["json", "yaml", "yml"]);

const jsTokenPattern =
  /\/\/.*|\/\*.*?\*\/|(["'`])(?:\\.|(?!\1).)*\1|\b(?:async|await|break|case|catch|class|const|continue|default|delete|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|switch|throw|try|typeof|var|void|while|yield)\b|\b(?:false|Infinity|NaN|null|true|undefined)\b|\b\d+(?:\.\d+)?\b|\b[A-Z][A-Za-z0-9_$]*(?=[\s.(])|\b[A-Za-z_$][\w$]*(?=\s*\()|[{}()[\].,;:?]/g;

const shellTokenPattern =
  /#.*|\$[A-Za-z_][\w]*|--?[A-Za-z0-9][\w-]*|(["'])(?:\\.|(?!\1).)*\1|\b\d+(?:\.\d+)?\b/g;

const dataTokenPattern =
  /(["'])(?:\\.|(?!\1).)*\1|\b(?:false|null|true)\b|\b\d+(?:\.\d+)?\b|[{}[\]:,]/g;

const markdownComponents: Components = {
  code({ children, className, node: _node, ...props }) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  li({ children, node: _node, ...props }) {
    return <li {...props}>{capitalizeFirstReadableText(children)}</li>;
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

type WorkspaceErrorBoundaryProps = {
  children: ReactNode;
  resetKey: string;
};

type WorkspaceErrorBoundaryState = {
  error: Error | null;
};

class WorkspaceErrorBoundary extends ReactComponent<
  WorkspaceErrorBoundaryProps,
  WorkspaceErrorBoundaryState
> {
  state: WorkspaceErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): WorkspaceErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  componentDidUpdate(previousProps: WorkspaceErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <section className="doc-layout">
          <DocumentErrorPanel
            error={this.state.error}
            onRetry={() => this.setState({ error: null })}
          />
        </section>
      );
    }

    return this.props.children;
  }
}

function DocumentErrorPanel({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <article className="detail-panel detail-error-state">
      <div className="system-state-icon" aria-hidden="true">
        <AlertTriangle size={24} />
      </div>
      <p className="eyebrow">Document Error</p>
      <h2>Unable to render this document</h2>
      <p>
        The docs layout is still available. Try rendering this panel again, or choose another topic
        from the sidebar.
      </p>
      {error.message ? <code>{error.message}</code> : null}
      <button className="state-primary-action" onClick={onRetry} type="button">
        <RefreshCcw size={16} />
        Try Again
      </button>
    </article>
  );
}

function TopicOverview({ onNavigate, tracks }: { onNavigate: () => void; tracks: TrackSummary[] }) {
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

function QuestionToc({
  onSelectQuestion,
  questions,
  selectedQuestionId,
}: {
  onSelectQuestion: (questionId: string) => void;
  questions: Question[];
  selectedQuestionId?: string;
}) {
  const groupedToc = getGroupedToc(questions);

  return (
    <aside className="toc-panel" aria-label="Sections in this document">
      {groupedToc ? (
        <div className="toc-list grouped">
          {groupedToc.standalone.map((question) => (
            <TocButton
              key={question.id}
              onSelectQuestion={onSelectQuestion}
              question={question}
              selected={selectedQuestionId === question.id}
            />
          ))}

          {groupedToc.groups.map((group) => {
            const groupActive =
              group.overview?.id === selectedQuestionId ||
              group.children.some((question) => question.id === selectedQuestionId);

            return (
              <div className={groupActive ? "toc-group active" : "toc-group"} key={group.title}>
                {group.overview ? (
                  <button
                    className={
                      selectedQuestionId === group.overview.id
                        ? "toc-group-button active"
                        : "toc-group-button"
                    }
                    data-question-id={group.overview.id}
                    onClick={() => onSelectQuestion(group.overview!.id)}
                    type="button"
                  >
                    <strong>{group.title}</strong>
                    <small>{group.children.length} patterns</small>
                  </button>
                ) : (
                  <div className="toc-group-label">
                    <strong>{group.title}</strong>
                    <small>{group.children.length} patterns</small>
                  </div>
                )}

                <div className="toc-sublist">
                  {group.children.map((question) => (
                    <TocButton
                      child
                      key={question.id}
                      onSelectQuestion={onSelectQuestion}
                      question={question}
                      selected={selectedQuestionId === question.id}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : questions.length ? (
        <div className="toc-list">
          {questions.map((question) => (
            <TocButton
              key={question.id}
              onSelectQuestion={onSelectQuestion}
              question={question}
              selected={selectedQuestionId === question.id}
            />
          ))}
        </div>
      ) : (
        <div className="toc-empty">No matching sections.</div>
      )}
    </aside>
  );
}

function TocButton({
  child = false,
  onSelectQuestion,
  question,
  selected,
}: {
  child?: boolean;
  onSelectQuestion: (questionId: string) => void;
  question: Question;
  selected: boolean;
}) {
  return (
    <button
      className={[selected ? "active" : "", child ? "toc-child-button" : ""]
        .filter(Boolean)
        .join(" ")}
      data-question-id={question.id}
      onClick={() => onSelectQuestion(question.id)}
      type="button"
    >
      <strong>{question.question}</strong>
    </button>
  );
}

function getGroupedToc(questions: Question[]): GroupedToc | undefined {
  if (
    !questions.length ||
    !questions.every((question) => question.topicSlug === "design-patterns")
  ) {
    return undefined;
  }

  const byNumber = new Map(questions.map((question) => [question.number, question]));
  const groups = [
    {
      numbers: [3, 4, 5, 6, 7],
      overviewNumber: 2,
      title: "Creational Patterns",
    },
    {
      numbers: [9, 10, 11, 12, 13, 14, 15],
      overviewNumber: 8,
      title: "Structural Patterns",
    },
    {
      numbers: [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
      overviewNumber: 16,
      title: "Behavioral Patterns",
    },
  ]
    .map((group) => ({
      children: group.numbers
        .map((number) => byNumber.get(number))
        .filter((question): question is Question => Boolean(question)),
      overview: byNumber.get(group.overviewNumber),
      title: group.title,
    }))
    .filter((group) => group.overview || group.children.length);

  return {
    groups,
    standalone: questions.filter((question) => question.number === 1),
  };
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
        {questions.map((question) => (
          <section className="document-section" id={question.id} key={question.id}>
            <div className="question-title-row">
              <span className="question-number" aria-label={`Question ${question.number}`}>
                {question.number}
              </span>
              <h2>{question.question}</h2>
            </div>
            <div className="question-answer">
              <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
                {question.answer}
              </ReactMarkdown>
            </div>
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
              <span className="code-line-content">{renderCodeLine(line, language, isOutput)}</span>
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

function capitalizeFirstReadableText(value: ReactNode) {
  return capitalizeFirstReadableTextOnce(value)[0];
}

function capitalizeFirstReadableTextOnce(value: ReactNode): [ReactNode, boolean] {
  if (typeof value === "string") {
    return capitalizeTextStart(value);
  }

  if (Array.isArray(value)) {
    let changed = false;
    const children = value.map((child) => {
      if (changed) return child;

      const [nextChild, didChange] = capitalizeFirstReadableTextOnce(child);
      changed = didChange;

      return nextChild;
    });

    return [children, changed];
  }

  if (isValidElement<{ children?: ReactNode }>(value)) {
    if (isCodeLikeElement(value)) {
      return [value, false];
    }

    const [children, changed] = capitalizeFirstReadableTextOnce(value.props.children);

    if (!changed) {
      return [value, false];
    }

    return [cloneElement(value, undefined, children), true];
  }

  return [value, false];
}

function capitalizeTextStart(value: string): [string, boolean] {
  const match = value.match(/^(\s*["'([{]*)([a-z])/);

  if (!match) {
    return [value, false];
  }

  const index = match[1].length;

  return [
    `${value.slice(0, index)}${value.charAt(index).toUpperCase()}${value.slice(index + 1)}`,
    true,
  ];
}

function isCodeLikeElement(value: ReactElement) {
  return typeof value.type === "string" && ["code", "kbd", "pre", "samp"].includes(value.type);
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

function renderCodeLine(line: string, language: string, isOutput: boolean) {
  if (!line || isOutput) {
    return line || " ";
  }

  if (jsLikeLanguages.has(language)) {
    return highlightCodeLine(line, jsTokenPattern, getJsTokenClass);
  }

  if (shellLanguages.has(language)) {
    return highlightCodeLine(line, shellTokenPattern, getShellTokenClass);
  }

  if (dataLanguages.has(language)) {
    return highlightCodeLine(line, dataTokenPattern, getDataTokenClass);
  }

  return line;
}

function highlightCodeLine(line: string, pattern: RegExp, getClassName: (token: string) => string) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of line.matchAll(pattern)) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > cursor) {
      nodes.push(line.slice(cursor, index));
    }

    nodes.push(
      <span className={getClassName(token)} key={`${tokenIndex}-${index}`}>
        {token}
      </span>,
    );
    cursor = index + token.length;
    tokenIndex += 1;
  }

  if (cursor < line.length) {
    nodes.push(line.slice(cursor));
  }

  return nodes.length ? nodes : line;
}

function getJsTokenClass(token: string) {
  if (token.startsWith("//") || token.startsWith("/*")) return "syntax-comment";
  if (/^["'`]/.test(token)) return "syntax-string";
  if (/^\d/.test(token)) return "syntax-number";
  if (/^(false|Infinity|NaN|null|true|undefined)$/.test(token)) return "syntax-literal";
  if (/^[A-Z]/.test(token)) return "syntax-class";
  if (/^[A-Za-z_$]/.test(token) && !isJsKeyword(token)) return "syntax-function";
  if (/^[{}()[\].,;:?]$/.test(token)) return "syntax-punctuation";

  return "syntax-keyword";
}

function getShellTokenClass(token: string) {
  if (token.startsWith("#")) return "syntax-comment";
  if (/^["']/.test(token)) return "syntax-string";
  if (token.startsWith("$")) return "syntax-variable";
  if (token.startsWith("-")) return "syntax-attr";
  if (/^\d/.test(token)) return "syntax-number";

  return "syntax-keyword";
}

function getDataTokenClass(token: string) {
  if (/^["']/.test(token)) return "syntax-string";
  if (/^\d/.test(token)) return "syntax-number";
  if (/^(false|null|true)$/.test(token)) return "syntax-literal";

  return "syntax-punctuation";
}

function isJsKeyword(token: string) {
  return /^(async|await|break|case|catch|class|const|continue|default|delete|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|switch|throw|try|typeof|var|void|while|yield)$/.test(
    token,
  );
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
    "interview note": { kind: "interview", title: "Interview Note" },
    "interview notes": { kind: "interview", title: "Interview Notes" },
    "interview caveat": { kind: "important", title: "Interview Caveat" },
    "interview method": { kind: "interview", title: "Interview Method" },
    "key reasoning": { kind: "important", title: "Key Reasoning" },
    "mental model": { kind: "example", title: "Mental Model" },
    "promise chain": { kind: "example", title: "Promise Chain" },
    "promise style": { kind: "example", title: "Promise Style" },
    "priority order": { kind: "important", title: "Priority Order" },
    "reliable rule": { kind: "important", title: "Reliable Rule" },
    sequential: { kind: "example", title: "Sequential" },
    "strong answer": { kind: "interview", title: "Strong Interview Answer" },
    "use cases": { kind: "benefit", title: "Use Cases" },
    walkthrough: { kind: "example", title: "Walkthrough" },
    "when .then() is still fine": {
      kind: "important",
      title: "When .then() Is Still Fine",
    },
    "when not to use promise.all()": {
      kind: "important",
      title: "When Not To Use Promise.all",
    },
    why: { kind: "important", title: "Why" },
    "why this is good": { kind: "benefit", title: "Why This Is Good" },
    "why it matters": { kind: "benefit", title: "Why It Matters" },
  };

  return labels[normalized] ?? null;
}
