# React Data Fetching & Server State Interview Guide

React data interview guidance covering the split between server state and client
state, query caches, `staleTime` and `gcTime`, deduplication, race conditions,
optimistic updates and rollback, invalidation strategy, pagination, retries,
prefetching, SSR hydration, and when a client state library is actually the right
answer.

Most React state management questions are really server state questions in
disguise. The single most useful idea in this guide is that data owned by a server
and data owned by the browser are different problems, and treating them the same
is why so many React apps have a large, unhappy Redux store.

## Interview Answer Flow

For a data-layer question, answer in this order:

1. Who owns this data — the server, or this browser tab?
2. What is the cache key, and what invalidates it?
3. What happens when two of these run at once?
4. What does the user see while it is loading, and when it fails?
5. How does the client converge back on server truth?

## 1. What Is The Difference Between Server State And Client State?

Server state is a **cached copy** of data you do not own. Client state is data the
browser owns outright.

| | Server state | Client state |
| --- | --- | --- |
| Owner | the server | this browser tab |
| Examples | users, orders, search results | is this drawer open, current step, theme |
| Can go stale | yes, silently, at any moment | no |
| Shared | with every other client | with nobody |
| Needs | caching, revalidation, dedupe, retry | a `useState` |
| Async | always | almost never |

Why the distinction matters:

> Server state has properties client state does not: it can become wrong without
> anything in your app happening, two components can ask for it at once, requests
> can fail and need retrying, and the user can return to a page and reasonably
> expect to see something immediately. Those properties need machinery. Putting
> server data in a client state container means hand-writing that machinery as
> reducers and thunks — which is exactly what a decade of Redux boilerplate was.

Interview note:

> "We moved server data out of Redux into TanStack Query and deleted 60% of the
> store" is the concrete version of this answer, and it is the shape of what
> actually happened across the ecosystem. What remains in the client store is
> genuinely client state — and it is usually small enough that you question
> whether it needed a library.

## 2. Why Is `useEffect` Plus `useState` A Bad Default For Fetching?

Not because it cannot work, but because getting it right means reimplementing a
cache. Here is the version everyone writes:

```tsx
useEffect(() => {
  setLoading(true);
  fetch(`/api/users/${id}`)
    .then((r) => r.json())
    .then(setUser)
    .finally(() => setLoading(false));
}, [id]);
```

What is missing:

| Missing | Consequence |
| --- | --- |
| Cancellation | changing `id` fast leaves the old response to overwrite the new one |
| Deduplication | two components mounting this both fetch |
| Caching | navigating back refetches and shows a spinner over data you already had |
| Error handling | a rejected promise leaves `loading` true forever without the `finally` |
| `res.ok` check | a 500 with a JSON body resolves happily and sets an error object as `user` |
| Revalidation | data goes stale and nothing notices |
| Retry | one dropped request is a permanent empty state |

Plus the structural issue: the fetch starts *after* render and commit, so you
guarantee at least one extra round trip compared with fetching on the server or
starting it during navigation.

Interview note:

> The honest framing is that `useEffect` fetching is not wrong, it is *incomplete* —
> and the complete version is a library. Every correct hand-rolled implementation
> converges on the same design, so the question is whether you want to maintain
> your copy of it.

Where it is still fine: a one-off request in a small app, a fire-and-forget
telemetry call, or anywhere the data genuinely cannot be shared or cached.

## 3. How Does A Query Cache Actually Work?

Three concepts, and everything else follows from them.

```txt
query key      ['todos', { status: 'done' }]
     |
     v
cache entry    { data, error, status, dataUpdatedAt, ... }
     ^
     |
observers      the mounted components subscribed to this key
```

- **The key identifies the entry.** It is hashed deterministically, so object key
  order does not matter and `['todos', { a: 1, b: 2 }]` matches
  `['todos', { b: 2, a: 1 }]`.
- **The entry holds the data and its metadata** — when it was last fetched,
  whether the last fetch failed, whether one is in flight.
- **Observers are the mounted `useQuery` calls.** Multiple observers on one key
  share one entry and one request. When the last observer unmounts, the entry
  becomes *inactive*, and that is when the garbage collection clock starts.

