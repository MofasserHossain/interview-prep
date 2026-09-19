# Next.js Rendering And Caching Interview Guide

Rendering and caching guidance covering what makes a route static or dynamic, the
complete list of Request-time APIs, the `new Date()` trap, `io()` and
`connection()`, Partial Prerendering, Cache Components, `use cache`,
revalidation, `generateStaticParams`, and how to diagnose a route's rendering
mode.

Written against **Next.js 16**. Next.js 16 ships two caching models: the classic
model, and **Cache Components** (`cacheComponents: true`), which changes the
defaults substantially. Answers below say which model they apply to — confirm
which one a codebase uses before answering in an interview.

## 1. If I Call `new Date()` In A Page, Is It SSR, SSG, Or ISR?

This is a favourite interview question, and the intuitive answer is wrong.

```tsx
// app/page.tsx
export default function Page() {
  return <p>{new Date().toISOString()}</p>;
}
```

```viz
type: flow
title: How Next.js decides a route is dynamic
Does a component call cookies(), headers(), searchParams or draftMode()? :: if yes, dynamic
Does it await io() or connection()? :: if yes, kept out of the static shell
Does route config force it? :: dynamic = "force-dynamic", revalidate = 0
Otherwise :: prerendered at build time, values frozen
```

Answer, on the classic model:

**It is static — SSG.** The page is prerendered at build time, and the timestamp
is frozen into the HTML. Every visitor sees the moment you ran `next build`,
forever, until the next deploy.

Why:

`new Date()` is **not** a Request-time API. Only four things opt a route into
dynamic rendering, and reading the clock is not one of them. Next.js has no way to
know the value should differ per request, so it prerenders like any other page.

The build output confirms it:

```txt
Route (app)
┌ ○ /              <- Static, prerendered at build time
```

Fixes, depending on what you actually want:

```tsx
// 1. Render per request — opt into dynamic with a Request-time API
import { connection } from "next/server";

export default async function Page() {
  await connection();
  return <p>{new Date().toISOString()}</p>;
}
```

```tsx
// 2. Preferred on Cache Components — suspends during prerender only
import { io } from "next/cache";
import { Suspense } from "react";

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <CurrentTime />
    </Suspense>
  );
}

async function CurrentTime() {
  await io();
  return <p>{new Date().toISOString()}</p>;
}
```

```tsx
// 3. Render in the browser — a Client Component reads the real clock
"use client";

import { useEffect, useState } from "react";

export function Clock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => setNow(new Date().toISOString()), []);
  return <p>{now ?? "..."}</p>;
}
```

Interview answer:

> `new Date()` is not a Request-time API, so it does not make the route dynamic.
> The page prerenders and the timestamp is frozen at build time. To get a
> per-request value I have to opt in explicitly — `await io()` inside a Suspense
> boundary on Cache Components, `connection()` otherwise, or render it on the
> client.

## 2. What Are The Request-Time APIs?

There are exactly **four**. These are the only APIs that opt a component into
dynamic rendering by reading request-specific data.

| API | Reads |
| --- | --- |
| `cookies()` | request cookies |
| `headers()` | request headers |
| `searchParams` | URL query parameters (the `page` prop) |
| `draftMode()` | whether draft mode is enabled |

```tsx
import { cookies, headers, draftMode } from "next/headers";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const theme = (await cookies()).get("theme")?.value;
  const agent = (await headers()).get("user-agent");
  const { isEnabled } = await draftMode();
  const { q } = await searchParams;

  return <Results query={q} theme={theme} />;
}
```

All four are **async** in Next.js 15 and later — they must be awaited.

Important:

`params` is a Promise too, but it is **not** a Request-time API. Route parameters
are known at build time when `generateStaticParams` supplies them, so awaiting
`params` does not by itself make a route dynamic.

Two more functions force a suspension without reading request data:

| Function | Purpose |
| --- | --- |
| `connection()` | wait for a real user request before continuing |
| `io()` | suspend during prerender, for synchronous sources such as the clock |

