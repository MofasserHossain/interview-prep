# Senior React Drill Round

A rapid-fire interview round pitched at 4–6 years of React experience. Each
question is the kind an interviewer uses to separate a mid-level answer from a
senior one, so every section shows both: the answer that is correct but stops
early, and the answer that shows ownership.

Use this file as a self-test. Read only the question, answer out loud, then check
yourself against the two answers and the follow-up probe. The long-form
reasoning for most of these lives in the other React topics — this is the drill,
not the reference.

## Drill Round Structure

Three rounds, roughly twenty minutes each:

1. **Depth probes** (1–8) — do you understand React, or do you know its API?
2. **Production scenarios** (9–16) — can you debug and own a live system?
3. **Breadth checks** (17–20) — accessibility, testing, server state, forms.

The third round is where strong React developers most often go quiet, because
these skills sit next to React rather than inside it.

## 1. A 5,000-Row Table Re-renders Every Row Despite `React.memo`. Why?

The setup: every row is wrapped in `React.memo`, and toggling a checkbox in row
3,000 re-renders all 5,000 rows.

What the interviewer is testing:

- whether you know what `memo` actually compares
- whether you reach for a tool or find the cause
- whether you can order fixes by cost and risk

Mid-level answer:

> `React.memo` only does a shallow compare, so I would add `useCallback` to the
> handlers and make sure the props are stable.

That is the right first instinct but it names one cause out of four and skips the
measurement.

Strong answer:

> `memo` compares props shallowly against the previous render, so it only helps
> if the parent hands the same prop identities. Four things break that here.

The four causes, in the order I would check them:

| Cause | What to look for |
| --- | --- |
| New object per row | `items.map((item) => ({ ...item, selected }))` — every row gets a fresh `item` |
| Inline function props | `onToggle={() => toggle(item.id)}` is a new identity every render |
| Inline object props | `style={{ width }}` or `sx={{}}` defeats the compare the same way |
| Context | a row reading `useContext` re-renders when the context value changes, and `memo` cannot stop it |

Fixes, least invasive first:

1. **Stabilise the props.** Pass `id` instead of the object, hoist the handler
   with `useCallback`, and update state immutably *at row granularity* so the
   4,999 untouched row objects keep their identity. Often this alone fixes it.
2. **Move the changing state out of the parent.** If the parent owns
   `selectedIds`, it must re-render to change them, and then every child is
   re-rendered or re-compared. Let each row subscribe to its own slice — a store
   selector (Zustand, Redux `useSelector`, `useSyncExternalStore`) or a
   context-per-row — so toggling row 3,000 re-renders row 3,000.
3. **Virtualise.** With `react-window` or `virtua` only ~30 rows exist, so the
   question stops mattering. This is last because it changes the DOM structure
   and breaks find-in-page, `Ctrl+F`, and native scroll anchoring.

Interview note:

> I would measure before choosing. 5,000 cheap re-renders that each bail out of
> the DOM diff can still be fast. The Profiler tells me whether the cost is in
> the render phase, in the commit, or somewhere else entirely — and `memo` only
> helps the first.

Follow-up probe:

> Row 3,000 is memoised and its props are genuinely unchanged, but it still
> re-renders. What is left?

Context, a `key` that changed, or a `memo` comparator that returns `false`
because you passed one — and `memo` never blocks a re-render triggered by the
component's own state or by a store subscription inside it.

## 2. What Happens Between `setState` In A Transition And The DOM Changing?

Use the words lane, work-in-progress tree, and commit.

What the interviewer is testing:

- whether "concurrent React" is a slogan or a model you can reason about
- whether you know why a transition is interruptible and a commit is not

Mid-level answer:

> `startTransition` marks the update as low priority, so React can keep the UI
> responsive while it renders the expensive part in the background.

True, and it stops exactly where the interesting part starts.

Strong answer:

> The update is tagged with a transition lane instead of the default sync lane.
> React queues it on the fiber's update queue and asks the scheduler for a
> callback at that priority.

Then, in order:

```txt
schedule  -> scheduler callback at transition priority
render    -> clone fibers into a work-in-progress tree (alternate pointers)
          -> check shouldYield() roughly every 5 ms, yield to the browser
          -> a higher-priority update can interrupt and throw this work away
complete  -> WIP tree finished without suspending
commit    -> one synchronous, uninterruptible pass:
               mutation phase applies DOM changes
               layout effects run, before paint
               current pointer flips to the WIP tree
               passive effects flush after paint
```

The two sentences that matter:

- **Render is interruptible, commit is not.** That asymmetry is the whole design.
  Rendering can be paused, restarted, or discarded, which is why render must be
  pure. Commit must be atomic, or the user would see a half-updated screen.
- **Double buffering is what makes discarding safe.** React builds the new tree
  alongside the current one rather than mutating it, so abandoning the work costs
  nothing but the wasted CPU.

`isPending` is true from the moment the transition starts until that commit.

Follow-up probe:

> A transition has been rendering for 400 ms and the user types. What happens to
> the work already done?

It is discarded. The typing update is a higher-priority lane, so React abandons
the in-progress tree, renders and commits the input, then starts the transition
again from scratch. This is why an expensive transition can feel like it never
finishes under continuous typing — and why `useDeferredValue` is often the better
tool, since it renders the *stale* value rather than nothing.

## 3. What Is Tearing, And Why Is `useSyncExternalStore` The Fix?

What the interviewer is testing:

- whether you understand the consequence of interruptible rendering
- whether you know why the obvious `useEffect` subscription is not enough

Mid-level answer:

> Tearing is when different parts of the UI show different values from the same
> store. `useSyncExternalStore` is the official way to subscribe to an external
> store.

Correct definition, no mechanism.

Strong answer:

> Because rendering is interruptible, React can read an external mutable store
> partway through a render, yield to the browser, have the store mutate, then
> resume and read a different value for the rest of the tree. One commit then
> paints two different truths from one source.

The broken subscription everyone writes first:

```tsx
// Tears, and flashes.
function useStoreValue() {
  const [value, setValue] = useState(store.get());

  useEffect(() => store.subscribe(() => setValue(store.get())), []);

  return value;
}
```

Why the effect does not fix it:

- Effects run **after** commit. The render already happened with whatever
  snapshot `useState` captured, so the wrong value is painted and then corrected
  in a second render — a visible flash, not a fix.
- It does nothing about the mid-render split. Two components can still capture
  their initial state at different times.
- Between mount and the effect running, a mutation is missed entirely.

What `useSyncExternalStore` does:

```tsx
const value = useSyncExternalStore(store.subscribe, store.get, store.getServerSnapshot);
```

You hand React the subscribe function and a `getSnapshot`. React re-reads the
snapshot before committing, and if it changed during the render, it throws the
work away and re-renders synchronously. That guarantees one consistent value for
the whole commit — the consistency guarantee you cannot build in userland,
because only React knows when it is about to commit.

Tradeoff:

> `getSnapshot` must return a referentially stable value for unchanged data. If
> it builds a new object each call, React sees a change every time and loops.
> That is the single most common bug with this hook, and the reason selector
> libraries ship their own `useSyncExternalStoreWithSelector`.

Follow-up probe:

> Does tearing happen in React 17?

No — rendering was synchronous, so there was no window to tear in. Tearing is a
cost React took on in exchange for concurrency, which is why the hook arrived in
18 and why library authors, not app authors, are its main audience.

## 4. Describe A Bug You Could Only Fix With `useLayoutEffect`

Not the textbook difference. A real bug. And say what the SSR warning means.

What the interviewer is testing:

- whether you have actually hit the paint-timing problem
- whether you understand why this hook is a liability on the server

Mid-level answer:

> `useLayoutEffect` runs synchronously after DOM mutations and before paint,
> while `useEffect` runs after paint.

That is the definition, which is not the question.

Strong answer:

> Positioning a tooltip from a measurement. I measure the trigger with
> `getBoundingClientRect`, compute whether the tooltip fits above or below, then
> set its position. With `useEffect` the browser paints the tooltip at its
> default position first, then my correction lands in the next frame — the user
> sees it visibly jump. `useLayoutEffect` runs before paint, so the corrected
> position is in the same frame the tooltip first appears.

The same shape shows up in: restoring scroll position after a list renders,
reading `scrollHeight` to animate an accordion to its natural height, and
syncing a horizontally scrolled header to a virtualised table body.

Tradeoff:

> It blocks paint. Heavy work there janks every frame it runs in, so the body
> must stay a measurement plus a style write. If I find myself doing layout maths
> in a loop there, the real fix is CSS.

What the SSR warning means:

```txt
Warning: useLayoutEffect does nothing on the server, because its effect
cannot be encoded into the renderer's output format.
```

There is no DOM and no paint on the server, so the hook cannot run. The warning
matters because it tells you the server HTML lacks whatever the layout effect
would have applied. If your first paint *depends* on the measurement, the server
output and the post-layout-effect client output differ, which is either a wrong
first paint or a hydration mismatch.

Fix:

> Do not need a measurement for the first paint. CSS anchor positioning, a
> transform-based placement, or rendering the tooltip only after mount removes
> the problem instead of timing around it. If I must measure, I render a
> server-safe placeholder and switch after mount, and I keep the layout effect
> for the client-only branch.

Follow-up probe:

> Your component library uses `useLayoutEffect` and now emits that warning in
> every consumer's SSR build. What do you ship?

The `useIsomorphicLayoutEffect` pattern — alias to `useEffect` when `window` is
undefined. It silences the warning honestly *only* because a component that does
not render on the server had nothing to measure anyway; it is a lie if the
component does render server-side, and then the hydration mismatch is the real
bug to fix.

## 5. Why Must Render Be Pure? Name Three Things That Break

One of the three should only appear in production under concurrent rendering.

What the interviewer is testing:

- whether purity is a style rule to you or a correctness requirement
- whether you know the failure that does not reproduce locally

Mid-level answer:

> Because React can call your component multiple times, and side effects in
> render would run more than once. StrictMode double-renders to catch that.

The first of three, and the least serious.

Strong answer:

Three breaks, in increasing order of how much they will ruin your week:

1. **Double invocation in development.** StrictMode calls render twice and
   discards one result, so a side effect in render fires twice — duplicate
   requests, a counter incremented by two, an array pushed to twice. Annoying,
   but it surfaces immediately and locally, which is the entire point of
   StrictMode.
2. **React may not call your component, or may throw the result away.** A `memo`
   bailout, an unchanged element identity, or a suspended sibling all mean render
   either does not run or runs without ever committing. Work that matters,
   placed in render, silently does not happen — and there is no warning, because
   from React's side nothing went wrong.
3. **An interrupted render applies the effect twice, in production only.** This
   is the one that matters. Under concurrent rendering a higher-priority update
   can interrupt a render, and React discards the partial tree and starts over.
   If render mutated something outside itself — a module-level counter, a cache,
   a prop object — that mutation was already applied, and the restart applies it
   again. It depends on interrupt timing, so it only shows up under load, only in
   production, and never twice the same way.

Interview note:

> Number three is the answer that shows I understand why purity is not a style
> preference. StrictMode exists precisely because that bug is undebuggable in
> production, so React makes a loud, deterministic version of it appear in
> development instead.

Follow-up probe:

> Is reading `Date.now()` during render a purity violation?

It does not mutate anything, so it is not a side effect — but it makes render
non-deterministic, which breaks the same guarantees: two render attempts produce
different trees, and server and client produce different HTML. Both mutation and
non-determinism break purity; people usually only remember the first.

## 6. What Is Wrong With `useEffect(() => setFiltered(items.filter(f)), [items])`?

Every reason, and what it costs at runtime.

What the interviewer is testing:

- whether you recognise derived state on sight
- whether you can quantify the cost rather than just calling it an anti-pattern

Mid-level answer:

> That is derived state. You should compute it during render, or use `useMemo`.

Right conclusion, and it skips both the runtime cost and the bug.

Strong answer:

> It stores something that is already a function of existing state, so there are
> now two sources of truth that can disagree, and it pays a full extra
> render-and-commit cycle to keep them agreeing.

The cost, concretely:

```txt
items changes
  -> render #1 with the OLD filtered value      <- user can see this frame
  -> commit
  -> effect runs, setFiltered(...)
  -> render #2 with the new filtered value
  -> commit
```