Everything a query library does is a consequence:

| Behaviour | Because |
| --- | --- |
| Dedupe | one entry per key, so a second observer joins the in-flight request |
| Instant data on remount | the entry outlived the unmount |
| `invalidateQueries` | marks entries stale, and refetches the ones with observers |
| Shared loading state | observers read the same entry's status |

Interview note:

> Being able to draw those three boxes is the difference between having used a
> query library and understanding one. Most confusing behaviour — "why did it
> refetch", "why did it not refetch", "why is my data shared" — is answered by
> asking which key you are on and how many observers it has.

## 4. `staleTime` vs `gcTime` — What Does Each Control?

| | `staleTime` | `gcTime` |
| --- | --- | --- |
| Default | `0` | 5 minutes |
| Controls | whether a **request** happens | whether the **entry is kept** |
| Applies to | active queries | *inactive* entries, with zero observers |
| Clock starts | when data arrives | when the last observer unmounts |
| Raise it to | stop refetching | keep instant data on return |

> While data is fresh, mounting a component on that key reads the cache and fires
> **no request at all**. Once stale, a mount, a window focus, or a reconnect
> triggers a background refetch — the cached data still renders immediately, so
> the user sees content, not a spinner.

The combinations:

```txt
staleTime: 0,    gcTime: 5min  -> instant paint, then background refetch (default)
staleTime: 5min, gcTime: 5min  -> instant paint, no request at all
staleTime: 0,    gcTime: 0     -> spinner every time; effectively no cache
staleTime: 5min, gcTime: 0     -> contradictory: the entry is dropped the moment
                                  nothing observes it, so freshness never applies
```

Choosing `staleTime` per query:

| Data | `staleTime` |
| --- | --- |
| Reference data — countries, currencies, permissions | `Infinity`, invalidated explicitly |
| A user profile | minutes |
| A dashboard metric | seconds |
| A live price or seat availability | `0`, plus polling |

Interview trap:

> A global `staleTime: 0` with complaints about "refetching constantly on tab
> focus" leads people to disable `refetchOnWindowFocus`. That is the wrong knob —
> focus refetching is a feature, and the reason it fires every time is that
> everything is instantly stale. Set a real `staleTime` per query and focus
> refetching becomes exactly what you wanted.

## 5. `isPending`, `isLoading`, `isFetching` — Which Do You Render?

Two independent axes, which is the part people miss:

- **`status`** — `pending` | `error` | `success`. Do I have data?
- **`fetchStatus`** — `fetching` | `paused` | `idle`. Is a request happening?

```txt
isPending   = status === 'pending'        -> no data yet, first load
isFetching  = fetchStatus === 'fetching'  -> a request is in flight, background or not
isLoading   = isPending && isFetching     -> first load, actually fetching
```

They are independent because a background refetch happens while you already have
data — `isPending` false, `isFetching` true.

```tsx
// Spinner only when there is nothing to show.
if (isPending) return <Skeleton />;
if (isError) return <ErrorState onRetry={refetch} />;

return (
  <>
    {isFetching && <RefreshIndicator />} {/* subtle, non-blocking */}
    <List items={data} />
  </>
);
```

Important:

> Rendering a full-page spinner on `isFetching` throws away the entire benefit of
> the cache: the user sees a spinner replace content that was already correct,
> every time the window regains focus. `isPending` gates the skeleton;
> `isFetching` at most gates a small indicator.

Interview note:

> In v4 `isLoading` meant what `isPending` means now. That rename is worth knowing
> because it is the most common source of a migration bug — the old name still
> exists with a narrower meaning, so the code type-checks and silently behaves
> differently.

## 6. How Does Request Deduplication Work, And When Does It Fail?

If a second observer subscribes to a key while a request for that key is in
flight, it joins the existing request. Ten components mounting simultaneously on
`['user', '1']` produce one network request.

When it fails — and this is the interview question:

| Cause | Example |
| --- | --- |
| Keys differ | `['user', 1]` and `['user', '1']` — number versus string |
| A key built from an unstable value | `['todos', new Date()]`, or an inline object rebuilt each render |
| Different `QueryClient` instances | a client created inside a component, so each subtree has its own cache |
| The request is not going through the library | one component still uses raw `fetch` |

