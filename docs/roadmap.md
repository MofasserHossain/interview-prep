# Interview Prep Platform Roadmap

## Current App

- Markdown-powered interview docs library
- Sidebar menu and submenu navigation
- Difficulty filters
- Full-text search over questions and answers
- Reading-focused answer view with code-block rendering
- Backend submenus for fundamentals and API/database performance
- Databases track covering database fundamentals, SQL fundamentals,
  EXPLAIN-driven query optimization, and SQL practice problems; PostgreSQL
  essentials and internals/performance; and MongoDB basics, the aggregation
  pipeline stage by stage, indexing and performance, and advanced topics
  (replication, sharding, transactions, change streams, schema patterns) —
  with every example output produced by running it on PostgreSQL 17 or
  MongoDB 8.2
- Node.js submenus for fundamentals/modules/APIs, event loop/runtime,
  streams/buffers/workers, and NestJS
- React topics grouped under multiple subtopics, including basics, core concepts,
  React 18/19, the compiler, internals and Fiber, performance, bundle
  optimization, data fetching and server state, forms and validation, testing,
  accessibility, senior scenarios, a senior drill round, and machine-coding
  practice
- Next.js track with 13 subtopics covering the App Router, routing, Server and
  Client Components, data and forms, rendering and Cache Components, error
  handling, metadata, styling, optimization, security, Proxy and observability,
  deployment, and tooling — written against the installed Next.js 16 by reading
  the docs vendored in `node_modules/next/dist/docs/`
- Browser & Web Platform track covering page load and rendering, CSS and layout,
  and DOM/events/browser APIs
- System Design messaging topics cover Kafka, RabbitMQ, and MQTT with broker,
  queue, stream, delivery, retry, and operations concepts
- JavaScript submenus split into language fundamentals, modules/import/export,
  promises and async, event loop/runtime, `this` and functions, prototypes and
  objects, map/object/set, loops/array methods, scope/hoisting/closures,
  types/equality/copying, execution context/lexical environment, and
  code practice/output questions

## Next Content Areas

1. TypeScript language fundamentals as its own topic
2. Data structures and algorithms
3. A Redis and caching guide extending the Databases track
4. Web security as its own topic, plus framework-agnostic testing fundamentals
   (React testing and accessibility now live in the React track)
5. AI backend engineering and LLM application architecture
6. Advanced system design case studies
7. Cloud-native deployment and incident response scenarios

## Later App Features

- Import Markdown from the UI
- Export selected sections as Markdown or JSON
- AI-generated reading guides and follow-up questions
- Difficulty calibration by topic
- Question source attribution
- Multi-user sync with authentication
- Admin editor for adding topics
- Topic dependency graph