Two renders and two commits where one would do, plus a paint of stale data. On
first mount it is worse: `filtered` starts empty, so the user sees an empty list
before the real one.

And the bug: `f` is not in the dependency array. When the predicate or the search
term changes but `items` does not, the filter never re-runs and the UI is
silently stale. The dependency array makes this a *correctness* problem, not just
a performance one.

Fix:

```tsx
// No state, no effect, no extra render.
const filtered = items.filter(f);
```

Tradeoff:

> `useMemo` around it only if the Profiler says the filter itself is expensive.
> Filtering a few thousand items is microseconds — the two extra renders were the
> expensive part, and they are exactly what this version removes. Wrapping it in
> `useMemo` by reflex adds a dependency array to get wrong for no measured gain,
> and React Compiler will do it for me anyway.

Interview note:

> If the goal was actually "keep showing the old list while the new one
> computes," that is `useDeferredValue`, not an effect. Naming the right tool for
> the intent behind the bad code is what turns this into a senior answer.

Follow-up probe:

> When *is* it correct to sync state in an effect?

When the source of truth is genuinely outside React and cannot be read during
render — a subscription, a WebSocket, a media query. Even then the hook is
`useSyncExternalStore`, not `useEffect`. The honest rule: if you can compute it
during render, it is not state.

## 7. Your Team Enables React Compiler. "We Can Delete Every `useMemo` Now." Response?

What the interviewer is testing:

- whether you understand what the compiler does and does not guarantee
- whether you manage a risky migration or just apply it

Mid-level answer:

> Mostly true — the compiler memoises automatically, so manual memoisation is
> redundant. We should still keep `useMemo` where the computation is expensive.

Half right, and the second sentence is the wrong half. The compiler *does* cover
expensive computations when the dependencies are unchanged.

Strong answer:

> Mostly yes for re-render memoisation, but "every" is wrong for three reasons,
> and I would not ship the deletion in the same pull request that turns the
> compiler on.

Where manual memoisation still earns its place:

| Case | Why the compiler does not cover it |
| --- | --- |
| Bail-outs | Code the compiler cannot prove safe makes it skip the **whole component**. That component gets no automatic memoisation at all. |
| Semantic identity | A value passed to a non-React API, or a `useEffect` dependency where identity controls re-subscription. Deleting the memo changes behaviour, not just speed. |
| `useRef`-style singletons | `useMemo(() => new Foo(), [])` for a stable instance is being used as a poor `useRef`, not as an optimisation — that one should become `useRef`, not disappear. |

Process, which is the actual answer:

1. Enable the compiler on its own, verified. The DevTools memo badge and the
   compiler's own output tell me which components it actually optimised — I do
   not assume coverage.
2. Fix the bail-outs it reports. Each one is a real rule-of-React violation, and
   fixing them is worth more than the memoisation.
3. Remove manual memoisation opportunistically after that, in separate commits,
   guided by the Profiler.
4. Keep `"use no memo"` for the component the compiler gets wrong, and treat
   every use of it as a bug to file, not a solution.

Interview note:

> The reason to separate the two changes is bisection. If the compiler causes a
> subtle regression and I deleted 200 memo calls in the same diff, I cannot tell
> which change broke it.

Follow-up probe:

> The compiler is on and a component got slower. How do you investigate?

Check first whether it was memoised at all or bailed out. If it bailed out, the
manual memo I deleted was load-bearing. If it was memoised, the likely cause is
memoising something that should not be — a value that changes every render now
pays the comparison cost plus the cache — or an effect re-firing because a
dependency's identity became *more* stable and changed the timing. Reproduce with
`"use no memo"` on that one component to confirm attribution before changing
anything.

## 8. Which Of `use`, `useOptimistic`, And `useActionState` Is Most Misused?

What the interviewer is testing:

- whether you have used React 19 or only read the release notes
- whether you can name a failure mode rather than a feature

Mid-level answer:

> `use` — people treat it as a general data fetching hook when it is meant for
> promises passed down from the server.

The right pick, stated as a rule rather than a consequence.

Strong answer:

> `use`, and the failure mode is an infinite suspend. `use(promise)` does not
> create, cache, or dedupe anything — it unwraps a promise you already have. So
> this hangs forever:

```tsx
// Broken: a new promise every render, so it never resolves the same one twice.
function Profile({ id }) {
  const user = use(fetch(`/api/users/${id}`).then((r) => r.json()));
  return <h1>{user.name}</h1>;
}
```

Every render creates a new promise, `use` suspends on it, the retry renders
again, creates another, and suspends again. The promise must outlive the render:
created in a Server Component and passed as a prop, or returned from a cache that
gives the same promise for the same key.

What it also does not give you, which is why it is not a data-fetching library:

- no caching, so navigating back refetches
- no deduplication between components asking for the same thing
- no retry, no backoff, no stale-while-revalidate
- no way to refetch on demand

Runner-up, honourably:

> `useOptimistic` without reconciling against server truth. The optimistic value
> is discarded when the action settles and the real state arrives — if the action
> fails and you do not surface that, the UI silently reverts and the user thinks
> their edit vanished. Optimistic UI is a promise to the user, and a failed
> action has to break that promise out loud.

Follow-up probe:

> So when *is* `use` the right tool?

Passing a promise from a Server Component to a Client Component so the server
starts the fetch and the client streams it in without a request waterfall. That
is the case it was designed for, and there it is excellent. Reading context
conditionally is the other real use — `use(Context)` works inside an `if`, which
`useContext` does not.

## 9. p75 INP Went From 180 ms To 900 ms. Local Lighthouse Is 98. No React Code Changed.

What the interviewer is testing:

- whether you understand lab versus field measurement
- whether you look outside the repository when the repository did not change

Mid-level answer:

> I would profile the page in Chrome DevTools, check for long tasks, and look at
> what shipped in the last release.

Reasonable, and it will find nothing, because the premise says the code did not
change and local numbers are fine.

Strong answer:

> The fact that lab is clean and field is not *is* the clue. Lighthouse runs on a
> fast machine, cold cache, no extensions, synthetic network, and no real user
> interactions. INP is measured from real interactions on real devices. I would
> chase that gap rather than re-profile locally.

