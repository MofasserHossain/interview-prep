type SectionKind = "question" | "prose";

export type Topic = {
  slug: string;
  title: string;
  category: string;
  trackSlug: string;
  trackTitle: string;
  subtopicTitle: string;
  description: string;
  file: string;
};

export type Question = {
  id: string;
  kind: SectionKind;
  topicSlug: string;
  topicTitle: string;
  trackSlug: string;
  trackTitle: string;
  subtopicTitle: string;
  category: string;
  number: number;
  question: string;
  answer: string;
  tags: string[];
  readingMinutes: number;
};

export type TopicSummary = Topic & {
  questionCount: number;
  readingMinutes: number;
};

/** What the table of contents and scroll tracking need from a section. */
export type TocEntry = Pick<Question, "id" | "kind" | "question">;

/**
 * The search index the browser downloads when the search opens: topic and
 * section titles only, no answer text. `topic` indexes into `topics`.
 */
export type SearchIndex = {
  topics: { description: string; slug: string; title: string; track: string }[];
  sections: { id: string; title: string; topic: number }[];
};
