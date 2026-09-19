import fs from "node:fs";
import path from "node:path";
import { topics } from "@/lib/topics";
import type { InterviewData, Question, Topic } from "@/lib/types";

const contentDirectory = path.join(process.cwd(), "content");

const skippedSections = new Set(["sources used"]);

const keywordTags = [
  "actions",
  "ack",
  "acknowledgement",
  "amqp",
  "api",
  "apply",
  "array",
  "async",
  "auth",
  "aws",
  "bind",
  "blue-green",
  "broker",
  "bundle",
  "call",
  "call stack",
  "cache",
  "canary",
  "cdc",
  "ci/cd",
  "closure",
  "coercion",
  "compiler",
  "component",
  "composition",
  "concurrency",
  "context",
  "controlled",
  "consumer",
  "consumer group",
  "database",
  "debounce",
  "dead letter",
  "dead letter exchange",
  "delivery limit",
  "deployment",
  "design pattern",
  "docker",
  "event loop",
  "equality",
  "explain",
  "external store",
  "exchange",
  "effect",
  "agent",
  "error boundary",
  "citation",
  "citations",
  "consumer capacity",
  "factory",
  "feature flags",
  "fragment",
  "hoc",
  "hooks",
  "hoisting",
  "http",
  "hydration",
  "iam",
  "indexing",
  "iteration",
  "loop",
  "idempotence",
  "jwt",
  "kafka",
  "kubernetes",
  "lazy",
  "llm",
  "last will",
  "map",
  "microtask",
  "memo",
  "middleware",
  "mqtt",
  "microservice",
  "module federation",
  "mvc",
  "mysql",
  "next.js",
  "node.js",
  "observability",
  "optimistic",
  "outbox",
  "offset",
  "partition",
  "performance",
  "php",
  "portal",
  "promise",
  "prototype",
  "producer",
  "prompt injection",
  "publisher confirm",
  "persistent session",
  "queue",
  "qos",
  "quorum queue",
  "rabbitmq",
  "rag",
  "react",
  "reconciliation",
  "reducer",
  "reduce",
  "render props",
  "replication",
  "redis",
  "rest",
  "rollback",
  "redux",
  "saas",
  "security",
  "server functions",
  "server components",
  "set",
  "sli",
  "slo",
  "scope",
  "schema registry",
  "singleton",
  "spring boot",
  "ssr",
  "stream",
  "streaming",
  "retained message",
  "routing key",
  "sasl",
  "session expiry",
  "shared subscription",
  "stateful",
  "stateless",
  "strict mode",
  "suspense",
  "task queue",
  "tdz",
  "throttle",
  "typescript",
  "vite",
  "transition",
  "transaction",
  "tree shaking",
  "message expiry",
  "topic alias",
  "tls",
  "retrieval",
  "virtualization",
  "web api",
  "webpack",
  "weakmap",
  "websocket",
  "execution context",
  "lexical environment",
  "environment record",
  "scope chain",
  "critical rendering path",
  "render tree",
  "cssom",
  "reflow",
  "repaint",
  "mime type",
  "preload",
  "core web vitals",
  "dom",
  "event delegation",
  "event bubbling",
  "box model",
  "stacking context",
  "specificity",
  "flexbox",
  "css grid",
  "media query",
  "cascade",
  "css",
  "sql",
  "join",
  "primary key",
  "foreign key",
  "normalization",
  "composite index",
  "covering index",
  "b-tree",
  "cardinality",
  "query plan",
  "execution plan",
  "isolation level",
  "deadlock",
  "pagination",
  "nestjs",
  "dependency injection",
  "interceptor",
  "guard",
  "backpressure",
  "worker thread",
  "cluster",
  "buffer",
  "server component",
  "app router",
  "cache components",
  "server actions",
  "proxy",
];

/**
 * The Markdown file's real modification time, used for `lastModified` in the
 * sitemap and `dateModified` in structured data. Build time would mark every
 * page as freshly changed on every deploy, which is a false signal.
 */
export function getTopicLastModified(file: string): Date {
  try {
    return fs.statSync(path.join(contentDirectory, file)).mtime;
  } catch {
    return new Date();
  }
}

export function getInterviewData(): InterviewData {
  const questions = topics.flatMap((topic) => parseTopic(topic));
  const sectionsByTopic = new Map<string, Question[]>();

  for (const question of questions) {
    const sections = sectionsByTopic.get(question.topicSlug);

    if (sections) {
      sections.push(question);
    } else {
      sectionsByTopic.set(question.topicSlug, [question]);
    }
  }

  const summaries = topics.map((topic) => {
    let questionCount = 0;
    let readingMinutes = 0;

    for (const section of sectionsByTopic.get(topic.slug) ?? []) {
      if (section.kind === "question") questionCount += 1;
      readingMinutes += section.readingMinutes;
    }

    return Object.assign({}, topic, { questionCount, readingMinutes });
  });

  return {
    topics: summaries,
    questions,
  };
}

