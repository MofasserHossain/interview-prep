# Topic Authoring Guide

Use this when adding interview topics such as DevOps, Docker, Kubernetes,
Nginx, .NET, C#, Python, Django, FastAPI, React Native, system design,
microservices, or micro frontends.

## File Location

Put topic files in:

```txt
content/interview/
```

Register each file in:

```txt
src/lib/topics.ts
```

Each topic must include track metadata. The track is the left-sidebar parent
menu, and the subtopic is the nested submenu item inside that parent.

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

## Suggested Future Topic Files

- `system-design-microservices-guide.md`
- `design-patterns-guide.md`
- `devops-docker-kubernetes-guide.md`
- `nginx-web-infrastructure-guide.md`
- `dotnet-csharp-interview-guide.md`
- `python-backend-frameworks-guide.md`
- `mobile-react-native-guide.md`
- `frontend-architecture-micro-frontends-guide.md`
