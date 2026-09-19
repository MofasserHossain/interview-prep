# React Internals And Fiber Interview Guide

React internals guidance covering the render and commit phases, why rendered work
may never reach the DOM, Fiber, lanes and scheduling, update queues,
reconciliation, effect timing, hydration, tearing, and how to explain the whole
pipeline in an interview.

## 1. Can React Render Something Without Ever Committing It To The DOM?

**Yes.** This is the single most revealing question about how modern React works.

```tsx
function App() {
  const [count, setCount] = useState(0);

  return (
    <>
      <h1>{count}</h1>
      <button
        onClick={() => {
          startTransition(() => {
            setCount(count + 1);
          });
        }}
      >
        Update
      </button>
    </>
  );
}
```

React enters the render phase and calculates what the UI **would** look like for
`count = 1`. Before it commits that work, a higher-priority update can arrive.

```viz
type: flow
title: Rendered work that never reaches the DOM
Render update A :: React computes the tree for count = 1
Interrupt :: a higher-priority update arrives
Discard A :: the computed result is thrown away, never committed
Render update B :: React starts again with the newer state
Commit B :: only B's result becomes DOM
```

The consequence:

**Rendered is not the same as committed.** React may execute your component
function and then discard the result entirely.

Interview answer:

> Since concurrent rendering, the render phase is interruptible. React can start
> computing a tree, pause when something more urgent arrives, and abandon that work
> without ever touching the DOM. Only the commit phase is guaranteed to run and is
> synchronous.

## 2. What Are The Render And Commit Phases?

| | Render phase | Commit phase |
| --- | --- | --- |
| Question it answers | "what should the UI look like?" | "which changes get applied?" |
| Interruptible | **yes** | no |
| May run more than once | **yes** | no |
| Touches the DOM | no | yes |
| Must be pure | **yes** | side effects allowed |

**Render phase** — React calls your components, reconciles Fibers, and computes
what changed. It can pause, restart, or abandon this work.

**Commit phase** — React applies the computed mutations to the DOM, updates refs,
and runs effects. This runs to completion.

```tsx
function Product() {
  // Render phase: called, possibly several times, possibly discarded
  const price = formatPrice(product.price);

  useEffect(() => {
    // Commit phase (after paint): guaranteed to have happened
    trackView(product.id);
  }, [product.id]);

  return <div>{price}</div>;
}
```

The rule:

Anything that must happen exactly once, or that the user must be able to observe,
belongs after commit — in an effect or an event handler. Never in the component
body.

## 3. Why Must Render Be Pure?

Because React may run it and throw the result away.

```tsx
// Bad example: a side effect in the render path
function Product() {
  sendAnalyticsEvent(); // may fire for a UI the user never sees
  return <div>Product</div>;
}
```

If that render is interrupted and abandoned, you have recorded a view of something
that was never displayed.

Other impurities that break under concurrent rendering:

```tsx
// Bad: mutating something outside the component
let renderCount = 0;

function Counter() {
  renderCount += 1; // wrong on every restart
  return <span>{renderCount}</span>;
}
```

```tsx
// Bad: mutating props or state during render
function List({ items }) {
  items.sort(); // mutates the caller's array
  return <ul>{items.map(...)}</ul>;
}
```

```tsx
// Good: derive without mutating
function List({ items }) {
  const sorted = [...items].sort();
  return <ul>{sorted.map(...)}</ul>;
}
```

Interview note:

Purity was always the documented rule, but before concurrent rendering you could
often break it without noticing. Interruptible rendering makes the violation
visible — which is exactly why StrictMode double-invokes components in
development.

## 4. What Is Fiber?

Fiber is React's internal representation of a unit of work — one object per
element in the tree, holding its type, props, state, and pointers to its
neighbours.

```txt
FiberNode {
  type          the component or host element
  stateNode     the DOM node or class instance
  child         first child
  sibling       next sibling
  return        parent
  pendingProps  incoming props
  memoizedState hooks list / class state
  flags         what to do at commit (Placement, Update, Deletion)
  lanes         the priorities of pending updates
  alternate     the other tree (current <-> work-in-progress)
}
```