```tsx
// Never dedupes: a new filter object identity is irrelevant — the *value* matters,
// and Date.now() makes a new value every render.
useQuery({ queryKey: ["todos", { t: Date.now() }], queryFn });
```

Fix:

> Keys are hashed by value, not identity, so an inline object literal is fine as
> long as its contents are stable. The failure is always a changing *value* — a
> timestamp, a random id, a `new Date()`. Normalise ids to one type at the
> boundary, and keep key construction in one factory so it cannot drift.

## 7. How Do You Handle Out-Of-Order Responses?

The scenario: a user types fast in a filter box, and sometimes the results shown
belong to an earlier keystroke.

Debouncing does not fix this. It makes it rarer. A slow response for `"re"` can
still land after a fast response for `"react"` no matter how long you waited
before firing.

The fix is about identity, not timing:

```tsx
// Each term owns its own cache entry, so a late response for an old term
// writes to an entry nobody is rendering.
const { data } = useQuery({
  queryKey: ["search", term],
  queryFn: ({ signal }) => search(term, { signal }),
  placeholderData: keepPreviousData, // keep the old list visible, no flicker
});
```

Without a library, the same idea by hand:

```tsx
const latest = useRef(0);

useEffect(() => {
  const id = ++latest.current;
  const controller = new AbortController();

  search(term, { signal: controller.signal }).then((result) => {
    if (id === latest.current) setResults(result); // ignore superseded responses
  });

  return () => controller.abort();
}, [term]);
```

The rule:

> Every async result must be attributable to the request that produced it. A
> sequence token, a cache key, or an abort signal all encode that. A delay encodes
> nothing, which is why debouncing is a load optimisation and never a correctness
> fix.

Interview note:

> `placeholderData: keepPreviousData` is the detail that makes this a good user
> experience rather than merely a correct one: the previous results stay on screen
> while the new ones load, so the list does not flash empty on every keystroke.

## 8. When Does `AbortController` Actually Help?

It cancels the HTTP request, which saves bandwidth and backend work. It does not,
on its own, fix a race — an aborted request rejects, and if your `.then` ignores
the rejection you still have the sequencing problem.

```tsx
// The signal is handed to you; forwarding it is all that is required.
useQuery({
  queryKey: ["todos"],
  queryFn: ({ signal }) => fetch("/api/todos", { signal }).then((r) => r.json()),
});
```

The library then aborts when the query is no longer needed — component unmounted,
key changed, an explicit cancel during a mutation.

Where it earns its keep:

- expensive backend queries the user has navigated away from
- typeahead, where most requests are superseded within a second
- large downloads on a metered connection
- `queryClient.cancelQueries` before an optimistic update, so an in-flight refetch
  cannot overwrite it

Edge cases:

> An aborted `fetch` rejects with an `AbortError`, so naive error handling
> displays "something went wrong" for a request you cancelled deliberately. Filter
> it out — query libraries do this for you, which is one more reason not to
> hand-roll. And aborting does not roll back work the server already committed;
> for a mutation, cancellation is not an undo.

## 9. How Do Optimistic Updates Work, And How Do You Roll Back?