function parseTopic(topic: Topic): Question[] {
  const filePath = path.join(contentDirectory, topic.file);
  const markdown = fs.readFileSync(filePath, "utf8");
  const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)];
  const sections: Question[] = [];

  headings.forEach((heading, index) => {
    const title = heading[1].trim();
    const start = heading.index! + heading[0].length;
    const nextHeading = headings[index + 1];
    const end = nextHeading?.index ?? markdown.length;
    const answer = cleanAnswer(markdown.slice(start, end));
    const questionMatch = title.match(/^(\d+)\.\s+(.+)$/);

    if (!questionMatch) {
      if (skippedSections.has(title.toLowerCase())) return;

      sections.push(
        buildSection(topic, {
          answer,
          id: `${topic.slug}-prose-${slugifyTitle(title)}`,
          kind: "prose",
          number: 0,
          question: title,
        }),
      );

      return;
    }

    const number = Number(questionMatch[1]);

    sections.push(
      buildSection(topic, {
        answer,
        id: `${topic.slug}-${String(number).padStart(3, "0")}`,
        kind: "question",
        number,
        question: normalizeQuestionTitle(questionMatch[2].trim()),
      }),
    );
  });

  return sections;
}

type SectionSeed = Pick<Question, "answer" | "id" | "kind" | "number" | "question">;

function buildSection(topic: Topic, seed: SectionSeed): Question {
  return {
    ...seed,
    topicSlug: topic.slug,
    topicTitle: topic.title,
    trackSlug: topic.trackSlug,
    trackTitle: topic.trackTitle,
    subtopicTitle: topic.subtopicTitle,
    category: topic.category,
    tags: getTags(`${seed.question} ${seed.answer}`, topic),
    readingMinutes: getReadingMinutes(seed.answer),
  };
}

function slugifyTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanAnswer(value: string) {
  return value
    .replace(/\n-{3,}\s*$/g, "")
    .replace(/\n##\s+Sources Used[\s\S]*$/g, "")
    .trim();
}

function getTags(text: string, topic: Topic) {
  const normalized = text.toLowerCase();
  const tags = keywordTags.filter((tag) => normalized.includes(tag));

  return Array.from(new Set([topic.category.toLowerCase(), ...tags])).slice(0, 6);
}

function getReadingMinutes(answer: string) {
  const words = answer.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

function normalizeQuestionTitle(value: string) {
  if (
    !/^(what|why|how|when|where|explain|describe|define|compare|difference|is|are|do|does|should|can)\b/i.test(
      value,
    )
  ) {
    return value;
  }

  return value
    .split(/(\s+)/)
    .map((part) => {
      if (!part.trim()) return part;

      return normalizeQuestionWord(part);
    })
    .join("");
}

function normalizeQuestionWord(value: string) {
  const match = value.match(/^([("'`]*)(.*?)([)"'`,.?;:!]*)$/);
  if (!match) return value.toLowerCase();

  const [, prefix, word, suffix] = match;
  if (!word) return value.toLowerCase();
  const preservedWord = getPreservedWord(word);

  if (preservedWord) {
    return `${prefix}${preservedWord}${suffix}`;
  }

  if (shouldPreserveWord(word)) return value;

  return `${prefix}${capitalizeFirst(word.toLowerCase())}${suffix}`;
}

function getPreservedWord(word: string) {
  const preservedWords = new Map(
    [
      ".NET",
      "API",
      "ASP.NET",
      "AWS",
      "CDN",
      "CPU",
      "CSS",
      "C#",
      "CPython",
      "Core",
      "DOM",
      "Django",
      "Docker",
      "Entity",
      "FastAPI",
      "Flask",
      "Framework",
      "GIL",
      "GraphQL",
      "HTML",
      "HTTP",
      "ISR",
      "JSON",
      "JWT",
      "Kafka",
      "JavaScript",
      "Kubernetes",
      "LINQ",
      "Module",
      "N+1",
      "Native",
      "Next.js",
      "Nginx",
      "NoSQL",
      "Node.js",
      "ORM",
      "OAuth",
      "Python",
      "React",
      "Redis",
      "Redux",
      "REST",
      "SQL",
      "SLI",
      "SLO",
      "SSG",
      "SSR",
      "TypeScript",
      "UI",
      "URL",
      "URLs",
      "UX",
      "Vite",
      "Webpack",
      "WebSocket",
      "p95",
      "p99",
    ].map((value) => [value.toLowerCase(), value]),
  );

  return preservedWords.get(word.toLowerCase());
}

function shouldPreserveWord(word: string) {
  return (
    word.includes("`") ||
    word.includes("/") ||
    /[.#]/.test(word) ||
    /^[A-Z0-9]{2,}$/.test(word) ||
    /[a-z][A-Z]/.test(word)
  );
}

function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
