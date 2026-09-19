# Frontend System Design Interview Guide

Frontend system design guidance covering how to structure the answer, real-time
transports, designing a chat application for high concurrency, syncing missed
data after a disconnect, offline-capable writes, chunked resumable uploads,
infinite feeds, traffic spikes, A/B testing, and multi-tenant permissions.

These are the 60–90 minute design rounds, not coding rounds. The interviewer is
testing structured thinking and tradeoffs, not syntax.

## 1. How Do You Approach A Frontend System Design Question?

Interview method:

```viz
type: flow
title: The 6-step structure
Clarify :: scale, platforms, offline, real-time, auth - ask before designing
Requirements :: split functional from non-functional, state them back
Data and transport :: what flows, how often, in which direction
Component architecture :: the tree, the state boundaries, the data layer
Edge cases :: reconnection, ordering, failure, empty and huge states
Tradeoffs :: name what you gave up and when you would choose differently
```

Questions worth asking before designing anything:

- How many concurrent users, and what is the read/write ratio?
- Does it need to work offline, or on a poor connection?
- How fresh must the data be — real-time, seconds, or minutes?
- Web only, or mobile web and native?
- Who are the users — one tenant or many?

Important:

Spending five minutes clarifying is not wasted time; it is the part being
assessed. A candidate who designs immediately is answering a question nobody
asked.

Strong answer:

> I start by separating functional requirements from non-functional ones, because
> the non-functional ones — concurrency, freshness, offline — determine the
> architecture. Then I pick the transport, design the data flow, and only then
> draw components.

## 2. What Are The Real-Time Transport Options?

| Transport | Direction | Cost | Good for |
| --- | --- | --- | --- |
| Polling | client pulls | wasteful | rarely-changing data |
| Long polling | client pulls, held open | moderate | fallback when WS is blocked |
| **SSE** | server → client | cheap, HTTP | feeds, notifications, AI streaming |
| **WebSocket** | bidirectional | a held connection | chat, collaboration, games |
| WebRTC | peer to peer | complex | audio, video, direct data |

```js
// SSE - one-directional, auto-reconnects, plain HTTP
const source = new EventSource("/api/notifications");
source.onmessage = (event) => addNotification(JSON.parse(event.data));
source.onerror = () => { /* the browser retries automatically */ };
```

```js
// WebSocket - bidirectional, manual reconnect
const socket = new WebSocket("wss://api.example.com/chat");
socket.onmessage = (event) => addMessage(JSON.parse(event.data));
```

The rule:

If the client only **receives**, use SSE. It runs over normal HTTP, works through
most proxies, and reconnects by itself with `Last-Event-ID`. Reach for WebSocket
when the client also needs to **send** frequently.

Interview note:

SSE is under-used and a good differentiator. Many "real-time" features — a
notification bell, a live order status, a streaming AI response — are one
directional and do not need a WebSocket at all.

## 3. Design A Chat Application For 100,000 Concurrent Users

Start with the transport and the fan-out, because that is where the scale lives.

```viz
type: flow
title: Chat architecture
Client :: one WebSocket per user, with reconnect and an outbox
Load balancer :: sticky by connection, spreads users across gateways
WS gateway tier :: stateless, holds N connections each, scales horizontally
Pub/sub (Redis or Kafka) :: a gateway publishes; all gateways receive
Message store :: append-only per conversation, monotonic sequence numbers
Client store :: normalised by conversation, deduped by message id
```

**Why a pub/sub layer is the key decision.** With 100,000 connections spread over,
say, 20 gateways, two users in one conversation are probably on different
gateways. A gateway cannot deliver to a socket it does not hold, so it publishes
to a channel and every gateway delivers to its own local subscribers.

Capacity reasoning worth saying out loud:

```txt
100,000 concurrent connections
÷ 5,000 connections per gateway     -> 20 gateway instances
× ~2 messages/sec/active user       -> fan-out is the bottleneck, not the sockets
```

Frontend concerns specifically:

- **one connection per tab**, shared across the app — not one per component
- **normalised store** keyed by conversation, so a new message is an O(1) insert
- **virtualised message list**, because a long conversation is thousands of nodes
- **optimistic send** with a client-generated id, reconciled when the server
  acknowledges
- **presence and typing indicators throttled** — they are far higher volume than
  messages and should never be sent per keystroke

Tradeoffs to name:

Sticky sessions simplify the gateway but make deploys disruptive — every
reconnect is a thundering herd. Stateless gateways with pub/sub cost an extra hop
but let you deploy without dropping conversations.

## 4. How Do You Sync Missed Messages After A Five-Minute Outage?

This is the follow-up to the chat question and the part most candidates miss.

The mechanism is a **monotonic sequence number per conversation** plus a cursor the
client remembers.

```viz
type: flow
title: Reconnect and catch up
Disconnect detected :: socket closes, or a heartbeat is missed
Queue local writes :: outgoing messages go to an outbox, UI stays optimistic
Reconnect with backoff :: exponential, with jitter to avoid a thundering herd
Send the cursor :: "my last seen sequence for this conversation is 1423"
Server returns the delta :: everything after 1423, in order, paginated
Merge and dedupe :: by message id, then flush the outbox
```

```js
socket.onopen = () => {
  socket.send(JSON.stringify({
    type: "resume",
    cursors: { "conv-1": 1423, "conv-2": 88 },
  }));
};

socket.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (seenIds.has(msg.id)) return;   // dedupe
  seenIds.add(msg.id);
  insertInSequenceOrder(msg);        // order by server sequence, not arrival
};
```

Why a sequence number and not a timestamp:

Clocks disagree. Two servers can issue the same millisecond, and a client clock can
be wrong by minutes. A server-assigned monotonic sequence per conversation gives
total ordering with no clock dependency.

Edge cases worth raising:

- **A large gap** — if the client is 10,000 messages behind, do not stream them all
  down the socket. Return a paginated REST fetch instead and let the socket handle
  only live traffic.
- **Duplicates** — at-least-once delivery means the same message can arrive twice.
  Dedupe by id on the client; never assume exactly-once.
- **Out-of-order arrival** — insert by sequence, not by arrival, or a slow packet
  puts an old message at the bottom.
- **Messages sent while offline** — they live in the outbox and are replayed with
  their original client id, so the server can reject duplicates idempotently.

## 5. How Do You Make Writes Work Offline?

The **outbox pattern**: never write directly to the network; write to a local
queue that a sender drains.

```js
// 1. Write locally and update the UI immediately
async function sendMessage(text) {
  const message = { id: crypto.randomUUID(), text, status: "pending", createdAt: Date.now() };
  await outbox.add(message);        // IndexedDB - survives a reload
  store.insert(message);            // optimistic UI
  void flush();
}

// 2. Drain the queue whenever possible
async function flush() {
  if (!navigator.onLine) return;

  for (const message of await outbox.all()) {
    try {
      await api.send(message);      // the id makes the retry idempotent
      await outbox.remove(message.id);
      store.update(message.id, { status: "sent" });
    } catch {
      store.update(message.id, { status: "failed" });
      break;                        // preserve order; stop on the first failure
    }
  }
}

window.addEventListener("online", () => void flush());
```

Why IndexedDB and not memory:

A queue in memory is lost on refresh or a crashed tab. IndexedDB is asynchronous
and large enough for real payloads, unlike `localStorage`.

Why the client generates the id:

It makes retries **idempotent**. The server upserts by that id, so sending the same
message three times after a flaky reconnect creates one row.

Tradeoff:

Optimistic UI plus an outbox is the right experience and creates a genuine
conflict problem — the message may ultimately fail. The UI must have a visible
`pending`, `sent`, and `failed` state with a retry affordance, or users lose data
silently.

## 6. Design A Resumable File Upload With Chunking

The Dropbox-style question. The whole design follows from one decision: **split the
file and treat each chunk as an independent, retryable unit**.

```viz
type: flow
title: Chunked upload lifecycle
Initiate :: POST file metadata, server returns an uploadId
Ask what exists :: GET /uploads/:id -> the set of chunks already received
Slice :: file.slice(start, end) - only the missing chunks
Upload concurrently :: N chunks in flight, each with an index and checksum
Track progress :: completed bytes + in-flight bytes / total
Complete :: POST /uploads/:id/complete - the server assembles and verifies
```

```js
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const CONCURRENCY = 4;

async function upload(file, uploadId, signal) {
  const total = Math.ceil(file.size / CHUNK_SIZE);
  const have = new Set(await api.getReceivedChunks(uploadId));
  const missing = [...Array(total).keys()].filter((i) => !have.has(i));

  let done = have.size;
  const queue = [...missing];

  async function worker() {
    while (queue.length > 0) {
      if (signal.aborted) return;
      const index = queue.shift();
      const chunk = file.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);

      await withRetry(() => api.putChunk(uploadId, index, chunk, signal));
      done += 1;
      onProgress(done / total);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (!signal.aborted) await api.complete(uploadId);
}
```

