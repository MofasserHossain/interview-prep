# Senior Frontend React Scenarios Interview Guide

Senior frontend interview guidance covering React rendering, performance,
frontend architecture, micro frontends, CI/CD, production ownership, legacy
migration, and multi-team engineering judgment.

Use this guide for scenario-driven senior interviews. The best answers show how
you diagnose, choose tradeoffs, communicate risk, and verify outcomes.

## Scenario Answer Flow

For senior frontend scenarios, answer in this order:

1. Clarify the user impact and constraints.
2. Gather evidence instead of guessing.
3. Separate symptoms from root causes.
4. Propose a low-risk short-term fix.
5. Propose a durable architecture or process fix.
6. Explain tradeoffs and failure cases.
7. Define how you will verify the result.

## 1. How Should You Answer Senior Frontend Scenario Questions?

A senior frontend answer should not sound like a list of tools. It should show
debugging discipline, product judgment, and ownership.

Use the same answer shape every time:

```txt
simple answer
  -> why the problem happens
  -> practical fix
  -> code or architecture example
  -> tradeoffs
  -> how to verify
  -> short interview summary
```

Easy version:

> I first explain the core idea in plain language. Then I show how I would solve
> it in code or architecture. After that I mention when my solution can fail and
> how I would measure that it worked.

Reusable interview template:

```txt
I would not guess.
First I would check <metric/tool/symptom>.
If the cause is <root cause>, I would apply <targeted fix>.
I would avoid <common bad fix> because <tradeoff>.
I would verify with <test/metric/profile>.
```

Example for a slow React page:

> First I would understand the user-visible impact and whether this is a
> release blocker. Then I would collect browser performance traces, React
> Profiler data, network timings, bundle changes, and production metrics. After
> identifying whether the bottleneck is rendering, data fetching, bundle size,
> layout, or third-party code, I would apply the smallest safe fix and verify it
> with metrics before rolling out broadly.

How to study this guide:

1. Read the simple answer first.
2. Understand the failure mode.
3. Practice explaining the tradeoff out loud.
4. Memorize one practical example.
5. Finish with how you would measure success.

What interviewers are testing:

- can you debug without guessing
- can you prioritize under pressure
- can you make tradeoffs explicit
- can you protect production users
- can you align multiple teams

## 2. A Page Becomes Slow After Adding Multiple API-Driven Components. What Would You Do?

Start by finding which layer became slow.

Investigation checklist:

- compare before/after Web Vitals and real user monitoring
- capture a Chrome Performance trace
- record the interaction in React Profiler
- inspect network waterfall and request duplication
- check API latency, payload size, and cache headers
- check JavaScript bundle changes
- check long tasks, layout shifts, and hydration work

Possible causes:

| Symptom | Likely cause |
| --- | --- |
| Many duplicate requests | each component fetches independently |
| Slow first render | large bundle, blocking data, hydration cost |
| Input lag | expensive rendering or synchronous JavaScript |
| Layout jump | unstable dimensions or late-loading content |
| CPU spike | expensive transforms during render |

Strong answer:

> I would not assume React rendering is the problem. I would split the page into
> network, JavaScript, rendering, layout, and backend latency. Then I would fix
> the measured bottleneck, such as deduplicating requests, moving data fetching
> to a shared cache, virtualizing heavy lists, or splitting heavy widgets.

## 3. How Would You Prevent Duplicate API Requests In A React Page?

Duplicate requests usually happen when multiple components fetch the same data
without a shared data boundary.

Practical fixes:

- centralize data fetching at a route or feature boundary
- use a query cache such as TanStack Query, SWR, RTK Query, or framework cache
- dedupe in-flight requests by key
- normalize API clients around typed functions
- set cache headers when data can be reused
- cancel stale requests with `AbortController`

Example shape:

```tsx
function useUser(userId: string) {
  return useQuery({
    queryKey: ["user", userId],
    queryFn: () => userApi.getById(userId),
    staleTime: 60_000,
  });
}
```

