# Topic Authoring Guide

Use this when adding interview topics such as DevOps, Docker, Kubernetes,
Nginx, .NET, C#, Python, Django, FastAPI, React Native, system design,
microservices, or micro frontends.

## File Location

Put topic files in a folder named after the sidebar track:

```txt
content/<track>/<name>.md
```

For example `content/nextjs/routing-navigation.md`. The track folder must match
the topic's `trackSlug`, and the folder is created on the first topic that
needs it.

Register each file in:

```txt
src/lib/topics.ts
```

Each topic must include track metadata. The track is the left-sidebar parent
menu, and the subtopic is the nested submenu item inside that parent.

Every topic also needs an icon entry, and every **new** track needs two more
edits. Missing either fails quietly rather than loudly:

| Edit               | File                            | If you forget                                                            |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------ |
| `topicIcons` entry | `src/components/topic-icon.tsx` | the topic renders the generic `Library` icon                             |
| `trackIcons` entry | `src/components/topic-icon.tsx` | the track renders the generic `Library` icon                             |
| `trackOrder` entry | `src/lib/tracks.ts`             | `indexOf` returns `-1` and the track jumps to the **top** of the sidebar |

A missing Markdown file is the one loud failure: `parseTopic` reads it with an
unguarded `fs.readFileSync`, so the build and `next dev` throw `ENOENT`. Register
a topic and create its file in the same change.

```ts
{
  slug: "react-performance",
  title: "React Performance",
  category: "React Performance",
  trackSlug: "react",
  trackTitle: "React",
  subtopicTitle: "Performance Optimization",
  description: "Re-renders, memoization, virtualization, and concurrency.",
  file: "react-performance-interview-guide.md",
}
```

## Markdown Shape

Each numbered `##` heading becomes one question in the app.

```md
# Docker Interview Guide

Docker interview guidance covering images, containers, volumes, networks,
Compose, registries, and production tradeoffs.

## 1. What Is Docker?

Answer with definition, real project value, example, and tradeoffs.

## 2. What Is The Difference Between An Image And A Container?

Answer with a practical example.
```

## Answer Quality

Use this structure:

1. Define the concept.
2. Explain why it matters.
3. Explain when to use it over traditional or alternative approaches.
4. Show code.
5. Show expected output when the code is meant to teach behavior.
6. Mention tradeoffs, edge cases, or production concerns.
7. Add a short strong interview answer when useful.

For example, a Promise topic should cover:

- what the method does
- when to use it
- why it is better than sequential `await`, nested callbacks, or another Promise helper in that situation
- code with output
- failure behavior and interview traps

## Numbering And Structure Rules

These are enforced by the parser in `src/lib/content.ts`, not by convention:

- Only `##` creates a section. `#` is the title; no file uses `###`.
- A numbered heading must match `## <digits>. <text>` exactly — digits, a
  literal period, then a space. Numbering runs contiguously from 1, because the
  number becomes the section's zero-padded id.
- A non-numbered `##` becomes a `prose` section and still renders as a card.
- `## Sources Used` is the only heading stripped from the output.
- No YAML frontmatter.

Study callout labels such as `Tradeoff:` or `When to use it:` must be a short
standalone paragraph. `findStudyBlock` ignores anything longer than 35
characters, so an inline `Tradeoff: ...` sentence renders as ordinary text.

## Suggested Future Topic Files

The earlier list here has been fully written. Current gaps, roughly in priority
order:

- `typescript-language-fundamentals-guide.md` — generics, utility types,
  `unknown` vs `any` vs `never`, narrowing, discriminated unions
- `mongodb-nosql-guide.md` — documents, aggregation, indexing (extends the
  Databases track)
- `redis-caching-guide.md` — data types, eviction, caching patterns
- `testing-fundamentals-guide.md` — unit, integration, end-to-end, test doubles
- `web-security-guide.md` — XSS, CSRF, CORS, CSP, secure headers
- `accessibility-guide.md` — semantics, ARIA, keyboard, screen readers
- `data-structures-algorithms-guide.md` — the roadmap's outstanding item