In order:

1. **Scope it in RUM.** Segment p75 INP by device class, country, browser,
   connection, and route. One cohort or all of them? A low-end Android spike and
   a global regression point at completely different causes. Line the inflection
   point up against a timeline of deploys, flag flips, and tag-manager changes.
2. **Read the INP breakdown.** Input delay, processing time, presentation delay.
   Input delay means the main thread was already busy when the user tapped —
   usually third-party or a long effect. Processing time means my handler is
   slow. Presentation delay means a huge DOM or expensive paint.
3. **Look outside the repo,** because the premise says the code did not change:

   | Suspect | Why it needs no deploy |
   | --- | --- |
   | A new tag via tag manager | marketing ships it without touching the repo — the most common answer |
   | A feature flag rollout | the code shipped weeks ago, the flag flipped Monday |
   | Data shape change | a list that used to be 50 rows now returns 5,000 |
   | API latency | slower responses mean more spinner churn and more re-renders |
   | A floating dependency range | `^` resolved to a heavier minor on the last build |
   | CDN or cache config | cache-miss rate up, so everyone pays full latency |

4. **Reproduce under real conditions.** 4× CPU throttle, Slow 4G, production data
   volumes, extensions enabled. If it reproduces, the Profiler is finally useful.
5. **Verify in the field, not the lab.** The fix is proven by p75 INP in RUM
   coming back down, not by Lighthouse going to 99.

Interview note:

> "Nothing changed in our code" almost always means something changed that is not
> in our code. Saying that out loud — and knowing tag managers and feature flags
> bypass the deploy pipeline — is the difference between a senior answer and a
> thorough one.

Follow-up probe:

> RUM shows the regression only on Safari iOS, only on the product page. Now
> what?

Narrow to what is Safari-specific and page-specific: a polyfill that only loads
there, a CSS feature falling back to a more expensive path, an `IntersectionObserver`
or `scroll` handler behaving differently, or memory pressure on older iPhones
causing GC pauses. Test on a real device, not the simulator — this class of bug
does not reproduce in one.

## 10. All Tests Pass, Then Production Fills With Hydration Errors And Flashing Content.

What the interviewer is testing:

- whether you know why the test suite could not have caught this
- whether you can enumerate mismatch causes systematically

Mid-level answer:

> A hydration mismatch means the server HTML differs from the first client
> render. Usually it is a date, `Math.random()`, or reading `window` during
> render.

The right three causes out of six, and no explanation of the test gap.

Strong answer:

> First, why the suite missed it: unit tests render client-side only. Hydration
> only happens when server HTML meets a client render, so nothing in a jsdom
> `render()` can produce a mismatch. This class of bug needs an SSR or end-to-end
> test by definition.

Then the causes, and the flashing narrows it down:

| Cause | Tell |
| --- | --- |
| Non-deterministic render | `Date.now()`, `Math.random()`, `toLocaleString()` with a different timezone or locale on the server |
| Reading browser state in render | `window`, `localStorage`, `matchMedia` for an initial value |
| Uncached personalisation | a full-page cached response served to a user whose cookies say otherwise |
| Invalid HTML nesting | `<div>` inside `<p>`, or inside `<tbody>` — the browser silently repairs the DOM, so it no longer matches what React emitted |
| Third-party DOM mutation | an extension or an injected script edits the DOM before hydration |
| Server/client branch drift | user-agent sniffing, or a different code path under `typeof window` |

> The flashing points straight at the second row. The server renders the default
> branch, the client's first render reads the real value, React patches the
> difference, and the user watches it flip. That is not only an error in the log —
> it is a layout shift and a CLS regression.

Fix:

> Make the first client render byte-identical to the server's. Render the
> server-safe branch, then switch after mount with an effect and state — so the
> change is a deliberate second render rather than a hydration repair. Better, move
> the decision to the server where the cookie or header is readable, so there is
> only one branch. `suppressHydrationWarning` is correct only for a genuinely
> unstable leaf, like a rendered timestamp.

Prevention, which is the part that makes it a senior answer:

> One SSR smoke test per critical route that hydrates the real server HTML and
> fails on any console error. It is a handful of Playwright tests and it closes
> the entire category.

Follow-up probe:

> React 19 changed the error for this. What do you get now, and why does it
> matter?

A diff of the mismatched tree rather than a generic "text content did not match"
with a minified component name. It matters because the old error frequently
pointed at the wrong component — the mismatch surfaced where React noticed it,
not where it originated — and people spent hours in the wrong file.

## 11. Eight Widgets Each Fetch In Their Own Effect. Product Wants Four More. The API Team Is Escalating.

34 requests per page load.

What the interviewer is testing:

- whether you make the complaint concrete before redesigning
- whether you can protect widget independence while cutting requests

Mid-level answer:

> I would lift the data fetching up to the page and pass data down as props, so
> there is one request per resource.

The obvious fix, and it throws away the property that made the widgets useful.

Strong answer:

> First I would make the complaint measurable. 34 cached requests over HTTP/2 is
> a non-problem; 34 uncached requests that each hit the database is a real one.
> I need to know which, and whether the requests are parallel or a waterfall,
> before I pick a fix.

Then, cheapest first:

1. **Shared cache with stable keys.** TanStack Query or SWR dedupes identical
   in-flight keys automatically. If those 34 requests contain 12 distinct
   resources, this drops it to 12 with no architectural change and no widget
   rewrite. Do this first, always — it is a day of work.
2. **Batch at the transport.** A BFF endpoint, or a GraphQL/tRPC batch link, so N
   logical queries become one round trip. Widgets stay independent and unaware.
3. **Hoist or move to the server.** Fetch at the route boundary or in a Server
   Component and pass data down. Fewest requests, and the widgets become
   presentational.

Tradeoff:

| Option | Cost |
| --- | --- |
| Shared cache | cache invalidation becomes a thing you own; keys must be disciplined |
| Batching | one slow query delays the whole batch; a new service to operate |
| Hoisting | the page now knows every widget's data needs — the "drop a widget anywhere" property is gone |

Interview answer:

> I would ship the shared cache immediately, then batching if the API team needs
> a real reduction in request count. I would avoid hoisting if widget
> independence is a product requirement — a configurable dashboard where users
> choose their widgets cannot have the page enumerate their queries.

Interview note:

> The waterfall question matters more than the count. Eight parallel requests
> finish in one round trip's time. Eight sequential ones, each waiting on the
> last, is eight round trips — and that is a rendering architecture problem, not
> a request-count problem.

Follow-up probe:

> Four of the widgets are owned by another team and you cannot change their code.
> Now what?

The cache layer, because it works without touching them — a shared
`QueryClient` at the shell dedupes their requests as long as the keys match,
which is an argument for publishing the query-key convention as part of the
platform contract. Failing that, an HTTP-level cache or a service worker gets
some of the win without any code change at all.

## 12. Fast Typing In A Filter Box Shows Results From An Earlier Keystroke.

Give a fix at the request layer and one at the React layer, then choose.

What the interviewer is testing:

- whether you know debouncing does not fix this
- whether you fix the instance or the class

Mid-level answer:

> Debounce the input so it only fires after the user stops typing.

This reduces how often it happens and fixes nothing. A slow response for "re"
can still land after a fast response for "react", regardless of debouncing.

Strong answer:

> This is a race, so the fix has to be about *identity* — which response belongs
> to which request — not about timing.

Request layer:

```tsx
// Abort the previous request, or guard with a sequence token.
const controller = new AbortController();
const res = await fetch(url, { signal: controller.signal });
```

Either `AbortController` to cancel superseded requests, or a sequence token where
you keep the id of the latest request and discard any response whose id is not
current.

React layer:

> A cache keyed by the search term. With `useQuery({ queryKey: ['search', term] })`
> the question disappears — each term owns its cache entry, and I render the
> entry for the *current* term, so a late response for an old term writes to a
> cache entry nobody is looking at. `useDeferredValue` complements it by keeping
> the last good list on screen while the new one loads, instead of flashing a
> spinner.

Interview answer:

> I would ship the keyed cache and wire `AbortController` into it. The cache fixes
> the class of bug rather than this instance, and it comes with dedupe, instant
> results on back-navigation, and real loading states. The abort signal is still
> worth having so I stop paying for responses I will throw away.

Tradeoff:

> Abort-only has a cost people forget: you discard work you already paid the
> latency for, so returning to a previous term refetches from scratch. The cache
> keeps it. Conversely the cache grows, so `gcTime` becomes a thing to think
> about.

Follow-up probe:

> There is no query library in this codebase and you cannot add one this sprint.
> What is the minimum correct fix?

A ref holding the latest request id, checked before every `setState`, plus
`AbortController`. Roughly ten lines, and it is exactly the logic the library
would have done for me — which is a reasonable thing to say out loud when arguing
for the dependency next sprint.

## 13. You Need A Breaking Change To `<Button>`, Used By Five Product Teams.

What the interviewer is testing:

- whether you have shipped a migration across teams you do not manage
- whether you know a big-bang upgrade is not actually schedulable

Mid-level answer:

> I would version the design system, publish a changelog and migration guide, and
> give teams time to upgrade before removing the old API.

The right shape, missing the mechanisms that make teams actually migrate.

Strong answer:

> I would not ship a breaking change. I would ship an additive one, migrate
> everyone, then remove the old path — across three releases.

| Phase | What ships | Why |
| --- | --- | --- |
| 1 | New API alongside the old, dev-only deprecation warning linking to the migration note | nobody is blocked, and every developer touching the old API learns about it in place |
| 2 | A codemod | if the change cannot be codemodded, it is probably badly designed — that constraint is a useful design review |
| 3 | A lint rule at `warn`, plus adoption telemetry | I need to know *who* is still on the old API, not guess |
| 4 | Lint rule to `error` | now the deadline is enforced by CI instead of by email |
| 5 | Removal in the next major | the old path is already unused, so the major is a no-op |

Tradeoff:

> I carry both APIs for two releases, which is real maintenance cost and a more
> confusing component for anyone reading it. The alternative — a coordinated
> upgrade where all five teams pause feature work in the same sprint — is not
> something I can actually schedule, and pretending otherwise is how design
> system migrations stall for a year.

Interview note:

> "No type errors" does not mean "looks the same." A visual or behavioural change
> to a shared button needs visual regression coverage in the design system's own
> pipeline, because the five consuming teams will not catch a 2px padding shift
> in review.

Follow-up probe:

> One team refuses to migrate and their deadline passes. What do you do?

Find out why before escalating — usually the codemod does not cover their case,
which is my bug, not their obstruction. If it is genuinely a priority conflict, I
keep the old path alive behind an explicit opt-in that makes the debt visible and
owned rather than silently blocking the major for everyone. Escalating to their
manager is a last resort and a sign the plan lacked their input from the start.

## 14. A Third-Party Analytics Script Adds 400 ms Of Blocking JavaScript. Growth Says It Is Non-Negotiable.

What the interviewer is testing:

- whether you argue with the constraint or work within it
- whether you bring numbers to a cross-functional disagreement

Mid-level answer:

> I would load it asynchronously with `async` or `defer` so it does not block
> rendering, and explain the performance cost to the growth team.

Right first move, and it stops before the interesting options and before the
negotiation.

Strong answer:

> The requirement is "analytics works," not "analytics blocks the main thread."
> Those are separable, so I would not fight the constraint — I would remove the
> blocking.

Options, in order of how much they buy:

| Approach | Effect |
| --- | --- |
| `async` / `defer` | stops blocking HTML parsing, still costs 400 ms of main thread |
| `strategy="afterInteractive"` or `lazyOnload` | moves the cost past first paint and past interactivity |
| Load on first interaction or `requestIdleCallback` | the cost lands when the user is already busy, not during the critical path |
| Partytown / web worker | moves the 400 ms **off** the main thread entirely — the real fix if the vendor tolerates it |
| Server-side the events | the events you actually need, with zero client cost |

Then negotiate with data:

> Late-loading analytics misses very short sessions. So I would quantify it —
> "we lose 0.4% of sessions, we gain 300 ms of INP across 100%" — and let growth
> make the call with real numbers. Framed that way it is usually not a fight.

