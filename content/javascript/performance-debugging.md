# JavaScript Performance And Debugging Interview Guide

Engine and diagnosis guidance covering hidden classes and inline caches, what
causes deoptimization, array element kinds, V8 garbage collection, finding memory
leaks with heap snapshots, detached DOM nodes, CPU profiling in the browser and in
Node.js, long tasks, and systematically debugging an application that degrades
over hours.

## 1. What Happens Internally When An Object Is Accessed Repeatedly?

JavaScript objects look like hash maps, but engines do not treat them as one.
V8 gives every object a **hidden class** — an internal description of its shape —
and stores properties at fixed offsets.

```js
function Point(x, y) {
  this.x = x;   // shape C1: { x }
  this.y = y;   // shape C2: { x, y }
}

const a = new Point(1, 2);
const b = new Point(3, 4);   // same shape C2 - shares the hidden class
```

Reading `a.x` is then an offset lookup, not a hash lookup — comparable to a struct
field access in a compiled language.

The rule that follows:

**Property insertion order determines the shape.** Two objects with the same
properties added in different orders get *different* hidden classes.

```js
// Bad example: two shapes for the same logical object
const a = { x: 1, y: 2 };
const b = { y: 2, x: 1 };   // different hidden class
```

```js
// Good: initialise every field, in one place, in a consistent order
function createPoint(x, y) {
  return { x, y, label: null };  // label present from the start
}
```

Interview note:

This is why adding a property later is worse than initialising it to `null`.
`point.label = "a"` after construction transitions the object to a new hidden
class, and every call site that cached the old shape has to adapt.

## 2. What Are Inline Caches, And What Makes Them Go Megamorphic?

An **inline cache** is a per-call-site memory of which shapes it has seen and where
the property lives for each.

```js
function getX(point) {
  return point.x;   // this call site caches shape -> offset
}
```

| State | Shapes seen | Cost |
| --- | --- | --- |
| **Monomorphic** | 1 | fastest — a shape check and an offset read |
| **Polymorphic** | 2–4 | a short list to check |
| **Megamorphic** | 5+ | falls back to a global hash lookup |

```js
// Monomorphic - one shape, fastest path
points.forEach((p) => getX(p));

// Megamorphic - many shapes through one call site
[{ x: 1 }, { x: 1, y: 2 }, { a: 0, x: 1 }, { x: 1, z: 3 }, { b: 9, x: 1 }]
  .forEach((p) => getX(p));
```

How this happens in real code:

- a function handling several unrelated "types" of object
- objects built by conditionally adding properties
- parsing JSON from an API whose shape varies per record
- a generic utility such as `get(obj, key)` used across the whole codebase

Fix — normalise shape at the boundary:

```js
// Every record has the same shape regardless of what the API omitted
function normalise(raw) {
  return {
    id: raw.id,
    name: raw.name ?? null,
    email: raw.email ?? null,
    avatar: raw.avatar ?? null,
  };
}
```

Important:

This is a real effect and a **micro-optimization** in most applications. It matters
in hot loops running millions of times — a render loop, a parser, a data
transform — and is irrelevant in an event handler that fires on click. Say that in
an interview; claiming it always matters is the wrong answer.

## 3. What Causes Deoptimization?

The engine optimizes a function based on the types it has observed. When an
assumption breaks, it **deoptimizes** — discards the optimized code and falls back
to the interpreter.

```js
function add(a, b) {
  return a + b;
}

add(1, 2);        // optimized for numbers
add(3, 4);
add("x", "y");    // assumption broken -> deopt
```

Common triggers:

| Trigger | Why |
| --- | --- |
| Changing argument types | the optimized code assumed one type |
| Adding or deleting properties | the hidden class changes |
| `delete obj.prop` | forces the object into dictionary mode |
| Mixing array element kinds | the array's internal representation changes |
| Reading `arguments` and leaking it | prevents several optimizations |
| Creating holes in arrays | switches to a slower holey representation |

