# Senior Frontend E-commerce (React & GraphQL) Round 2 Guide

Round 2 preparation for Senior Frontend roles in e-commerce that pair React
with GraphQL and Apollo Client. The round mixes deep React internals, GraphQL
protocol knowledge, and cart design under failure — the three things that
separate a senior frontend answer from a competent mid-level one.

The pattern in this round: the first half checks that you know how the tools
actually work, and the second half checks whether you can keep a cart correct
when the network lies to you. Answer the first half precisely and the second
half with tradeoffs.

Deeper per-topic coverage lives in
[React Internals & Fiber](/topics/react-internals-fiber),
[API Protocols](/topics/api-protocols),
[Data Fetching & State](/topics/react-data-fetching-state), and
[React Testing](/topics/react-testing). This guide is the round-shaped path
through them.

## 1. What Is React Fiber, And How Does It Improve Rendering Performance?

Fiber is two things, and a strong answer separates them.

| Meaning | What it is |
| --- | --- |
| The architecture | React's reconciler, rewritten in React 16, that can pause, resume, and abandon rendering work. |
| The data structure | One plain JavaScript object per element in the tree — the unit of work. |

A fiber node holds the fields the reconciler needs to do work incrementally:

```ts
type Fiber = {
  type: Function | string; // CartRow, or "div"
  stateNode: unknown; // the DOM node or class instance
  return: Fiber | null; // parent
  child: Fiber | null; // first child
  sibling: Fiber | null; // next sibling
  pendingProps: unknown; // incoming props for this pass
  memoizedProps: unknown; // props from the last committed pass
  memoizedState: unknown; // the hook list for function components
  lanes: number; // priority bitmask for pending updates
  flags: number; // Placement, Update, Deletion...
  alternate: Fiber | null; // the matching node in the other tree
};
```

Why It Matters:

Before Fiber, reconciliation was a recursive walk. Recursion runs on the
JavaScript call stack, and you cannot pause a call stack — once React started
rendering a 5,000-row product grid, it ran to completion and the main thread
was unavailable until it finished. Typing in the filter box felt frozen.

The `return`/`child`/`sibling` pointers turn the tree into a linked list React
can traverse with a loop instead of recursion. A loop can stop after any node,
keep a pointer, and continue later:

```viz
type: flow
title: What the linked-list tree buys React
Pause :: stop between any two fibers and hand the thread back
Resume :: a saved pointer means work continues where it stopped
Abandon :: higher-priority input arrives, work-in-progress is thrown away
Commit :: only a finished tree is applied to the DOM, in one synchronous pass
```

The concurrent work loop checks a deadline between units of work:

```ts
function workLoopConcurrent() {
  while (workInProgress !== null && !shouldYield()) {
    workInProgress = performUnitOfWork(workInProgress);
  }
}
```

`shouldYield()` is true once React has held the thread for roughly 5ms, so the
browser gets a chance to paint and to process input between slices.

Two more pieces make that safe:

- **Double buffering.** React keeps a `current` tree (what is on screen) and
  builds a `workInProgress` tree beside it, linked through `alternate`. Because
  the on-screen tree is never mutated during render, abandoning work costs
  nothing — React drops the work-in-progress tree and starts over.
- **Lanes.** Each update gets a bitmask lane based on how it was triggered. A
  click is a discrete, high-priority lane; a `startTransition` update gets a
  transition lane that is allowed to be interrupted. Lanes are why React can
  say "this render is less important than that click."

Interview Trap:

> Fiber does not make rendering faster. In raw throughput it does slightly more
> work than the old recursive reconciler — there is bookkeeping for lanes,
> yielding, and two trees. What it buys is *responsiveness*: expensive rendering
> stops blocking input. The p95 time-to-finish may be worse; the p95
> time-to-first-keystroke-response is dramatically better.

E-commerce framing:

> On a category page with 200 product cards and a faceted filter sidebar,
> re-filtering is a large render. Wrapping the filter state update in
> `startTransition` puts the grid re-render on a transition lane, so the
> checkbox ticks instantly and the grid catches up. Without Fiber's ability to
> yield, that is one long task and the checkbox visibly lags.

Follow-up probe:

> "Does Fiber help if my component tree is small?" Almost not at all. Fiber pays
> off when render work is large enough to exceed a frame. For a small tree the
> honest answer is that the bottleneck is elsewhere — usually data fetching or
> a synchronous layout read.

## 2. What Happens Between A State Update And The DOM Update?

Walk the pipeline in order. The senior signal is naming the *phases* and what
is interruptible in each.

```viz
type: flow
title: setState to pixels
Dispatch :: setState creates an update object and picks a lane
Schedule :: the root is marked dirty and a callback is queued
Render :: beginWork down, completeWork up - interruptible, must be pure
Commit :: mutation and layout effects - synchronous, cannot be interrupted
Paint :: the browser draws the new frame
Passive :: useEffect callbacks flush after paint
```

**1. Dispatch.** `setQuantity(3)` calls the dispatcher bound to that hook. React
creates an update object and asks `requestUpdateLane()` what priority the
current context implies — inside a click handler, a discrete lane; inside
`startTransition`, a transition lane. The update is pushed onto the hook's
circular pending queue.

There is a shortcut here worth knowing: if the fiber has no other pending work,
React *eagerly* computes the next state and compares it to the current one with
`Object.is`. If they are equal, it bails out without scheduling anything. This
is why `setCount(count)` with the same value is free.

