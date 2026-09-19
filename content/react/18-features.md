# React 18 Features Interview Guide

React 18 interview guidance covering concurrent rendering, automatic batching,
transitions, Suspense server rendering, new root APIs, and the hooks introduced
for concurrent-safe apps and libraries.

React 18 is the release where modern React's scheduling model became stable.
For interviews, explain the user problem first: keeping urgent UI responsive
while React prepares less urgent work.

## Course Topic Map

- New root APIs: `createRoot` and `hydrateRoot`
- Concurrent rendering: interruptible rendering work
- Automatic batching: fewer renders across async boundaries
- Transitions: `useTransition` and `startTransition`
- Deferred rendering: `useDeferredValue`
- Hydration-safe IDs: `useId`
- Library hooks: `useSyncExternalStore` and `useInsertionEffect`
- Suspense and streaming server rendering
- Development checks in `StrictMode`
- Migration notes from React 17

## 1. What Changed In React 18?

React 18 introduced the concurrent rendering foundation. Concurrent rendering
lets React prepare UI work in the background, interrupt it, resume it, or throw
it away when a newer update matters more.

Key features:

- `createRoot` and `hydrateRoot`
- automatic batching for more update sources
- `useTransition` and `startTransition`
- `useDeferredValue`
- `useId`
- `useSyncExternalStore`
- `useInsertionEffect`
- improved Suspense support
- streaming server rendering APIs
- stricter development checks in `StrictMode`

Strong interview answer:

> React 18 is mainly about concurrency. The visible APIs help mark non-urgent
> work, defer expensive rendering, batch updates consistently, and make server
> rendering stream through Suspense boundaries.

## 2. Why Did React 18 Add `createRoot` And `hydrateRoot`?

React 18 added new root APIs to enable the concurrent renderer.

Client-rendered app:

```tsx
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(<App />);
```

Server-rendered app:

```tsx
import { hydrateRoot } from "react-dom/client";

hydrateRoot(document.getElementById("root")!, <App />);
```

Why it matters:

Using the old `ReactDOM.render` API keeps the app in legacy behavior. The new
root APIs are the entry point for React 18 features like automatic batching and
concurrent rendering.

Migration note:

Frameworks usually own this setup. In a custom client app, update the root
entry file directly.

## 3. What Is Concurrent Rendering?

Concurrent rendering is React's ability to work on more than one version of the
UI at a time and commit only the version that wins.

Example scenario:

1. The user types into a search input.
2. React updates the input immediately.
3. React starts rendering the filtered result list.
4. The user types again before the list finishes.
5. React can abandon the old list render and work on the newer value.

Why it matters:

The browser stays responsive because React can prioritize direct interactions
over expensive UI updates.

Tradeoff:

Concurrent rendering does not make slow rendering disappear. If the UI is still
too expensive, use smaller components, virtualization, pagination, caching, or
server-side work.

## 4. What Is Automatic Batching In React 18?

Batching means React groups multiple state updates into one render.

React 18 batches updates from more places, including promises, timers, native
events, and React events.

Example:

```tsx
setTimeout(() => {
  setCount((count) => count + 1);
  setOpen((open) => !open);
}, 100);
```

With a React 18 root, those updates are usually processed in one render.

Why it matters:

Automatic batching reduces unnecessary renders and makes async code behave more
like React event-handler code.

Tradeoff:

If code depends on the DOM being updated immediately after one state call, use
`flushSync` only as a narrow escape hatch.

## 5. When Should You Use `useTransition`?

`useTransition` marks a state update as non-urgent and gives you an `isPending`
flag.

Example:

```tsx
const [isPending, startTransition] = useTransition();

function handleSearch(nextQuery: string) {
  setQuery(nextQuery);

  startTransition(() => {
    setFilteredItems(filterItems(items, nextQuery));
  });
}
```

The input update is urgent. The filtered list update can be interrupted.

Use transitions for:

- tab changes with heavy panels
- search results that render many rows
- navigation that may suspend
- charts or previews that recalculate after input

Interview trap:

Controlled input state should not be delayed. Keep direct feedback urgent and
transition the expensive dependent UI.

## 6. What Is `startTransition`?

`startTransition` is the non-hook version of transition scheduling.

Example:

```tsx
import { startTransition } from "react";

function selectUser(userId: string) {
  startTransition(() => {
    setSelectedUserId(userId);
  });
}
```

Use `startTransition` when you need to mark work outside a component hook
context or from shared code.

Difference from `useTransition`:

- `useTransition` gives the component an `isPending` value
- `startTransition` only marks updates as transitions

Tradeoff:

If the component needs to show pending UI, `useTransition` is usually more
convenient.

## 7. When Should You Use `useDeferredValue`?

`useDeferredValue` returns a lagging version of a value. React updates the
urgent value first and lets expensive UI catch up later.

Example:

```tsx
const [query, setQuery] = useState("");
const deferredQuery = useDeferredValue(query);

const results = useMemo(() => {
  return searchProducts(products, deferredQuery);
}, [products, deferredQuery]);
```

Use it when:

- the value comes from props
- you cannot wrap the setter in a transition
- the displayed result can briefly lag behind input

Tradeoff:

It is not a debounce. It helps rendering responsiveness, but it does not reduce
API calls unless you combine it with request-level debouncing or caching.

## 8. What Problem Does `useId` Solve?

`useId` generates stable unique IDs that match between server rendering and
client hydration.

Example:

```tsx
function EmailField() {
  const id = useId();

  return (
    <>
      <label htmlFor={id}>Email</label>
      <input id={id} type="email" />
    </>
  );
}
```

Why it matters:

Component libraries need unique IDs for accessible form fields, descriptions,
and errors. Random IDs can create server/client hydration mismatches.

Interview trap:

Do not use `useId` for list keys. List keys should come from stable data.

## 9. What Is `useSyncExternalStore`?

`useSyncExternalStore` subscribes to external stores in a way that is safe for
concurrent rendering.

Example:

```tsx
function useOnlineStatus() {
  return useSyncExternalStore(
    subscribeToOnlineEvents,
    () => navigator.onLine,
    () => true,
  );
}
```

Why it matters:

React needs a consistent snapshot while rendering. External stores live outside
React, so this hook prevents tearing when concurrent rendering is preparing UI.

Use it for:

- state libraries
- browser subscriptions
- custom external caches
- cross-tab state

Tradeoff:

Application components usually do not need this directly. It is most common in
libraries and shared infrastructure.

## 10. What Is `useInsertionEffect`?

`useInsertionEffect` is a specialized hook for CSS-in-JS libraries. It runs
before layout effects so runtime styles can be inserted before layout reads.

Example:

```tsx
useInsertionEffect(() => {
  styleRegistry.insert(rule);
  return () => styleRegistry.remove(rule);
}, [rule]);
```

Why it matters:

CSS-in-JS libraries need predictable style insertion timing, especially with
concurrent rendering.

Interview answer:

> I would rarely use `useInsertionEffect` in application code. It is mainly a
> library hook for style injection.

## 11. What Changed For Suspense And Server Rendering In React 18?

React 18 improved Suspense and added streaming server rendering APIs.

Example:

```tsx
<Suspense fallback={<ProductSkeleton />}>
  <ProductDetails id={productId} />
</Suspense>
```

Why it matters:

Suspense lets a component tree declare a loading boundary. With streaming
server rendering, ready parts of the page can be sent while slower parts are
still loading.

Server APIs:

- `renderToPipeableStream` for Node.js streams
- `renderToReadableStream` for Web Streams and edge runtimes
- `hydrateRoot` for client hydration

Tradeoff:

Suspense data fetching is best handled by frameworks or data libraries. Manual
Suspense integrations are easy to get wrong.

## 12. What Strict Mode Behavior Changed In React 18?

In development, React 18 `StrictMode` simulates mounting, unmounting, and
remounting components to find unsafe effects.

Bad:

```tsx
useEffect(() => {
  socket.connect();
}, []);
```

Better:

```tsx
useEffect(() => {
  socket.connect();

  return () => socket.disconnect();
}, []);
```

Why it matters:

Concurrent React can start, stop, or retry work. Effects must clean up after
themselves and be resilient to setup running more than once.

Tradeoff:

This extra behavior is development-only. Prefer fixing effect cleanup instead
of removing `StrictMode`.

## 13. How Would You Migrate A React 17 App To React 18?

Start with a conservative migration:

1. Upgrade `react` and `react-dom`.
2. Replace `ReactDOM.render` with `createRoot`.
3. Replace `ReactDOM.hydrate` with `hydrateRoot` for SSR.
4. Run the app under `StrictMode`.
5. Fix effect cleanup and dependency issues.
6. Review tests that assumed synchronous rendering.
7. Add transitions only around real expensive updates.

Common issues:

- extra effects in development reveal missing cleanup
- automatic batching changes timing assumptions
- legacy libraries may need updates
- old test utilities may need `act` fixes

Strong interview answer:

> I would migrate the root first, run the test suite, fix Strict Mode and
> batching assumptions, and only then adopt transitions or deferred rendering
> where profiling shows a responsiveness problem.

## Quick Revision Checklist

Before a React 18 interview, be ready to explain:

- why `createRoot` matters
- what concurrent rendering means
- automatic batching across async boundaries
- urgent vs transition updates
- `useTransition` vs `startTransition`
- `useDeferredValue` vs debounce
- `useId` for hydration-safe accessibility IDs
- why `useSyncExternalStore` is mostly for libraries
- why `useInsertionEffect` is mostly for CSS-in-JS libraries
- streaming SSR with Suspense
- React 18 `StrictMode` development behavior

## Sources Used

- [React v18.0](https://react.dev/blog/2022/03/29/react-v18)
- [React useTransition](https://react.dev/reference/react/useTransition)
- [React startTransition](https://react.dev/reference/react/startTransition)
- [React useDeferredValue](https://react.dev/reference/react/useDeferredValue)
- [React useId](https://react.dev/reference/react/useId)
- [React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
- [React useInsertionEffect](https://react.dev/reference/react/useInsertionEffect)
- [React DOM createRoot](https://react.dev/reference/react-dom/client/createRoot)
- [React DOM hydrateRoot](https://react.dev/reference/react-dom/client/hydrateRoot)