```js
// Bad: delete puts the object into dictionary (hash) mode permanently
delete user.email;

// Good: keep the shape, clear the value
user.email = null;
```

Strong answer:

> Engines optimize on observed types, so the cost is not any single operation — it
> is *changing* the shape or type the engine has specialised for. Keeping object
> shapes and argument types stable is what keeps code on the fast path.

## 4. What Are Array Element Kinds?

V8 tracks what an array contains, and the representation only ever gets **more
general**, never back.

```txt
PACKED_SMI_ELEMENTS      [1, 2, 3]            small integers - fastest
PACKED_DOUBLE_ELEMENTS   [1.5, 2.5]           doubles
PACKED_ELEMENTS          [1, "a", {}]         anything
HOLEY_SMI_ELEMENTS       [1, , 3]             gaps - every read needs a check
HOLEY_ELEMENTS           [1, , "a"]           slowest
```

```js
const a = [1, 2, 3];     // PACKED_SMI - fast
a.push(4.5);             // -> PACKED_DOUBLE, one-way transition
a.push("x");             // -> PACKED_ELEMENTS
```

Holes are the expensive part, because every read must check the prototype chain in
case the hole is shadowed:

```js
// Bad: creates a hole, transitions to HOLEY
const arr = [10, 20, 30];
delete arr[1];           // [10, <empty>, 30]

// Bad: allocates a holey array
const b = new Array(1000);

// Good
arr.splice(1, 1);
const c = Array.from({ length: 1000 }, () => 0);
```

The rule:

Keep arrays **packed and of one type**. Never `delete` an array element, and avoid
`new Array(n)` without filling it.

## 5. How Does V8 Manage Memory?

The heap is split by generation, based on the observation that most objects die
young.

```viz
type: flow
title: V8 garbage collection
Allocation :: new objects go into the young generation nursery
Minor GC (Scavenger) :: frequent, fast, copies survivors between semi-spaces
Promotion :: an object surviving two scavenges moves to the old generation
Major GC (Mark-Compact) :: infrequent, expensive, marks live objects then compacts
Concurrent + incremental :: most marking runs off the main thread to limit pauses
```

| | Young generation | Old generation |
| --- | --- | --- |
| Size | small, a few MB | large |
| Algorithm | scavenge (copying) | mark-sweep-compact |
| Frequency | very often | rarely |
| Pause | sub-millisecond | can be tens of ms |

What this means in practice:

- **Short-lived garbage is nearly free.** Allocating objects in a loop is not the
  problem people assume; the scavenger handles it cheaply.
- **Long-lived growth is expensive.** Objects that survive get promoted, and old
  generation collection is what causes visible pauses.
- **A leak is not "memory that is unreachable and uncollected"** — it is memory
  that is still *reachable* and should not be.

## 6. How Do You Diagnose A Memory Leak In Production?

A leak means something is still referenced. The job is to find the retaining path.

Interview method — the **three-snapshot technique**:

1. Load the app, reach a steady state, take **snapshot 1**
2. Perform the suspect action several times — navigate away and back, open and
   close a modal, run the flow ten times
3. Force garbage collection, take **snapshot 2**
4. Repeat the action the same number of times again, take **snapshot 3**
5. Compare 1→2 and 2→3, filtering to **objects allocated between 1 and 2 that are
   still alive at 3**

Anything in that set survived two collections despite the action completing, which
is the definition of the leak.

What to read in a snapshot:

| Column | Meaning |
| --- | --- |
| **Shallow size** | memory the object itself occupies |
| **Retained size** | memory freed if this object were collected — the important one |
| **Distance** | hops from the GC root |
| **Retainers** | the reference chain keeping it alive — where the fix goes |

```txt
Filter by "Detached" to find DOM nodes removed from the document
but still referenced by JavaScript.
```

In Node.js:

```bash
node --inspect server.js         # then take snapshots from Chrome DevTools
```