Why it matters:

Caching is not only about speed. It also reduces backend load and avoids
inconsistent UI when several components receive different versions of the same
data.

Tradeoff:

Do not cache everything forever. Pick stale times based on business freshness,
mutation frequency, and user risk.

## 4. When Can `React.memo`, `useMemo`, And `useCallback` Help Or Hurt?

They help when there is a measured render or identity problem.

Useful cases:

- expensive child component receives stable props
- expensive derived value is recalculated frequently
- callback identity is passed to a memoized child
- dependency identity causes unnecessary effects

They hurt when:

- the component is cheap
- props change every render anyway
- dependency arrays are wrong
- memoization hides poor state design
- comparison cost is higher than rendering cost
- code becomes harder to reason about

Strong answer:

> I use memoization after measuring. `React.memo` skips child renders when props
> are stable. `useMemo` caches values. `useCallback` stabilizes function
> references. They can hurt when added everywhere because they add comparison
> work, dependency bugs, and complexity without solving the actual bottleneck.

## 5. How Would You Design Reusable Components Without Creating Tight Coupling?

Reusable components should be reusable because their responsibility is clear,
not because they accept dozens of configuration props.

Good design rules:

- keep shared UI free from business logic
- use composition for slots and layout variation
- keep domain behavior in feature components or hooks
- expose typed, minimal props
- prefer controlled APIs when parent ownership matters
- document accessibility behavior and states

Example:

```tsx
function DataTable<T>({
  columns,
  rows,
  getRowId,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
}) {
  return rows.map((row) => <Row key={getRowId(row)} row={row} columns={columns} />);
}
```

Tradeoff:

Over-generic components become hard to change. If only one feature uses a
component, keep it local until reuse is real.

## 6. How Would You Design A Custom Hook For Reuse?

A custom hook should package behavior, not UI.

Good hook shape:

```tsx
function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timerId = window.setTimeout(() => setDebouncedValue(value), delayMs);

    return () => window.clearTimeout(timerId);
  }, [value, delayMs]);

  return debouncedValue;
}
```

Design checklist:

- inputs are explicit
- return value is small and predictable
- effect cleanup is correct
- dependencies are complete
- hook does not hide surprising global state
- hook can be tested with realistic behavior

Strong answer:

> I extract a custom hook when multiple components need the same stateful
> behavior. I avoid putting business decisions inside shared hooks unless that
> hook belongs to the feature domain.

## 7. How Would You Handle Complex State Without Tightly Coupled Components?

Start by identifying ownership.

State placement options:

| State type | Good owner |
| --- | --- |
| local UI state | nearest component |
| form workflow state | form or feature boundary |
| server data | query cache or framework loader |
| cross-route app state | app provider or store |
| URL-driven state | router/search params |
| derived data | compute during render |

Avoid coupling by:

- keeping state close to where it changes
- lifting state only to the nearest common owner
- using reducers for complex transitions
- separating server cache from client UI state
- passing events upward instead of mutating parent state directly
- avoiding one giant global store

Interview line:

> I do not choose Redux, Context, or local state first. I first ask who owns the
> state, how often it changes, who reads it, and whether it is server state,
> client workflow state, URL state, or derived state.

## 8. How Would You Architect A Frontend App For Multiple Teams?

Use architecture to create ownership boundaries.

Recommended shape:

```txt
src/
  app/
    routes/
    providers/
  features/
    billing/
      api/
      components/
      hooks/
      types.ts
    claims/
      api/
      components/
      hooks/
  shared/
    ui/
    lib/
    analytics/
```

Team-scale rules:

- feature teams own feature folders and routes
- shared UI is generic and versioned
- API contracts are typed
- design tokens are centralized
- cross-cutting concerns have clear owners
- architecture decisions are documented

Tradeoff:

A modular monolith is often the best starting point. Move to micro frontends
only when independent deployment and team autonomy justify the cost.

## 9. How Would You Design A Scalable Component Library And Design System?

