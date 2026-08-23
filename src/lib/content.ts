import fs from "node:fs";
import path from "node:path";
import { topics, getDifficulty } from "@/lib/topics";
import type { InterviewData, Question, Topic } from "@/lib/types";

const contentDirectory = path.join(process.cwd(), "content", "interview");

const keywordTags = [
  "api",
  "apply",
  "async",
  "auth",
  "bind",
  "call",
  "call stack",
  "cache",
  "closure",
  "coercion",
  "compiler",
  "concurrency",
  "context",
  "database",
  "debounce",
  "deployment",
  "docker",
  "event loop",
  "equality",
  "hooks",
  "hoisting",
  "http",
  "hydration",
  "indexing",
  "iteration",
  "jwt",
  "lazy",
  "map",
  "microtask",
  "memo",
  "middleware",
  "microservice",
  "mvc",
  "next.js",
  "node.js",
  "performance",
  "promise",
  "prototype",
  "queue",
  "rabbitmq",
  "react",
  "reduce",
  "redis",
  "rest",
  "security",
  "set",
  "scope",
  "ssr",
  "task queue",
  "tdz",
  "throttle",
  "virtualization",
  "web api",
  "weakmap",
  "websocket",
];

export function getInterviewData(): InterviewData {
  const questions = topics.flatMap((topic) => parseTopic(topic));
  const summaries = topics.map((topic) => ({
    ...topic,
    questionCount: questions.filter((question) => question.topicSlug === topic.slug).length,
  }));

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
    .map((part, index) => {
      if (!part.trim()) return part;
      if (index === 0) return capitalizeFirst(part.toLowerCase());

      return normalizeQuestionWord(part);
    })
    .join("");
}

function normalizeQuestionWord(value: string) {
  const match = value.match(/^([("'`]*)(.*?)([)"'`,.?;:!]*)$/);
  if (!match) return value.toLowerCase();

  const [, prefix, word, suffix] = match;
  if (!word) return value.toLowerCase();
  if (shouldPreserveWord(word)) return value;

  return `${prefix}${word.toLowerCase()}${suffix}`;
}

function shouldPreserveWord(word: string) {
  const preservedWords = new Set([
    ".NET",
    "API",
    "ASP.NET",
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
    "HTML",
    "HTTP",
    "ISR",
    "JWT",
    "JavaScript",
    "Kubernetes",
    "LINQ",
    "Native",
    "Next.js",
    "Nginx",
    "Node.js",
    "ORM",
    "Python",
    "React",
    "Redis",
    "REST",
    "SQL",
    "SSG",
    "SSR",
    "TypeScript",
    "WebSocket",
  ]);

  return (
    preservedWords.has(word) ||
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