**2. Schedule.** `scheduleUpdateOnFiber` walks `return` pointers to the root,
merging the lane into each ancestor's `childLanes` so React later knows which
subtrees can be skipped. Then `ensureRootIsScheduled` asks the Scheduler for a
callback — a microtask for sync lanes, a `MessageChannel` task for concurrent
work. Nothing has rendered yet; several `setState` calls in the same handler
land in the same queue, which is what "batching" means.

**3. Render phase.** React walks the tree building the work-in-progress tree:

- `beginWork` goes **down**: it calls your component function, runs hooks,
  produces children, and diffs them against the current tree (reconciliation).
- `completeWork` goes **up**: it creates or prepares host instances, computes
  the DOM property diff, and bubbles `flags` toward the root so the commit
  phase knows exactly what changed.

Bailouts happen here. If a fiber's props are referentially equal, its state has
not changed, and it has no lanes in `childLanes`, React clones the subtree
without calling the component at all. That is the mechanism `React.memo`,
stable `useCallback` props, and children-as-props all exploit.

Important:

> The render phase must be pure. React may run it twice (StrictMode), throw the
> result away (interruption), or run it for a tree that is never committed.
> A `fetch` or a DOM write in a component body is a bug that only shows up
> under concurrency.

**4. Commit phase.** Synchronous, uninterruptible, three sub-phases:

```viz
type: flow
title: Commit phase order
Before mutation :: getSnapshotBeforeUpdate reads the DOM before it changes
Mutation :: DOM nodes inserted, updated, deleted; refs detached; layout cleanup runs
Layout :: refs attached, useLayoutEffect runs synchronously, componentDidMount fires
Swap :: root.current points at the finished tree
Paint :: the browser finally shows the user the new pixels
Passive :: useEffect callbacks run asynchronously, after paint
```

`useLayoutEffect` runs *before* paint, so it can measure and re-write the DOM
without the user seeing an intermediate frame — and for the same reason it
blocks paint. `useEffect` runs after paint, which is why it is the default.

Interview Answer:

> A state update does not touch the DOM. It enqueues an update with a lane,
> schedules work on the root, and returns. Later React renders — building a new
> fiber tree, interruptibly and purely — and only if that render finishes does
> it commit, applying DOM mutations and layout effects in one synchronous pass
> before the browser paints. Passive effects run after the paint.

Follow-up probe:

> "Where would you put a cart-total DOM measurement?" `useLayoutEffect`, because
> a measurement in `useEffect` runs after paint, so any correction you make
> causes a visible flicker. But measure only if you must — a layout read in the
> commit path is a forced synchronous layout on every update.

## 3. What Are GraphQL Queries, Mutations, Subscriptions, And Fragments?

Three operation types and one composition unit.

| Construct | Purpose | Execution |
| --- | --- | --- |
| `query` | Read. Should be side-effect free. | Top-level fields resolve **in parallel**. |
| `mutation` | Write, then read the result back. | Top-level fields resolve **serially**, in document order. |
| `subscription` | A long-lived stream of events pushed by the server. | One root field only, over WebSocket or SSE. |
| `fragment` | A named, reusable selection set on a type. | Not an operation — it is inlined at execution. |

**Query.** The client states the shape it wants and gets exactly that shape
back. No over-fetching, no `/products/:id?include=variants,reviews` guesswork.

```graphql
query ProductPage($slug: String!) {
  product(slug: $slug) {
    id
    title
    price { amount currencyCode }
    variants { id title availableForSale }
  }
}
```

**Mutation.** The important detail is that a mutation is a write *and* a read:
the selection set after the mutation field is what the client gets back, and
choosing it well is how you keep the cache correct without a refetch.

```graphql
mutation UpdateCartLine($lineId: ID!, $quantity: Int!) {
  cartLineUpdate(lineId: $lineId, quantity: $quantity) {
    cartLine {
      id
      quantity
      cost { totalAmount { amount } }
    }
    cart {
      id
      subtotal { amount }
      lineCount
    }
    userErrors { field message code }
  }
}
```

Two e-commerce-specific habits are visible there:

- Return **the mutated entity and its aggregate parent**. The line changed, but
  so did the cart subtotal. Returning both means Apollo's normalized cache
  updates every component with no manual cache surgery and no refetch.
- Return **`userErrors` as data**, not as a thrown GraphQL error. "Only 2 left
  in stock" is a business outcome the UI must render per field, not a transport
  failure. Reserve top-level `errors` for genuine faults.

**Subscription.** A stream. The transport is WebSocket via the `graphql-ws`
protocol (the older `subscriptions-transport-ws` is unmaintained), or SSE for
one-directional cases that must survive strict corporate proxies.

```graphql
subscription CartChanged($cartId: ID!) {
  cartUpdated(cartId: $cartId) {
    id
    lines { id quantity }
    subtotal { amount }
  }
}
```

Tradeoff:

> Subscriptions are stateful infrastructure. Every connected shopper holds a
> socket, which means sticky sessions or a shared pub/sub backplane, reconnect
> and backfill logic, and a load profile your CDN cannot absorb. For a cart
> badge, polling every 30 seconds or refetching on `visibilitychange` is often
> the correct engineering answer. Use subscriptions when latency genuinely
> matters — live inventory on a flash sale, auction bids, order tracking.

**Fragment.** A named selection set tied to a type. It is the unit of
colocation: a component declares the data it needs, and pages compose those
declarations.

```graphql
fragment CartLineFields on CartLine {
  id
  quantity
  merchandise {
    ... on ProductVariant {
      id
      title
      image { url altText }
    }
  }
}

query Cart($id: ID!) {
  cart(id: $id) {
    id
    lines { ...CartLineFields }
  }
}
```

Why It Matters:

Fragments are not just DRY. They are what makes cache updates reliable: if the
cart query and the `cartLineUpdate` mutation both select `CartLineFields`, the
mutation response normalizes onto the exact same cache entity the list reads,
and the list updates itself. Mismatched selection sets are the single most
common cause of "the mutation succeeded but the UI did not change."

Interview Trap:

> A fragment on an interface or union needs `__typename` to be resolvable, and
> Apollo needs `possibleTypes` generated from the schema to match inline
> fragments in the cache. Skip that config and `... on ProductVariant` silently
> reads as a miss.

Follow-up probe:

> "How do fragments interact with codegen?" GraphQL Codegen generates a type
> per fragment, and fragment masking makes a component's props readable *only*
> through its own fragment. That turns "this component quietly depends on a
> field its parent happened to fetch" into a compile error.

## 4. What Is The N+1 Query Problem, And How Do You Solve It?

N+1 is one query to fetch a list, then one additional query per item in that
list. Ten products with a seller name each becomes 11 round trips.

GraphQL makes it the default failure mode because resolvers are per-field and
per-item. A field resolver has no idea it is being called 200 times:

```ts
const resolvers = {
  Query: {
    products: () => db.product.findMany({ take: 200 }),
  },
  Product: {
    // Called once per product. 200 products, 200 queries.
    seller: (product) => db.seller.findUnique({ where: { id: product.sellerId } }),
  },
};
```

Symptom:

Every individual query is fast and correctly indexed, and the endpoint is still
slow. That is the tell: N+1 is a **latency** problem, not a query-plan problem.
200 queries at 2ms each is 400ms of serialized round trips that `EXPLAIN` will
never show you.

**Fix 1 — DataLoader.** Batch and de-duplicate within a single tick.

```ts
import DataLoader from "dataloader";

// Created PER REQUEST, never module-scoped.
function createLoaders() {
  return {
    sellerById: new DataLoader<string, Seller>(async (ids) => {
      const rows = await db.seller.findMany({ where: { id: { in: [...ids] } } });
      const byId = new Map(rows.map((row) => [row.id, row]));
      // Must return results in the same order as `ids`.
      return ids.map((id) => byId.get(id) ?? new Error(`No seller ${id}`));
    }),
  };
}

const resolvers = {
  Product: {
    seller: (product, _args, context) => context.loaders.sellerById.load(product.sellerId),
  },
};
```

200 `.load()` calls in the same tick collapse into one `WHERE id IN (...)`.

Interview Trap:

> A module-level DataLoader is a security bug, not just a caching bug. The
> per-request cache would be shared across users, so shopper A can be served
> shopper B's cached entity after an authorization check passed for A only.
> Always build loaders in the per-request context factory.

**Fix 2 — join at the source.** If the relation is always needed, a single
query with a join or an ORM `include` beats batching, because batching still
costs two round trips.

**Fix 3 — lookahead.** Inspect the GraphQL AST via the resolver's `info`
argument to see which fields the client actually asked for, then eager-load
only those. More powerful than DataLoader, considerably more code.

Tradeoff:

| Approach | Best when | Cost |
| --- | --- | --- |
| DataLoader | Relations requested inconsistently; nested many levels deep. | Two round trips; per-request wiring. |
| Join / eager load | The relation is nearly always selected. | Over-fetches when it is not. |
| Lookahead on `info` | Hot paths where both above are too blunt. | AST handling; harder to maintain. |

**The frontend half of the answer.** For a frontend role, stop the server
answer here and pivot — the same shape appears in the client:

```tsx
// Twenty cards, twenty useQuery calls, twenty HTTP requests.
function ProductCard({ id }: { id: string }) {
  const { data } = useQuery(PRODUCT_PRICE, { variables: { id } });
  return <Price value={data?.product.price} />;
}
```

Three fixes, in the order you should try them:

1. **Hoist the query.** One route-level query selecting a fragment per card,
   passed down as props. Fewest requests, and cards become presentational.
2. **Batch the transport.** `BatchHttpLink` coalesces operations fired in the
   same ~10ms window into one HTTP request. Components stay independent and
   unaware; you trade a little latency for far fewer round trips.
3. **Rely on normalization.** If the list query already wrote `Product:123`
   into the cache with the price field, a child's `useQuery` for that field is
   a cache hit and never reaches the network at all.

Interview Answer:

> N+1 is the same defect at two layers. On the server it is one resolver call
> per row, solved by batching with DataLoader or by joining. On the client it is
> one query per component, solved by hoisting to a route-level query with
> fragments, or by batching at the link. I check for both, because fixing the
> resolver does nothing if the client is firing twenty operations to begin with.

Deeper coverage: [API Protocols](/topics/api-protocols) has the resolver-level
walkthrough, and [SQL Query Optimization](/topics/sql-query-optimization) has
the database side.

## 5. How Do You Persist The Apollo Client Cache Across Browser Refreshes?

Apollo's `InMemoryCache` lives in memory, so a refresh empties it and every
screen starts at a spinner. Persistence writes the normalized cache to storage
and restores it before the app renders.

The standard tool is `apollo3-cache-persist`:

```ts
import { ApolloClient, InMemoryCache } from "@apollo/client";
import { CachePersistor, LocalStorageWrapper } from "apollo3-cache-persist";

const cache = new InMemoryCache({
  typePolicies: {
    Cart: { fields: { lines: { merge: false } } },
  },
});

export const persistor = new CachePersistor({
  cache,
  storage: new LocalStorageWrapper(window.localStorage),
  maxSize: 1_048_576, // 1MB; pause writes past this
  key: "apollo-cache-v3", // bump to invalidate on schema change
  debug: process.env.NODE_ENV !== "production",
});

export async function createClient() {
  // Restore BEFORE the client is used, or the first writes are clobbered.
  await persistor.restore();

  return new ApolloClient({ cache, uri: "/graphql" });
}
```