A design system should include more than visual components.

It should define:

- design tokens
- accessible component behavior
- variants and states
- theming rules
- documentation and examples
- testing expectations
- release and migration policy
- ownership model

Quality gates:

- visual regression tests
- accessibility checks
- TypeScript prop contracts
- Storybook or equivalent documentation
- changelog and migration notes

Strong answer:

> A scalable design system is a product for internal developers. It needs
> ownership, versioning, accessibility standards, documentation, and a migration
> path, not just a folder of shared components.

## 10. How Would You Manage Shared State In A Large React App?

Do not put all shared state in one provider or one global store.

Classify state first:

- server state: query cache or framework data APIs
- form state: form library or local reducer
- UI state: local component or feature provider
- auth/session summary: app provider
- URL state: route params or search params
- derived state: calculate from existing state

Tradeoffs:

| Option | Strength | Risk |
| --- | --- | --- |
| Local state | simple and isolated | hard for siblings |
| Context | easy app-level dependency | broad re-renders |
| Reducer | explicit transitions | boilerplate |
| Query cache | server data lifecycle | not for UI state |
| External store | fine-grained sharing | more architecture |

Interview line:

> I separate server state from client state. Most performance problems in large
> apps come from unclear ownership and broad subscriptions.

## 11. How Would You Separate Business Logic From UI?

Separate by responsibility.

Good boundaries:

- UI components render data and emit events
- feature hooks coordinate feature workflows
- API clients handle transport
- domain functions transform business data
- validation schemas live near forms or contracts
- route loaders or server components fetch page-level data

Example:

```tsx
function ClaimsPage() {
  const claims = useClaims();

  return <ClaimsTable claims={claims.data ?? []} onApprove={claims.approve} />;
}
```

`ClaimsTable` should not know HTTP URLs, cache keys, auth headers, or retry
policy.

Tradeoff:

Do not over-abstract small features. Extract boundaries when the logic is
shared, complex, tested independently, or owned by a domain.

## 12. How Would You Evolve Frontend Architecture Without Breaking Backward Compatibility?

Treat architecture migration as a product rollout.

Safe migration approach:

1. Define the target architecture and why it is better.
2. Add compatibility adapters around old APIs.
3. Migrate one vertical slice.
4. Keep old and new code paths behind flags when needed.
5. Add tests around contracts and critical flows.
6. Track migration progress publicly.
7. Remove compatibility code only after usage reaches zero.

Examples:

- wrap a legacy API client behind a typed client
- introduce a new design system component with an adapter
- move route by route to a new data-fetching approach
- use feature flags for risky interaction changes

Strong answer:

> I avoid big-bang rewrites. I define a target, create adapters, migrate
> vertical slices, measure risk, and keep feature delivery moving.

## 13. When Would You Choose Micro Frontends Over A Modular Monolith?

Choose micro frontends when organizational needs justify runtime and deployment
complexity.

Good reasons:

- many teams need independent deployment
- product domains are clearly separated
- release cadence differs by domain
- legacy migration must happen incrementally
- ownership boundaries are more important than single-app simplicity

Avoid micro frontends when:

- the team is small
- deployment independence is not needed
- design system maturity is low
- shared dependencies are unstable
- the app can be kept modular inside one build

Strong answer:

> I would start with a modular monolith and move to micro frontends only when
> team autonomy, independent releases, or migration pressure outweigh the extra
> complexity.

## 14. How Would You Handle Module Federation And Shared Dependencies?

Module Federation lets separately built apps expose and consume modules at
runtime. The senior concern is dependency policy, not only webpack syntax.

Key rules:

- keep React and React DOM singletons
- define compatible version ranges
- avoid sharing unstable feature packages
- version shared design system packages carefully
- test host and remote combinations
- provide a fallback when a remote fails to load

Example risk:

```txt
Shell uses React 19
Remote bundles another React copy
Result: hooks can break because two React instances exist
```

Strong answer:

> With Module Federation, I would treat shared dependencies as a contract. React
> must be singleton, design system versions need policy, and host/remote
> compatibility needs automated testing before deployment.

## 15. How Should Micro Frontends Communicate?

Prefer explicit contracts over hidden coupling.

Communication options:

| Option | Use when |
| --- | --- |
| URL and route params | navigation and shareable state |
| custom events | loose browser-level events |
| shared event bus | cross-domain events with governance |
| shared store | rare cases with strong ownership |
| backend APIs | durable source of truth |
| props from shell | shell-owned context like user/session |

Avoid:

- direct imports across team-owned remotes
- one remote mutating another remote's state
- global variables as hidden contracts
- duplicating auth logic in every remote

Tradeoff:

Loose communication is safer for independence but harder to coordinate.
Shared runtime state is easier short-term but can recreate a monolith at
runtime.

## 16. How Would You Handle Auth, Routing, And Design Systems In Micro Frontends?

The shell should usually own cross-cutting concerns.

Recommended ownership:

- shell owns authentication/session bootstrap
- shell owns top-level routing
- remotes own domain routes under their boundary
- design system owns tokens and base components
- platform team owns dependency and deployment policy
- observability is standardized across all remotes

Why it matters:

Without shared standards, users see inconsistent UX and engineers debug
failures across unclear ownership boundaries.

Strong answer:

> Micro frontends need platform governance. Teams can deploy independently, but
> auth, routing contracts, design tokens, dependency policy, and observability
> must be consistent.

## 17. What Should A Senior Frontend CI/CD Pipeline Include?

A frontend CI/CD pipeline should prevent unsafe code from reaching users.

Recommended gates:

- install with locked dependencies
- typecheck
- lint
- unit tests
- component tests
- integration or E2E smoke tests
- accessibility checks for key flows
- bundle size budget
- dependency and secret scanning
- build artifact generation
- deploy preview
- production deployment with rollback

Strong answer:

> CI/CD is not only automation. It is a risk control system. I want fast checks
> for every PR, deeper tests before release, deploy previews for review, and a
> rollback path if production metrics regress.

## 18. How Would You Design Build, Test, Deploy, And Rollback?

A safe frontend release flow separates artifact creation from deployment.

Good flow:

```txt
commit -> install -> typecheck -> lint -> test -> build artifact
       -> preview -> deploy canary -> monitor -> promote or rollback
```

Rollback strategy:

- keep previous artifacts available
- make deployment reversible without rebuilding
- keep feature flags server-controlled
- verify rollback with smoke tests
- document who can trigger rollback

Tradeoff:

Fast pipelines are valuable, but senior teams should not remove critical gates
just to make deployments feel quick. Split fast PR checks from deeper release
checks when needed.

## 19. How Would You Use Environment Configuration And Feature Flags?

Environment configuration should describe deployment environment. Feature flags
should control behavior rollout.

Good practices:

- validate required environment variables at startup or build time
- avoid committing secrets
- separate public client config from server-only config
- use flags for risky UI or API changes
- make flags observable
- define flag owners and cleanup dates

Feature flag rollout:

```txt
internal users -> small percentage -> one region/customer segment -> all users
```

Tradeoff:

Flags reduce release risk but add conditional complexity. Remove stale flags
after rollout.

## 20. Canary vs Blue-Green Deployment For Frontend Releases

Canary deployment sends a small percentage of users to the new version first.

Blue-green deployment keeps two complete environments and switches traffic from
old to new.

Comparison:

| Strategy | Strength | Risk |
| --- | --- | --- |
| Canary | catches regressions with limited blast radius | needs traffic splitting and monitoring |
| Blue-green | fast rollback to old environment | higher infrastructure cost |

Frontend-specific checks:

- JavaScript error rate
- page load metrics
- route-level conversion or task success
- API error correlation
- bundle loading failures
- Core Web Vitals

Strong answer:

> I prefer canary for risky frontend changes when monitoring is strong. I want
> an automatic or clear manual rollback if error rate, latency, or Web Vitals
> cross thresholds.