```js
import { writeHeapSnapshot } from "node:v8";

process.on("SIGUSR2", () => {
  writeHeapSnapshot(`/tmp/heap-${Date.now()}.heapsnapshot`);
});
```

Sending `SIGUSR2` to a running production process writes a snapshot without a
restart — the standard way to capture a leak in the environment where it happens.

## 7. What Are The Common Sources Of Memory Leaks?

**1. Listeners on long-lived objects.**

```js
// Bad: the closure captures panel; window keeps the closure alive forever
window.addEventListener("resize", () => panel.classList.toggle("wide"));
```

```js
// Good: tear it down
const controller = new AbortController();
window.addEventListener("resize", onResize, { signal: controller.signal });
// later: controller.abort();
```

**2. Timers that are never cleared.** A `setInterval` holding a closure over a
component keeps that whole subtree alive.

**3. Unbounded caches.** A `Map` that only grows. Bound it with an LRU, or use a
`WeakMap` when the key is an object whose lifetime should decide the entry's.

```js
const cache = new WeakMap();   // entry disappears when the key is collected
cache.set(domNode, computed);
```

**4. Detached DOM nodes.** A node removed from the document but still referenced.

**5. Closures over large objects.**

```js
// Bad: the whole record stays alive for one field
function attach(hugeRecord) {
  return () => hugeRecord.id;
}

// Good: capture only what is needed
function attach(hugeRecord) {
  const { id } = hugeRecord;
  return () => id;
}
```

**6. Global accumulators** — an error log array that is appended to and never
drained.

**7. Observers without `disconnect()`** — `IntersectionObserver`,
`MutationObserver`, `ResizeObserver`.

## 8. How Do Closures Accidentally Keep Large Objects Alive?

A closure retains its entire enclosing **environment record**, not just the
variables it mentions — and in some engines, sibling closures share that record.

```js
function setup() {
  const huge = new Array(1_000_000).fill("data");
  const id = computeId(huge);

  // This closure mentions only `id`, but shares the environment holding `huge`
  return () => id;
}
```

The reliable fix is to scope the large value so it falls out of the retained
environment:

```js
function setup() {
  const id = (() => {
    const huge = new Array(1_000_000).fill("data");
    return computeId(huge);     // huge is unreachable once this returns
  })();

  return () => id;
}
```

Interview note:

This is the practical consequence of how closures work at the specification level —
a function holds `[[OuterEnv]]`, which is a reference to a whole record. Explaining
it that way, rather than as "closures remember variables", is what distinguishes a
deep answer.

Study path:

The environment-record mechanics are covered in the JavaScript Execution Context &
Lexical Environment guide.

## 9. What Is A Detached DOM Node?

A node removed from the document that JavaScript still references, so neither the
node nor its subtree can be collected.

```js
// Bad: the reference outlives the node
let cached = document.querySelector("#panel");
cached.remove();          // gone from the page, still in memory
// cached still points at it, along with every descendant
```

```js
// Good
cached.remove();
cached = null;
```

How to find them:

Take a heap snapshot and filter for `Detached`. A growing detached count across
repeated mount and unmount cycles is the signature.

Important:

A listener attached **to the removed element itself** is collected with it. The leak
comes from listeners on long-lived objects — `window`, `document` — whose closures
capture short-lived elements.

## 10. An Application Gets Slow After Several Hours. How Do You Debug It?

CPU rising **and** memory rising together is a strong signal: it is usually one
cause, because a growing structure makes the work over it grow too.

Interview method:

```viz
type: flow
title: Systematic diagnosis
Confirm the shape :: is memory growing monotonically, or sawtoothing normally?
Separate CPU from memory :: profile both; decide which is the cause
Heap: three snapshots :: find what survives; read the retainer chain
CPU: sample a profile :: find the function whose self-time is growing
Correlate with load :: does it track requests, connections, or wall-clock time?
Bisect :: disable suspect subsystems until growth stops
Fix and verify :: re-run the same measurement, do not assume
```