## 3. Why Are `new Date()` And `Math.random()` Not Request-Time APIs?

Because they read nothing from the request. They are ordinary JavaScript, and
during prerendering they simply run — producing one value that gets baked into the
static output.

```tsx
export default function Page() {
  return (
    <ul>
      <li>{new Date().toISOString()}</li>
      <li>{Math.random()}</li>
      <li>{crypto.randomUUID()}</li>
    </ul>
  );
}
```

All three are evaluated once, at build time. Every visitor gets identical values.

The same applies to synchronous data sources:

- a synchronous SQLite driver such as `better-sqlite3` or `node:sqlite`
- an in-memory counter or module-level variable
- `process.uptime()`, `performance.now()`

Why it matters:

This is a silent correctness bug, not an error. The page builds, deploys, and
looks right on the day you ship it. A "last updated" timestamp that never changes
is the classic production symptom.

The rule:

If a value must differ per request and does not come from the request, Next.js
cannot infer that. You have to say so with `io()` or `connection()`.

## 4. What Is `io()` And When Do You Need It?

`io()` tells Next.js that an IO-like read follows, so it should suspend rather
than capture the value into the static shell.

```tsx
import { io } from "next/cache";
import { Suspense } from "react";

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <CurrentTime />
    </Suspense>
  );
}

async function CurrentTime() {
  await io();
  return <p>{new Date().toISOString()}</p>;
}
```

During prerender, `await io()` suspends and the fallback ships in the static
shell. At request time the real value streams in.

It works in Client Components too, via React's `use` — because Client Components
are prerendered on the server during SSR, where the read would otherwise be
captured:

```tsx
"use client";

import { use } from "react";
import { io } from "next/cache";

export function CurrentTime() {
  use(io());
  return <div>{Date.now()}</div>;
}
```

When you do **not** need `io()`:

- the component already uses a Request-time API such as `cookies()` — that is
  itself the suspension point
- the data comes from an awaited `fetch` or async database query inside
  `<Suspense>` — the `await` is the suspension point

Important:

Inside a `use cache` scope, `io()` is a no-op. The value is captured into the
static shell deliberately, and no Suspense boundary is needed. That is the other
half of the decision: cache the value once, or produce it per request.

## 5. What Is `connection()`, And How Does It Differ From `io()`?

`connection()` indicates that rendering should **wait for an incoming user
request before continuing**. It is useful when a component does not use a
Request-time API such as `cookies()` or `headers()`, but still needs to produce
different output per request — for example `Math.random()` or `new Date()`.

```ts
import { connection } from "next/server";

function connection(): Promise<void>;
```

It takes no arguments and returns a `void` promise that is not meant to be
consumed — you `await` it purely for the suspension it causes.

Everything written after `await connection()` runs only at request time:

```tsx
import { connection } from "next/server";

export default async function Page() {
  await connection(); // prerendering stops here
  const rand = Math.random();
  return <span>{rand}</span>;
}
```

A second use is a **synchronous database driver**. Queries from drivers such as
`better-sqlite3` complete during prerendering, so they would be captured into the
static output. Calling `connection()` first excludes them:

```ts
import { connection } from "next/server";
import Database from "better-sqlite3";

const db = new Database("app.db");

export async function getVisitorCount() {
  await connection();
  return db.prepare("SELECT value FROM counters WHERE name = ?").get("visitors");
}
```

Any component calling `getVisitorCount()` is now excluded from prerendering,
along with the rest of its output.

Two facts worth knowing about its history:

- `connection()` **replaces `unstable_noStore()`**, which is the older way to opt
  out of static rendering. New code should use `connection()` or `io()`.
- It stabilised in Next.js 15.0.0, so it is safe to use without an `unstable_`
  caveat.

Both keep code out of the static shell. They differ in what they wait for.