## 21. How Would You Monitor Production Frontend Quality?

Use both technical and user-impact signals.

Monitor:

- JavaScript errors
- unhandled promise rejections
- route-level load time
- Core Web Vitals
- API error rates from the browser
- failed asset loads
- rage clicks or repeated failed actions
- bundle size trends
- release version correlation
- user session replay for critical incidents when privacy policy allows it

Why it matters:

Backend health can look normal while the frontend is broken for users.

Strong answer:

> I want every frontend release tied to versioned telemetry. If errors or Web
> Vitals regress, I should know which release caused it and whether to roll
> back, disable a flag, or patch forward.

## 22. A Critical Release Causes A Frontend Performance Regression. What Do You Do?

Handle it as an incident.

Immediate response:

1. Confirm user impact and affected routes.
2. Compare metrics before and after the release.
3. Check JavaScript errors, Web Vitals, network, and backend latency.
4. Decide rollback, flag-off, or hotfix.
5. Communicate status to product and support.
6. Monitor recovery after mitigation.

Root-cause follow-up:

- identify the exact change
- add a regression test or budget
- document the timeline
- improve dashboards or alerts
- update release checklist if a gate was missing

Strong answer:

> I would protect users first. If rollback or flag-off is safer than debugging
> live, I would do that. After recovery, I would use traces and release
> comparison to find the root cause and add a guardrail so it does not repeat.

## 23. Two Teams Want Different Frontend Architectures. How Do You Resolve It?

Start by turning preferences into decision criteria.

Evaluate:

- product goals
- team ownership
- release independence
- runtime performance
- developer experience
- migration cost
- testability
- observability
- security and compliance
- long-term maintenance

Process:

1. Write the problem statement.
2. List constraints and non-goals.
3. Compare options with tradeoffs.
4. Run a small proof of concept if uncertainty is high.
5. Decide with accountable owners.
6. Document the decision and revisit date.

Strong answer:

> I would not let architecture become a taste debate. I would define decision
> criteria, compare tradeoffs, run a small spike if needed, and document the
> decision so teams can align.

## 24. How Would You Migrate A Large Legacy React App Without Stopping Feature Work?

Use incremental migration.

Practical approach:

- map risky areas and ownership
- define the target architecture
- create adapter layers around legacy APIs
- migrate vertical slices route by route
- keep feature teams shipping inside clear boundaries
- use feature flags for risky changes
- add tests around critical flows before moving them
- measure bundle size, performance, and errors after each slice

Avoid:

- big-bang rewrites
- changing architecture and UI behavior at the same time
- migrating files without improving ownership
- deleting old code before usage reaches zero

Strong answer:

> I would avoid a rewrite freeze. I would migrate by vertical slice, protect
> feature delivery with adapters and flags, and remove legacy paths only after
> telemetry confirms they are unused.

## 25. How Would You Scale Frontend Development Across 5 To 10 Teams?

Scaling frontend teams requires standards and ownership, not only folders.

Needed foundations:

- clear domain ownership
- design system governance
- shared API contract rules
- frontend platform team or rotating guild
- coding standards and architecture decision records
- CI/CD quality gates
- release ownership
- observability standards
- dependency upgrade policy
- onboarding documentation

Operating model:

```txt
feature teams own product domains
platform/design-system team owns shared foundations
architecture guild aligns cross-team decisions
CI/CD enforces minimum quality automatically
```

Tradeoff:

Too much central control slows delivery. Too little control creates duplicated
patterns and inconsistent UX. The senior job is to set standards that keep
teams autonomous inside safe boundaries.

## 26. How Do You Establish Standards Through Reviews, Tests, And Guidelines?

Standards should be automated where possible and discussed where judgment is
needed.

Automate:

- formatting
- linting
- typechecking
- test execution
- bundle budget checks
- dependency scanning
- accessibility smoke checks

Use code review for:

- state ownership
- component boundaries
- API contract clarity
- failure states
- migration risk
- readability
- test coverage quality

