import type { SearchIndex } from "@/lib/types";

type SearchTopic = SearchIndex["topics"][number];
type SearchSection = SearchIndex["sections"][number];

export type SearchResultGroup = {
  sections: SearchSection[];
  topic: SearchTopic;
};

const maxGroups = 6;
const maxSectionsPerGroup = 5;

let request: Promise<SearchIndex> | undefined;

/** Fetches the search index once per visit; a failed request is retried on the next call. */
export function loadSearchIndex() {
  request ??= fetch("/search-index")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Search index request failed with ${response.status}`);
      }

      return response.json() as Promise<SearchIndex>;
    })
    .catch((error: unknown) => {
      request = undefined;
      throw error;
    });

  return request;
}

/** Lowercased query words, without the backticks titles use for code. */
export function getSearchTerms(query: string) {
  return normalize(query).split(/\s+/).filter(Boolean);
}

/**
 * Matches every query word against topic and section titles and groups the
 * hits by topic, best first. A section must match at least one word in its
 * own title; the other words may match its topic or track name, so
 * "react memo" finds memo questions in React topics. A topic that matches by
 * name is listed even when none of its sections do.
 */
export function searchDocs(index: SearchIndex, query: string): SearchResultGroup[] {
  const terms = getSearchTerms(query);

  if (!terms.length) return [];

  const phrase = terms.join(" ");
  const topicNames = index.topics.map((topic) => normalize(`${topic.title} ${topic.track}`));
  const groups = new Map<
    number,
    { score: number; sections: { score: number; section: SearchSection }[] }
  >();

  index.topics.forEach((topic, topicIndex) => {
    const name = topicNames[topicIndex];
    const description = normalize(topic.description);
    const score = scoreAllTerms(
      terms,
      (term) => termScore(name, term, 12) || termScore(description, term, 3),
    );

    if (score) {
      groups.set(topicIndex, { score: score + (name.includes(phrase) ? 20 : 0), sections: [] });
    }
  });

  for (const section of index.sections) {
    const title = normalize(section.title);

    if (!terms.some((term) => title.includes(term))) continue;

    const name = topicNames[section.topic];
    const score = scoreAllTerms(
      terms,
      (term) => termScore(title, term, 10) || termScore(name, term, 2),
    );

    if (!score) continue;

    const group = groups.get(section.topic) ?? { score: 0, sections: [] };
    const sectionScore = score + (title.includes(phrase) ? 15 : 0);

    group.score = Math.max(group.score, sectionScore);
    group.sections.push({ score: sectionScore, section });
    groups.set(section.topic, group);
  }

  // `sort` on copies rather than `toSorted`: Next.js supports Firefox 111+,
  // and `toSorted` arrived in Firefox 115.
  const ranked = [...groups];
  // oxlint-disable-next-line unicorn/no-array-sort
  ranked.sort(
    ([firstIndex, first], [secondIndex, second]) =>
      second.score - first.score || firstIndex - secondIndex,
  );

  return ranked.slice(0, maxGroups).map(([topicIndex, group]) => {
    const sections = [...group.sections];
    // oxlint-disable-next-line unicorn/no-array-sort
    sections.sort((first, second) => second.score - first.score);

    return {
      topic: index.topics[topicIndex],
      sections: sections.slice(0, maxSectionsPerGroup).map(({ section }) => section),
    };
  });
}

function normalize(value: string) {
  return value.toLowerCase().replaceAll("`", "");
}

/** The summed score when every term scores, otherwise 0. */
function scoreAllTerms(terms: string[], scoreTerm: (term: string) => number) {
  let total = 0;

  for (const term of terms) {
    const score = scoreTerm(term);

    if (!score) return 0;
    total += score;
  }

  return total;
}

/** `weight` for a match, half again when the match starts a word. */
function termScore(text: string, term: string, weight: number) {
  const at = text.indexOf(term);

  if (at === -1) return 0;

  return at === 0 || !/[a-z0-9]/.test(text[at - 1]) ? weight * 1.5 : weight;
}
