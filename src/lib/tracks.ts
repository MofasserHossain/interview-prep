import type { InterviewData, Topic } from "@/lib/types";

export type TopicSummary = InterviewData["topics"][number];

export type TrackSummary = {
  slug: string;
  title: string;
  questionCount: number;
  readingMinutes: number;
  topics: TopicSummary[];
};

// Sidebar order, read as a learning path: the frontend run first, then the
// backend run, then platform and other languages. Keep `@/lib/topics` grouped
// the same way so the registry matches what the menu shows.
const trackOrder = [
  // Frontend path
  "browser",
  "networking",
  "javascript",
  "react",
  "nextjs",
  "frontend-architecture",
  "react-native",
  "ai-engineering",
  // Backend path
  "backend",
  "nodejs",
  "nestjs",
  "databases",
  // Platform
  "system-design",
  "devops",
  // Other languages
  "dotnet",
  "python",
  // Meta
  "interview-prep",
];

// Unlisted tracks sort to the end rather than the top, so a new track added to
// the registry but forgotten here does not take over the menu.
function trackRank(slug: string) {
  const index = trackOrder.indexOf(slug);

  return index === -1 ? trackOrder.length : index;
}

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
    (first, second) => trackRank(first.slug) - trackRank(second.slug),
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
    (first, second) => trackRank(first.slug) - trackRank(second.slug),
  );
}