The tree is a **linked list**, not a nested array. That is the key design choice:
React can walk it iteratively with its own cursor, which means it can **stop
mid-traversal** and resume later.

```viz
type: stack
title: What a linked-list tree buys React
Pause :: React can stop between any two Fibers
Resume :: it holds a pointer, so it continues where it left off
Abandon :: work-in-progress is dropped; current tree is untouched
Prioritise :: higher-lane work can jump ahead
```

Before Fiber, reconciliation was a recursive function call. Recursion uses the
JavaScript call stack, which cannot be paused — once started, it had to run to
completion.

## 5. What Is The Double Buffering Model?

React keeps **two** trees and swaps between them.

- **current** — what is on screen
- **workInProgress** — what React is building

Each Fiber points to its counterpart through `alternate`. React builds the
work-in-progress tree, and at commit it swaps the pointer so work-in-progress
becomes current.

Why it matters:

If rendering is abandoned, the current tree was never touched — there is nothing to
roll back. The screen stays consistent because React never mutates what is
displayed until the swap.

Interview note:

This is why an abandoned render is cheap and safe. React is not undoing DOM
changes; it simply discards a tree that was never shown.

## 6. What Are Lanes?

Lanes are React's priority system — a bitmask where each bit represents a
priority level for pending work.

| Roughly | Lane | Source |
| --- | --- | --- |
| Highest | Sync | discrete input: click, keydown |
| | InputContinuous | drag, scroll, hover |
| | Default | ordinary `setState`, network responses |
| | Transition | `startTransition`, `useDeferredValue` |
| Lowest | Idle / Offscreen | far-off or hidden work |

Because it is a bitmask, React can test and merge several pending priorities with
single bitwise operations, and can work on a **set** of lanes at once.

```tsx
// Default lane: urgent, blocks paint until done
setQuery(value);

// Transition lane: interruptible, yields to typing
startTransition(() => {
  setResults(filter(value));
});
```

The practical effect:

The input stays responsive because the transition work sits in a lower lane and is
abandoned and restarted every time a new keystroke arrives.

Interview note:

Lanes replaced the older `expirationTime` model. Expiration times were a single
number, so React could only express "more urgent than". Lanes are a set, so React
can represent unrelated priorities simultaneously — which is what makes selective
hydration and offscreen work possible.

## 7. How Does `startTransition` Actually Work?

It marks the state updates inside it as belonging to a transition lane.

```tsx
const [isPending, startTransition] = useTransition();

function onChange(value: string) {
  setQuery(value);                          // urgent - input updates now
  startTransition(() => {
    setResults(expensiveFilter(value));     // interruptible
  });
}
```

What React does:

1. Processes the urgent update and commits it, so the input shows the new character
2. Begins rendering the transition update
3. If another keystroke arrives mid-render, **abandons** that work and restarts
4. Commits only when it manages to finish without interruption

`isPending` is true while the transition is in flight, which is how you show a
subtle loading state without blocking input.

Important:

`startTransition` does not make the work faster. It makes it **interruptible**, so
slow work stops blocking urgent work. A 2-second filter still takes 2 seconds — it
just no longer freezes typing.

When not to use it:

For updates the user expects to be immediate. Wrapping the input's own value in a
transition makes typing feel laggy, because the character itself is now
low-priority.

## 8. How Does React Track Which Updates Still Need Processing?

Every `setState` pushes an object onto the Fiber's **update queue** — a circular
linked list on `memoizedState` for hooks.

```txt
Fiber (useState hook)
└── queue
    ├── update { lane: Default,    action: 1 }
    ├── update { lane: Transition, action: 2 }
    └── update { lane: Default,    action: 3 }
```

During render, React walks the queue and applies **only the updates whose lane is
included in the lanes currently being worked on**, skipping the rest. Skipped
updates stay in the queue, and their lanes remain marked on the Fiber so React
knows to come back.

This is why abandoning work is safe: the updates were never consumed, only read.

It is also why the functional form matters:

```tsx
setCount(count + 1);       // captures the value read during this render
setCount((c) => c + 1);    // applied against whatever is current when it runs
```

With interruption and replay, the closed-over `count` can be stale. The updater
function is applied in queue order at processing time, so it is always correct.