Apply the change in the cache immediately, then reconcile with the server.

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
  onError: (_error, _next, context) => {
    queryClient.setQueryData(["todos"], context.previous);
  },
  onSettled: () => {
    // 4. Converge on server truth, after the mutation resolved.
    queryClient.invalidateQueries({ queryKey: ["todos"] });
  },
});
```

Each step is load-bearing:

| Step | Without it |
| --- | --- |
| `cancelQueries` | a refetch that started earlier returns stale data and reverts your update on screen |
| Snapshot | you cannot roll back, so a failure leaves the UI showing a change that did not happen |
| `invalidateQueries` in `onSettled` | the client keeps a guess instead of server truth — ids, timestamps, and computed fields are all wrong |

Edge cases:

> Concurrent mutations on one key break the naive version. Each `onSettled`
> invalidates while the others are still in flight, which is the race again — gate
> it on `isMutating({ queryKey })` reaching zero. And a snapshot taken during a
> second mutation already contains the first one's optimistic change, so rolling
> back restores a state that was never real.

Tradeoff:

> Optimistic UI is a promise to the user. If the action fails you must break that
> promise loudly — a silent revert means they believe their edit saved. That is
> worse than a spinner, so only go optimistic where failure is rare and the change
> is cheap to undo: toggling a like, reordering a list, marking something read.
> Never for a payment.

## 10. How Is `useOptimistic` Different From A Query Library's Optimistic Update?

They solve the same user problem at different layers.

| | `useOptimistic` | Query library |
| --- | --- | --- |
| Scope | one component's local view | the shared cache, so every observer sees it |
| Lifetime | automatically discarded when the action settles | persists until you invalidate or roll back |
| Rollback | free — the real state reappears | you snapshot and restore manually |
| Needs | a React 19 action or transition | a mutation |

```tsx
const [optimisticTodos, addOptimistic] = useOptimistic(todos, (state, next) => [...state, next]);

