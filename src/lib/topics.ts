import type { Topic } from "@/lib/types";

// Topics are grouped by track in the same order as `trackOrder` in `@/lib/tracks`,
// and within each track they run fundamentals first. Array position is what the
// sidebar, the overview index, and prev/next pagination use, so keep blocks intact.
export const topics: Topic[] = [
  // Browser & Web Platform
  {
    slug: "browser-page-load-rendering",
    title: "Browser Page Load & Rendering",
    category: "Browser",
    trackSlug: "browser",
    trackTitle: "Browser & Web Platform",
    subtopicTitle: "Page Load & Rendering",
    description:
      "Navigation, DNS, TLS, HTTP responses, MIME types, HTML parsing, CSSOM, render tree, layout, paint, compositing, script loading, and Core Web Vitals.",
    file: "browser-page-load-rendering-guide.md",
  },
  {
    slug: "css-fundamentals-layout",
    title: "CSS Fundamentals & Layout",
    category: "CSS",
    trackSlug: "browser",
    trackTitle: "Browser & Web Platform",
    subtopicTitle: "CSS & Layout",
    description:
      "Cascade, specificity, inheritance, box model, positioning, stacking contexts, flexbox, grid, units, media and container queries, custom properties, and paint cost.",
    file: "css-fundamentals-layout-guide.md",
  },
  {
    slug: "dom-events-browser-apis",
    title: "DOM, Events & Browser APIs",
    category: "Browser",
    trackSlug: "browser",
    trackTitle: "Browser & Web Platform",
    subtopicTitle: "DOM, Events & Browser APIs",
    description:
      "DOM traversal and updates, event capture and bubbling, delegation, custom events, storage options, observers, fetch with AbortController, and frame scheduling.",
    file: "dom-events-browser-apis-guide.md",
  },

  // Networking
  {
    slug: "networking-fundamentals",
    title: "Networking Fundamentals",
    category: "Networking",
    trackSlug: "networking",
    trackTitle: "Networking",
    subtopicTitle: "Networking Fundamentals",
    description:
      "OSI and TCP/IP models, IP addresses, ports, TCP vs UDP, the handshake, sockets, DNS resolution, NAT, latency vs bandwidth, proxies, load balancing, CDNs, firewalls, and command-line diagnosis.",
    file: "networking-fundamentals-guide.md",
  },
  {
    slug: "http-tls-protocols",
    title: "HTTP, TLS & Web Protocols",
    category: "Networking",
    trackSlug: "networking",
    trackTitle: "Networking",
    subtopicTitle: "HTTP, TLS & Web Protocols",
    description:
      "Request anatomy, methods, idempotency, status codes, headers, the TLS handshake, certificates, HTTP/1.1 vs 2 vs 3, caching, cookies, CORS, compression, REST vs GraphQL vs gRPC, realtime transports, security headers, and idempotency keys.",
    file: "http-tls-protocols-guide.md",
  },

  // JavaScript
  {
    slug: "javascript",
    title: "JavaScript",
    category: "JavaScript",
    trackSlug: "javascript",
    trackTitle: "JavaScript",
    subtopicTitle: "Language Fundamentals",
    description:
      "Core language questions, utilities, polyfills, async basics, and coding problems.",
    file: "javascript-interview-guide.md",
  },
  {
    slug: "javascript-types-equality-copying",
    title: "JavaScript Types, Equality & Copying",
    category: "JavaScript",
    trackSlug: "javascript",
    trackTitle: "JavaScript",
    subtopicTitle: "Types, Equality & Copying",
    description:
      "Primitive vs reference values, equality, Object.is, nullish values, shallow/deep copy, optional chaining, and array methods.",
    file: "javascript-types-equality-copying-guide.md",
  },
  {
    slug: "javascript-loops-array-methods",
    title: "JavaScript Loops & Array Methods",
    category: "JavaScript",
    trackSlug: "javascript",
    trackTitle: "JavaScript",
    subtopicTitle: "Loops & Array Methods",
    description:
      "for loops, for...of, for...in, forEach, map, filter, find, reduce, some/every, sort, slice/splice, flat/flatMap, and mutation behavior.",
    file: "javascript-loops-array-methods-guide.md",
  },
  {
    slug: "javascript-collections-iteration",
    title: "JavaScript Map, Object & Set",
    category: "JavaScript",
    trackSlug: "javascript",
    trackTitle: "JavaScript",
    subtopicTitle: "Map, Object & Set",
    description:
      "Map vs Object, Object.create(null), WeakMap, Set, WeakSet, object key helpers, freeze/seal, and object merging.",
    file: "javascript-collections-iteration-guide.md",
  },
  {
    slug: "javascript-execution-context",
    title: "JavaScript Execution Context",
    category: "JavaScript",
    trackSlug: "javascript",
    trackTitle: "JavaScript",
    subtopicTitle: "Execution Context & Lexical Environment",
    description:
      "Execution contexts, creation and execution phases, lexical environments, environment records, scope chain resolution, the call stack, this binding, and multi-script execution.",
    file: "javascript-execution-context-guide.md",
  },
  {
    slug: "javascript-scope-hoisting-closures",
    title: "JavaScript Scope, Hoisting & Closures",
    category: "JavaScript",
    trackSlug: "javascript",
    trackTitle: "JavaScript",
    subtopicTitle: "Scope, Hoisting & Closures",
    description:
      "Lexical scope, hoisting, temporal dead zone, closures, var loop traps, object state, and module scope.",
    file: "javascript-scope-hoisting-closures-guide.md",
  },
  {
    slug: "javascript-this-functions",
    title: "JavaScript this & Functions",
    category: "JavaScript",
    trackSlug: "javascript",
    trackTitle: "JavaScript",
    subtopicTitle: "this & Functions",
    description:
      "this binding, callback loss, arrow functions, call, apply, bind, partial application, and constructor behavior.",
    file: "javascript-this-functions-guide.md",
  },
  {
    slug: "javascript-prototypes-objects",
    title: "JavaScript Prototypes & Objects",
    category: "JavaScript",
    trackSlug: "javascript",
    trackTitle: "JavaScript",
    subtopicTitle: "Prototypes & Objects",
    description:
      "Objects, prototype chains, constructor prototypes, classes, property checks, shadowing, and prototype pollution.",
    file: "javascript-prototypes-objects-guide.md",
  },
  {
    slug: "javascript-modules-import-export",
    title: "JavaScript Modules",
    category: "JavaScript",
    trackSlug: "javascript",
    trackTitle: "JavaScript",
    subtopicTitle: "Modules, Import & Export",
    description:
      "ES modules, CommonJS comparison, import/export syntax, named and default exports, dynamic imports, module scope, and practical module decisions.",
    file: "javascript-modules-import-export-guide.md",
  },
  {
    slug: "javascript-promises-async",
    title: "JavaScript Promises & Async",
    category: "JavaScript",
    trackSlug: "javascript",
    trackTitle: "JavaScript",
    subtopicTitle: "Promises & Async",
    description:
      "Promise states, then/catch/finally, async/await, Promise.all, allSettled, any, race, timeouts, and tradeoffs.",
    file: "javascript-promises-async-guide.md",
  },
  {
    slug: "javascript-event-loop-runtime",
    title: "JavaScript Event Loop & Runtime",
    category: "JavaScript",
    trackSlug: "javascript",
    trackTitle: "JavaScript",
    subtopicTitle: "Event Loop & Runtime",
    description:
      "Runtime model, call stack, Web APIs, task queue, microtask queue, rendering priority, async/await timing, and output-order questions.",
    file: "javascript-event-loop-runtime-guide.md",
  },
  {
    slug: "javascript-performance-debugging",
    title: "JavaScript Performance & Debugging",
    category: "JavaScript",
    trackSlug: "javascript",
    trackTitle: "JavaScript",
    subtopicTitle: "Performance & Debugging",
    description:
      "Hidden classes and inline caches, deoptimization, array element kinds, V8 garbage collection, heap snapshots and memory leaks, CPU profiling in the browser and Node, long tasks, and bundle analysis.",
    file: "javascript-performance-debugging-guide.md",
  },
  {
    slug: "javascript-code-practice",
    title: "JavaScript Code Practice",
    category: "JavaScript",
    trackSlug: "javascript",
    trackTitle: "JavaScript",
    subtopicTitle: "Code Practice & Output Questions",
    description:
      "Predict-the-output drills across hoisting, closures, this, coercion, references, array method traps, async ordering, prototypes, and destructuring defaults.",
    file: "javascript-code-practice-guide.md",
  },

  // React
  {
    slug: "frontend-react-next",
    title: "React Basics",
    category: "React",
    trackSlug: "react",
    trackTitle: "React",
    subtopicTitle: "React Basics",
    description:
      "React fundamentals, props and state, reconciliation, render and commit phases, hook comparisons, error boundaries, list rendering, code splitting, and Next.js rendering basics.",
    file: "frontend-react-next-interview-guide.md",
  },
  {
    slug: "react-core-through-17",
    title: "React Core Concepts",
    category: "React Core",
    trackSlug: "react",
    trackTitle: "React",
    subtopicTitle: "Core Concepts Through 17",
    description:
      "Components, JSX, props, state, forms, lifecycle, composition, Context, refs, portals, error boundaries, HOCs, render props, and hooks.",
    file: "react-core-through-17-guide.md",
  },
  {
    slug: "react-18-features",
    title: "React 18 Features",
    category: "React 18",
    trackSlug: "react",
    trackTitle: "React",
    subtopicTitle: "React 18 Features",
    description:
      "Concurrent rendering, automatic batching, transitions, deferred values, Suspense streaming, and new root APIs.",
    file: "react-18-features-guide.md",
  },
  {
    slug: "react-19-features",
    title: "React 19 Features",
    category: "React 19",
    trackSlug: "react",
    trackTitle: "React",
    subtopicTitle: "React 19 Features",
    description:
      "Actions, form hooks, use, optimistic UI, Server Components, Server Functions, refs, metadata, assets, and React 19.2.",
    file: "react-19-features-guide.md",
  },
  {
    slug: "react-compiler",
    title: "React Compiler",
    category: "React Compiler",
    trackSlug: "react",
    trackTitle: "React",
    subtopicTitle: "React Compiler",
    description:
      "Automatic memoization, compiler-friendly code, lint feedback, Next.js setup, annotations, and gradual adoption.",
    file: "react-compiler-guide.md",
  },
  {
    slug: "typescript-react-architecture",
    title: "TypeScript & React Architecture",
    category: "TypeScript",
    trackSlug: "react",
    trackTitle: "React",
    subtopicTitle: "TypeScript Architecture",
    description:
      "Advanced TypeScript for React: DTOs, generics, discriminated unions, utility types, Redux Toolkit, component boundaries, and tests.",
    file: "typescript-react-architecture-guide.md",
  },
  {
    slug: "react-internals-fiber",
    title: "React Internals & Fiber",
    category: "React Core",
    trackSlug: "react",
    trackTitle: "React",
    subtopicTitle: "Internals & Fiber",
    description:
      "Render versus commit, why rendered work may never reach the DOM, Fiber and double buffering, lanes and scheduling, update queues, reconciliation, effect timing, hydration, and tearing.",
    file: "react-internals-fiber-guide.md",
  },
  {
    slug: "react-performance",
    title: "React Performance",
    category: "React Performance",
    trackSlug: "react",
    trackTitle: "React",
    subtopicTitle: "Performance Optimization",
    description:
      "Re-renders, memoization, debouncing, throttling, lazy loading, virtualization, concurrency, context, and stable keys.",
    file: "react-performance-interview-guide.md",
  },
  {
    slug: "react-bundle-optimization",
    title: "React Bundle Optimization",
    category: "React Bundle Optimization",
    trackSlug: "react",
    trackTitle: "React",
    subtopicTitle: "Bundle Optimization",
    description:
      "Bundle analysis, webpack, Vite, code splitting, dynamic imports, tree shaking, third-party dependencies, source maps, caching, and production builds.",
    file: "react-bundle-optimization-guide.md",
  },
  {
    slug: "senior-frontend-react-scenarios",
    title: "Senior Frontend Scenarios",
    category: "Senior Frontend",
    trackSlug: "react",
    trackTitle: "React",
    subtopicTitle: "Senior Frontend Scenarios",
    description:
      "Scenario-driven senior frontend practice for React performance, architecture, micro frontends, CI/CD, migration, and production ownership.",
    file: "senior-frontend-react-scenarios-guide.md",
  },
  {
    slug: "machine-coding",
    title: "Machine Coding",
    category: "Machine Coding",
    trackSlug: "react",
    trackTitle: "React",
    subtopicTitle: "Machine Coding Practice",
    description:
      "Timed implementation practice for todo apps, stopwatches, circle-click challenges, state design, and edge cases.",
    file: "machine-coding-interview-guide.md",
  },

  // Next.js
  {
    slug: "nextjs-fundamentals",
    title: "Next.js Fundamentals",
    category: "Next.js",
    trackSlug: "nextjs",
    trackTitle: "Next.js",
    subtopicTitle: "Fundamentals & App Router",
    description:
      "App Router file conventions, server and client components, rendering and streaming, data fetching, server actions, Cache Components, Proxy, metadata, and deployment.",
    file: "nextjs-fundamentals-guide.md",
  },
  {
    slug: "nextjs-routing-navigation",
    title: "Next.js Routing & Navigation",
    category: "Next.js",
    trackSlug: "nextjs",
    trackTitle: "Next.js",
    subtopicTitle: "Routing & Navigation",
    description:
      "File-system routes, dynamic and catch-all segments, root params, nested layouts and templates, route groups, parallel and intercepting routes, redirects, navigation hooks, and typed routes.",
    file: "nextjs-routing-navigation-guide.md",
  },
  {
    slug: "nextjs-server-client-components",
    title: "Next.js Server & Client Components",
    category: "Next.js",
    trackSlug: "nextjs",
    trackTitle: "Next.js",
    subtopicTitle: "Server & Client Components",
    description:
      "The use client boundary, composition patterns, serialisation rules, hydration mismatches, preventing theme and locale flashes, server-only code, context providers, and client data fetching.",
    file: "nextjs-server-client-components-guide.md",
  },
  {
    slug: "nextjs-rendering-caching",
    title: "Next.js Rendering & Caching",
    category: "Next.js",
    trackSlug: "nextjs",
    trackTitle: "Next.js",
    subtopicTitle: "Rendering, Caching & Dynamic APIs",
    description:
      "What makes a route static or dynamic, the Request-time APIs, the new Date() trap, io and connection, Partial Prerendering, Cache Components, revalidation, and diagnosing render modes.",
    file: "nextjs-rendering-caching-guide.md",
  },
  {
    slug: "nextjs-data-forms-mutations",
    title: "Next.js Data Fetching & Forms",
    category: "Next.js",
    trackSlug: "nextjs",
    trackTitle: "Next.js",
    subtopicTitle: "Data Fetching, Forms & Mutations",
    description:
      "Fetching in Server Components, avoiding waterfalls, Server Functions over the wire, form validation, pending and optimistic state, Route Handlers, and Server Action security.",
    file: "nextjs-data-forms-mutations-guide.md",
  },
  {
    slug: "nextjs-styling-assets",
    title: "Next.js Styling & Assets",
    category: "Next.js",
    trackSlug: "nextjs",
    trackTitle: "Next.js",
    subtopicTitle: "Styling & Assets",
    description:
      "CSS Modules, global CSS, Tailwind, Sass, CSS-in-JS registries, CSS ordering and chunking, next/image optimization, next/font, static assets, video, MDX, and theming.",
    file: "nextjs-styling-assets-guide.md",
  },
  {
    slug: "nextjs-metadata-seo",
    title: "Next.js Metadata & SEO",
    category: "Next.js",
    trackSlug: "nextjs",
    trackTitle: "Next.js",
    subtopicTitle: "Metadata & SEO",
    description:
      "The metadata object and generateMetadata, title templates, metadataBase, Open Graph images with ImageResponse, viewport, sitemaps, robots, manifests, JSON-LD, and i18n metadata.",
    file: "nextjs-metadata-seo-guide.md",
  },
  {
    slug: "nextjs-error-handling",
    title: "Next.js Error Handling",
    category: "Next.js",
    trackSlug: "nextjs",
    trackTitle: "Next.js",
    subtopicTitle: "Error Handling",
    description:
      "Expected errors versus uncaught exceptions, error boundaries and the retry prop, global-error, error.digest, notFound, forbidden and unauthorized, unstable_rethrow, and catchError.",
    file: "nextjs-error-handling-guide.md",
  },
  {
    slug: "nextjs-security-auth",
    title: "Next.js Security & Authentication",
    category: "Next.js",
    trackSlug: "nextjs",
    trackTitle: "Next.js",
    subtopicTitle: "Security & Auth",
    description:
      "Where auth checks belong, why layouts are wrong, the Data Access Layer and DTOs, sessions, optimistic Proxy checks, Server Action security, closure encryption, tainting, CSP nonces, and auditing.",
    file: "nextjs-security-auth-guide.md",
  },
  {
    slug: "nextjs-optimizations",
    title: "Next.js Optimizations",
    category: "Next.js",
    trackSlug: "nextjs",
    trackTitle: "Next.js",
    subtopicTitle: "Optimizations & Performance",
    description:
      "Image and font optimization, script strategies, lazy loading, prefetching, the client router cache, bundle size, data waterfalls, after(), Turbopack, and Core Web Vitals.",
    file: "nextjs-optimizations-guide.md",
  },
  {
    slug: "nextjs-proxy-observability",
    title: "Next.js Proxy & Observability",
    category: "Next.js",
    trackSlug: "nextjs",
    trackTitle: "Next.js",
    subtopicTitle: "Proxy & Observability",
    description:
      "Proxy (formerly Middleware), matchers and execution order, rewrites versus redirects, instrumentation, onRequestError, OpenTelemetry, Web Vitals reporting, logging, and debugging.",
    file: "nextjs-proxy-observability-guide.md",
  },
  {
    slug: "nextjs-testing-tooling",
    title: "Next.js Testing & Tooling",
    category: "Next.js",
    trackSlug: "nextjs",
    trackTitle: "Next.js",
    subtopicTitle: "Testing, Debugging & Tooling",
    description:
      "Test strategy and why async Server Components need E2E, Vitest and Jest setup, Playwright, Turbopack, typed routes, linting after next lint, bundle analysis, the React Compiler, and codemods.",
    file: "nextjs-testing-tooling-guide.md",
  },
  {
    slug: "nextjs-deployment-production",
    title: "Next.js Deployment & Production",
    category: "Next.js",
    trackSlug: "nextjs",
    trackTitle: "Next.js",
    subtopicTitle: "Deployment & Production",
    description:
      "Build output, standalone and static export, Docker, build-time versus runtime env vars, version skew and deploymentId, multi-instance self-hosting, shared caches, reverse proxies, and rollback.",
    file: "nextjs-deployment-production-guide.md",
  },

  // Frontend Architecture
  {
    slug: "frontend-system-design",
    title: "Frontend System Design",
    category: "Frontend Architecture",
    trackSlug: "frontend-architecture",
    trackTitle: "Frontend Architecture",
    subtopicTitle: "Frontend System Design",
    description:
      "Structuring a design round, real-time transports, chat at high concurrency, syncing missed data, offline writes, chunked resumable uploads, infinite feeds, traffic spikes, A/B testing, and permissions.",
    file: "frontend-system-design-guide.md",
  },
  {
    slug: "frontend-architecture-micro-frontends",
    title: "Frontend Architecture & Micro Frontends",
    category: "Frontend Architecture",
    trackSlug: "frontend-architecture",
    trackTitle: "Frontend Architecture",
    subtopicTitle: "Micro Frontends",
    description:
      "Scalable frontend structure, design systems, state ownership, micro frontends, and deployment tradeoffs.",
    file: "frontend-architecture-micro-frontends-guide.md",
  },

  // React Native
  {
    slug: "react-native-fundamentals",
    title: "React Native Fundamentals",
    category: "React Native",
    trackSlug: "react-native",
    trackTitle: "React Native",
    subtopicTitle: "Fundamentals & Core Concepts",
    description:
      "React vs React Native, how an app runs on a device, core components, styling and flexbox defaults, mount and unmount lifecycle, platform-specific code, Expo vs CLI, navigation, keyboard and safe areas, images, app state, and debugging.",
    file: "react-native-fundamentals-guide.md",
  },
  {
    slug: "mobile-react-native",
    title: "Mobile & React Native Overview",
    category: "React Native",
    trackSlug: "react-native",
    trackTitle: "React Native",
    subtopicTitle: "Overview & Offline Basics",
    description:
      "React Native fundamentals, native bridges, performance, platform differences, offline behavior, and releases.",
    file: "mobile-react-native-guide.md",
  },
  {
    slug: "react-native-networking-auth",
    title: "React Native Networking & Auth",
    category: "React Native",
    trackSlug: "react-native",
    trackTitle: "React Native",
    subtopicTitle: "Networking, Auth & Storage",
    description:
      "Fetch vs Axios, cancelling requests on unmount, multiple concurrent calls, slow APIs, the authentication flow, bearer and refresh tokens, secure token storage, AsyncStorage limitations, WebSockets, offline queues, and API key handling.",
    file: "react-native-networking-auth-guide.md",
  },
  {
    slug: "react-native-performance",
    title: "React Native Lists & Performance",
    category: "React Native",
    trackSlug: "react-native",
    trackTitle: "React Native",
    subtopicTitle: "Lists & Performance",
    description:
      "FlatList optimization and virtualization internals, windowing props, getItemLayout, keys, re-render control, FlashList, infinite scroll, images, 60fps animations, startup time, memory leaks, and profiling.",
    file: "react-native-performance-guide.md",
  },
  {
    slug: "react-native-architecture",
    title: "React Native Architecture",
    category: "React Native",
    trackSlug: "react-native",
    trackTitle: "React Native",
    subtopicTitle: "Old vs New Architecture",
    description:
      "Threading model, the old bridge and why it was a bottleneck, JSI, TurboModules, Fabric, Codegen, bridgeless mode, Hermes, Yoga, detecting the active architecture, and migration.",
    file: "react-native-architecture-guide.md",
  },
  {
    slug: "react-native-production",
    title: "React Native Production & Release",
    category: "React Native",
    trackSlug: "react-native",
    trackTitle: "React Native",
    subtopicTitle: "Production, Release & Gotchas",
    description:
      "Over-the-air updates, app size, build environments, deep links, push notifications, testing, crash reporting, version upgrades, cross-platform gotchas, release-only crashes, and shipping tricks.",
    file: "react-native-production-guide.md",
  },

  // AI Engineering
  {
    slug: "ai-frontend-engineering",
    title: "AI Frontend Engineering",
    category: "AI Frontend",
    trackSlug: "ai-engineering",
    trackTitle: "AI Engineering",
    subtopicTitle: "Frontend AI Apps",
    description:
      "Frontend interview scenarios for LLM chat, streaming UI, race conditions, agent tool state, RAG citations, AI app security, testing, and observability.",
    file: "ai-frontend-engineering-guide.md",
  },

  // Backend
  {
    slug: "backend",
    title: "Backend",
    category: "Backend",
    trackSlug: "backend",
    trackTitle: "Backend",
    subtopicTitle: "Fundamentals & APIs",
    description:
      "HTTP, REST, databases, authentication, caching, scaling, queues, deployments, and distributed-system fundamentals.",
    file: "backend-interview-guide.md",
  },
  {
    slug: "senior-api-database-performance",
    title: "API Optimization & Database Performance",
    category: "Backend",
    trackSlug: "backend",
    trackTitle: "Backend",
    subtopicTitle: "API Optimization & Database Performance",
    description:
      "API optimization, payload design, pagination, caching, query performance, N+1 prevention, REST contracts, database modeling, transactions, and latency troubleshooting.",
    file: "senior-api-database-performance-guide.md",
  },

  // Node.js
  {
    slug: "nodejs-backend",
    title: "Node.js Fundamentals",
    category: "Node.js",
    trackSlug: "nodejs",
    trackTitle: "Node.js",
    subtopicTitle: "Fundamentals, Modules & APIs",
    description:
      "Node.js runtime basics, project setup, npm, CommonJS vs ES modules, module caching, built-in APIs, errors, events, HTTP, Express, and backend usage patterns.",
    file: "nodejs-backend-interview-guide.md",
  },
  {
    slug: "express-framework",
    title: "Express",
    category: "Express",
    trackSlug: "nodejs",
    trackTitle: "Node.js",
    subtopicTitle: "Express & Middleware",
    description:
      "Middleware pipeline, routing, Express 5 breaking changes, async error handling, validation, auth, security headers, uploads, streaming, trust proxy, timeouts, graceful shutdown, and testing.",
    file: "express-framework-guide.md",
  },
  {
    slug: "nodejs-event-loop-runtime",
    title: "Node.js Event Loop",
    category: "Node.js",
    trackSlug: "nodejs",
    trackTitle: "Node.js",
    subtopicTitle: "Event Loop & Async Runtime",
    description:
      "Node.js event loop phases, nextTick, promises, timers, setImmediate, browser differences, cluster vs workers, CPU-heavy work, streams, and runtime debugging.",
    file: "nodejs-event-loop-runtime-guide.md",
  },
  {
    slug: "nodejs-streams-buffers",
    title: "Node.js Streams & Buffers",
    category: "Node.js",
    trackSlug: "nodejs",
    trackTitle: "Node.js",
    subtopicTitle: "Streams, Buffers & Workers",
    description:
      "Buffers, readable and writable streams, transform streams, backpressure, pipeline, async iteration, worker threads, cluster, signals, and graceful shutdown.",
    file: "nodejs-streams-buffers-guide.md",
  },

  // NestJS
  {
    slug: "nestjs-fundamentals",
    title: "NestJS Fundamentals",
    category: "NestJS",
    trackSlug: "nestjs",
    trackTitle: "NestJS",
    subtopicTitle: "Fundamentals & Modules",
    description:
      "Why Nest over Express, the layered architecture, modules and metadata, dynamic and global modules, controllers and routing, providers, project structure, lifecycle hooks, and configuration.",
    file: "nestjs-fundamentals-guide.md",
  },
  {
    slug: "nestjs-dependency-injection",
    title: "NestJS Dependency Injection",
    category: "NestJS",
    trackSlug: "nestjs",
    trackTitle: "NestJS",
    subtopicTitle: "Dependency Injection",
    description:
      "How the container resolves providers, injection tokens, the four custom provider types, scopes and why request scope is contagious, circular dependencies, ModuleRef, and durable providers.",
    file: "nestjs-dependency-injection-guide.md",
  },
  {
    slug: "nestjs-request-lifecycle",
    title: "NestJS Request Lifecycle",
    category: "NestJS",
    trackSlug: "nestjs",
    trackTitle: "NestJS",
    subtopicTitle: "Request Lifecycle",
    description:
      "The exact execution order, middleware, guards and the Reflector, pipes and validation, interceptors and RxJS patterns, exception filters, binding scope, and custom decorators.",
    file: "nestjs-request-lifecycle-guide.md",
  },
  {
    slug: "nestjs-data-persistence",
    title: "NestJS Data & Persistence",
    category: "NestJS",
    trackSlug: "nestjs",
    trackTitle: "NestJS",
    subtopicTitle: "Data & Persistence",
    description:
      "TypeORM and Prisma integration, the repository pattern, transactions, relations and N+1, migrations, DTOs versus entities, safe serialisation, pagination, soft deletes, caching, and pooling.",
    file: "nestjs-data-persistence-guide.md",
  },
  {
    slug: "nestjs-auth-microservices",
    title: "NestJS Auth & Microservices",
    category: "NestJS",
    trackSlug: "nestjs",
    trackTitle: "NestJS",
    subtopicTitle: "Auth, Testing & Microservices",
    description:
      "JWT and Passport, refresh token rotation, password hashing, RBAC, sessions versus tokens, rate limiting, a security checklist, microservice transports, Kafka and RabbitMQ, and testing.",
    file: "nestjs-auth-microservices-guide.md",
  },
  {
    slug: "nestjs-queues-realtime",
    title: "NestJS Queues, Events & Realtime",
    category: "NestJS",
    trackSlug: "nestjs",
    trackTitle: "NestJS",
    subtopicTitle: "Queues, Events & Realtime",
    description:
      "Background jobs with BullMQ, job idempotency, scheduled tasks and the multi-replica trap, in-process events, WebSocket gateways, scaling realtime with a Redis adapter, server-sent events, CQRS, configurable modules, and queue observability.",
    file: "nestjs-queues-events-realtime-guide.md",
  },

  // Databases
  {
    slug: "database-fundamentals",
    title: "Database Fundamentals",
    category: "Databases",
    trackSlug: "databases",
    trackTitle: "Databases",
    subtopicTitle: "Database Fundamentals",
    description:
      "Relational model, keys, relationships, normalization, constraints, ACID, isolation levels, locking, index internals, SQL vs NoSQL, replication, and connection pooling.",
    file: "database-fundamentals-guide.md",
  },
  {
    slug: "sql-fundamentals",
    title: "SQL Fundamentals",
    category: "SQL",
    trackSlug: "databases",
    trackTitle: "Databases",
    subtopicTitle: "SQL Fundamentals",
    description:
      "Query processing order, joins, grouping, subqueries, CTEs, window functions, set operators, NULL logic, upserts, and classic interview query patterns.",
    file: "sql-fundamentals-guide.md",
  },
  {
    slug: "sql-query-optimization",
    title: "SQL Query Optimization",
    category: "SQL",
    trackSlug: "databases",
    trackTitle: "Databases",
    subtopicTitle: "Query Optimization",
    description:
      "EXPLAIN-driven tuning, index design, sargable predicates, join and subquery rewrites, sorting and aggregation cost, pagination at scale, and real slow-query scenarios.",
    file: "sql-query-optimization-guide.md",
  },
  {
    slug: "mongodb-fundamentals",
    title: "MongoDB",
    category: "MongoDB",
    trackSlug: "databases",
    trackTitle: "Databases",
    subtopicTitle: "MongoDB",
    description:
      "Documents and collections, find versus findOne, explain plans, index types and the ESR rule, slow queries on large collections, aggregation optimization, embedding versus referencing, replica sets, and sharding.",
    file: "mongodb-fundamentals-guide.md",
  },

  // System Design
  {
    slug: "design-patterns",
    title: "Design Patterns",
    category: "System Design",
    trackSlug: "system-design",
    trackTitle: "System Design",
    subtopicTitle: "Design Patterns",
    description:
      "Classic creational, structural, and behavioral design patterns with bad and good class examples, problems, fixes, and tradeoffs.",
    file: "design-patterns-guide.md",
  },
  {
    slug: "system-design-microservices",
    title: "System Design & Microservices",
    category: "System Design",
    trackSlug: "system-design",
    trackTitle: "System Design",
    subtopicTitle: "Microservices & Scalability",
    description:
      "Scalability, service boundaries, communication, consistency, reliability, and distributed-system tradeoffs.",
    file: "system-design-microservices-guide.md",
  },
  {
    slug: "kafka-event-streaming",
    title: "Kafka Event Streaming",
    category: "Kafka",
    trackSlug: "system-design",
    trackTitle: "System Design",
    subtopicTitle: "Kafka & Event Streaming",
    description:
      "Kafka producers, consumers, topics, partitions, offsets, consumer groups, delivery guarantees, replication, Spring Kafka, retries, DLTs, ordering, and scaling.",
    file: "kafka-event-streaming-guide.md",
  },
  {
    slug: "rabbitmq-message-broker",
    title: "RabbitMQ Message Broker",
    category: "RabbitMQ",
    trackSlug: "system-design",
    trackTitle: "System Design",
    subtopicTitle: "RabbitMQ Queues & Exchanges",
    description:
      "RabbitMQ exchanges, queues, bindings, acknowledgements, publisher confirms, DLX, retries, quorum queues, streams, ordering, scaling, and production tradeoffs.",
    file: "rabbitmq-message-broker-guide.md",
  },
  {
    slug: "mqtt-iot-messaging",
    title: "MQTT IoT Messaging",
    category: "MQTT",
    trackSlug: "system-design",
    trackTitle: "System Design",
    subtopicTitle: "MQTT IoT Messaging",
    description:
      "MQTT brokers, topics, QoS levels, retained messages, last will, persistent sessions, shared subscriptions, flow control, security, and IoT architecture.",
    file: "mqtt-iot-messaging-guide.md",
  },

  // DevOps & Infrastructure
  {
    slug: "devops-docker-kubernetes",
    title: "DevOps, Docker, Kubernetes",
    category: "DevOps",
    trackSlug: "devops",
    trackTitle: "DevOps & Infrastructure",
    subtopicTitle: "Docker & Kubernetes",
    description:
      "Containers, images, orchestration, CI/CD, rolling deployments, and production operations.",
    file: "devops-docker-kubernetes-guide.md",
  },
  {
    slug: "nginx-web-infrastructure",
    title: "Nginx & Web Infrastructure",
    category: "Infrastructure",
    trackSlug: "devops",
    trackTitle: "DevOps & Infrastructure",
    subtopicTitle: "Nginx & Web",
    description:
      "Reverse proxies, TLS termination, load balancing, static assets, compression, and routing.",
    file: "nginx-web-infrastructure-guide.md",
  },
  {
    slug: "aws-saas-observability",
    title: "AWS SaaS & Observability",
    category: "AWS",
    trackSlug: "devops",
    trackTitle: "DevOps & Infrastructure",
    subtopicTitle: "AWS SaaS & Observability",
    description:
      "AWS-hosted SaaS architecture, ECS/EKS/Lambda choices, CI/CD, Docker/Kubernetes runtime concerns, logs, metrics, traces, SLI/SLO, alerts, and incidents.",
    file: "aws-saas-observability-guide.md",
  },

  // .NET & C#
  {
    slug: "dotnet-csharp",
    title: ".NET & C#",
    category: ".NET",
    trackSlug: "dotnet",
    trackTitle: ".NET & C#",
    subtopicTitle: "C# & ASP.NET Core",
    description:
      ".NET platform fundamentals, C#, ASP.NET Core, dependency injection, async, middleware, and EF Core.",
    file: "dotnet-csharp-interview-guide.md",
  },

  // Python
  {
    slug: "python-backend-frameworks",
    title: "Python Backend Frameworks",
    category: "Python",
    trackSlug: "python",
    trackTitle: "Python",
    subtopicTitle: "Backend Frameworks",
    description:
      "Python backend fundamentals, Django, FastAPI, Flask, typing, ORMs, async behavior, and API design.",
    file: "python-backend-frameworks-guide.md",
  },

  // Interview Prep
  {
    slug: "senior-full-stack-saas-job-prep",
    title: "Senior Full Stack SaaS Job Prep",
    category: "Interview Prep",
    trackSlug: "interview-prep",
    trackTitle: "Interview Prep",
    subtopicTitle: "Senior Full Stack SaaS",
    description:
      "Focused preparation for the posted Senior Full Stack and Field Nation-style SaaS roles: React, TypeScript, APIs, AWS, SQL, Docker, queues, and observability.",
    file: "senior-full-stack-saas-job-prep-guide.md",
  },
];