| | `io()` | `connection()` |
| --- | --- | --- |
| Suspends like | any async function | a real user request |
| Blocks prefetches | **no** | **yes** |
| Can be wrapped in `use cache` | yes | no |
| Import | `next/cache` | `next/server` |
| Preference | **default choice** | only when you need a real request |

```tsx
import { connection } from "next/server";

export default async function Page() {
  await connection(); // prerendering stops here
  const rand = Math.random();
  return <span>{rand}</span>;
}
```

Because `connection()` stays suspended until a full user navigation reaches the
server, it also blocks prefetching — so a link to that page cannot be made
instant.

The rule:

Prefer `io()`. Reach for `connection()` only when the code genuinely must not run
until a real user request arrives.

## 6. What Are The Four Rendering Modes, And How Do You Tell Which One A Route Uses?

Run `next build` and read the symbol beside each route.

| Symbol | Name | Behaviour |
| --- | --- | --- |
| `○` | Static | fully prerendered at build time, served without server rendering |
| `◐` | Partial Prerender | static shell served immediately, dynamic content streams in |
| `●` | SSG | prerendered static HTML from `generateStaticParams` |
| `ƒ` | Dynamic | server-rendered on demand for every request |

```txt
Route (app)
┌ ○ /                        static
├ ◐ /products                shell static, content streams
├ ● /blog/[slug]             prerendered from generateStaticParams
└ ƒ /api/search              dynamic
```

Important:

`◐` only appears with Cache Components, which makes Partial Prerendering the
default. On that model routes sit on a spectrum from fully static `○` to partially
prerendered `◐`, and `ƒ` appears only when a route has **nothing** to prerender —
request-dependent Route Handlers, Proxy, and dynamic metadata such as `icon` or
`opengraph-image`.

Interview note:

This build table is the honest answer to "is my page SSR or SSG?". It reflects
what the route does at prerender time, and it is how you verify a claim rather
than reasoning about it.

## 7. What Is Partial Prerendering?

Partial Prerendering splits one route into a static shell prerendered at build
time and dynamic holes that stream in per request.

```txt
┌─────────────────────────────┐
│  header, nav, layout        │  static shell, served instantly from CDN
│  ┌───────────────────────┐  │
│  │ user greeting         │  │  dynamic hole, streams at request time
│  └───────────────────────┘  │
│  product description        │  static
└─────────────────────────────┘
```

```tsx
import { Suspense } from "react";
import { cookies } from "next/headers";

export default function Page() {
  return (
    <main>
      <h1>Products</h1>          {/* static */}
      <ProductList />            {/* static */}

      <Suspense fallback={<GreetingSkeleton />}>
        <Greeting />             {/* dynamic hole */}
      </Suspense>
    </main>
  );
}

async function Greeting() {
  const name = (await cookies()).get("name")?.value;
  return <p>Welcome back, {name}</p>;
}
```

Why it matters:

Before PPR the choice was per route — one `cookies()` call anywhere made the
entire page dynamic, losing the CDN cache for the whole thing. PPR makes the
choice per component.

Important:

In Next.js 16 `cacheComponents: true` makes PPR the default. The
`experimental.ppr` flag and the `experimental_ppr` route segment config have been
**removed**.

## 8. How Does One `cookies()` Call Make A Whole Page Dynamic?

On the classic model, reading a Request-time API anywhere in the tree opts the
**entire route** into dynamic rendering.

```tsx
// Bad example: the whole page is now dynamic
import { cookies } from "next/headers";

export default async function Page() {
  const theme = (await cookies()).get("theme")?.value;

  return (
    <main>
      <ExpensiveStaticContent />   {/* re-rendered every request */}
      <Dashboard theme={theme} />
    </main>
  );
}
```

Fix — push the dynamic access down into a Suspense-wrapped child:

```tsx
import { cookies } from "next/headers";
import { Suspense } from "react";

export default function Page() {
  return (
    <main>
      <ExpensiveStaticContent />   {/* prerenders */}

      <Suspense fallback={<p>Loading...</p>}>
        <Dashboard />              {/* streams at request time */}
      </Suspense>
    </main>
  );
}

async function Dashboard() {
  const theme = (await cookies()).get("theme")?.value;
  return <DashboardUI theme={theme} />;
}
```

The same applies to `searchParams` — pass the promise down rather than awaiting it
at the top:

```tsx
export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Results searchParams={searchParams} />
    </Suspense>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const { query } = await searchParams;
  return <List query={query} />;
}
```

Interview note:

With Cache Components, reading a Request-time API outside a Suspense boundary
surfaces a **blocking-prerender-runtime** insight at build time, so the framework
points you at this fix rather than silently degrading.

## 9. What Is Cache Components, And How Does It Change The Defaults?

```ts
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;
```

| | Classic model | Cache Components |
| --- | --- | --- |
| Data fetching | cached by default in places | **dynamic by default** |
| You opt into | dynamic behaviour | **caching**, via `use cache` |
| PPR | opt-in, experimental | **default** |
| Route segment `dynamic` | supported | largely unnecessary |
| `dynamicParams` | supported | **not supported** |
| Runtime | Node or Edge | **Node.js required** |

The mental flip: instead of fighting the framework to make something dynamic, you
explicitly mark what should be cached.

Important:

Cache Components requires the Node.js runtime. Routes exporting the deprecated
`runtime = 'edge'` must be migrated.

Interview note:

Knowing that `cacheComponents` is **opt-in** matters. A codebase without it in
`next.config.ts` is on the classic model, and answers about `use cache` do not
apply to it.

## 10. What Is `use cache`?

`use cache` caches the return value of an async function or component. It requires
Cache Components.

Data-level:

```ts
import { cacheLife } from "next/cache";

export async function getProducts() {
  "use cache";
  cacheLife("hours");

  return db.query("SELECT * FROM products");
}
```

UI-level:

```tsx
export default async function Page() {
  "use cache";
  cacheLife("hours");

  const users = await db.query("SELECT * FROM users");
  return <UserList users={users} />;
}
```

Important:

A function's **arguments, and any values captured from an enclosing scope**, form
part of the cache key. Different inputs produce separate entries — which also
means capturing a large object in scope silently widens the key.

Everything cached must be serialisable. Functions and class instances cannot cross
a cache boundary.

## 11. How Do `cacheLife` And `cacheTag` Work?

`cacheLife` sets the lifetime, by profile:

| Profile | `stale` | `revalidate` | `expire` |
| --- | --- | --- | --- |
| `default` | 5m | 15m | never |
| `seconds` | 30s | 1s | 60s |
| `minutes` | 5m | 1m | 1h |
| `hours` | 5m | 1h | 1d |
| `days` | 5m | 1d | 1w |
| `weeks` | 5m | 1w | 30d |
| `max` | 5m | 30d | 1y |

Or explicitly, in seconds:

```ts
"use cache";
cacheLife({ stale: 3600, revalidate: 7200, expire: 86400 });
```

`cacheTag` labels an entry for later invalidation:

```ts
import { cacheLife, cacheTag } from "next/cache";

export async function getPosts() {
  "use cache";
  cacheLife("hours");
  cacheTag("posts");

  return db.post.findMany();
}
```

Edge case:

A cache counts as **short-lived** when it uses the `seconds` profile,
`revalidate: 0`, or an `expire` under five minutes. Short-lived caches are
excluded from prerendering and become dynamic holes instead — so an aggressive
`cacheLife` can accidentally turn a static page dynamic.

Important:

Pair every `use cache` with a `cacheLife`. Without one the implicit `default`
profile applies, which never expires.

## 12. `revalidateTag` vs `updateTag` vs `revalidatePath`

| | `updateTag` | `revalidateTag` |
| --- | --- | --- |
| Where | Server Actions **only** | Server Actions and Route Handlers |
| Behaviour | expires immediately | stale-while-revalidate |
| Use case | read-your-own-writes | background refresh |

