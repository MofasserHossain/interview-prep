---
name: content-authoring-discipline
description: Keep interview-prep content structured, accurate, extensible, and easy for the app parser to consume.
---

# Content authoring discipline

**Intent:** When adding interview content, the agent MUST keep Markdown files
structured as reusable app data, not one-off notes.

**Evidence:** The agent SHOULD inspect the target topic file, `lib/topics.ts`,
existing heading style, existing examples, and whether the new content overlaps
with another topic before editing.

**Decision:** The agent SHOULD decide whether to extend an existing topic,
create a new topic file, or add planning documentation under `docs/`.

**Execution:** The agent SHOULD use numbered `##` question headings, detailed
answers, examples, tradeoffs, and tags that can be inferred from the content.

**Recovery:** If source material is incomplete or uncertain, the agent SHOULD
mark the content as a starter guide or ask for source material before writing
high-confidence answers.

**Failure modes:** The agent SHOULD NOT hard-code interview questions in React
components, mix unrelated domains in one large file, or create headings that
the parser cannot recognize.