Interview note:

> Very often the 400 ms is one tag manager loading six vendors, five of which
> nobody remembers adding. Auditing what is actually in there is the highest-value
> hour in the whole task, and it is a conversation, not a code change.

Fix:

> The durable part is a performance budget on third-party bytes enforced in CI,
> and a named owner for the tag manager. Without those, this exact ticket comes
> back next quarter with a different vendor.

Follow-up probe:

> The vendor's script needs `document.write` and breaks in a worker. Now what?

Then Partytown is out, and the honest options are: load it on interaction, ask
the vendor for a modern build, or escalate the tradeoff with the measured cost.
Sometimes the answer is that the business accepts the 400 ms — and that is a
legitimate outcome as long as the decision is explicit, documented, and
revisited, rather than an accident nobody owns.

## 15. The Bundle Grew 240 KB In One Sprint And Nobody Knows Why.

What the interviewer is testing:

- whether you diff builds or stare at a single treemap
- whether your answer ends with prevention

Mid-level answer:

> I would run the bundle analyser to see what is taking up space, and look for
> large dependencies we could replace or lazy-load.

That finds what is big. The question is what *changed*.

Strong answer:

> A treemap of the current build tells me what is large, not what grew. I would
> diff two builds — the current one against the last known-good commit — because
> the 240 KB is a delta and I should look at it as one.

Then:

1. **Diff, then bisect.** If CI kept per-build size artifacts, the regression
   commit is already visible. If not, build at a few commits across the range to
   bisect it. This is usually minutes, and it beats any amount of reading.
2. **Check the usual suspects** once you have the commit:

   | Cause | Signature |
   | --- | --- |
   | Whole-library import | `import _ from 'lodash'`, or a barrel file that defeats tree shaking |
   | Locale or icon bloat | a date library pulling every locale, an icon set imported non-granularly |
   | Duplicate dependency | two copies of the same library at different versions in the graph |
   | Polyfills returned | a `browserslist` change re-enabled transpilation and core-js |
   | A dynamic import became static | removing `ssr: false` or `lazy()` moves a chunk into the main bundle |
   | A floating range resolved up | nothing in the diff changed, the lockfile did |

3. **Stop it recurring.** A size budget in CI that *fails* the pull request —
   `size-limit` or the framework's build-output diff — reported as a PR comment so
   the cost is visible at review time, when it is cheap to argue about. Budget per
   entry chunk, not on the total, or one lazily-loaded admin page will eat the
   whole allowance.

Interview note:

> The prevention answer matters more than the diagnosis here. Any competent
> developer can find 240 KB with an analyser. The reason it reached production is
> that nothing in the pipeline had an opinion about bundle size, and that is the
> actual finding.

Follow-up probe:

> The 240 KB is one genuinely required dependency for one route. Is that a
> regression?

Not if it is in that route's chunk and not in the shared one. This is why
per-chunk budgets beat a total: the right answer is often "the dependency is
fine, the chunking is wrong." Verify it is actually code-split, and that the
route is not imported eagerly somewhere that drags it into the entry chunk.

## 16. Sentry Spikes With `undefined.map` In A Component You Never Touched. Backend Deployed 20 Minutes Ago.

What the interviewer is testing:

- whether you separate incident response from root cause
- whether you know what TypeScript does not protect at the network boundary

Mid-level answer:

> I would add optional chaining and a default so it does not crash, then ask the
> backend team what changed in the response.

That is a patch, not a fix, and it will be repeated in forty other components.

Strong answer, in three parts:

**Right now — restore service.** Ask the backend team to roll back; it is their
change and it is the fastest path. In parallel, if a flag can disable that widget
faster than a rollback, flip it. I would not ship a frontend hotfix under
pressure to compensate for a change that is about to be reverted.

**Then — find what actually changed.** `undefined.map` means a field I assumed
was an array is not. Get the real response from the new API and compare: renamed,
newly nested, or returning `null` where it used to return `[]`. That last one is
the most common and the most annoying, because it is often not considered a
breaking change by the team that shipped it.

**Then — the durable fix,** which is that one field's shape should never crash a
page:

| Layer | What it does |
| --- | --- |
| Schema validation at the boundary | parse responses with zod. A shape change fails *that query* loudly, with a useful message, instead of crashing a render 3 components deep |
| Defaults in the schema | `items` is always an array after parsing, so every consumer downstream is simply correct |
| Per-widget error boundary | one bad response degrades one card, not the whole dashboard |
| Generated types | types from OpenAPI or GraphQL codegen make a contract change a compile error instead of a runtime one |

Interview trap:

> TypeScript gave us false confidence here. `response.json()` returns `any`, so
> every type at the network boundary is an assertion I wrote, not a guarantee
> anyone checked. A fully typed codebase crashes exactly like an untyped one when
> the server disagrees — validation is the only thing that actually closes that
> gap.

The postmortem:

> No blame on the deploy. The finding is that we had no contract test and no
> validation boundary, so a routine backend change could take down a page. Action
> items: a contract test in the backend's pipeline that fails on an incompatible
> response change, schema validation on critical queries, per-widget error
> boundaries, and an error-rate-delta alert after *either* side deploys. The
> optional chaining fix would have hidden this until the next field changed.

Follow-up probe:

> Schema validation on every response has a cost. Where do you draw the line?

Validate at boundaries you do not control and on data whose shape drives
rendering. Skip it for internal endpoints covered by generated types and contract
tests, and for large payloads where parsing cost is measurable — there, validate
the shape you branch on rather than the whole document. The line is about trust
and blast radius, not about principle.

## 17. Your Modal Traps Focus — Does It? Describe The Keyboard-Only Experience, And How You Test It.

What the interviewer is testing:

- whether you have ever navigated your own app without a mouse
- whether you know the limits of automated accessibility testing

Mid-level answer:

> I would add a focus trap so Tab cycles within the modal, focus the first
> element on open, and close on Escape.

The right checklist, and it misses what the user actually experiences and the
whole testing half of the question.

Strong answer, what actually happens in a hand-rolled modal:

1. You activate the trigger. The modal appears, but focus is still on the
   trigger — which is now *behind* the overlay. Your first Tab goes somewhere
   invisible.