Because restore is asynchronous, the app must wait for it:

```tsx
function Root() {
  const [client, setClient] = useState<ApolloClient<unknown>>();

  useEffect(() => {
    createClient().then(setClient);
  }, []);

  if (!client) return <AppSkeleton />;

  return (
    <ApolloProvider client={client}>
      <App />
    </ApolloProvider>
  );
}
```

Important:

> Render `ApolloProvider` before `restore()` resolves and you get the worst of
> both worlds: queries fire against an empty cache, write their results, and
> then the restore overwrites them with older data. Gate the tree on the restored
> client, or use `CachePersistor` in a synchronous storage wrapper.

**Storage choice matters more than it looks:**

| Storage | Limit | Notes |
| --- | --- | --- |
| `localStorage` | ~5MB, synchronous | Simple; blocks the main thread on every write. Fine for a small cache. |
| `sessionStorage` | ~5MB, per tab | Clears on tab close — a reasonable default for carts on shared devices. |
| IndexedDB (`localforage`) | Hundreds of MB, async | The right choice once a product catalog is cached. |

**The four gotchas that decide this answer:**

1. **Schema drift.** A persisted cache written against last week's schema can
   contain entities missing fields the new UI selects, producing cache misses
   or partial-data warnings forever. Store a schema version alongside the cache
   and `persistor.purge()` when it changes — `apollo3-cache-persist` ships a
   `SchemaVersion` helper for exactly this.
2. **Personal data at rest.** A normalized cache contains whatever you queried:
   addresses, order history, email. `localStorage` is readable by any script on
   the origin, so an XSS becomes a full customer-data leak. Persist a
   deliberate allow-list of types, never the whole cache, on any authenticated
   surface — and call `persistor.purge()` on logout, before clearing the token.
3. **Stale prices and stock.** This is the e-commerce-specific one. A cart
   restored from storage may be days old; prices change, promotions expire,
   items go out of stock. Persistence is a *rendering* optimization, never a
   source of truth. Restore for instant paint, then revalidate — a
   `cache-and-network` fetch policy on the cart query shows the cached cart
   immediately and corrects it when the server responds.
4. **Size.** Carts are small; a browsed catalog is not. Without `maxSize`,
   persistence eventually throws `QuotaExceededError` mid-session. Set a bound
   and let the persistor pause.

Interview Answer:

> I persist the normalized cache with `apollo3-cache-persist`, gate the app on
> `restore()` so the first render sees the restored data, and treat what comes
> back as a fast first paint rather than as truth. Cart and pricing queries run
> `cache-and-network`, so the shopper sees their cart instantly and the server
> corrects it a moment later. I version the cache key against the schema, cap
> its size, restrict what is persisted on authenticated screens, and purge on
> logout.

Follow-up probe:

> "What about SSR?" Do not persist to `localStorage` on the server — there is no
> such object, and a shared client would leak one user's cache to the next
> request. Server-side you create a fresh client per request and hydrate via
> `cache.restore(window.__APOLLO_STATE__)`; browser persistence is a separate,
> client-only concern layered on top.

## 6. How Do You Design A Cart With Quantity Updates, Cache Sync, And Rollback?

This question and the next one are the same system asked at two depths. Build
the correct-under-failure version first; add optimistic UI and undo only once
the foundation holds.

**Start with the cache shape, not the components.** Apollo normalizes by
`__typename` plus `id` into a flat store, so `CartLine:line_1` is one object
that every component reads. Get the identity right and most "sync" work
disappears:

```ts
const cache = new InMemoryCache({
  typePolicies: {
    Cart: {
      keyFields: ["id"],
      fields: {
        // Server sends the authoritative list; do not merge arrays positionally.
        lines: { merge: (_existing, incoming) => incoming },
      },
    },
    CartLine: { keyFields: ["id"] },
    // Money is a value object, not an entity - never normalize it.
    Money: { keyFields: false },
  },
});
```

**Quantity updates.** The mutation returns the changed line *and* the cart
aggregate, so one response updates the row, the subtotal, and the header badge:

```tsx
const UPDATE_LINE = gql`
  mutation UpdateCartLine($lineId: ID!, $quantity: Int!) {
    cartLineUpdate(lineId: $lineId, quantity: $quantity) {
      cartLine { id quantity cost { totalAmount { amount } } }
      cart { id subtotal { amount } lineCount }
      userErrors { field message code }
    }
  }
`;

function QuantityStepper({ line }: { line: CartLineFragment }) {
  const [updateLine, { loading }] = useMutation(UPDATE_LINE);

  async function setQuantity(quantity: number) {
    const { data } = await updateLine({ variables: { lineId: line.id, quantity } });
    const failure = data?.cartLineUpdate.userErrors?.[0];

    if (failure) {
      toast.error(failure.message); // "Only 2 left in stock"
    }
  }

  return (
    <Stepper
      disabled={loading}
      onChange={setQuantity}
      value={line.quantity}
    />
  );
}
```

Why It Matters:

No `update` callback, no `refetchQueries`. Because the response carries the same
entities under the same ids, Apollo writes them into the normalized store and
every subscriber re-renders. **Refetching the whole cart after a mutation is the
mid-level answer** — it works, it costs a round trip, and it papers over a
selection set that was wrong.

**When you genuinely need a cache `update`.** Normalization fixes *field*
changes automatically. It cannot know that a new line belongs in a list, or
that a removed one should leave it — list membership is not derivable from an
entity. Add and remove need explicit cache writes:

```ts
const [removeLine] = useMutation(REMOVE_LINE, {
  update(cache, { data }) {
    const removedId = data?.cartLineRemove.removedLineId;
    if (!removedId) return;

    cache.modify({
      id: cache.identify({ __typename: "Cart", id: cartId }),
      fields: {
        lines: (existing = [], { readField }) =>
          existing.filter((ref) => readField("id", ref) !== removedId),
      },
    });
    cache.evict({ id: cache.identify({ __typename: "CartLine", id: removedId }) });
    cache.gc();
  },
});
```

**What "rollback" means here.** Without optimistic updates the Apollo cache is
never wrong — it only ever holds server-confirmed data, so there is nothing to
revert. The state that *can* drift is local component state:

Scenario:

> The stepper keeps its own `useState` so typing feels responsive. The user
> types 5, the server rejects it ("only 2 in stock"), and the input still shows
> 5 while the cache and the subtotal say 2. Now the page contradicts itself.

Fix:

> Make the server value the single source of truth and derive the input from
> the cache rather than shadowing it. If a local buffer is unavoidable for
> typing, reset it from the cache value whenever the mutation settles — success
> or failure — so a rejected edit visibly snaps back.

**Three failure classes, three behaviours.** Collapsing them is the most common
mistake in this answer:

| Failure | Looks like | Correct response |
| --- | --- | --- |
| Business rule | `userErrors: [{ code: "OUT_OF_STOCK" }]` | Render inline, next to the field. Not a toast, not a retry. |
| GraphQL error | top-level `errors`, HTTP 200 | Usually a bug or auth failure. Log it; show a generic message. |
| Network failure | link throws, no response | Retry with backoff, then surface "couldn't reach us" with a retry action. |

```ts
const link = from([
  new RetryLink({
    attempts: { max: 3, retryIf: (error, operation) =>
      Boolean(error) && operation.getContext().idempotent === true },
  }),
  new HttpLink({ uri: "/graphql" }),
]);
```

Interview Trap:

> Never blind-retry a cart mutation. `addToCart` retried after a timeout that
> actually succeeded adds the item twice. Either send an idempotency key the
> server de-duplicates on, or make the operation naturally idempotent — which is
> the real argument for `cartLineUpdate(quantity: 3)` (absolute, idempotent)
> over `incrementQuantity(by: 1)` on this layer.

**Coalescing rapid clicks.** A shopper clicking `+` five times should not send
five mutations that can land out of order. Debounce the intent and send the
final value:

```ts
const commit = useMemo(
  () => debounce((quantity: number) => updateLine({ variables: { lineId, quantity } }), 400),
  [lineId, updateLine],
);
```

Edge cases:

- Responses can arrive out of order; with absolute quantities, a late response
  from an older request can overwrite a newer one. Serialize per line, or drop
  responses whose request is no longer the latest for that line.
- Debounced writes must flush on unmount and before navigating to checkout, or
  the last edit is silently lost.

## 7. How Do You Add Optimistic UI And Undo To That Cart?

Now layer on the two things that make the cart feel instant.

**Optimistic UI.** Apollo writes an `optimisticResponse` into a temporary
optimistic layer on top of the cache, broadcasts to watchers immediately, and
discards that layer when the real result arrives:

```viz
type: flow
title: Optimistic mutation lifecycle
Fire :: optimisticResponse written to an optimistic cache layer
Broadcast :: every watcher re-renders with the fake data - no network yet
Update runs :: the update callback executes against the optimistic layer
Response :: the layer is discarded, the real result is written, update runs again
On error :: the layer is discarded and nothing replaces it - the cache reverts
```

```tsx
const [updateLine] = useMutation(UPDATE_LINE, {
  optimisticResponse: (variables) => ({
    cartLineUpdate: {
      __typename: "CartLineUpdatePayload",
      cartLine: {
        __typename: "CartLine",
        id: variables.lineId, // must match the real entity key
        quantity: variables.quantity,
        cost: {
          __typename: "Cost",
          totalAmount: {
            __typename: "Money",
            amount: unitPrice * variables.quantity,
          },
        },
      },
      cart: null, // see the note on totals below
      userErrors: [],
    },
  }),
});
```

Important:

> **Rollback is automatic — you do not write it.** Apollo removes the optimistic
> layer on both success and failure, so a failed mutation reverts the cache with
> no compensating code. Two consequences interviewers probe for: your `update`
> callback runs **twice** (once optimistically, once for real), so it must be
> idempotent and must never do anything outside the cache; and `__typename` plus
> `id` must exactly match the real response, or the optimistic write lands on a
> different cache key and nothing appears to happen.

Automatic cache rollback is not the whole job, though:

> Reverting silently is a bad experience — the number flicks back to 2 and the
> shopper assumes they misclicked. Rollback restores correctness; you still owe
> them an explanation. Pair every revert with an inline message that says what
> failed and what to do.

**The totals problem.** This is the e-commerce-specific trap, and volunteering
it is a strong signal:

> You can optimistically compute a line subtotal — quantity times unit price is
> arithmetic the client already has. You cannot optimistically compute the order
> total. Tax depends on jurisdiction, shipping on weight and destination,
> promotions on basket-level rules ("spend 50, get free delivery"), and none of
> that is client-side knowledge. Guessing produces a total that visibly corrects
> itself a moment later, which reads as a pricing bug.

Fix:

> Be optimistic about what you can derive and honest about what you cannot.
> Update the line and its subtotal instantly; render the order total in a
> pending state until the server responds. Users forgive a spinner on the total
> far more readily than a number that changes after they read it.

