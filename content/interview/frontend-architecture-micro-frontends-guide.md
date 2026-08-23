# Frontend Architecture And Micro Frontends Interview Guide

Frontend architecture guidance covering scalable UI structure, design systems,
state ownership, micro frontends, module federation, testing, and deployment
tradeoffs.

## 1. What Is Frontend Architecture?

Frontend architecture is how a frontend application is organized so it remains
maintainable as features and teams grow.

It includes:

- routing
- component structure
- state management
- API boundaries
- design system
- testing strategy
- build and deployment

Strong answer:

> Good frontend architecture keeps product features easy to change without
> spreading logic across unrelated components.

## 2. How Do You Structure A Large Frontend App?

A common structure groups code by feature and keeps shared code explicit.

Example:

```txt
src/
  app/
  features/
    billing/
    users/
  components/
  lib/
  hooks/
```

Rules:

- feature logic stays near the feature
- shared components stay generic
- API clients are centralized
- design tokens are consistent
- tests sit close to behavior

## 3. What Are Micro Frontends?

Micro frontends split a frontend into independently owned and deployed parts.

Example:

```txt
Shell app
  -> account frontend
  -> billing frontend
  -> reports frontend
```

Benefits:

- team independence
- independent deployments
- separate technology choices in some cases

Tradeoffs:

- more operational complexity
- shared design system challenges
- routing and auth coordination
- bundle duplication risk

## 4. When Should You Avoid Micro Frontends?

Avoid micro frontends when:

- the team is small
- deployment independence is not needed
- product boundaries are unclear
- the app can be a modular monolith
- shared UX consistency is more important than team separation

Strong answer:

> I would not start with micro frontends by default. I would first build a
> modular frontend and move to micro frontends only when team and deployment
> boundaries justify the complexity.

## 5. What Is A Design System?

A design system is a shared set of UI components, tokens, patterns, and
guidelines.

It helps with:

- consistent UI
- faster development
- accessibility
- shared product language
- easier maintenance

Example components:

- Button
- Input
- Modal
- Table
- Toast
- Tabs

Tradeoff:

> A design system should provide consistency without blocking product teams
> from solving real workflow needs.