The distinguishing question:

- **Memory grows, CPU flat** → a pure leak, usually a cache or listener
- **CPU grows, memory flat** → an unbounded loop over a growing external source,
  or timers accumulating
- **Both grow together** → a growing collection that is iterated. This is the
  common case.

```js
// The classic: both grow, because the array is both retained and traversed
const subscribers = [];

function subscribe(fn) {
  subscribers.push(fn);   // nothing ever removes
}

function publish(event) {
  subscribers.forEach((fn) => fn(event));  // O(n), n grows forever
}
```

Node-specific checks:

```js
setInterval(() => {
  const m = process.memoryUsage();
  console.log(JSON.stringify({
    rss: Math.round(m.rss / 1e6),
    heapUsed: Math.round(m.heapUsed / 1e6),
    external: Math.round(m.external / 1e6),
    handles: process._getActiveHandles().length,
    requests: process._getActiveRequests().length,
  }));
}, 60_000);
```

A growing **handle count** points at sockets, timers, or file descriptors that are
never closed. Rising `external` with a flat heap points at `Buffer` growth, which
a JavaScript heap snapshot will not show.

Interview note:

Saying "restart it nightly" is not a diagnosis. A supervised restart is a valid
*mitigation* while you investigate, and naming it as such — mitigate, then
diagnose — is a good answer.

## 11. How Do You Profile CPU In The Browser?

The Performance panel records a sampled profile of the main thread.

Method:

1. Record while reproducing the slowness — keep it short, a few seconds
2. Look at the **flame chart** for wide bars: wide means long-running
3. Check **self time** versus **total time** — self time is where the work actually is
4. Look for **long tasks**, marked in red, anything over 50ms
5. Check whether time is in **scripting**, **rendering**, or **painting** — they
   have entirely different fixes

Measuring long tasks in production:

```js
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    reportLongTask({ duration: entry.duration, start: entry.startTime });
  }
}).observe({ entryTypes: ["longtask"] });
```

A task over 50ms blocks input for that long, which is what Interaction to Next
Paint measures.

Fixing a long task, in order of preference:

1. **Do less** — memoize, virtualize, paginate
2. **Break it up** — chunk the work and yield between pieces
3. **Move it off the main thread** — a Web Worker
4. **Defer it** — `requestIdleCallback` for genuinely low-priority work

```js
async function processInChunks(items, handler) {
  for (let i = 0; i < items.length; i += 100) {
    items.slice(i, i + 100).forEach(handler);
    await new Promise((resolve) => setTimeout(resolve, 0)); // yield
  }
}
```

## 12. How Do You Profile CPU In Node.js?

```bash
# Built-in sampling profiler
node --cpu-prof --cpu-prof-dir=./profiles server.js
# produces a .cpuprofile - open it in Chrome DevTools

# The older V8 tick processor
node --prof server.js
node --prof-process isolate-*.log > profile.txt

# Live debugging with DevTools
node --inspect server.js
```

Third-party tools worth naming:

```bash
npx clinic doctor -- node server.js   # diagnoses the category of problem
npx clinic flame -- node server.js    # flamegraph of CPU time
npx 0x server.js                      # flamegraph, minimal setup
```

`clinic doctor` is a good first move because it tells you *what kind* of problem you
have — event loop blocked, GC pressure, or I/O bound — before you dig into a
flamegraph.

Reading a flamegraph:

- **width** = time spent, the only thing that matters
- **height** = call depth, not cost
- look for a wide plateau; that is the hot function
- wide frames in V8 internals such as `GC` point at allocation pressure, not your
  logic

Important:

Profile under **realistic load**, not a single request. A function that is 2% of one
request can be 60% of the profile under concurrency, because that is where
contention appears.

## 13. Your Node API Is Fine With Few Users But Hits 100% CPU Under Load. How Do You Fix It?

100% CPU on a single-threaded runtime means **synchronous work is blocking the
event loop**.