## 9. What Is Reconciliation, Precisely?

Reconciliation is React comparing the new element tree against the current Fiber
tree to decide what changed.

The rules it uses:

1. **Different type → replace.** `<div>` to `<span>`, or `ComponentA` to
   `ComponentB`, destroys the subtree and builds a new one. State is lost.
2. **Same type → update in place.** Props are updated; state is kept.
3. **Lists are matched by `key`.** Without keys, React matches by index.

```tsx
// Type changed: the entire subtree remounts, state is lost
{isEditing ? <div><Input /></div> : <span><Input /></span>}
```

```tsx
// Same type: Input keeps its state
<div>{isEditing ? <Input mode="edit" /> : <Input mode="view" />}</div>
```

Interview trap:

Defining a component **inside** another component creates a new type on every
render, so React unmounts and remounts it every time:

```tsx
// Bad: Row is a new function identity each render
function Table() {
  const Row = ({ item }) => <tr>{item.name}</tr>;
  return <tbody>{items.map((i) => <Row key={i.id} item={i} />)}</tbody>;
}
```

The symptom is inputs losing focus and state resetting on every keystroke.

## 10. Why Do Keys Matter For Reconciliation?

A key tells React which element in the new list corresponds to which Fiber in the
old one.

```tsx
// Bad: index keys
{items.map((item, i) => <Row key={i} item={item} />)}
```

Insert at the front and every index shifts. React thinks item 0 changed from "A"
to "B", item 1 from "B" to "C", and a new item appeared at the end — so it updates
**every** row instead of inserting one, and any component state travels to the
wrong row.

```tsx
// Good: stable identity
{items.map((item) => <Row key={item.id} item={item} />)}
```

Index keys are only safe when the list never reorders, never has insertions except
at the end, and the items hold no state.

Important:

Keys are scoped to their **siblings**, not globally. Two lists can reuse the same
key values without conflict.

## 11. Is The Virtual DOM Actually Fast?

Not inherently — and this is a good senior follow-up.

The Virtual DOM is a **programming model**, not a performance optimization. Its
value is that you describe the UI declaratively and React works out the mutations.

The honest comparison:

- a hand-written, perfectly targeted DOM update is **faster** than React
- React is faster than naively re-rendering everything with `innerHTML`
- diffing itself costs CPU, and that cost grows with tree size

What actually makes React fast in practice:

- it batches DOM writes, avoiding layout thrashing
- it skips subtrees whose props and state have not changed
- it can now interrupt and prioritise work

Strong answer:

> The Virtual DOM buys maintainability, not raw speed. It lets me write declarative
> UI and lets React batch the real mutations. When a React app is slow, the fix is
> usually to render fewer components — memoization, virtualization, better
> keys — rather than anything about the diffing algorithm itself.

## 12. Why Does StrictMode Render Components Twice?

To surface impurity in development.

```tsx
<StrictMode>
  <App />
</StrictMode>
```

In development, StrictMode double-invokes component bodies, initialisers, and
updater functions, and mounts-unmounts-remounts each component once on mount,
running effects twice.

It is simulating what concurrent rendering can legitimately do: run your render
more than once, and mount, unmount, and remount a component while preserving
state.

```tsx
// StrictMode surfaces this immediately
let id = 0;

function Item() {
  const myId = id++; // impure: different value on the second invocation
  return <li>{myId}</li>;
}
```

```tsx
// And this: an effect that does not clean up
useEffect(() => {
  const socket = connect();
  // no cleanup -> two sockets after the double mount
}, []);
```

Important:

Double rendering happens **only in development**, and only inside StrictMode. The
fix is never to remove StrictMode — it is to make the code idempotent, which is
what concurrent rendering requires anyway.

## 13. When Do Effects Run Relative To Commit?

The commit phase has three sub-phases, and effect timing follows them.

```viz
type: flow
title: Commit phase order
Before mutation :: getSnapshotBeforeUpdate - read the DOM before changes
Mutation :: React applies DOM changes; refs are detached
Layout :: refs attached, useLayoutEffect runs SYNCHRONOUSLY - blocks paint
Browser paint :: the user finally sees the change
Passive :: useEffect runs asynchronously, after paint
```