2. You Tab forward. Focus moves through the background page, which is still in
   the tab order, while you see only a dimmed overlay and cannot tell where you
   are.
3. You reach the last control in the modal and Tab again. Focus escapes into the
   page behind, or into browser chrome.
4. Escape does nothing, because nobody wired it.
5. You close the modal. Focus is now on `<body>`, so your next Tab starts from
   the very top of the document and you have lost your place entirely.

What correct looks like:

| Requirement | Detail |
| --- | --- |
| Focus moves in on open | to the dialog or the first meaningful control — not reflexively the close button |
| Tab is constrained | forward and backward, wrapping at both ends |
| Background is inert | out of the tab order **and** out of the accessibility tree, so a screen reader cannot wander into it |
| Escape closes | and so does a click on the backdrop, if that is the design |
| Focus returns on close | to the element that opened it |
| It announces itself | `role="dialog"`, `aria-modal="true"`, and a name via `aria-labelledby` |

Fix:

> Use `<dialog>` with `showModal()`, or a tested primitive like Radix or React
> Aria. The platform gives you the top layer, background inertness, Escape, and
> the modal semantics for free. Hand-rolled focus traps have a long tail —
> iframes, shadow DOM, `contenteditable`, radio groups, nodes added while the
> dialog is open — and that tail is where they all fail.

Testing, in layers:

```tsx
// Integration: the cycle and the return are both assertable.
await user.click(screen.getByRole("button", { name: "Edit" }));
const dialog = screen.getByRole("dialog", { name: "Edit profile" });
expect(dialog).toContainElement(document.activeElement);

await user.tab();
await user.tab();
await user.tab();
expect(dialog).toContainElement(document.activeElement); // never escaped

await user.keyboard("{Escape}");
expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus();
```

Then `jest-axe` for static violations, and `@axe-core/playwright` on the real
page plus an explicit keyboard journey.

Interview note:

> axe catches roughly a third of real accessibility problems. It will not tell me
> whether the announcement makes sense or whether I focused the *sensible*
> element. So automated tests prevent regressions; they do not prove
> accessibility. A manual screen reader pass belongs in the definition of done
> for any new dialog, and saying that is the difference between treating a11y as
> a lint rule and treating it as a user.

Follow-up probe:

> Your modal renders through a portal at the end of `<body>`. Does that help or
> hurt?

It helps with stacking and clipping, and it changes nothing about the tab order —
DOM order is what matters, and a portal at the end of `<body>` happens to put the
dialog last, which is why "it seems to work" without a trap. It also means
`aria-hidden` on your app root is not enough on its own, because the portal is a
sibling, not a child. That asymmetry is exactly why `inert` and the `<dialog>`
top layer exist.

## 18. Write The Test For A Component That Suspends.

What the interviewer is testing:

- whether you have tested async React or only sync React
- whether you mock the network or the module

Mid-level answer:

> I would mock the data fetching function to resolve immediately and then assert
> the rendered output with `waitFor`.

It passes, and it tested the mock rather than the suspending code path.

Strong answer:

> Suspense means rendering throws a promise and React shows the nearest boundary.
> So the test has to provide the boundary, assert the fallback, await resolution,
> and assert the result. I mock the network, not the module, so the real
> suspending path runs.

```tsx
const server = setupServer(
  http.get("/api/users/1", () => HttpResponse.json({ name: "Ada" })),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderProfile() {
  // A fresh client per test, retries off, or a failing query retries
  // three times and the test times out instead of failing.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <ErrorBoundary fallback={<p>Something went wrong</p>}>
        <Suspense fallback={<p>Loading…</p>}>
          <Profile id="1" />
        </Suspense>
      </ErrorBoundary>
    </QueryClientProvider>,
  );
}

test("shows the fallback, then the profile", async () => {
  renderProfile();

  expect(screen.getByText("Loading…")).toBeInTheDocument();
  expect(await screen.findByText("Ada")).toBeInTheDocument();
});

test("shows the error boundary when the request fails", async () => {
  server.use(http.get("/api/users/1", () => HttpResponse.error()));
  renderProfile();

  expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
});
```

Why each piece is there:

- **MSW over `jest.mock`** — the component's real fetching code runs, so the test
  survives a refactor of *how* it fetches and catches a broken URL or a bad
  parse. Mocking the module makes the test a mirror of the implementation.
- **`findBy*`, not `getBy*`, for the resolved state** — `findBy*` is async and
  act-wrapped, so it waits for the suspense resolution and the re-render without
  a manual `act`.
- **`getBy*` for the fallback** — that assertion must be synchronous, before the
  await, or the fallback is already gone.
- **The error boundary in the same tree** — the rejected path is half the
  behaviour, and it is the half that ships broken.

Interview trap:

> Three ways this test hangs instead of failing: a promise created during render
> so it never resolves the same one twice; retries left on, so a failing query
> takes three attempts past the timeout; and fake timers without advancing them,
> which deadlocks the await. A hanging test looks like a flaky test, and people
> disable it rather than read it.

Follow-up probe:

> The component suspends on a promise passed down from a Server Component. How do
> you test it?

Pass a promise in directly as a prop — it is just a prop, so the test constructs
it. That is the argument for that data-flow shape generally: a component that
receives a promise is trivially testable, while one that creates its own needs the
whole fetching stack stood up around it.

## 19. `staleTime` vs `gcTime`, And What Happens On A Refetch During A Mutation?

What the interviewer is testing:

- whether you configured a query cache or copied a config
- whether you know the optimistic-update race

Mid-level answer:

> `staleTime` is how long data stays fresh before refetching, and `gcTime` is how
> long it stays in the cache before being removed.

Correct, and it does not say what each one *controls*, which is the point.

Strong answer:

| | `staleTime` | `gcTime` |
| --- | --- | --- |
| Default | `0` | 5 minutes |
| Controls | whether a **request** happens | whether the **entry is kept** |
| Applies to | mounted, active queries | *unused* entries, with no mounted observer |
| Raise it to | stop refetching | keep instant data on return |

> While data is fresh, mounting a component with that key gets the cached value
> and fires **no request at all**. `gcTime` has nothing to do with freshness — it
> is retention, and its clock only starts when the last observer unmounts.