**Undo.** Two designs, and the choice is the answer:

| Design | How it works | Cost |
| --- | --- | --- |
| Compensating mutation | Remove immediately; undo fires `cartLineAdd` to put it back. | Undo itself can fail, and it can fail after the item sold out. Two round trips. |
| Deferred write | Hide the row optimistically, hold the mutation behind a cancellable timer; undo cancels it. | Nothing to compensate. Needs flush guarantees. |

Prefer the deferred write for destructive actions — it is the Gmail pattern,
and undo becomes `clearTimeout` rather than a network call that might fail:

```tsx
function useRemoveWithUndo(cartId: string) {
  const [removeLine] = useMutation(REMOVE_LINE);
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const client = useApolloClient();

  const flush = useCallback((lineId: string) => {
    const timer = pending.current.get(lineId);
    if (!timer) return;
    clearTimeout(timer);
    pending.current.delete(lineId);
    void removeLine({ variables: { lineId } });
  }, [removeLine]);

  function remove(lineId: string) {
    hideLineInCache(client.cache, cartId, lineId); // local-only field, reversible
    const timer = setTimeout(() => {
      pending.current.delete(lineId);
      void removeLine({ variables: { lineId } });
    }, 5_000);
    pending.current.set(lineId, timer);

    return function undo() {
      clearTimeout(timer);
      pending.current.delete(lineId);
      unhideLineInCache(client.cache, cartId, lineId);
    };
  }

  // A deferred write that never flushes is a lost mutation.
  useEffect(() => {
    const flushAll = () => pending.current.forEach((_timer, lineId) => flush(lineId));
    document.addEventListener("visibilitychange", flushAll);
    return () => {
      document.removeEventListener("visibilitychange", flushAll);
      flushAll();
    };
  }, [flush]);

  return { remove, flush };
}
```

Edge cases:

- **Flush before checkout.** Navigating to payment with a pending removal means
  the shopper pays for an item they deleted. Await all pending flushes at the
  checkout boundary.
- **Tab close.** `visibilitychange` plus unmount covers most of it;
  `navigator.sendBeacon` is the last resort for a hard close, since a normal
  `fetch` is cancelled during unload.
- **Undo after the window.** Once flushed, undo must become a real
  `cartLineAdd` — and it can legitimately fail if the item sold out in the
  meantime. Disable the undo affordance when the timer expires rather than
  letting it fail confusingly.
- **Use a local-only cache field for hiding**, not an eviction. Evicting and
  re-adding loses list position; a reversible `isPendingRemoval` client field
  keeps the row's place if undo is pressed.

Interview Answer:

> Optimistic UI in Apollo is an `optimisticResponse` written to a temporary
> cache layer that Apollo discards on completion, so cache rollback is free and
> my job is making the optimistic entity keys match, keeping the `update`
> callback idempotent because it runs twice, and telling the user when a revert
> happens. I stay optimistic only about values I can derive locally — line
> subtotals, yes; order totals with tax and promotions, no. For undo I defer the
> destructive write behind a five-second cancellable timer instead of firing a
> compensating mutation, so undo is a `clearTimeout` that cannot fail, and I
> flush pending writes on unmount, tab hide, and at the checkout boundary.

## 8. How Do You Implement A/B Testing In An E-commerce Application?

Four concerns: assignment, delivery without flicker, exposure tracking, and
analysis. Most candidates answer only the first.

**1. Assignment must be deterministic.** Never `Math.random()` — a shopper who
refreshes would flip variants and their session would be unusable as data. Hash
a stable unit id together with the experiment key:

```ts
function assignVariant(experimentKey: string, unitId: string, weights: number[]) {
  const bucket = hash32(`${experimentKey}:${unitId}`) % 100;
  let cumulative = 0;

  for (const [index, weight] of weights.entries()) {
    cumulative += weight;
    if (bucket < cumulative) return index;
  }

  return 0; // control
}
```

Salting with the experiment key matters: without it, the same users land in the
same bucket for every experiment, and the biases of experiment one carry into
experiment two.

The unit id is an anonymous cookie before login and the account id after. The
handover is its own problem — **identity stitching**. If a shopper is bucketed
anonymously into B and then logs in and is re-bucketed into A, you have
corrupted the experiment and shown them two different checkouts. Persist the
assignment against the anonymous id and carry it forward at login.

**2. Deliver at the edge, not in the browser.** Client-side assignment means
the control renders first and then swaps — a flash of original content, plus
layout shift that damages CLS on the exact pages you are trying to measure.

```viz
type: flow
title: Edge assignment on a CDN-cached storefront
Request :: shopper hits /product/running-shoe
Middleware :: read or set the anon id cookie, compute the variant
Rewrite :: route internally to the variant path, cookie set on the response
Cache key :: variant is part of the key, so B never serves A's cached HTML
Response :: correct variant on the first byte, no flicker, still cacheable
```

Interview Trap:

> The CDN is where e-commerce A/B tests actually break. If the variant is not
> part of the cache key, the first shopper to miss the cache populates it with
> their variant and everyone behind that edge node gets the same HTML —
> assignment looks random in your logs and is constant in reality. Vary on the
> variant cookie, or rewrite to distinct URLs per variant. Also watch the
> cardinality cost: every variant multiplies the number of cached objects.

**3. Log exposure, not assignment.** The event that counts is "this shopper
actually saw the variant," fired where the variant renders:

```tsx
function PdpBuyBox({ variant }: { variant: "control" | "sticky" }) {
  useEffect(() => {
    track("experiment_exposure", { experiment: "pdp_buy_box_v2", variant });
  }, [variant]);

  return variant === "sticky" ? <StickyBuyBox /> : <InlineBuyBox />;
}
```