Method:

1. **Confirm the event loop is blocked**, rather than the process simply being busy:

```js
import { monitorEventLoopDelay } from "node:perf_hooks";

const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();

setInterval(() => {
  console.log({ p50: h.mean / 1e6, p99: h.percentile(99) / 1e6 });
}, 10_000);
```

A p99 delay in the hundreds of milliseconds means the loop is starved.

2. **Profile under load** — `clinic flame` or `--cpu-prof` while running a load
   test, not idle.

3. **Find the synchronous culprit.** The usual suspects:

| Culprit | Fix |
| --- | --- |
| `JSON.parse` / `stringify` on large payloads | stream, paginate, or cap size |
| Synchronous `fs` calls | use the promise API |
| `bcrypt` / `crypto` with high cost factors | the async API, which uses the thread pool |
| Regex backtracking on user input | rewrite, or bound input length |
| Templating or Markdown rendering per request | cache the result |
| Sorting or aggregating large arrays in JS | do it in the database |

4. **Move genuinely CPU-bound work off the loop** — a worker thread, or a queue and
   a separate service.

5. **Scale out** only after the above. Adding instances to a blocked event loop
   multiplies cost without fixing the cause.

Important:

Node handles **I/O** concurrently, not **computation**. A slow database query does
not consume CPU; a JSON parse of a 10MB response does. If CPU is at 100%, the
problem is JavaScript execution, not the database.

Study path:

Event loop phases and worker threads are covered in the Node.js Event Loop and
Streams guides.

## 14. Would You Use `Promise.all` For Five Independent Calls? What Breaks At Scale?

For five, yes — it is exactly the right tool.

```js
const [user, orders, settings, notifications, flags] = await Promise.all([
  getUser(id), getOrders(id), getSettings(id), getNotifications(id), getFlags(id),
]);
```

Five sequential awaits cost the sum of the latencies; `Promise.all` costs the
maximum.

What breaks under heavy traffic:

**1. The concurrency multiplies.** Five parallel calls × 500 concurrent requests =
2,500 simultaneous downstream calls. A connection pool of 10 means 2,490 are
queued, and the queue timeout becomes your error.

**2. Fail-fast loses work.** `Promise.all` rejects on the first failure, but the
other four **still run** to completion — you pay for work whose result you discard.

**3. No partial success.** One failing non-essential call takes down a page that
could have rendered.

Fixes:

```js
// Partial success - the page renders with what succeeded
const results = await Promise.allSettled([...]);
const user = results[0].status === "fulfilled" ? results[0].value : null;
```

```js
// Bound the concurrency rather than fanning out without limit
import pLimit from "p-limit";

const limit = pLimit(5);
const results = await Promise.all(ids.map((id) => limit(() => fetchOne(id))));
```

The rule:

`Promise.all` over a **fixed, small** set is correct. `Promise.all` over an
**array of unknown length** is a denial-of-service on your own infrastructure —
bound it.

Important:

Also check whether the five calls should be one. Five round trips to the same
service is usually a missing endpoint, not a concurrency problem.

## 15. Debounce vs Throttle vs `requestAnimationFrame`

| | Debounce | Throttle | `requestAnimationFrame` |
| --- | --- | --- | --- |
| Fires | after silence | at most once per interval | once per frame, before paint |
| Guarantees | the last call | a steady rate | alignment with the display |
| Use for | search input, autosave, resize-end | scroll handlers, analytics, rate-limited APIs | animation, DOM measurement |

```js
// Debounce - wait for the user to stop
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Throttle - at most once per window
function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...args); }
  };
}

// rAF - synchronised with the browser's frame schedule
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => { updatePosition(); ticking = false; });
}
```

The decision rule:

- Does only the **final** value matter? → debounce
- Do you need **steady updates** during a continuous event? → throttle
- Are you **moving or measuring** something visual? → `requestAnimationFrame`

Important:

Throttling a visual update at 100ms produces visible stutter, because frames arrive
every ~16ms. Anything that changes what is on screen belongs in
`requestAnimationFrame`, which is aligned to the frame schedule and pauses in
background tabs.

## 16. How Would You Optimize A 5MB Bundle — Before Reaching For Lazy Loading?

Lazy loading is the *last* step, not the first. Investigate in this order:

**1. Look at the analyzer output.** Guessing wastes the most time.

```bash
ANALYZE=true npm run build
```

**2. Find duplicate dependencies.** Two versions of one library is invisible and
often huge.

```bash
npm ls react
npm dedupe
```

**3. Find the oversized single dependency.** Usually one or two packages dominate:

| Common offender | Replacement |
| --- | --- |
| `moment` | `date-fns`, `dayjs`, or `Intl` |
| `lodash` (full) | `lodash-es` with named imports |
| A full icon set | individual imports, or `optimizePackageImports` |
| `chart.js` + adapters | a lighter chart library, or lazy-load it |

**4. Check that tree shaking is actually working.** A CommonJS dependency, a
side-effectful module, or a missing `"sideEffects": false` silently disables it.

**5. Check for barrel files.** `export * from "./everything"` pulls the whole module
graph in for one import.

**6. Move work to the server.** A Markdown parser or syntax highlighter used only
for rendering never needs to ship at all.

**7. Only now, code-split** by route and behind interaction.

Why this order:

Lazy loading a 5MB bundle produces a 5MB app that downloads in pieces. Removing a
duplicated library or replacing `moment` deletes the bytes entirely, which is
strictly better.

## 17. How Do You Tell Whether A Problem Is CPU, Memory, Network, Or Rendering?

| Symptom | Likely area | First tool |
| --- | --- | --- |
| Page blank for seconds, then appears | network or server | Network panel, TTFB |
| Content appears, input ignored | main-thread JS | Performance panel, long tasks |
| Smooth at first, degrades over time | memory leak | heap snapshots |
| Janky scrolling or animation | rendering | Performance panel, layers |
| Slow only under load | server CPU or contention | server profile under load |
| Slow only on mobile | CPU-bound JS or bundle size | throttled profile |

The decisive first question is **where the time goes**: before the first byte, or
after it. Before is network and server; after is parsing, rendering, and
execution.

```js
const [nav] = performance.getEntriesByType("navigation");
console.log({
  ttfb: nav.responseStart,
  domInteractive: nav.domInteractive,
  loadComplete: nav.loadEventEnd,
});
```

Interview note:

The weakest answers jump straight to a fix — "add caching", "use `useMemo`" —
without establishing which stage is slow. Naming the measurement before the fix is
what the question is actually testing.

## 18. What Is The Systematic Way To Answer A Performance Question?

Interview method:

1. **Reproduce** — under realistic conditions, including throttling and load
2. **Measure** — a profile, a snapshot, or a trace; never a guess
3. **Localise** — which stage: network, parse, execute, render, paint
4. **Form one hypothesis** and state what you expect to see
5. **Change one thing**
6. **Re-measure** against the same baseline
7. **Check the cost** — what did the fix make worse?

Strong answer:

> I never optimise from intuition. I reproduce it under realistic conditions, take
> a profile or a heap snapshot, and localise which stage is slow before changing
> anything. Most of the wins come from doing less work — fewer renders, fewer
> bytes, fewer round trips — rather than from making the same work faster. And I
> re-measure, because a fix that improves one metric often costs another.

## Sources Used

- <https://v8.dev/blog/fast-properties>
- <https://v8.dev/blog/elements-kinds>
- <https://v8.dev/blog/trash-talk>
- <https://developer.chrome.com/docs/devtools/memory-problems>
- <https://developer.chrome.com/docs/devtools/performance>
- <https://nodejs.org/api/perf_hooks.html>
- <https://nodejs.org/api/v8.html>
- <https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver>
- <https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame>