async function formAction(formData: FormData) {
  addOptimistic({ id: "temp", title: formData.get("title") });
  await createTodo(formData); // the optimistic value is dropped when this settles
}
```

When to use which:

> `useOptimistic` for a local, self-contained interaction where the real state
> arrives from a server action on the same screen — it is dramatically less code,
> and the automatic discard removes the whole class of rollback bugs. The query
> library's version when the change must be visible to other components reading
> the same cache, or when you need it to survive past the action.

Interview trap:

> `useOptimistic` reverting automatically is a feature *and* the most common
> confusion with it. If the action fails and you do not surface an error, the UI
> snaps back with no explanation and the user assumes the app ate their input. The
> automatic revert handles your cache; it does not handle your user.

## 11. Invalidation Or Manual Cache Writes — Which?

| | `invalidateQueries` | `setQueryData` |
| --- | --- | --- |
| Effect | marks stale, refetches observed queries | writes the value directly |
| Truth | server | your guess |
| Cost | a request | none |
| Risk | a moment of staleness | drift from the server, silently |

Default to invalidation:

```tsx
// Correct and cheap to reason about.
onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos"] });
```

Use `setQueryData` when you have the server's own response and it is authoritative:

```tsx
// The server returned the created entity — write it in rather than refetch.
onSuccess: (created) => {
  queryClient.setQueryData(["todos", created.id], created);
  queryClient.invalidateQueries({ queryKey: ["todos", "list"] });
};
```

Interview note:

> The failure mode of manual writes is drift. Your computed list does not match
> what the server would have returned — a derived count, a sort order, a field the
> backend fills in — and nothing tells you, because no request happened. The bug
> surfaces as "it is right until you refresh," which is a miserable thing to
> debug.

Hierarchical keys make invalidation precise:

```tsx
// Invalidates ['todos'], ['todos','list'], ['todos','list',{done:true}] — prefix match.
queryClient.invalidateQueries({ queryKey: ["todos"] });
```

## 12. How Do You Design Query Keys?

Keys are your cache's schema. Design them once, centrally, and never inline them.

```tsx
export const todoKeys = {
  all: ["todos"] as const,
  lists: () => [...todoKeys.all, "list"] as const,
  list: (filters: Filters) => [...todoKeys.lists(), filters] as const,
  details: () => [...todoKeys.all, "detail"] as const,
  detail: (id: string) => [...todoKeys.details(), id] as const,
};
```

Why a factory rather than inline arrays:

| Problem it removes | How |
| --- | --- |
| Typos that silently create a second cache entry | one definition |
| Invalidating the wrong thing | `todoKeys.lists()` says what it means |
| Key drift across features | the hierarchy is enforced by construction |
| Forgetting a dependency | the function signature makes the inputs explicit |

Rules:

- **Every input to `queryFn` belongs in the key.** A key missing a variable means
  two different results share one entry, and you serve the wrong data.
- **Order from general to specific,** so prefix invalidation works naturally.
- **Values must be serialisable and stable** — no `Date` objects, functions, or
  class instances.

Interview note:

> "Every input to the query function must be in the key" is the same rule as the
> `useEffect` dependency array, and it fails the same way: a variable used but not
> declared gives you stale data with no error. The difference is that ESLint
> enforces the dependency array and nothing enforces query keys, which is exactly
> why the factory is worth it.

## 13. Pagination Or Infinite Scroll — What Changes Technically?

| | Paginated | Infinite |
| --- | --- | --- |
| Cache shape | one entry per page | one entry holding an array of pages |
| Hook | `useQuery` with the page in the key | `useInfiniteQuery` |
| Page changes | new key, new entry, new fetch | appends to the same entry |
| Flicker between pages | `placeholderData: keepPreviousData` | none — pages accumulate |
| Deep linking | natural, page is in the URL | hard, you must restore N pages |

```tsx
useInfiniteQuery({
  queryKey: todoKeys.lists(),
  queryFn: ({ pageParam }) => fetchTodos({ cursor: pageParam }),
  initialPageParam: null,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
});
```

The backend decision that matters more than the UI one:

> Offset pagination (`LIMIT 20 OFFSET 200`) drifts when rows are inserted or
> deleted between requests — the user sees an item twice or misses one entirely,
> and the deeper the offset the slower the query. Cursor pagination is stable
> under concurrent writes and stays fast at any depth. For an infinite feed,
> cursors are close to mandatory.

Tradeoff:

> Infinite lists grow the cache entry without bound, and every accumulated page is
> memory and DOM. Combine with virtualisation past a few hundred items, accept
> that back-navigation restoring 40 pages is expensive, and know that infinite
> scroll is an accessibility and usability problem in its own right — no footer,
> no sense of position, no way to link to what you found.

## 14. How Do Retries Work, And When Should You Turn Them Off?

The default is three retries with exponential backoff, which is right for a
flaky network and wrong for a `404`.

```tsx
retry: (failureCount, error) => {
  // Never retry what will never succeed.
  if (error.status >= 400 && error.status < 500) return false;
  return failureCount < 3;
},
retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
```

| Do not retry | Why |
| --- | --- |
| `400`, `404`, `422` | the request is wrong; repeating it stays wrong |
| `401`, `403` | retry the auth refresh, not the request |
| Non-idempotent mutations | a retried `POST` can charge a card twice |
| Anything in tests | three retries turn a failing test into a timeout |

Important:

> Mutations do not retry by default, and that default is correct. A `POST` that
> timed out may well have succeeded — the response was lost, not the write. The
> safe way to retry a mutation is an idempotency key the server deduplicates on,
> which is a backend contract, not a frontend setting.

Edge cases:

> Retries plus a long timeout means a user waits 30 seconds staring at a spinner
> before seeing an error. Cap total retry time against what the user will tolerate,
> and show the error with a manual retry rather than silently burning the budget.

## 15. What Is Prefetching, And Where Do You Put It?

Starting a fetch before the render that needs it, so the cache is warm on arrival.

```tsx
// On hover or focus: the user has signalled intent but not committed.
<Link
  to={`/todos/${id}`}
  onMouseEnter={() =>
    queryClient.prefetchQuery({
      queryKey: todoKeys.detail(id),
      queryFn: () => fetchTodo(id),
      staleTime: 10_000,
    })
  }
/>
```

Where prefetching pays:

| Trigger | Good for |
| --- | --- |
| Hover or focus on a link | detail pages from a list |
| Route transition start | data for the route being entered |
| Rendering page N | page N+1 of a paginated list |
| On the server | anything above the fold — no client round trip at all |

Interview note:

> Prefetching attacks the request waterfall, which is usually the real latency
> problem. Render, then effect, then fetch, then render again is three sequential
> steps before content appears; starting the fetch during navigation collapses it.
> Fetching on the server removes the client round trip altogether, which is the
> strongest version of the same idea.

Tradeoff:

> Prefetching on hover spends bandwidth on links nobody clicks — bad on mobile and
> metered connections. Gate it on `navigator.connection.saveData` and pointer type
> where it matters. Prefetching everything visible is a good way to DDoS your own
> API from a list page.

## 16. How Do You Hydrate A Query Cache From The Server?

Fetch on the server, serialise the cache, and rehydrate on the client so the first
render has data and fires no request.

```tsx
// Server
const queryClient = new QueryClient();
await queryClient.prefetchQuery({ queryKey: todoKeys.lists(), queryFn: fetchTodos });