```tsx
useLayoutEffect(() => {
  // runs before paint - the user never sees an intermediate state
  const { height } = ref.current.getBoundingClientRect();
  setHeight(height);
});

useEffect(() => {
  // runs after paint - does not block the user seeing the update
  analytics.track("viewed");
});
```

When to use which:

- **`useLayoutEffect`** — measuring the DOM and immediately adjusting it, to avoid
  a visible flicker: tooltips, popovers, scroll restoration
- **`useEffect`** — everything else: subscriptions, data fetching, logging

Important:

`useLayoutEffect` blocks paint. Slow work there directly delays what the user sees,
and it warns during server rendering because there is no DOM to measure.

## 14. What Is Hydration, And What Can Go Wrong?

Hydration is React attaching to server-rendered HTML — walking the existing DOM
and building the Fiber tree, attaching event handlers, rather than creating nodes.

```viz
type: flow
title: Hydration
Server HTML arrives :: content is visible but not interactive
JS bundle downloads :: React and the component code
Hydrate :: React renders and matches against existing DOM nodes
Attach handlers :: the page becomes interactive
```

What breaks it:

| Cause | Example |
| --- | --- |
| Time and locale | `toLocaleDateString()` differs server vs client |
| Randomness | `Math.random()`, `crypto.randomUUID()` |
| Browser-only state | `localStorage`, `window.matchMedia` |
| Invalid HTML nesting | `<p><div/></p>` — the browser silently repairs it |
| Browser extensions | injecting attributes into `<body>` |

On a mismatch, React treats it as an error and **client-renders from the nearest
error or Suspense boundary**, which produces a visible flash.

Interview note:

Invalid HTML nesting is the sneakiest cause. The browser repairs the markup while
parsing, so the DOM no longer matches what React produced — and the error message
points at hydration rather than at your markup.

See the Next.js Server & Client Components guide for the inline-script pattern that
fixes locale and theme mismatches.

## 15. What Is Selective Hydration?

React hydrates Suspense boundaries **independently**, and prioritises the one the
user interacts with.

```tsx
<Suspense fallback={<Skeleton />}><Comments /></Suspense>
<Suspense fallback={<Skeleton />}><Sidebar /></Suspense>
```

Two consequences:

1. A slow boundary does not block the rest of the page from becoming interactive.
2. If the user clicks inside a boundary that has not hydrated yet, React
   **prioritises hydrating that boundary first** and replays the event.

That second point is why lanes matter: React needs to express "hydrate this
subtree now, ahead of the others".

Benefits:

Before this, hydration was one blocking pass over the whole tree — the page looked
ready and ignored clicks until the entire bundle had hydrated.

## 16. How Does Suspense Interact With Rendering?

A component that suspends throws a promise. React catches it, keeps the fallback,
and retries when the promise resolves.

```tsx
<Suspense fallback={<Skeleton />}>
  <SlowComponent />
</Suspense>
```

In concurrent rendering, React can keep the **previous** content on screen while
the new content loads, instead of immediately dropping to the fallback:

```tsx
const deferredQuery = useDeferredValue(query);

<Suspense fallback={<Skeleton />}>
  <Results query={deferredQuery} />
</Suspense>
```

Typing keeps the old results visible while the new ones render in the background —
no flash of skeleton on every keystroke.

Important:

A component that suspends may have its render discarded and re-run after the
promise resolves. That is another reason render must be pure — it can genuinely
execute several times for one visible update.

## 17. What Is `useDeferredValue` Doing Internally?

It renders **twice** on a change: once immediately with the old value, then again
in a transition lane with the new one.

```tsx
function Search({ query }: { query: string }) {
  const deferred = useDeferredValue(query);
  const isStale = query !== deferred;

  return (
    <div style={{ opacity: isStale ? 0.6 : 1 }}>
      <Results query={deferred} />
    </div>
  );
}
```

The sequence:

1. `query` changes to `"abc"` — React renders urgently with `deferred` still
   `"ab"`, so the input updates instantly
2. React then renders in a transition lane with `deferred = "abc"`
3. If another keystroke arrives, that second render is abandoned and restarted