How each requirement is satisfied:

| Requirement | Mechanism |
| --- | --- |
| **Resume** | ask the server which chunks it already has, upload only the rest |
| **Pause** | `AbortController` cancels in-flight chunks; the queue stops |
| **Progress** | completed chunks ÷ total, refined by in-flight byte counts |
| **Retry** | per chunk, with exponential backoff and jitter |
| **Integrity** | a checksum per chunk, plus one for the assembled file |
| **Parallelism** | a fixed worker pool, not `Promise.all` over every chunk |

Why bounded concurrency matters:

`Promise.all` over 2,000 chunks opens 2,000 requests. The browser caps connections
per origin anyway, so the rest queue silently, memory balloons holding slices, and
progress reporting becomes meaningless. Four to six workers is the usual sweet
spot.

Edge cases worth raising:

- **Chunk size** — too small means per-request overhead dominates; too large means
  a failure wastes more work. 5–10MB is typical.
- **The file changes on disk mid-upload** — store size and last-modified at
  initiation and re-validate.
- **Upload expiry** — the server must garbage-collect abandoned uploads.
- **Very large files** — upload directly to object storage with presigned per-chunk
  URLs so bytes never pass through your API.

## 7. How Do You Design A Virtualised Infinite Feed?

Two independent problems: **loading more** and **rendering efficiently**. Candidates
often solve only one.

```tsx
export function Feed() {
  const { items, loadMore, hasMore, isLoading } = useFeed();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !isLoading) void loadMore(); },
      { rootMargin: "600px" },   // start loading before the user arrives
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore]);

  return (
    <>
      <VirtualList items={items} />   {/* only visible rows in the DOM */}
      <div ref={sentinelRef} />
    </>
  );
}
```

Why `IntersectionObserver` and not a scroll listener:

A scroll handler fires continuously on the main thread and typically calls
`getBoundingClientRect()`, forcing synchronous layout. `IntersectionObserver` runs
off the main thread and reports only when the threshold is crossed.

The hard parts, which are what the interviewer is probing:

| Problem | Solution |
| --- | --- |
| Scroll jumps when items load above | measure and restore scroll offset, or use CSS `overflow-anchor` |
| Variable-height rows | measure on render and cache heights by item id |
| Duplicate or missing items across pages | **cursor** pagination, never `offset` |
| Back-navigation loses position | persist scroll offset and the loaded cursor |
| Infinite scroll traps keyboard users | provide a "load more" button as well |

Important:

Offset pagination on a live feed **duplicates and skips** items, because new posts
shift the offsets between requests. Cursor pagination keyed on the last item is the
only correct choice for a feed that changes.

Study path:

The rendering half — virtualization, `react-window`, 10,000 items — is covered in
the React Performance guide.

## 8. How Do You Handle Real-Time Updates Efficiently In React?

The naive approach re-renders the world on every message.

```tsx
// Bad example: every message re-renders the entire list
const [messages, setMessages] = useState([]);
socket.onmessage = (e) => setMessages((prev) => [...prev, JSON.parse(e.data)]);
```

Four techniques, in order of impact:

**1. Batch bursts.** A chat room can deliver dozens of events per second; the
screen updates at 60fps at best.

```tsx
const buffer = useRef([]);

useEffect(() => {
  const flush = () => {
    if (buffer.current.length > 0) {
      setMessages((prev) => [...prev, ...buffer.current]);
      buffer.current = [];
    }
    raf = requestAnimationFrame(flush);
  };
  let raf = requestAnimationFrame(flush);
  return () => cancelAnimationFrame(raf);
}, []);

socket.onmessage = (e) => buffer.current.push(JSON.parse(e.data));
```

**2. Normalise the store** so a new message is an insert, not a rebuild of a
derived array.

**3. Subscribe narrowly.** A component should read only the slice it renders —
`useSyncExternalStore` with a selector, or a store library with selectors — so an
unrelated conversation's message does not re-render this one.

**4. Virtualise the list**, so only visible rows exist in the DOM.

Important:

`useSyncExternalStore` is the correct hook for an external source such as a socket
store. It prevents **tearing** — two components rendering different values of the
same store within one commit — which concurrent rendering makes possible.