Why It Matters:

> Bucketing every visitor at the edge but only showing the variant on the
> product page means most of your assigned population never saw the experiment.
> Including them dilutes the measured effect toward zero, and a real winner
> looks flat. Exposure is the denominator; get it wrong and the analysis is
> wrong no matter how clean the statistics are.

**4. Analysis, stated before launch.** A senior answer names these up front:

| Decision | Why it is decided in advance |
| --- | --- |
| One primary metric | Conversion rate or revenue per session. Ten metrics guarantee one looks significant by chance. |
| Guardrails | Latency, error rate, AOV, returns. A variant that lifts conversion and breaks mobile checkout is a loss. |
| Sample size and duration | Computed from baseline rate and minimum detectable effect. Run full weeks — weekday and weekend shoppers differ. |
| No peeking | Stopping the moment significance appears inflates false positives badly. Fix the horizon, or use a sequential test designed for it. |
| SRM check | If a 50/50 split delivers 52/48, the assignment is broken. Check this before reading any result. |

Tradeoff:

> Flags and experiments are different tools that share plumbing. A feature flag
> is an operational switch — roll out, kill instantly, no statistics. An
> experiment is a measurement with a fixed population and duration. Run them on
> one system, but never let an experiment double as your kill switch: every
> variant needs an escape hatch that does not corrupt the data.

Edge cases:

- **Overlapping experiments.** Two tests on the same checkout interact. Use
  mutually exclusive layers for anything touching the same surface.
- **Bots.** Crawler traffic in the denominator skews conversion. Exclude it at
  assignment.
- **Server-rendered price experiments.** Variant pricing must be re-validated
  server-side at checkout; a client-chosen price is an exploit, not a test.

## 9. How Do You Test Optimistic UI Behavior?

The core insight first, because it is what the question is really asking:

Interview Answer:

> Most tests of optimistic UI pass whether or not optimistic UI exists. They
> click, `await` the final state, and assert it — which is exactly what a
> non-optimistic implementation produces. The behaviour under test is the
> *intermediate* frame, so the test has to hold the response open and assert
> while it is in flight.

Three tests per optimistic interaction:

**Test 1 — the optimistic frame appears before the server answers.** Control
the response with a deferred promise so you decide when it resolves:

```tsx
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

it("shows the new quantity before the server responds", async () => {
  const gate = deferred<CartLineUpdateResult>();
  server.use(
    graphql.mutation("UpdateCartLine", async () => HttpResponse.json(await gate.promise)),
  );

  render(<Cart />);
  await userEvent.click(screen.getByRole("button", { name: /increase quantity/i }));

  // The request is still open: this can only pass if the UI is optimistic.
  expect(await screen.findByDisplayValue("3")).toBeInTheDocument();

  gate.resolve(successPayload);
  await screen.findByText("$59.97");
});
```

**Test 2 — the server value wins.** Make the server return something different
from the optimistic guess, so the assertion proves reconciliation happened
rather than that the optimistic value simply stayed:

```tsx
it("replaces the optimistic value with the server value", async () => {
  // Client guessed 3; the server caps it at 2.
  server.use(graphql.mutation("UpdateCartLine", () =>
    HttpResponse.json(payloadWithQuantity(2))));

  render(<Cart />);
  await userEvent.click(screen.getByRole("button", { name: /increase quantity/i }));

  expect(await screen.findByDisplayValue("2")).toBeInTheDocument();
});
```

**Test 3 — failure reverts and explains.** Both halves are the assertion:

```tsx
it("reverts and surfaces an error when the mutation fails", async () => {
  server.use(graphql.mutation("UpdateCartLine", () => HttpResponse.error()));

  render(<Cart />);
  await userEvent.click(screen.getByRole("button", { name: /increase quantity/i }));

  expect(await screen.findByDisplayValue("2")).toBeInTheDocument(); // reverted
  expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't update/i);
});
```

**`MockedProvider` versus MSW.** Worth having an opinion on:

| Tool | Fit |
| --- | --- |
| `MockedProvider` | Simple cases only. Mocks resolve on the next tick. |
| MSW | Preferred. Intercepts at the network layer. |

`MockedProvider` resolving on the next tick means the optimistic frame can
vanish before your assertion runs, so every mock needs an explicit `delay` —
and `delay: Infinity` to freeze a request open. It also matches on exact query
*and* variables, so an unrelated selection-set edit breaks tests that had
nothing to do with the change.

MSW has neither problem. Because it intercepts below Apollo, the real link
chain runs — retry links, error links, and your `onError` handling are all
exercised rather than stubbed out — and the same handlers serve tests,
Storybook, and local development.

Edge cases worth a test each:

- **Rapid double-click.** Two optimistic updates in flight; assert the final
  state matches the last intent, not whichever response returned last.
- **Undo inside the window.** With a deferred write, assert that **no mutation
  was sent at all** — spy on the handler and expect zero calls. That is the
  whole point of the deferred design.
- **Rollback of list membership.** A failed remove must put the row back *in
  its original position*, not append it.

Important:

> Assert what the shopper sees, not `cache.extract()`. A cache snapshot test
> breaks on every schema change and still would not catch a row rendering in
> the wrong place. The one fair exception is a rollback test where the cache is
> genuinely the unit under test.

Round it out with one Playwright path over the real app, where
`page.route()` can abort a request or hold it open, plus an offline check via
the browser context. Network failure is the case unit tests simulate and
production actually produces.

