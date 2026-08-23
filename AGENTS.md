# AGENTS.md

This is the permanent engineering guide for agents working in this repository.
It keeps the interview-prep platform consistent as more topics, docs, and app
features are added.

## Product Intent

This project is a content-driven interview preparation app. It should help a
developer collect, organize, search, review, and practice interview questions
across many domains:

- JavaScript, TypeScript, frontend, React, Next.js, React performance
- backend fundamentals, system design, microservices, APIs, databases
- DevOps, Docker, Kubernetes, Nginx, CI/CD, observability
- .NET, C#, Python, backend frameworks
- mobile development, React Native, cross-platform app architecture

The content source is Markdown under `content/interview/`. The Next.js app
parses those docs and turns numbered `##` sections into questions.

## Architecture

- `src/app/` contains the Next.js App Router shell.
- `src/components/` contains reusable UI and feature components.
- `src/components/ui/` is managed by shadcn. Keep local wrappers compatible with
  shadcn conventions.
- `content/interview/` contains topic Markdown files.
- `docs/` contains project guidance, authoring rules, and topic planning.
- `src/lib/content.ts` parses Markdown into app data.
- `src/lib/topics.ts` is the topic registry. Add new content files there.
- `.conductor/` contains setup, run, check, build, and archive commands for
  parallel Conductor workspaces.

## Adding A New Topic

1. Create a Markdown file in `content/interview/`.
2. Use this shape:

   ```md
   # Topic Interview Guide

   Short topic overview.

   ## 1. What Is The Concept?

   Detailed answer with examples.

   ## 2. How Would You Use It In A Real Project?

   Detailed answer with tradeoffs.
   ```

3. Register the file in `src/lib/topics.ts`.
4. Assign a clear category, slug, description, and accent color.
5. Run `npm run check` and `npm run build`.

Do not hard-code questions inside React components. Content belongs in
Markdown unless the feature is truly app behavior.

## Content Quality

Every answer should follow this flow:

1. Define the concept.
2. Explain why it matters.
3. Give a practical example.
4. Mention tradeoffs or failure cases.
5. Add interview-level phrasing where useful.

Prefer accurate, maintainable answers over very long answers. Use code blocks
only when they clarify the concept.

## UI Standards

- Build the actual question-bank workflow first, not a marketing landing page.
- Keep the interface dense, scannable, and useful for repeated study.
- Use shadcn/Tailwind-compatible patterns for new UI.
- Use lucide icons for actions and navigation.
- Keep cards to individual items, panels, and study surfaces.
- Preserve mobile usability. Text must not overlap or overflow controls.

## Quality Gates

Run these before handing off changes:

```bash
npm run typecheck
npm run lint
npm run knip
npm run build
```

Use `npm run format` for code formatting and `npm run format:check` in review.

## Conductor Workflow

Use the `.conductor` scripts:

- setup: `bash ./.conductor/setup.sh`
- web: `bash ./.conductor/run.sh web`
- check: `bash ./.conductor/run.sh check`
- build: `bash ./.conductor/run.sh build`
- archive: `bash ./.conductor/archive.sh`

The run script uses `CONDUCTOR_PORT` when available so multiple workspaces can
run side by side.

## Editing Rules

- Preserve user-authored Markdown content.
- Avoid broad rewrites of existing guides unless the user asks for cleanup.
- Keep new abstractions small and tied to real app needs.
- If adding generated indexes later, document the generation command here.
- Do not commit secrets or local `.env` files.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
