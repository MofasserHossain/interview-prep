import type { Difficulty, Topic } from "@/lib/types";

export const topics: Topic[] = [
  {
    slug: "senior-full-stack-saas-job-prep",
    title: "Senior Full Stack SaaS Job Prep",
    category: "Job Prep",
    trackSlug: "role-prep",
    trackTitle: "Job Prep",
    subtopicTitle: "Senior Full Stack SaaS",
    description:
      "Focused preparation for the posted Senior Full Stack and Field Nation-style SaaS roles: React, TypeScript, APIs, AWS, SQL, Docker, queues, and observability.",
    file: "senior-full-stack-saas-job-prep-guide.md",
  },
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
  {
    slug: "nodejs-backend",
    title: "Node.js Fundamentals",
    category: "Node.js",
    trackSlug: "nodejs",
    trackTitle: "Node.js",
    subtopicTitle: "Fundamentals, Modules & APIs",
    description:
      "Node.js runtime basics, project setup, npm, modules, built-in APIs, events, HTTP, Express, and backend usage patterns.",
    file: "nodejs-backend-interview-guide.md",
  },
  {
    slug: "nodejs-event-loop-runtime",
    title: "Node.js Event Loop",
    category: "Node.js",
    trackSlug: "nodejs",
    trackTitle: "Node.js",
    subtopicTitle: "Event Loop & Async Runtime",
    description:
      "Node.js event loop phases, non-blocking I/O, callbacks, promises, microtasks, timers, EventEmitter, CPU-heavy work, streams, and runtime debugging.",
    file: "nodejs-event-loop-runtime-guide.md",
  },
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
      "Prototype chains, shared methods, classes, own vs inherited properties, and prototype pollution.",
    file: "javascript-prototypes-objects-guide.md",
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
    slug: "frontend-react-next",
    title: "Frontend, React, Next.js",
    category: "Frontend",
    trackSlug: "react",
    trackTitle: "React",
    subtopicTitle: "Basics & Next.js",
    description:
      "HTML, CSS, React internals, hooks, rendering strategies, error handling, and Next.js basics.",
    file: "frontend-react-next-interview-guide.md",
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
  {
    slug: "mobile-react-native",
    title: "Mobile & React Native",
    category: "Mobile",
    trackSlug: "mobile",
    trackTitle: "Mobile",
    subtopicTitle: "React Native",
    description:
      "React Native fundamentals, native bridges, performance, platform differences, offline behavior, and releases.",
    file: "mobile-react-native-guide.md",
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
];

export function getDifficulty(topicSlug: string, number: number): Difficulty {
  if (topicSlug === "backend") {
    if (number <= 15) return "beginner";
    if (number <= 30) return "intermediate";
    return "senior";
  }

  if (topicSlug === "nodejs-backend") {
    if (number <= 18) return "beginner";
    if (number <= 40) return "intermediate";
    return "senior";
  }

  if (topicSlug === "nodejs-event-loop-runtime") {
    if (number <= 6) return "beginner";
    if (number <= 14) return "intermediate";
    return "senior";
  }

  if (topicSlug === "javascript") {
    if (number <= 5) return "beginner";
    if (number <= 9) return "intermediate";
    return "senior";
  }

  const javascriptCoreTopics = new Set([
    "javascript-promises-async",
    "javascript-this-functions",
    "javascript-prototypes-objects",
    "javascript-collections-iteration",
    "javascript-loops-array-methods",
    "javascript-scope-hoisting-closures",
    "javascript-types-equality-copying",
  ]);

  if (javascriptCoreTopics.has(topicSlug)) {
    if (number <= 3) return "beginner";
    if (number <= 6) return "intermediate";
    return "senior";
  }

  if (topicSlug === "javascript-event-loop-runtime") {
    if (number <= 5) return "beginner";
    if (number <= 12) return "intermediate";
    return "senior";
  }

  if (topicSlug === "frontend-react-next") {
    if (number <= 6) return "beginner";
    if (number <= 14) return "intermediate";
    return "senior";
  }

  if (topicSlug === "react-performance") {
    if (number <= 7) return "beginner";
    if (number <= 22) return "intermediate";
    return "senior";
  }

  const seniorJobTopics = new Set([
    "senior-full-stack-saas-job-prep",
    "typescript-react-architecture",
    "aws-saas-observability",
  ]);

  if (seniorJobTopics.has(topicSlug)) {
    if (number <= 2) return "beginner";
    if (number <= 7) return "intermediate";
    return "senior";
  }

  if (topicSlug === "senior-api-database-performance") {
    if (number <= 4) return "beginner";
    if (number <= 10) return "intermediate";
    return "senior";
  }

  const expansionTopics = new Set([
    "system-design-microservices",
    "devops-docker-kubernetes",
    "nginx-web-infrastructure",
    "dotnet-csharp",
    "python-backend-frameworks",
    "mobile-react-native",
    "frontend-architecture-micro-frontends",
  ]);

  if (expansionTopics.has(topicSlug)) {
    if (number <= 2) return "beginner";
    if (number <= 4) return "intermediate";
    return "senior";
  }

  return "mixed";
}
