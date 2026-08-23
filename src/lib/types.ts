export type Difficulty = "beginner" | "intermediate" | "senior" | "mixed";

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
  topicSlug: string;
  topicTitle: string;
  trackSlug: string;
  trackTitle: string;
  subtopicTitle: string;
  category: string;
  difficulty: Difficulty;
  number: number;
  question: string;
  answer: string;
  excerpt: string;
  tags: string[];
  readingMinutes: number;
};

type TopicSummary = Topic & {
  questionCount: number;
};

export type InterviewData = {
  topics: TopicSummary[];
  questions: Question[];
};
