import { useEffect, useState } from "react";
import type { Question } from "@/lib/types";

/** Whether a section matches a trimmed, lowercased search query. */
export function matchesQuery(section: Question, normalizedQuery: string) {
  return [
    section.question,
    section.answer,
    section.topicTitle,
    section.trackTitle,
    section.subtopicTitle,
    section.category,
    section.tags.join(" "),
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

const requests = new Map<string, Promise<Question[]>>();

/**
 * Fetches the sections search runs over: one topic's, or every topic's when no
 * slug is given. Pages do not embed them, so only readers who search download
 * them, once per visit. A failed request is retried on the next call.
 */
export function loadSearchSections(topicSlug?: string) {
  const url = topicSlug ? `/search-index/${topicSlug}` : "/search-index";
  let request = requests.get(url);

  if (!request) {
    request = fetch(url).then((response) => {
      if (!response.ok) {
        throw new Error(`Search index request failed with ${response.status}`);
      }

      return response.json() as Promise<Question[]>;
    });
    request.catch(() => requests.delete(url));
    requests.set(url, request);
  }

  return request;
}

/** The sections to search, requested once the query is non-empty. */
export function useSearchSections(topicSlug: string | undefined, normalizedQuery: string) {
  const [sections, setSections] = useState<Question[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!normalizedQuery || sections) return;

    let active = true;

    loadSearchSections(topicSlug).then(
      (loaded) => {
        if (!active) return;
        setSections(loaded);
        setFailed(false);
      },
      () => {
        if (active) setFailed(true);
      },
    );

    return () => {
      active = false;
    };
  }, [normalizedQuery, sections, topicSlug]);

  return { failed, sections };
}