return (
  <HydrationBoundary state={dehydrate(queryClient)}>
    <TodoList />
  </HydrationBoundary>
);
```

```tsx
// Client — same key, so it reads the hydrated entry rather than fetching.
const { data } = useQuery({ queryKey: todoKeys.lists(), queryFn: fetchTodos });
```

Rules that make it work:

- **The keys must match exactly.** A mismatch means the hydrated entry is ignored
  and the client fetches anyway — silently, so the only symptom is a wasted
  request and a flash.
- **A new `QueryClient` per request on the server.** A module-level one is shared
  across users, which leaks one user's data into another's HTML. This is a
  security bug, not a performance one.
- **Set `staleTime` above zero,** or the client immediately refetches everything
  you just hydrated and the whole exercise buys nothing.
- **Dehydrated state must be serialisable.** `Date`s become strings, so either
  normalise at the boundary or configure a serialiser.

Interview note:

> The per-request client is the answer worth volunteering, because the failure is
> the worst kind: it works perfectly in development with one user and cross-
> contaminates data in production under concurrency.

## 17. Where Should Data-Fetching Errors Be Handled?

Three layers, and a good app uses all three.

| Layer | Handles | Example |
| --- | --- | --- |
| Per query | expected, local failures | this widget's data failed — show an inline retry |
| Error boundary | render-breaking failures | a whole section cannot render; degrade that card |
| Global | cross-cutting concerns | `401` triggers a token refresh or a redirect |

```tsx
// Global: one place for auth and for telemetry.
new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (error.status === 401) return refreshOrRedirect();
      if (query.meta?.silent) return;
      reportError(error);
    },
  }),
});
```

The design principle:

> One failing request should degrade one part of the page. A dashboard where a
> failing widget takes down the whole screen has coupled unrelated features —
> wrap each widget in its own error boundary, and the blast radius becomes one
> card with a retry button.

Interview trap:

> `throwOnError` routes query errors to the nearest error boundary, which is
> tidy — but a boundary cannot retry the request, only reset and re-render. So
> reserve boundaries for failures that genuinely prevent rendering, and handle
> "the data did not load" inline where you can offer a retry that actually
> refetches.

## 18. When Do You Actually Need A Client State Library?

Once server state lives in a query cache, what remains is usually small. Ask in
this order:

```txt
Is it server data?                 -> query cache, not a store
Is it URL state?                   -> the URL. Filters, tabs, pagination, search
Is it used by one component?       -> useState
Is it used by one subtree?         -> lift it, or useReducer + context
Is it genuinely global and often-changing? -> now consider a store
```

| Option | Good at | Cost |
| --- | --- | --- |
| `useState` | almost everything local | none |
| URL | shareable, restorable, back-button-correct state | serialisation |
| Context | low-frequency global values: theme, locale, user | re-renders every consumer |
| Zustand / Jotai | frequently-changing global state with selector subscriptions | another concept |
| Redux Toolkit | large apps needing middleware, devtools, strict conventions | the most ceremony |

Interview note:

> The most under-used answer is the URL. Filters, sort order, the open tab, the
> current page — putting them in the query string makes the state shareable,
> bookmarkable, restorable on refresh, and correct with the back button, all for
> free. Teams routinely build that in a store and then implement URL syncing on
> top, which is the same work twice.

Tradeoff:

> Redux Toolkit is not obsolete — for a large app with many teams, enforced
> conventions and time-travel debugging are genuinely valuable, and RTK Query
> covers server state within the same toolkit. The change is that it should hold
> *client* state. A Redux store that is 90% cached API responses is the
> anti-pattern, not Redux itself.

## 19. How Do You Stop Context From Re-rendering Everything?

Every consumer of a context re-renders when the provider's value changes, and
`React.memo` cannot stop it. Three fixes, in order of how often they apply.

**1. The value identity is unstable.** The most common bug, and pure waste:

```tsx
// New object every render, so every consumer re-renders every time.
<UserContext value={{ user, setUser }}>