The combination is what matters:

```txt
staleTime: 0,     gcTime: 5min  -> instant cached paint, then background refetch
staleTime: 5min,  gcTime: 5min  -> instant paint, no request
staleTime: 5min,  gcTime: 0     -> contradictory: the entry is dropped the moment
                                   nothing uses it, so freshness never applies
```

The refetch-during-mutation race:

> They are independent, and that is the bug. A background refetch that started
> *before* the mutation lands can return pre-mutation data and overwrite the
> optimistic update — the user sees their change appear, then flip back, then
> reappear when the invalidation resolves.

```tsx
useMutation({
  mutationFn: updateTodo,
  onMutate: async (next) => {
    // 1. Stop in-flight refetches that would overwrite us.
    await queryClient.cancelQueries({ queryKey: ["todos"] });
    // 2. Snapshot for rollback.
    const previous = queryClient.getQueryData(["todos"]);
    // 3. Apply optimistically.
    queryClient.setQueryData(["todos"], (old) => applyUpdate(old, next));
    return { previous };
  },
  onError: (_err, _next, context) => {
    queryClient.setQueryData(["todos"], context.previous);
  },
  onSettled: () => {
    // 4. Converge on server truth, after the mutation resolved.
    queryClient.invalidateQueries({ queryKey: ["todos"] });
  },
});
```

Edge cases:

> With several mutations in flight on the same key, invalidating in each
> `onSettled` refetches while the others are still going — straight back into the
> race. Gate it on `isMutating({ queryKey })` reaching zero, or use a mutation
> scope so they run serially. And rolling back to a snapshot is only correct for
> the *last* mutation; with concurrent ones the snapshot may already include
> another optimistic change.

Follow-up probe:

> Your app refetches on every window focus and users complain about flicker.
> Which knob?

`staleTime`, not `refetchOnWindowFocus`. Focus refetching is usually desirable —
it is the `staleTime: 0` default that makes *every* focus fire a request. Setting
a sensible `staleTime` per query means focus only refetches data that is actually
stale. Disabling focus refetching entirely treats the symptom and loses the
feature.

## 20. A 60-Field Form Re-renders On Every Keystroke. Why Does React Hook Form Not?

What the interviewer is testing:

- whether you understand controlled inputs as a state-ownership problem
- whether you know the cost of the uncontrolled model you are recommending

Mid-level answer:

> React Hook Form uses uncontrolled inputs with refs, so typing does not trigger
> React state updates and the form does not re-render.

Correct, and it does not say why the original re-renders, or what the tradeoff is.

Strong answer, why the naive version re-renders:

> A controlled input drives `value` from state, so every keystroke calls
> `setState` on whichever component owns that state. If that is one `useState`
> object at the form root, every keystroke re-renders the root and therefore all
> 60 fields — plus whatever validation runs, plus any derived work. The
> re-render count is a *state ownership* problem, not an input problem.

Why RHF does not:

| Mechanism | Effect |
| --- | --- |
| Values in a ref-based store, outside React state | typing mutates the DOM and the store; no state changes, so nothing re-renders |
| `register` returns `ref`, `name`, and native handlers | the input is uncontrolled — the DOM is the source of truth |
| `formState` is a Proxy | you only subscribe to the parts you actually read, so reading `errors.email` does not re-render on `isDirty` |
| `useWatch` / `Controller` | scope a subscription to one field's subtree rather than the form |

Tradeoff:

> The DOM being the source of truth is awkward exactly where you need controlled
> behaviour: masked inputs, most third-party selects, anything that transforms on
> type. That is what `Controller` is for — and `Controller` *is* controlled and
> does re-render, so it is a per-field escape hatch, not a default. Also
> `mode: "onChange"` puts validation back on every keystroke and undoes much of
> the win; `onTouched` or `onBlur` is the better default.

Interview note:

> You do not need the library to fix this, and saying so is worth more than
> naming it. Uncontrolled inputs read via `FormData` on submit — or React 19 form
> Actions, where the action receives `FormData` directly — re-render *never*, with
> zero dependencies. And the pure-React answer is state colocation: let each
> field own its own value, and the 60-field re-render disappears without changing
> libraries at all. Reach for RHF when you want per-field validation UX and
> `formState` wiring, not as the fix for a re-render count.

Follow-up probe:

> Your form needs a field that shows or hides based on another field's value.
> Does the uncontrolled model still work?

Yes, with `useWatch` on just that field, which subscribes the conditional subtree
and leaves the other 59 alone. The mistake is `watch()` at the form root, which
subscribes the whole form to every change and reintroduces exactly the
re-render-everything behaviour you adopted the library to avoid.

## Quick Revision Checklist

Before a senior React interview, be able to answer without preparation:

- what `React.memo` compares, and the four ways a parent defeats it
- lane, work-in-progress tree, yield, commit — in order, unprompted
- tearing, and why an effect-based subscription is not the fix
- a real `useLayoutEffect` bug, and what its SSR warning implies
- the purity violation that only appears in production
- the full runtime cost of derived state in an effect
- what React Compiler does not cover, and why you split the migration
- why `use(fetch(...))` hangs forever
- why lab performance numbers disagree with field numbers
- the six causes of hydration mismatch, and which one causes flashing
- dedupe before batching before hoisting, and what hoisting costs
- why debouncing does not fix out-of-order responses
- additive change, codemod, lint rule, removal — the migration order
- how to move third-party JavaScript off the main thread
- diffing builds rather than reading one treemap
- why a fully typed codebase still crashes on a response shape change
- what a keyboard-only user experiences in an untrapped modal
- how to test a suspending component without mocking your own module
- `staleTime` controls requests, `gcTime` controls retention
- why a 60-field form re-renders, and the fix that needs no library

## Sources Used

- Drill round derived from this repository's React track: `core-concepts.md`,
  `internals-fiber.md`, `performance.md`, `bundle-optimization.md`,
  `19-features.md`, `compiler.md`, and `senior-scenarios.md`
- Gap questions (17–20) written alongside the new `accessibility.md`,
  `testing.md`, `data-fetching-state.md`, and `forms-validation.md` topics
