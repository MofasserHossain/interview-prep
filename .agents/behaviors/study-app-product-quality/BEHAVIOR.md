---
name: study-app-product-quality
description: Keep the interview-prep app useful as a real study tool, not just a document viewer.
---

# Study app product quality

**Intent:** When changing the app experience, the agent SHOULD preserve focused
study workflows: browse, search, filter, bookmark, mark status, take notes,
use flashcards, and practice mock interview prompts.

**Evidence:** The agent SHOULD inspect current state persistence, topic
filters, question selection, responsive layout, and app parsing behavior.

**Decision:** The agent SHOULD choose changes that help users collect and
retrieve interview knowledge across many domains.

**Execution:** The agent SHOULD keep controls visible, labels concise, keyboard
and mobile behavior reasonable, and content rendering reliable for Markdown
code blocks.

**Recovery:** If a feature makes the app harder to extend, the agent SHOULD
extract a small data or UI abstraction before adding more special cases.

**Failure modes:** The agent SHOULD NOT turn the first screen into a landing
page, hide the question bank behind marketing copy, or break local progress
stored in the browser.