## 9. How Do You Guarantee An Outdated Response Never Overwrites A Newer One?

Applies to search-as-you-type, filters, and anything keyed on fast-changing input.

Two mechanisms, and the second is the one that always works:

**Cancel the stale request:**

```tsx
const controller = useRef<AbortController>();

async function search(query: string) {
  controller.current?.abort();
  controller.current = new AbortController();

  try {
    const res = await fetch(`/api/search?q=${query}`, { signal: controller.current.signal });
    setResults(await res.json());
  } catch (error) {
    if ((error as Error).name !== "AbortError") throw error;
  }
}
```

**Guard on arrival with a sequence number** — the safety net, because a response
already in flight when you abort can still resolve:

```tsx
const latest = useRef(0);

async function search(query: string) {
  const id = ++latest.current;
  const data = await api.search(query);

  if (id !== latest.current) return; // a newer request has started; drop this
  setResults(data);
}
```

The rule:

Cancellation is an optimisation — it saves bandwidth. The sequence guard is the
correctness fix. Use both; rely on the second.

Study path:

`AbortController` mechanics are covered in the DOM, Events & Browser APIs guide.

## 10. Your App Handles 1M+ Daily Views During A Sale Spike. How Do You Prepare?

Work outward from the user, and prefer removing load over adding capacity.

**1. Serve as much as possible from a CDN.** A static shell with dynamic holes
means the CDN absorbs most traffic and the origin only handles what genuinely
varies per user.

**2. Cache aggressively with a stated invalidation plan.** Product pages, category
listings, and images should not reach the origin. Tag them so a price change
invalidates precisely what it must.

**3. Degrade gracefully rather than failing.** Decide in advance what gets turned
off first: personalised recommendations, live inventory counts, review summaries.

```tsx
<Suspense fallback={<StaticPriceBanner />}>
  <LiveInventory />   {/* if this is slow or failing, the page still sells */}
</Suspense>
```

**4. Queue writes.** Checkouts should enqueue and confirm asynchronously rather than
holding a connection through a slow payment provider.

**5. Load-shed at the edge.** Rate limit per IP and per account before traffic
reaches application servers.

**6. Test before the event.** A load test against a production-like environment is
what turns this from a guess into a plan.

Frontend specifics:

- prefetch the checkout route from the product page
- keep the critical path free of third-party scripts — that is where sites fall over
- set explicit image dimensions so a slow CDN does not cause layout shift
- make the cart resilient: persist it locally so a failed request does not lose it

Tradeoff:

Everything above trades freshness for availability. Showing a stock count that is
30 seconds stale is almost always better than showing an error.

## 11. How Do You Handle Prop Drilling Through 20+ Props?

Twenty props through several layers is a **design smell**, not a state-management
problem. Reach for composition before Context.

```tsx
// Bad: every intermediate component must declare and forward props it never uses
<Dashboard user={user} theme={theme} perms={perms} filters={filters} ... />
```

**1. Composition first — pass JSX, not data:**

```tsx
// The parent builds the pieces; the layout never sees the data
<DashboardLayout
  sidebar={<Sidebar filters={filters} onChange={setFilters} />}
  header={<Header user={user} />}
>
  <Report data={data} />
</DashboardLayout>
```

This removes most drilling, because intermediate components stop being conduits.

**2. Group related props into objects** so the signature reflects the domain:

```tsx
<Report config={{ filters, range, columns }} actions={{ onExport, onShare }} />
```

**3. Context for genuinely global, rarely-changing values** — theme, locale,
current user:

```tsx
const ThemeContext = createContext<Theme | null>(null);
```

**4. A store with selectors** for shared state that changes often, so components
subscribe to slices instead of receiving everything.

Important:

Context is not a performance tool. Every consumer re-renders when the value
changes, so putting frequently-changing state in one Context re-renders the entire
subtree. Split by change frequency — a stable `ThemeContext` and a volatile
`FiltersContext` are two contexts, not one.

Strong answer:

> Twenty props usually means the component boundaries are wrong. I try composition
> first — passing rendered children instead of data — because that removes the
> intermediate layers entirely. Context is for genuinely global values, and a store
> with selectors is for shared state that changes often. Reaching straight for
> Context often just moves the problem and adds re-renders.

## 12. How Do You Design A/B Testing Without Affecting Current Users?

The requirement behind the question is **no flicker and stable assignment**.