Document:

- folder structure
- component API patterns
- state management rules
- testing strategy
- release checklist
- observability expectations

Strong answer:

> I do not want code review to be the first place people learn standards.
> Standards should be documented, enforced by tooling where possible, and used
> in review for judgment-heavy tradeoffs.

## 27. How Do You Update One Item In A Long React List Without Re-rendering Every Row?

Easy answer:

> Keep the list update immutable, but preserve the same object reference for
> every item that did not change. Then render each row with a stable `key`,
> memoize the row component, and pass stable callbacks. For very large lists,
> also use virtualization.

The important detail:

The parent list may still render and call `.map()`. That is often okay.
The optimization goal is that unchanged row components should not re-render or
commit DOM changes.

Mental model:

```txt
Before update:
array A -> item 1 object
        -> item 2 object
        -> item 3 object

After updating item 2:
array B -> same item 1 object
        -> new item 2 object
        -> same item 3 object
```

React sees a new array, so state changed. `React.memo` sees the same object for
item 1 and item 3, so those rows can skip rendering.

The practical approach is:

1. Use stable data IDs as keys.
2. Update state immutably.
3. Preserve object references for unchanged items.
4. Memoize each row with `React.memo`.
5. Pass stable callbacks to rows.
6. Virtualize the list if the DOM itself is large.
7. Use row-level subscriptions only when parent mapping is still too expensive.

Assume each row has this shape:

```tsx
type Todo = {
  id: string;
  title: string;
  done: boolean;
};
```

Bad example:

```tsx
function TodoList({ initialTodos }: { initialTodos: Todo[] }) {
  const [todos, setTodos] = useState(initialTodos);

  function toggleTodo(id: string, done: boolean) {
    setTodos((currentTodos) =>
      currentTodos.map((todo) => ({
        ...todo,
        done: todo.id === id ? done : todo.done,
      })),
    );
  }

  return todos.map((todo, index) => (
    <TodoRow
      key={index}
      todo={todo}
      onToggle={(done) => toggleTodo(todo.id, done)}
    />
  ));
}
```

Why this is bad:

- every item becomes a new object because `{ ...todo }` runs for every row
- index keys can break state when items are inserted, removed, or sorted
- the inline callback creates a new function for every row on every render
- `React.memo` cannot help much because props keep changing

Better array-state approach:

```tsx
const TodoRow = React.memo(function TodoRow({
  todo,
  onToggle,
}: {
  todo: Todo;
  onToggle: (id: string, done: boolean) => void;
}) {
  return (
    <label>
      <input
        checked={todo.done}
        onChange={(event) => onToggle(todo.id, event.target.checked)}
        type="checkbox"
      />
      {todo.title}
    </label>
  );
});

function TodoList({ initialTodos }: { initialTodos: Todo[] }) {
  const [todos, setTodos] = useState(initialTodos);

  const handleToggle = useCallback((id: string, done: boolean) => {
    setTodos((currentTodos) =>
      currentTodos.map((todo) => {
        if (todo.id !== id) return todo;

        return { ...todo, done };
      }),
    );
  }, []);

  return todos.map((todo) => (
    <TodoRow key={todo.id} todo={todo} onToggle={handleToggle} />
  ));
}
```

Why this is better:

- the changed item gets a new object
- unchanged items keep the same object reference
- each row has a stable `key`
- `handleToggle` has a stable function reference
- `React.memo` lets unchanged rows skip rendering

Very important distinction:

> You are not mutating only one array cell in place. You are creating a new
> array so React sees the state change, while reusing the same item objects for
> rows that did not change.

Alternative: normalized state.

Normalized state separates ordering from item data. It is useful when updates
are frequent, items are large, or many operations need fast lookup by ID.

```tsx
type TodoState = {
  ids: string[];
  byId: Record<string, Todo>;
};

function updateTodo(id: string, patch: Partial<Todo>) {
  setState((state) => ({
    ids: state.ids,
    byId: {
      ...state.byId,
      [id]: {
        ...state.byId[id],
        ...patch,
      },
    },
  }));
}
```

