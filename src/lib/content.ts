import fs from "node:fs";
import path from "node:path";
import { topics, getDifficulty } from "@/lib/topics";
import type { InterviewData, Question, Topic } from "@/lib/types";

const contentDirectory = path.join(process.cwd(), "content", "interview");

const keywordTags = [
  "actions",
  "api",
  "apply",
  "array",
  "async",
  "auth",
  "aws",
  "bind",
  "blue-green",
  "bundle",
  "call",
  "call stack",
  "cache",
  "canary",
  "ci/cd",
  "closure",
  "coercion",
  "compiler",
  "component",
  "composition",
  "concurrency",
  "context",
  "controlled",
  "database",
  "debounce",
  "deployment",
  "design pattern",
  "docker",
  "event loop",
  "equality",
  "explain",
  "external store",
  "effect",
  "error boundary",
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
  "jwt",
  "kafka",
  "kubernetes",
  "lazy",
  "map",
  "microtask",
  "memo",
  "middleware",
  "microservice",
  "module federation",
  "mvc",
  "mysql",
  "next.js",
  "node.js",
  "observability",
  "optimistic",
  "performance",
  "php",
  "portal",
  "promise",
  "prototype",
  "queue",
  "rabbitmq",
  "react",
  "reconciliation",
  "reducer",
  "reduce",
  "render props",
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
  "singleton",
  "ssr",
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
  "tree shaking",
  "virtualization",
  "web api",
  "webpack",
  "weakmap",
  "websocket",
];

export function getInterviewData(): InterviewData {
  const questions = topics.flatMap((topic) => parseTopic(topic));
  const summaries = topics.map((topic) => {
    const topicQuestions = questions.filter((question) => question.topicSlug === topic.slug);

    return {
      ...topic,
      questionCount: topicQuestions.length,
      readingMinutes: topicQuestions.reduce(
        (total, question) => total + question.readingMinutes,
        0,
      ),
    };
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
  const questions: Question[] = [];

  headings.forEach((heading, index) => {
    const title = heading[1].trim();
    const questionMatch = title.match(/^(\d+)\.\s+(.+)$/);

    if (!questionMatch) return;

    const number = Number(questionMatch[1]);
    const question = normalizeQuestionTitle(questionMatch[2].trim());
    const start = heading.index! + heading[0].length;
    const nextHeading = headings[index + 1];
    const end = nextHeading?.index ?? markdown.length;
    const answer = cleanAnswer(markdown.slice(start, end));

    questions.push({
      id: `${topic.slug}-${String(number).padStart(3, "0")}`,
      topicSlug: topic.slug,
      topicTitle: topic.title,
      trackSlug: topic.trackSlug,
      trackTitle: topic.trackTitle,
      subtopicTitle: topic.subtopicTitle,
      category: topic.category,
      difficulty: getDifficulty(topic.slug, number),
      number,
      question,
      answer,
      excerpt: getExcerpt(answer),
      tags: getTags(`${question} ${answer}`, topic),
      readingMinutes: getReadingMinutes(answer),
    });
  });

  return questions;
}

function cleanAnswer(value: string) {
  return value
    .replace(/\n-{3,}\s*$/g, "")
    .replace(/\n##\s+Sources Used[\s\S]*$/g, "")
    .trim();
}

function getExcerpt(answer: string) {
  return answer
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 190);
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