```viz
type: flow
title: Server-assigned bucketing
Request arrives :: no variant cookie present
Assign at the edge :: hash the user id, or pick randomly
Set a cookie :: the bucket persists across sessions and devices-per-browser
Rewrite, do not redirect :: the URL stays the same; the user sees no navigation
Render the variant :: server-rendered, so there is no flash of the wrong version
```

```ts
// proxy.ts / middleware at the edge
export function proxy(request: NextRequest) {
  const bucket = request.cookies.get("bucket")?.value
    ?? (Math.random() < 0.5 ? "a" : "b");

  const response = NextResponse.rewrite(new URL(`/home-${bucket}`, request.url));
  response.cookies.set("bucket", bucket, { maxAge: 60 * 60 * 24 * 30 });
  return response;
}
```

Why not client-side assignment:

A client-side experiment renders the control, then swaps — a visible flicker that
also contaminates the metric you are measuring, because the user saw both.

Requirements worth naming:

- **stable assignment** — the same user always gets the same variant
- **mutual exclusion** — overlapping experiments must not confound each other
- **a kill switch** — a flag that disables the experiment without a deploy
- **exposure tracking** — log when a user actually *saw* a variant, not when they
  were assigned
- **an unaffected control** — the existing experience must be untouched

Tradeoff:

Edge assignment forces the route to render dynamically, losing full static
caching. Caching per variant recovers most of it, at the cost of splitting the
cache.

## 13. How Do You Design Role-Based Permissions For A Multi-Tenant SaaS?

The frontend's job is **UX**; the backend's job is **enforcement**. Saying this
explicitly is most of the answer.

```ts
type Permission = "order:read" | "order:write" | "billing:manage";

type Session = {
  userId: string;
  tenantId: string;
  roles: string[];
  permissions: Permission[];   // resolved server-side, sent to the client
};
```

```tsx
function Can({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { permissions } = useSession();
  return permissions.includes(permission) ? <>{children}</> : null;
}

<Can permission="billing:manage">
  <BillingSettings />
</Can>
```

Design decisions worth explaining:

**1. Send resolved permissions, not roles.** The client checking
`role === "admin"` hard-codes policy in the UI; every role change becomes a
frontend deploy. Resolve roles to a permission list on the server.

**2. Scope everything by tenant.** `tenantId` belongs in the session and in every
query, enforced in a data access layer rather than by convention — a missing tenant
filter is a cross-tenant data leak.

**3. Hiding is not preventing.** A hidden button is a nicety; the API must reject
the call regardless. Interviewers probe this deliberately.

**4. Route-level guards plus component-level checks.** Guards stop navigation;
component checks handle partial permissions within a page.

**5. Plan for role changes mid-session.** Either short-lived sessions, or push an
update over the existing socket.

Important:

Never put the permission **decision** in the client bundle. Ship the resolved list
for rendering, and keep the policy on the server where it can change without a
release.

## 14. How Do You Choose A Client-Side Caching Strategy?

| Need | Mechanism | Survives reload |
| --- | --- | --- |
| Server data with revalidation | SWR / TanStack Query | no |
| Per-viewer preference | `localStorage` | yes |
| Per-tab wizard state | `sessionStorage` | tab only |
| Large structured/offline data | IndexedDB | yes |
| Shareable UI state | the **URL** | yes |
| Assets | HTTP cache + CDN | yes |

The ordering principle: **the URL first**, then server cache, then client cache.
State in the URL is shareable, bookmarkable, survives refresh, and needs no
synchronisation.

```tsx
// Filters belong in the URL, not in useState
const searchParams = useSearchParams();
const status = searchParams.get("status") ?? "all";
```

Important:

Every client cache is a **consistency problem** you have signed up for. Before
adding one, ask what happens when it is stale, and how it gets invalidated. A cache
with no invalidation story is a bug with a delay on it.

## 15. How Do You Design The Data Layer For A Large Frontend?

Separate **server state** from **client state** — conflating them is the most common
architectural mistake.

| | Server state | Client state |
| --- | --- | --- |
| Owner | the backend | the UI |
| Examples | users, orders, products | modal open, selected tab, form draft |
| Needs | caching, revalidation, retry | simple, synchronous |
| Tool | TanStack Query / SWR / RSC | `useState`, `useReducer`, a small store |

```tsx
// Server state - the library owns caching and revalidation
const { data: orders } = useQuery({ queryKey: ["orders", filters], queryFn: fetchOrders });

// Client state - local and simple
const [isDrawerOpen, setDrawerOpen] = useState(false);
```