More on testing strategy: [React Testing](/topics/react-testing).

## 10. How Do You Keep The Cart Synchronized Across Multiple Devices?

Start by rejecting the premise that the cart is client state.

Interview Answer:

> A cart that lives in `localStorage` cannot be synchronized, because there is
> nothing to synchronize with. The cart is a server-owned resource keyed by
> identity; every device holds a cache of it. Once that is true, "sync across
> devices" reduces to three ordinary problems: identity, propagation, and
> conflict resolution.

**Identity.** Anonymous shoppers get a cart keyed by a durable cookie or device
id. On login, the anonymous cart merges into the account cart — and the merge
rule is a product decision you should name:

| Situation | Reasonable rule |
| --- | --- |
| Item only in one cart | Include it. |
| Same item in both | Take the **maximum** quantity, not the sum. Summing double-counts the shopper who added the same thing on two devices. |
| Merged result | Re-validate every line against current stock and price before showing it. |

**Propagation.** Pick the cheapest mechanism that meets the latency the product
actually needs:

```viz
type: flow
title: Propagating a cart change to a second device
Mutate :: phone commits cartLineUpdate; server persists and bumps the version
Publish :: server emits cartUpdated on a pub/sub topic keyed by cart id
Fan out :: subscription servers push to every socket for that cart
Write :: laptop writes the payload into the Apollo normalized cache
Render :: badge, drawer, and cart page all update - one entity, many watchers
```

```tsx
function useCartSync(cartId: string) {
  useSubscription(CART_UPDATED, {
    variables: { cartId },
    onData: ({ client, data }) => {
      const cart = data.data?.cartUpdated;
      if (!cart) return;
      // Normalized write: every component reading Cart:<id> updates.
      client.cache.writeQuery({ query: CART_QUERY, variables: { cartId }, data: { cart } });
    },
  });

  // Sockets die when a phone backgrounds. Refetch on return.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void client.refetchQueries({ include: [CART_QUERY] });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
}
```

Tradeoff:

| Mechanism | Latency | Cost |
| --- | --- | --- |
| Refetch on focus / `visibilitychange` | Seconds, on return to tab | Nearly free. Covers the real behaviour — people switch devices, they do not watch two at once. |
| Polling | Bounded by interval | Simple and CDN-friendly; wasteful at scale. |
| Subscription over WebSocket | Sub-second | Sticky sessions or a pub/sub backplane, reconnect and backfill, connection cost per shopper. |

> Start with refetch-on-focus. It solves the actual user story — add on the
> phone, open the laptop, see it — for a fraction of the operational cost.
> Escalate to subscriptions when the product needs live inventory or a shared
> basket, not because it demos well.

**Conflict resolution.** Two devices change the same line at once. This is
where the design pays off:

```txt
Absolute (setQuantity):   phone -> 3, laptop -> 4   => one update is lost
Delta   (adjustBy):       phone -> +1, laptop -> +1  => 2, both preserved
```

| Strategy | Behaviour | When |
| --- | --- | --- |
| Last write wins | Server timestamp decides; simple, silently loses an update. | Low-stakes fields. |
| Optimistic concurrency | Client sends the cart `version`; a stale write is rejected and the client refetches and retries. | The default for quantity. Never loses data silently. |
| Commutative deltas | `adjustQuantity(by: +1)` commutes, so concurrent adds compose. | "Add to cart" from multiple surfaces. |

The nuance is that deltas and idempotent retries pull in opposite directions: an
absolute `setQuantity(3)` is safe to retry and unsafe to merge, while
`adjustBy(+1)` is safe to merge and unsafe to retry. Resolve it with an
idempotency key so a delta can be retried exactly once:

```graphql
mutation AdjustLine($lineId: ID!, $by: Int!, $idempotencyKey: String!) {
  cartLineAdjust(lineId: $lineId, by: $by, idempotencyKey: $idempotencyKey) {
    cart { id version lines { id quantity } }
  }
}
```

Edge cases:

- **Offline device reconnecting.** A phone that queued three mutations offline
  replays them against a cart that moved on. Version checks reject stale writes
  and force a reconcile; without them the offline device silently overwrites
  the newer cart.
- **The cart is not a contract.** Prices, promotions, and stock are
  re-validated server-side at checkout regardless of what any device cached.
  This is also the security answer — a client-supplied price is never trusted.
- **Guest on a shared device.** Logout must clear the cached cart, or the next
  person sees someone else's basket. Purge the persisted Apollo cache on
  logout, as in question 5.

Follow-up probe:

> "What about two tabs on the same device?" Same-origin tabs can share a
> `BroadcastChannel`, so one tab's mutation notifies the others without a server
> round trip. Cheap, and it removes the most visible flavour of this bug.

Related depth: [Frontend System Design](/topics/frontend-system-design) and
[Senior Frontend Scenarios](/topics/senior-frontend-react-scenarios).

## Sources Used

- <https://react.dev/learn/render-and-commit>
- <https://react.dev/reference/react/useOptimistic>
- <https://github.com/acdlite/react-fiber-architecture>
- <https://spec.graphql.org/October2021/>
- <https://www.apollographql.com/docs/react/data/mutations/>
- <https://www.apollographql.com/docs/react/performance/optimistic-ui/>
- <https://www.apollographql.com/docs/react/caching/cache-configuration/>
- <https://www.apollographql.com/docs/react/api/link/apollo-link-batch-http/>
- <https://github.com/apollographql/apollo-cache-persist>
- <https://github.com/graphql/dataloader>
- <https://testing-library.com/docs/guiding-principles/>
- <https://mswjs.io/docs/basics/intercepting-requests>