```ts
"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

export async function createPost(formData: FormData) {
  const post = await db.post.create({
    data: { title: formData.get("title") as string },
  });

  updateTag("posts"); // the author sees their post immediately
  redirect(`/posts/${post.id}`);
}
```

```ts
import { revalidateTag } from "next/cache";

export async function updateCatalog() {
  await syncFromSupplier();
  revalidateTag("products", "max"); // serve stale while refreshing
}
```

The second argument to `revalidateTag` sets how long stale content may be served
while fresh content generates. Once it expires, requests block until the new
content is ready.

`revalidatePath` invalidates by route instead of by tag:

```ts
import { revalidatePath } from "next/cache";

revalidatePath("/posts");
```

The rule:

`updateTag` when the user who made the change must see it. `revalidateTag` when a
short delay is acceptable and you would rather nobody wait.

## 13. What Is ISR, And How Do You Do It Now?

Incremental Static Regeneration serves a prerendered page and refreshes it in the
background after a period, so you get static performance with changing data.

Classic model — route segment config:

```tsx
export const revalidate = 3600; // seconds

export default async function Page() {
  const posts = await getPosts();
  return <PostList posts={posts} />;
}
```

Cache Components — `cacheLife` does the same job:

```tsx
import { cacheLife } from "next/cache";

export default async function Page() {
  "use cache";
  cacheLife("hours");

  const posts = await getPosts();
  return <PostList posts={posts} />;
}
```

On-demand ISR, triggered by a webhook from a CMS:

```ts
// app/api/revalidate/route.ts
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const secret = new URL(request.url).searchParams.get("secret");

  if (secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  revalidateTag("posts");
  return NextResponse.json({ revalidated: true });
}
```

Important:

Self-hosting ISR across multiple instances needs a **shared** cache handler.
Without one, each replica keeps its own cache and users see different content
depending on which instance answers.

## 14. How Do `generateStaticParams` And `dynamicParams` Work?

`generateStaticParams` tells Next.js which dynamic routes to prerender at build
time.

```tsx
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await getPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPost(slug);
  return <article>{post.title}</article>;
}
```

These routes build as `●` SSG.

Classic model — `dynamicParams` controls what happens for a param **not** in the
list:

```tsx
export const dynamicParams = true;  // default: render on demand, then cache
export const dynamicParams = false; // return 404 for anything not listed
```

Important, on Cache Components:

- `generateStaticParams` must return **at least one** param
- `dynamicParams` is **not supported**
- `params` should be awaited inside a `<Suspense>` boundary

Edge case:

Listing params does not guarantee `○` Static. If the page body still performs
uncached I/O, each route prerenders only its shell and shows `◐` — the params tell
Next.js which pages exist, not that their content is static.

## 15. What Are The Route Segment Config Options?

On the classic model, these exports control a segment's behaviour:

```tsx
export const dynamic = "auto";          // 'auto' | 'force-dynamic' | 'error' | 'force-static'
export const revalidate = 3600;         // false | 0 | number
export const dynamicParams = true;      // boolean
export const fetchCache = "auto";       // caching strategy for fetch
export const runtime = "nodejs";        // 'nodejs' | 'edge'  (edge deprecated)
export const preferredRegion = "auto";
export const maxDuration = 5;
```

`dynamic` values:

| Value | Effect |
| --- | --- |
| `auto` | default — cache what it can, opt into dynamic when a Request-time API is used |
| `force-dynamic` | always render per request |
| `force-static` | force static; Request-time APIs return empty values |
| `error` | force static and **error** if anything tries to go dynamic |

`dynamic = "error"` is the useful one for catching this class of bug — it fails the
build if a page you intended to be static reads a cookie.

On Cache Components:

- `force-dynamic` is **not needed** — everything is dynamic by default
- `force-static` should be removed; use `use cache` with a long `cacheLife`
  instead
