import type { InterviewData, Topic } from "@/lib/types";

export type TopicSummary = InterviewData["topics"][number];

export type TrackSummary = {
  slug: string;
  title: string;
  questionCount: number;
  readingMinutes: number;
  topics: TopicSummary[];
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

export function buildTrackSummaries(topics: TopicSummary[]) {
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

  return Array.from(byTrack.values()).toSorted(
    (first, second) => trackOrder.indexOf(first.slug) - trackOrder.indexOf(second.slug),
  );
}

export function groupTopicsByTrack(topics: Topic[]) {
  const byTrack = new Map<string, { slug: string; title: string; topics: Topic[] }>();

  topics.forEach((topic) => {
    const current = byTrack.get(topic.trackSlug) ?? {
      slug: topic.trackSlug,
      title: topic.trackTitle,
      topics: [],
    };

    current.topics.push(topic);
    byTrack.set(topic.trackSlug, current);
  });

  return Array.from(byTrack.values()).toSorted(
    (first, second) => trackOrder.indexOf(first.slug) - trackOrder.indexOf(second.slug),
  );
}