// Stable across renders where the inputs did not change.
const value = useMemo(() => ({ user, setUser }), [user]);
```

**2. Split by update frequency.** One context holding a rarely-changing value and
a frequently-changing one forces everyone to re-render at the faster rate:

```tsx
// Consumers of the dispatch context never re-render — dispatch is stable.
<StateContext value={state}>
  <DispatchContext value={dispatch}>
```

**3. When consumers need different slices, context is the wrong tool.** Context has
no selector — you get the whole value or nothing. A store with selectors
(`useSyncExternalStore`, Zustand, Redux) subscribes each component to the slice it
reads, so changing one field re-renders only its readers.

Interview note:

> "Context is not a state manager, it is a dependency injection mechanism" is the
> sentence that captures this. It is excellent at passing a stable value down a
> deep tree — a theme, a client, a user — and poor at broadcasting frequently
> changing state, because it has no way to narrow what each consumer subscribes
> to.

## 20. How Would You Design The Data Layer For A Large React App?

Four layers, each with one job:

```txt
transport   fetch wrapper: base URL, auth, error normalisation, tracing
schema      zod parse at the boundary -> typed, defaulted, trustworthy data
queries     key factories + typed hooks, one module per resource
components  call the hooks, render; no fetching, no URLs, no parsing
```

```tsx
// features/todos/api.ts — the whole contract for this resource, in one file.
export const todoKeys = { … };

const TodoSchema = z.object({ id: z.string(), title: z.string(), done: z.boolean() });

export function useTodos(filters: Filters) {
  return useQuery({
    queryKey: todoKeys.list(filters),
    queryFn: async ({ signal }) => TodoSchema.array().parse(await http.get("/todos", { filters, signal })),
    staleTime: 30_000,
  });
}
```

Why each boundary exists:

| Boundary | Buys you |
| --- | --- |
| Transport | auth and tracing in one place, not in 200 components |
| Schema | a shape change fails *that query* loudly instead of crashing a render three levels down |
| Query module | swapping the query library, or an endpoint, touches one file |
| Components | testable with props, no network knowledge |

Interview trap:

> The schema layer is the one people skip, and it is the one that prevents
> production incidents. `response.json()` returns `any`, so every type at the
> network boundary is an assertion you wrote, not a guarantee anyone checked. A
> fully typed codebase crashes exactly like an untyped one when the backend
> renames a field — parsing is the only thing that closes that gap, and it also
> gives you defaults so `items` is always an array.

Tradeoff:

> Four layers is over-engineering for a small app, and a co-located `useQuery` in
> the component is perfectly good until the codebase has several teams or several
> consumers per endpoint. The trigger for introducing them is the second consumer
> of an endpoint, or the first incident caused by a response shape change.

## Quick Revision Checklist

Be ready to explain:

- server state versus client state, and why the distinction restructures the app
- everything `useEffect` fetching is missing, and why the fix converges on a library
- query key, cache entry, observer — and what each explains
- `staleTime` controls requests, `gcTime` controls retention
- `isPending` gates the skeleton, `isFetching` at most gates an indicator
- why dedupe fails: keys that differ by value
- why debouncing does not fix out-of-order responses
- the four steps of an optimistic update, and what each prevents
- `useOptimistic` versus a cache-level optimistic update
- invalidate by default, `setQueryData` only with authoritative server data
- key factories, and why every query input belongs in the key
- cursor pagination over offset for infinite lists
- never retry a `4xx` or a non-idempotent mutation
- prefetch to collapse the request waterfall
- a new `QueryClient` per request on the server, always
- one failing request degrades one card
- the URL is the most under-used state container
- context is dependency injection, not a state manager
- parse at the network boundary, because types are assertions

## Sources Used

- TanStack Query v5 documentation: caching, query keys, `staleTime` and `gcTime`,
  optimistic updates, infinite queries, retries, prefetching, and SSR hydration
- React documentation for `useOptimistic`, `useSyncExternalStore`, and Context
- Related topics in this repository: `frontend-architecture/system-design.md` on
  response ordering, and `react/19-features.md` on Actions