`query !== deferred` is how you know the displayed result is stale, which is the
hook for a dimming effect.

`useDeferredValue` vs `useTransition`:

| | `useTransition` | `useDeferredValue` |
| --- | --- | --- |
| You control | the **update** | the **value** |
| Use when | you own the `setState` call | the value arrives as a prop |

## 18. What Is Tearing, And Why Does `useSyncExternalStore` Exist?

**Tearing** is two components rendering different values of the same external
store within a single commit.

It became possible because rendering is interruptible: React can render half the
tree, yield, let the external store change, then render the rest — producing a UI
that shows two versions of the same data.

```tsx
// Vulnerable: no way for React to know the store changed mid-render
function useStoreValue() {
  const [value, setValue] = useState(store.get());
  useEffect(() => store.subscribe(() => setValue(store.get())), []);
  return value;
}
```

```tsx
// Safe: React can detect a change and restart the render
import { useSyncExternalStore } from "react";

function useStoreValue() {
  return useSyncExternalStore(
    store.subscribe,      // subscribe
    () => store.get(),    // client snapshot
    () => store.get(),    // server snapshot, for SSR
  );
}
```

React re-reads the snapshot during render and, if it changed, restarts with the
new value so the whole commit is consistent.

Interview note:

This is why Redux, Zustand, and similar libraries had to be updated for React 18.
The hook exists specifically so external stores can participate safely in
concurrent rendering.

## 19. How Does React Decide To Yield?

React works through Fibers in a loop and checks whether it should hand control
back to the browser.

```txt
while (workInProgress !== null && !shouldYield()) {
  workInProgress = performUnitOfWork(workInProgress);
}
```

`shouldYield()` is true when the current time slice — roughly 5ms — is used up.
React then schedules a continuation and lets the browser handle input, paint, and
other tasks.

This only applies to **concurrent** work. A synchronous, discrete update such as a
click-driven `setState` runs to completion without yielding, because delaying it
would make the app feel unresponsive.

Why the time slice matters:

A 60fps frame is about 16ms. Yielding every ~5ms means React never occupies a
frame long enough to cause a dropped frame on its own.

Study path:

How this queues relative to promises and timers is covered in the JavaScript Event
Loop & Runtime guide — React's scheduler sits on top of those same task and
microtask queues.

## 20. How Do You Explain Render → Reconciliation → Commit On A Whiteboard?

Interview method:

```viz
type: flow
title: The full pipeline
setState :: an update is queued on the Fiber with a lane
Schedule :: the scheduler picks the highest-priority pending lanes
Render :: build the workInProgress tree, calling components - INTERRUPTIBLE
Reconcile :: diff each Fiber against its alternate, set flags
Yield check :: every ~5ms, hand control back to the browser if needed
Commit :: apply mutations, swap current tree, run layout effects - SYNCHRONOUS
Paint :: the browser draws; passive effects run after
```

The four sentences worth memorising:

1. **State updates are queued on Fibers with a priority lane**, not applied
   immediately.
2. **The render phase is interruptible and may be discarded**, so it must be pure.
3. **Reconciliation compares by type and key** to decide update, remount, or
   delete.
4. **The commit phase is synchronous and is the only part that touches the DOM.**

Strong answer:

> A `setState` queues an update on a Fiber with a lane. The scheduler picks the
> highest-priority lanes and builds a work-in-progress tree, reconciling each Fiber
> against its alternate and yielding to the browser roughly every five
> milliseconds. That whole phase can be interrupted and thrown away, which is why
> render must be pure. Only the commit phase — which is synchronous — swaps the
> tree and mutates the DOM, and passive effects run after paint.

## Sources Used

- <https://react.dev/reference/react/useTransition>
- <https://react.dev/reference/react/useDeferredValue>
- <https://react.dev/reference/react/useSyncExternalStore>
- <https://react.dev/reference/react/StrictMode>
- <https://react.dev/learn/preserving-and-resetting-state>
- <https://react.dev/learn/keeping-components-pure>
- <https://react.dev/reference/react/Suspense>
- <https://github.com/acdlite/react-fiber-architecture>