- `revalidate` and `fetchCache` are replaced by `cacheLife`
- `runtime = 'edge'` must be migrated to Node.js

Newer config options in 16 include `instant`, `prefetch`, `maxDuration`,
`preferredRegion`, and `dynamicParams`.

## 16. How Do You Cache In Route Handlers?

Route Handlers are dynamic by default in the App Router.

```ts
// app/api/posts/route.ts
export const revalidate = 3600; // classic model: cache for an hour

export async function GET() {
  const posts = await db.post.findMany();
  return Response.json(posts);
}
```

Important:

A `GET` handler that reads `request` — its URL, headers, or cookies — cannot be
cached, because the response depends on the request. Any handler using `POST`,
`PUT`, `PATCH`, or `DELETE` is never cached.

With Cache Components, `GET` Route Handlers follow the same prerendering model as
pages.

Interview note:

Route Handlers that simply re-expose your own database to your own pages are
usually unnecessary. A Server Component can query directly, skipping a serialise,
HTTP round trip, and deserialise.

## 17. How Do You Debug Why A Route Went Dynamic?

Method:

1. **Run `next build`** and read the symbol. `ƒ` means fully dynamic.
2. **Search for the four Request-time APIs** — `cookies()`, `headers()`,
   `searchParams`, `draftMode()` — anywhere in the route's component tree,
   including shared components and layouts.
3. **Check the layout**, not only the page. A `cookies()` call in a layout affects
   every route beneath it.
4. **Check route segment config** for `dynamic = "force-dynamic"` or
   `revalidate = 0`.
5. **Add `export const dynamic = "error"`** temporarily. The build then fails and
   names the exact call that forced dynamic rendering.

```tsx
// Temporarily, to find the culprit
export const dynamic = "error";
```

```txt
Error: Route /dashboard with `dynamic = "error"` couldn't be rendered
statically because it used `cookies`.
```

Interview trap:

A third-party component or an analytics helper reading `headers()` deep in the
tree makes the page dynamic with nothing visible in your own page file. The
`dynamic = "error"` trick is the fastest way to find it.

## 18. How Does Streaming Work With Suspense?

Adding `loading.tsx` wraps the segment in a Suspense boundary automatically:

```tsx
// app/dashboard/loading.tsx
export default function Loading() {
  return <DashboardSkeleton />;
}
```

Explicit boundaries give per-component control:

```tsx
import { Suspense } from "react";

export default function Page() {
  return (
    <section>
      <h1>Dashboard</h1>

      <Suspense fallback={<StatsSkeleton />}>
        <Stats />
      </Suspense>

      <Suspense fallback={<FeedSkeleton />}>
        <Feed />
      </Suspense>
    </section>
  );
}
```

Each boundary resolves independently, so a slow `Stats` no longer delays `Feed`.

The rule:

A Suspense boundary is both a loading state and a **rendering boundary**. It is
what lets the static shell ship while the dynamic part streams — the same
mechanism behind Partial Prerendering.

Tradeoff:

Every boundary adds a fallback that must match the final layout's dimensions.
Mismatched sizes produce layout shift when content arrives, hurting Cumulative
Layout Shift.

## 19. What Happened To `fetch` Caching?

On the classic model, `fetch` accepted Next-specific options:

```ts
await fetch(url, { cache: "force-cache" });           // cache indefinitely
await fetch(url, { cache: "no-store" });              // never cache
await fetch(url, { next: { revalidate: 3600 } });     // time-based
await fetch(url, { next: { tags: ["posts"] } });      // taggable
```

In Next.js 15 the default changed to **`no-store`** — `fetch` is no longer cached
by default, which reversed the Next.js 13 and 14 behaviour and surprised a lot of
upgrades.

On Cache Components these options are replaced by `use cache` plus `cacheLife` and
`cacheTag`:

```ts
export async function getPosts() {
  "use cache";
  cacheLife("hours");
  cacheTag("posts");

  const res = await fetch("https://api.example.com/posts");
  return res.json();
}
```

Important:

`fetch` options `cache`, `next.revalidate`, and `next.tags` have **no effect
inside Proxy**. Proxy is not a data-fetching layer.

## 20. What Is `unstable_cache`, And Should You Use It?

`unstable_cache` caches the result of a non-`fetch` async function on the classic
model — typically a database query.

```ts
import { unstable_cache } from "next/cache";

const getPosts = unstable_cache(
  async () => db.post.findMany(),
  ["posts-list"],                      // cache key parts
  { revalidate: 3600, tags: ["posts"] },
);
```

When not to use it:

On Cache Components, `use cache` replaces it entirely and is the supported path.
The `unstable_` prefix is a genuine signal — the API is not stable.

Its sibling `unstable_noStore()` is also superseded: `connection()` replaced it,
and on Cache Components `io()` is preferred again over `connection()`. The
progression is `unstable_noStore` → `connection` → `io`.

Interview note:

React's `cache()` is a different thing and often confused with it. `cache()`
deduplicates a function **within a single render pass**; it does not persist
anything between requests.

```ts
import { cache } from "react";

export const getUser = cache(async (id: string) => db.user.findUnique({ where: { id } }));
```

Three components calling `getUser("1")` in one render hit the database once. The
next request starts fresh.

## 21. How Do You Decide What To Cache?

Decision table:

| Data | Approach |
| --- | --- |
| Marketing copy, docs, changelog | fully static, long `cacheLife` |
| Product catalogue, blog posts | cached with a tag, invalidated on publish |
| Search results | dynamic, inside Suspense |
| Anything per-user | dynamic, via `cookies()` inside Suspense |
| Dashboards mixing both | PPR — static shell plus dynamic holes |
| Real-time prices, stock levels | dynamic, short or no cache |

Questions to ask in order:

1. Is it the same for every visitor? If not, it is dynamic.
2. How stale can it be? That answers `cacheLife`.
3. Is there an event that should invalidate it? That answers `cacheTag`.
4. Must the person who changed it see the change immediately? That is `updateTag`
   rather than `revalidateTag`.

Tradeoff:

Caching more increases the risk of serving something wrong. The cost of a stale
price is not the cost of a stale blog post, and the cache lifetime should reflect
that rather than being uniform.

## 22. How Would You Explain The Rendering Model In An Interview?

Strong answer:

> Next.js prerenders by default. A route becomes dynamic only when a component
> reads request-specific data, and there are exactly four Request-time APIs that
> do that: `cookies()`, `headers()`, `searchParams`, and `draftMode()`. Anything
> else — including `new Date()` and `Math.random()` — is evaluated once at build
> time and frozen into the static output.
>
> With Cache Components in Next.js 16, Partial Prerendering is the default, so the
> choice is per component rather than per route. I keep the shell static and wrap
> the request-dependent parts in Suspense so they stream in. When I need a
> per-request value that does not come from the request, I say so explicitly with
> `await io()`.
>
> To verify any of this I read the symbols in the `next build` output rather than
> reasoning about it — `○` static, `◐` partially prerendered, `●` SSG, `ƒ`
> dynamic.

## Sources Used

- <https://nextjs.org/docs/app/glossary>
- <https://nextjs.org/docs/app/api-reference/functions/connection>
- <https://nextjs.org/docs/app/api-reference/functions/io>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents>
- <https://nextjs.org/docs/app/api-reference/directives/use-cache>
- <https://nextjs.org/docs/app/api-reference/functions/cacheLife>
- <https://nextjs.org/docs/app/api-reference/functions/updateTag>
- <https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config>
- <https://nextjs.org/docs/app/guides/building>
- <https://nextjs.org/docs/app/guides/migrating-to-cache-components>
- <https://nextjs.org/docs/app/guides/incremental-static-regeneration>
