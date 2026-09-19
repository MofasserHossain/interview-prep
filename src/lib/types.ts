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

type TopicSummary = Topic & {
  questionCount: number;
  readingMinutes: number;
};

export type InterviewData = {
  topics: TopicSummary[];
  questions: Question[];
};