Why it matters:

Putting server data in Redux means hand-writing caching, deduplication,
revalidation, and retry — all of which a data library already does, better.

Layering that scales:

```txt
Components      rendering only
useX hooks      component-facing API
data layer      queries, mutations, cache keys
api client      transport, auth headers, error normalisation
```

The api client is the boundary worth insisting on: one place for auth, retries,
and error shape means a token refresh is one change, not fifty.

## 16. How Do You Handle A Component That Breaks After A Library Upgrade?

A dependency question that is really about process.

Method:

1. **Read the changelog and the migration guide** before debugging. Most breaks are
   documented.
2. **Confirm it is the upgrade** — `git bisect`, or pin back and verify.
3. **Check for a duplicated version** — two copies of the same library in the tree
   causes context and instance-identity bugs that look inexplicable.

```bash
npm ls react
npm ls @tanstack/react-query
```

4. **Check peer dependencies** — a mismatched peer is a frequent cause.
5. **Isolate** with an adapter so the rest of the codebase does not depend on the
   library's API directly.

Prevention worth naming:

- pin exact versions and upgrade deliberately, not via a floating range
- upgrade one major at a time, never several at once
- keep a smoke test over the critical flows so breakage is caught in CI
- wrap third-party components in your own adapter, so a breaking change touches one
  file

Interview note:

The strongest answer mentions **duplicate versions**. Two copies of React or of a
context-providing library produce errors that look like framework bugs, and `npm
ls` finds it in seconds.

## 17. Users Report Intermittent UI Glitches In Different Browsers. How Do You Debug?

"Intermittent" and "different browsers" are the two clues.

Method:

1. **Get the specifics** — browser, version, OS, device, and a reproduction path.
   Without a version, you are guessing.
2. **Check feature support** for anything recent — `:has()`, container queries,
   `structuredClone`, `Intl` options. Safari lags most often.
3. **Reproduce in a real browser**, not a resized window. Device emulation does not
   reproduce Safari's layout or iOS input behaviour.
4. **Look for timing dependence** — "intermittent" usually means a race: an effect
   assuming a ref exists, a font loading after measurement, an animation assuming a
   frame has painted.
5. **Check error monitoring grouped by browser** — a spike confined to one engine is
   the fastest signal available.

Frequent culprits:

| Symptom | Likely cause |
| --- | --- |
| Layout differs on Safari only | flexbox gap, `100vh` on iOS, date input styling |
| Works on refresh, not on navigation | client-side navigation skipping an effect |
| Only on slow connections | a race between hydration and user input |
| Only for some users | a browser extension mutating the DOM |
| Fonts jump after load | no metrics-matched fallback |

Important:

`100vh` on iOS includes the area behind the collapsing toolbar, so full-height
layouts overflow. `100dvh` is the fix, and it is one of the most common
Safari-only bug reports.

## 18. What Distinguishes A Strong Frontend System Design Answer?

**Clarify before designing.** The interviewer is watching whether you gather
requirements.

**Name the non-functional requirements.** Concurrency, freshness, offline
behaviour, and device constraints drive the architecture more than features do.

**Draw the data flow, not the folder structure.** What moves, how often, in which
direction.

**Design for failure explicitly.** Reconnection, retries, duplicates, ordering,
partial failure. Most candidates design the happy path only, and this is where the
question is actually decided.

**Cover the empty, huge, and slow states.** Zero items, a hundred thousand items,
and a three-second response.

**State tradeoffs and when you would choose differently.** "I would use WebSocket
here, but if the client only receives, SSE is simpler and survives proxies better."

**Know where the frontend stops.** Saying "the API must enforce this regardless"
about permissions, or "the server assigns the sequence number", shows you
understand the boundary.

Strong answer:

> I structure it as clarify, requirements, data and transport, components, edge
> cases, tradeoffs. The part I spend most time on is failure — reconnection,
> ordering, deduplication, and what the UI shows while things are broken — because
> that is where real systems differ from the diagram.

## Sources Used

- <https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API>
- <https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events>
- <https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API>
- <https://developer.mozilla.org/en-US/docs/Web/API/AbortController>
- <https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API>
- <https://developer.mozilla.org/en-US/docs/Web/API/Blob/slice>
- <https://react.dev/reference/react/useSyncExternalStore>
- <https://web.dev/articles/vitals>
