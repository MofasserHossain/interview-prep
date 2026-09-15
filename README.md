# Interview Prep App

A Next.js interview-preparation docs library backed by Markdown content.

The app helps collect, search, filter, and read interview questions across
backend, frontend, JavaScript, React, system design, DevOps, mobile, and
framework-specific topics. Topics are grouped into tracks and subtopics so areas
like React can contain multiple focused documents such as basics, performance
optimization, and machine-coding practice.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS v4
- shadcn-compatible component setup
- lucide-react icons
- Markdown rendering with `react-markdown` and `remark-gfm`
- Oxlint for linting
- oxfmt for formatting
- Knip for dead-code and dependency checks

## Project Structure

```txt
src/app/                 Next.js routes and global styles
src/components/          App UI and shadcn components
src/lib/                 Content parser, topic registry, shared types
content/interview/       Markdown interview guides
docs/                    Authoring guidance and roadmap
.agents/                 Agent behavior guidance
AGENTS.md                Repository guidance for coding agents
CLAUDE.md                Symlink to AGENTS.md
```

## Current Tracks And Subtopics

- Backend: Fundamentals & APIs, API Optimization & Database Performance
- Node.js: Fundamentals, Modules & APIs, Event Loop & Async Runtime
- JavaScript: Language Fundamentals, Modules, Import & Export, Promises & Async, Event Loop & Runtime, this & Functions, Prototypes & Objects, Map, Object & Set, Loops & Array Methods, Scope, Hoisting & Closures, Types, Equality & Copying
- React: Basics & Next.js, Performance Optimization, Machine Coding Practice
- System Design: Microservices & Scalability
- DevOps & Infrastructure: Docker & Kubernetes, Nginx & Web
- .NET & C#: C# & ASP.NET Core
- Python: Backend Frameworks
- Mobile: React Native
- Frontend Architecture: Micro Frontends

## Run Locally

```bash
npm install
npm run dev
```

Open:

```txt
http://localhost:3000
```

## Quality Checks

```bash
npm run typecheck
npm run lint
npm run knip
npm run format:check
npm run build
```

Combined check:

```bash
npm run check
```

Format files:

```bash
npm run format
```

## Adding A Topic

1. Add a Markdown file under `content/interview/`.
2. Use numbered `##` headings. Each one becomes a readable section.
3. Register the file in `src/lib/topics.ts` with track and subtopic metadata.
4. Run `npm run check` and `npm run build`.

Example:

```md
# Docker Interview Guide

Docker interview guidance covering images, containers, volumes, networks,
Compose, and production tradeoffs.

## 1. What Is Docker?

Answer with definition, value, example, and tradeoffs.
```

For deeper topics, prefer this structure:

1. Define the concept.
2. Explain when to use it.
3. Compare it with the traditional or alternative approach.
4. Show code.
5. Show expected output.
6. Add interview notes and common traps.

More guidance is in [docs/topic-authoring.md](docs/topic-authoring.md).

## Sources Used For Initial Content

- <https://roadmap.sh/questions/backend>
- <https://github.com/arialdomartini/Back-End-Developer-Interview-Questions>
- <https://www.indeed.com/career-advice/interviewing/back-end-interview-questions>
- <https://www.linkedin.com/pulse/possible-interview-questions-senior-backend-developer-anthony-miracho-iuvzf/>
- <https://internshala.com/blog/backend-developer-interview-questions/>
- <https://www.founditgulf.com/career-advice/react-nextjs-interview-questions-answers/>
- <https://www.geeksforgeeks.org/javascript/javascript-interview-questions/>
- <https://www.geeksforgeeks.org/interview-prep/backend-developer-interview-questions-and-answers/>
- <https://react.dev/learn/react-compiler>
- <https://react.dev/reference/react/memo>
- <https://react.dev/reference/react/useMemo>
- <https://react.dev/reference/react/useCallback>
- <https://react.dev/reference/react/useTransition>
- <https://react.dev/reference/react/useDeferredValue>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model>
- <https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide>
- <https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide/In_depth>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Inheritance_and_the_prototype_chain>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze>
- <https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick>
- <https://expressjs.com/en/guide/using-middleware/>
- <https://redis.io/docs/latest/develop/>
- <https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API>
- <https://docs.docker.com/guides/nodejs/>
- <https://www.rabbitmq.com/tutorials/tutorial-two-javascript>
- <https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html>

The Medium article shared earlier was blocked, so it was used only as a topic
signal, not as a detailed answer source.