Render from normalized state:

```tsx
function TodoList() {
  const ids = useTodoStore((state) => state.ids);

  return ids.map((id) => <TodoRowById key={id} id={id} />);
}
```

For very large lists:

- use virtualization with `react-window`, `react-virtual`, or a similar library
- keep row height stable when possible
- avoid passing new object literals or inline arrays to rows
- avoid filtering and sorting large lists on every keystroke
- consider `useTransition` or `useDeferredValue` for non-urgent derived views

Example row-level subscription:

Use a store with row-level selectors so each row subscribes only to its own
item.

```tsx
function TodoRowById({ id }: { id: string }) {
  const todo = useTodoStore((state) => state.byId[id]);

  return <TodoRow todo={todo} onToggle={toggleTodo} />;
}
```

What to say if the interviewer asks, "Doesn't `.map()` still loop over the full
array?"

> Yes, `.map()` still loops over the array in the parent render. For many lists,
> that loop is cheap compared with re-rendering and committing every row. If the
> loop itself becomes expensive, I would virtualize the list, normalize state,
> or use row-level subscriptions so the parent does less work.

Tradeoff:

Row-level subscriptions add architecture complexity. Start with stable keys,
immutable updates, memoized rows, and virtualization. Move to per-row store
subscriptions only after profiling proves the parent list work is still a
problem.

Strong answer:

> I would keep stable keys, update the changed item immutably, preserve
> references for unchanged items, and memoize row components. For very long
> lists, I would virtualize so the DOM stays small. If updates are extremely
> frequent, I would normalize state or use row-level subscriptions so unchanged
> rows do not re-render.

Quick checklist:

```txt
Stable key?               key={item.id}
Changed item new object?  yes
Unchanged items reused?   yes
Row memoized?             React.memo(Row)
Callback stable?          useCallback or row owns handler
DOM too large?            virtualize
Parent still too slow?    row-level subscriptions
```

## 28. What Additional Senior Frontend Scenario Questions Should You Practice?

Good additional prompts:

- A third-party analytics script adds 400 ms of blocking JavaScript. What do
  you do?
- A design system change breaks five product teams. How do you roll forward?
- A route has good Lighthouse scores locally but poor real user metrics. How do
  you debug it?
- A shared component API is now too generic and hard to maintain. How do you
  simplify it?
- A micro frontend fails to load in production. What should the shell do?
- A team wants to add a global state library for one workflow. How do you
  evaluate it?
- A backend API changes its response shape unexpectedly. How should the
  frontend protect itself?
- A release passes tests but causes hydration errors in production. How do you
  investigate?
- A legacy app has no tests. What do you test first before migration?
- Two teams need the same component but different behavior. Do you share or
  duplicate?

How to answer:

> For each prompt, state the impact, gather evidence, identify ownership,
> propose short-term mitigation, describe the durable fix, and define the
> metric or test that proves the issue is solved.

## Quick Revision Checklist

Before a senior frontend interview, be ready to explain:

- React rendering and reconciliation from a performance angle
- hooks, closures, event loop, and async debugging
- when memoization helps and when it hurts
- how to update one item in a long list without re-rendering every row
- custom hooks and reusable components without coupling
- state ownership in large React apps
- frontend architecture for many teams
- design system governance
- API abstraction and business logic boundaries
- backward-compatible migration
- micro frontend decision criteria
- Module Federation dependency risks
- cross-micro-frontend communication
- frontend CI/CD quality gates
- canary, blue-green, feature flags, and rollback
- production monitoring and Web Vitals
- incident response for frontend regressions
- senior tradeoff communication

## Sources Used

- User-provided senior frontend interview scenario prompt
- Existing React Performance guide in this repository
- Existing Frontend Architecture and Micro Frontends guide in this repository
- Existing DevOps, AWS, and observability guides in this repository
