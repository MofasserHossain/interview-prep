# Next.js Fundamentals Interview Guide

Next.js interview guidance covering the App Router, file conventions, Server and
Client Components, data fetching, streaming, Server Functions, Cache Components,
revalidation, Proxy, Route Handlers, error handling, navigation, metadata, and
deployment.

Examples target **Next.js 16**. Several APIs changed in this major version —
Middleware is now called Proxy, caching centres on Cache Components, and `params`
is a Promise. Answers written against Next.js 13 or 14 will be wrong on those
points.

This guide is the overview. Each area has its own deeper guide in the Next.js
track:

| Topic | Guide |
| --- | --- |
| Static vs dynamic, `new Date()`, Cache Components | Rendering, Caching & Dynamic APIs |
| Routes, layouts, parallel and intercepting routes | Routing & Navigation |
| `use client`, hydration, flashes | Server & Client Components |
| Server Functions, forms, Route Handlers | Data Fetching, Forms & Mutations |
| Boundaries, `retry`, `unstable_rethrow` | Error Handling |
| `generateMetadata`, OG images, sitemaps | Metadata & SEO |
| CSS Modules, Tailwind, images, fonts | Styling & Assets |
| Images, fonts, prefetching, bundles | Optimizations & Performance |
| Auth checks, DAL, CSP, tainting | Security & Auth |
| Proxy, instrumentation, tracing | Proxy & Observability |
| Docker, env vars, version skew | Deployment & Production |
| Vitest, Playwright, Turbopack, codemods | Testing, Debugging & Tooling |

## 1. What Is Next.js, And What Does It Add Over React?

React renders components. Next.js supplies everything around them that a
production application needs.

| Concern | Plain React | Next.js |
| --- | --- | --- |
| Routing | a library you choose | file-system based |
| Rendering | client-side only | server, static, streaming, client |
| Data fetching | `useEffect` or a library | `async` Server Components |
| Bundling | configure yourself | built in, with code splitting |
| Images and fonts | manual | `next/image`, `next/font` |
| SEO and metadata | manual | the Metadata API |
| API endpoints | a separate server | Route Handlers |

Why it matters:

The largest difference is **where** components run. In plain React everything ships
to the browser. In Next.js the default is the server, so data fetching happens close
to the data and only interactive code is sent to the client.

When not to use it:

An internal dashboard behind a login with no SEO requirement, or an app embedded in
an existing backend, may be better served by Vite and a client-side router. Next.js
earns its complexity when rendering strategy, SEO, or payload size matter.

## 2. App Router vs Pages Router

Both are supported and can coexist in one project. The App Router is the default for
new applications.

| | Pages Router | App Router |
| --- | --- | --- |
| Directory | `pages/` | `app/` |
| Default component type | Client | **Server** |
| Data fetching | `getServerSideProps`, `getStaticProps` | `async` components |
| Layouts | `_app.tsx`, manual | nested `layout.tsx` |
| Loading states | manual | `loading.tsx`, Suspense |
| Streaming | no | yes |
| Server Functions | no | yes |

```tsx
// Pages Router
export async function getServerSideProps() {
  const res = await fetch("https://api.example.com/posts");
  return { props: { posts: await res.json() } };
}

export default function Page({ posts }) {
  return <PostList posts={posts} />;
}
```

```tsx
// App Router — the component itself is async
export default async function Page() {
  const res = await fetch("https://api.example.com/posts");
  const posts = await res.json();

  return <PostList posts={posts} />;
}
```

Interview note:

The key conceptual shift is that data fetching moved **into** the component instead
of sitting in a separate exported function that passes props down. That is what makes
nested layouts and streaming possible.

## 3. What Are The App Router File Conventions?

Inside `app/`, specific filenames have specific meanings. Folders create routes;
these files define behaviour.

| File | Purpose |
| --- | --- |
| `page.tsx` | the route's UI — makes the segment publicly routable |
| `layout.tsx` | shared shell that wraps children and **preserves state** |
| `template.tsx` | like a layout, but remounts on navigation |
| `loading.tsx` | Suspense fallback for the segment |
| `error.tsx` | error boundary — must be a Client Component |
| `global-error.tsx` | replaces the root layout when it fails |
| `not-found.tsx` | UI for `notFound()` |
| `forbidden.tsx` / `unauthorized.tsx` | UI for `forbidden()` / `unauthorized()` |
| `route.ts` | an API endpoint instead of a page |
| `default.tsx` | fallback for unmatched parallel routes |
| `proxy.ts` | runs before a request completes (project root) |

```txt
app/
├── layout.tsx            root layout, required
├── page.tsx              /
├── loading.tsx
├── blog/
│   ├── layout.tsx        wraps everything under /blog
│   ├── page.tsx          /blog
│   └── [slug]/
│       └── page.tsx      /blog/:slug
└── api/
    └── posts/
        └── route.ts      /api/posts
```

Important:

A folder without a `page.tsx` or `route.ts` is not routable — useful for colocating
components and tests next to the route that uses them.

Layouts nest and preserve state across navigation, which is why a sidebar's scroll
position survives a route change. A `template.tsx` remounts instead, which is what
you want for an entry animation that should replay.

## 4. Server Components vs Client Components

Every component in `app/` is a **Server Component** by default.

| | Server Component | Client Component |
| --- | --- | --- |
| Runs | on the server | server (prerender) then browser |
| Ships JavaScript | **no** | yes |
| `async` / `await` | yes | no |
| Direct database access | yes | no |
| Hooks (`useState`, `useEffect`) | no | yes |
| Event handlers | no | yes |
| Browser APIs | no | yes |

```tsx
// Server Component: no "use client"
import { db } from "@/lib/db";

export default async function UsersPage() {
  const users = await db.user.findMany(); // runs on the server only

  return <UserList users={users} />;
}
```

```tsx
"use client";

import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);

  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

Benefits of Server Components:

- database credentials and API keys never reach the browser
- no client-side loading waterfall for initial data
- large dependencies such as a Markdown parser stay on the server

Interview trap:

`"use client"` marks a **boundary**, not a single file. Everything imported by a
Client Component also becomes client code. Push the directive as far down the tree as
possible — one `"use client"` at the top of a page sends the entire subtree to the
browser.

## 5. How Do You Compose Server And Client Components?

A Client Component cannot import a Server Component, but it can **receive one as a
prop** — usually as `children`.

```tsx
// Bad: importing a Server Component into a Client Component
// makes it a Client Component too
"use client";
import { ServerSidebar } from "./server-sidebar"; // now client code
```

```tsx
// Good: pass it through as children
// app/layout.tsx — a Server Component
import { ClientShell } from "./client-shell";
import { ServerSidebar } from "./server-sidebar";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ClientShell sidebar={<ServerSidebar />}>
      {children}
    </ClientShell>
  );
}
```

The Server Component is rendered on the server, and the Client Component receives the
finished output.

Important:

Props crossing the boundary must be serialisable. Functions, class instances, and
`Date` objects cannot be passed to a Client Component — only plain data and
JSX elements.

Context providers must live in a Client Component and are usually mounted once in the
root layout:

```tsx
"use client";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
```

## 6. How Do You Fetch Data In The App Router?

The component is `async` and awaits directly.

```tsx
export default async function PostsPage() {
  const res = await fetch("https://api.example.com/posts");

  if (!res.ok) {
    throw new Error("Failed to load posts");
  }

  const posts = await res.json();

  return <PostList posts={posts} />;
}
```

Or skip HTTP entirely and query the database:

```tsx
import { db } from "@/lib/db";

export default async function PostsPage() {
  const posts = await db.post.findMany({ orderBy: { createdAt: "desc" } });
  return <PostList posts={posts} />;
}
```

**Sequential** fetching creates a waterfall — each await blocks the next:

```tsx
const user = await getUser(id);
const orders = await getOrders(user.id); // waits for user
```

**Parallel** fetching starts both at once:

```tsx
const [user, posts] = await Promise.all([getUser(id), getPosts(id)]);
```

Tradeoff:

Sequential is necessary when the second request genuinely needs the first result.
When it does not, `Promise.all` removes a full round trip from the response time.

Interview note:

React's `cache()` deduplicates a function across one render pass, so several
components calling `getUser(1)` hit the database once.

## 7. Why Are `params` And `searchParams` Promises?

Since Next.js 15 they are asynchronous and must be awaited.

```tsx
export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPost(slug);

  return <article>{post.title}</article>;
}
```

```tsx
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <Results query={q} />;
}
```

Why:

Making them async lets Next.js begin rendering the static parts of a page before
these request-specific values are known. The page's shell can be prerendered and
streamed while the dynamic segment resolves.

Interview trap:

This is one of the most common upgrade errors. Code written for Next.js 13 or 14
destructures `params` directly, which now yields a Promise and produces confusing
`undefined` values rather than a clear error.

```tsx
// Wrong in Next.js 15+
export default function Page({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug); // params is a Promise
}
```

## 8. What Is Streaming, And How Does `loading.tsx` Work?

Streaming sends HTML in pieces so the user sees the shell immediately instead of
waiting for the slowest query.

```tsx
// app/dashboard/loading.tsx
export default function Loading() {
  return <DashboardSkeleton />;
}
```

Adding this file automatically wraps the segment in a Suspense boundary. The layout
renders at once and the page streams in when ready.

Finer control comes from Suspense directly:

```tsx
import { Suspense } from "react";

export default function DashboardPage() {
  return (
    <section>
      <h1>Dashboard</h1>

      <Suspense fallback={<StatsSkeleton />}>
        <Stats />       {/* slow: streams in when ready */}
      </Suspense>

      <Suspense fallback={<FeedSkeleton />}>
        <Feed />        {/* independent, streams separately */}
      </Suspense>
    </section>
  );
}
```

Why it matters:

Without Suspense the whole page waits for the slowest component. With it, each
boundary resolves independently, so a 2-second analytics query no longer delays the
heading and navigation.

The rule:

Put a Suspense boundary around anything slow and independent. The fallback should
match the final layout's dimensions, or the content will shift when it arrives and
hurt Cumulative Layout Shift.

## 9. What Are Server Functions?

A Server Function — the mechanism behind Server Actions — is an async function that
runs on the server but can be called from the client. It is marked with
`"use server"`.

```ts
// app/lib/actions.ts
"use server";

import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export async function createPost(formData: FormData) {
  const title = formData.get("title") as string;

  if (!title || title.length < 3) {
    return { error: "Title must be at least 3 characters" };
  }

  const post = await db.post.create({ data: { title } });
  redirect(`/posts/${post.id}`);
}
```

Called from a form with no client JavaScript at all:

```tsx
import { createPost } from "@/lib/actions";

export default function NewPostPage() {
  return (
    <form action={createPost}>
      <input name="title" required />
      <button type="submit">Create</button>
    </form>
  );
}
```

Benefits:

- no API route, no `fetch`, no manual serialisation
- works before hydration, because it is a real form POST
- types are shared, since the caller and the function are the same codebase

Important:

A Server Function is a **public HTTP endpoint**. Next.js cannot know who is allowed
to call it, so every one must validate its own input and check authorisation:

```ts
"use server";

export async function deletePost(id: string) {
  const session = await auth();

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  await db.post.delete({ where: { id, authorId: session.user.id } });
}
```

## 10. How Do You Show Pending And Error States?

`useActionState` gives the returned value and a pending flag.

```tsx
"use client";

import { useActionState } from "react";
import { createPost } from "@/lib/actions";

export function PostForm() {
  const [state, formAction, isPending] = useActionState(createPost, null);

  return (
    <form action={formAction}>
      <input name="title" required />

      {state?.error ? <p role="alert">{state.error}</p> : null}

      <button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Create"}
      </button>
    </form>
  );
}
```

`useFormStatus` reads the status of the nearest parent form, which keeps the button
reusable:

```tsx
"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? "Saving..." : "Save"}</button>;
}
```

Important:

`useFormStatus` must be used in a component **inside** the form, not in the component
that renders the form. Reading it beside the `<form>` always returns `pending: false`.

## 11. What Are Cache Components And `use cache`?

Cache Components is Next.js 16's caching model. It is opt-in:

```ts
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;
```

The `use cache` directive then caches the return value of an async function or
component.

Data-level — cache what a function returns:

```ts
import { cacheLife } from "next/cache";

export async function getProducts() {
  "use cache";
  cacheLife("hours");

  return db.query("SELECT * FROM products");
}
```

UI-level — cache an entire component or page:

```tsx
import { cacheLife } from "next/cache";

export default async function Page() {
  "use cache";
  cacheLife("hours");

  const users = await db.query("SELECT * FROM users");

  return (
    <ul>
      {users.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

Important:

A function's **arguments and any values captured from an enclosing scope** become
part of the cache key, so different inputs produce different entries.

Interview note:

If a project has not enabled `cacheComponents`, the previous model applies — `fetch`
options such as `cache` and `next.revalidate`, plus route segment config. The docs
keep that as a separate guide, so confirm which model a codebase uses before
answering questions about it.

## 12. How Do `cacheLife` And `cacheTag` Work?

`cacheLife` sets how long an entry stays valid, by profile name:

| Profile | `stale` | `revalidate` | `expire` |
| --- | --- | --- | --- |
| `default` | 5m | 15m | never |
| `seconds` | 30s | 1s | 60s |
| `minutes` | 5m | 1m | 1h |
| `hours` | 5m | 1h | 1d |
| `days` | 5m | 1d | 1w |
| `weeks` | 5m | 1w | 30d |
| `max` | 5m | 30d | 1y |

Or with explicit seconds:

```ts
"use cache";
cacheLife({
  stale: 3600,      // 1 hour before considered stale
  revalidate: 7200, // 2 hours before revalidating
  expire: 86400,    // 1 day before expiring
});
```

`cacheTag` labels an entry so it can be invalidated by name later:

```ts
import { cacheLife, cacheTag } from "next/cache";

export async function getPosts() {
  "use cache";
  cacheLife("hours");
  cacheTag("posts");

  return db.post.findMany();
}
```

Important:

Pair every `use cache` with a `cacheLife`. Without one the implicit `default` profile
applies, which never expires — rarely what you want.

Edge case:

A cache counts as short-lived when it uses the `seconds` profile, `revalidate: 0`, or
an `expire` under five minutes. Short-lived caches are excluded from prerendering and
become dynamic holes instead.

## 13. `revalidateTag` vs `updateTag` vs `revalidatePath`

Three ways to invalidate, and the difference between the first two is a common
interview question.

| | `updateTag` | `revalidateTag` |
| --- | --- | --- |
| Where | Server Actions **only** | Server Actions and Route Handlers |
| Behaviour | expires immediately | stale-while-revalidate |
| Use case | read-your-own-writes | background refresh, slight delay acceptable |

```ts
"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

export async function createPost(formData: FormData) {
  const post = await db.post.create({
    data: { title: formData.get("title") as string },
  });

  updateTag("posts"); // the user sees their new post immediately
  redirect(`/posts/${post.id}`);
}
```

```ts
import { revalidateTag } from "next/cache";

export async function updateUser(id: string) {
  await db.user.update({ where: { id }, data: { /* ... */ } });

  revalidateTag("user", "max"); // serve stale while refreshing in the background
}
```

The second argument to `revalidateTag` sets how long stale content may be served
while fresh content generates. Once it expires, requests block until the new content
is ready; `"max"` gives the longest stale window.

`revalidatePath` invalidates by route instead of by tag:

```ts
import { revalidatePath } from "next/cache";

revalidatePath("/posts");
```

The rule:

Use `updateTag` when the user just made the change and must see it. Use
`revalidateTag` when a delay of a few seconds is acceptable and you would rather not
make anyone wait.

## 14. What Is Proxy, And What Happened To Middleware?

**Starting with Next.js 16, Middleware is called Proxy.** The functionality is
unchanged; the name better describes what it is for.

The file is `proxy.ts` at the project root, beside `app/`:

```ts
// proxy.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const token = request.cookies.get("session")?.value;

  if (!token && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const response = NextResponse.next();
  response.headers.set("x-request-id", crypto.randomUUID());
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
```

Use cases:

- rewriting for A/B tests or experiments
- setting headers across many routes
- programmatic redirects from request properties

Important:

Proxy is **not** intended for slow data fetching or as a full authorisation
solution. It is suited to optimistic checks such as "is there a session cookie";
real authorisation belongs closer to the data. Also note that `fetch` options
`cache`, `next.revalidate`, and `next.tags` have **no effect** inside Proxy.

Only one `proxy.ts` is supported per project. Split the logic into modules and import
them if it grows.

Interview note:

Naming this correctly signals current knowledge. An answer describing `middleware.ts`
describes Next.js 15 and earlier.

## 15. What Are Route Handlers?

Route Handlers build API endpoints using `route.ts` and the Web `Request` and
`Response` APIs.

```ts
// app/api/posts/route.ts
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? 10);

  const posts = await db.post.findMany({ take: limit });

  return NextResponse.json(posts);
}

export async function POST(request: Request) {
  const body = await request.json();

  if (!body.title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const post = await db.post.create({ data: body });

  return NextResponse.json(post, { status: 201 });
}
```

Dynamic segments, with `params` again a Promise:

```ts
// app/api/posts/[id]/route.ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const post = await db.post.findUnique({ where: { id } });

  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(post);
}
```

Supported methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.

When to use which:

| Need | Use |
| --- | --- |
| a form or mutation from your own UI | Server Function |
| a public API for external clients | Route Handler |
| webhook receiver | Route Handler |
| reading data for your own pages | fetch directly in a Server Component |

Important:

A `route.ts` and a `page.tsx` cannot coexist in the same folder — they both claim the
segment.

## 16. How Does Error Handling Work?

Next.js distinguishes **expected** errors from **uncaught exceptions**.

Expected errors are returned as values, not thrown:

```ts
"use server";

export async function createPost(formData: FormData) {
  const title = formData.get("title");

  if (!title) {
    return { error: "Title is required" }; // returned, not thrown
  }

  await db.post.create({ data: { title: title as string } });
}
```

Uncaught exceptions are caught by an `error.tsx` boundary:

```tsx
"use client"; // error boundaries must be Client Components

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong</h2>
      <p>{error.digest}</p>
      <button onClick={() => retry()}>Try again</button>
    </div>
  );
}
```

Note the prop is `retry`, not `reset`. `retry()` re-fetches and re-renders the
boundary's children; the older `reset()` only clears the error state. See the
Error Handling guide for the difference.

`error.tsx` catches errors in its own segment and below, but **not** in its own
layout — that layout is its parent. Catching a root layout failure needs
`global-error.tsx`, which replaces the entire page including the root layout.

Navigation helpers that render dedicated files:

```ts
import { notFound, forbidden, unauthorized } from "next/navigation";

if (!post) notFound();        // renders not-found.tsx
if (!canView) forbidden();    // renders forbidden.tsx
if (!session) unauthorized(); // renders unauthorized.tsx
```

Important:

In production, error messages from the server are not sent to the browser. The
`digest` property is a hash you can match against your server logs — that is why it
is worth displaying.

## 17. What Are Route Groups, Parallel Routes, And Intercepting Routes?

**Route groups** `(name)` organise files without affecting the URL:

```txt
app/
├── (marketing)/
│   ├── layout.tsx      only wraps marketing pages
│   ├── page.tsx        /
│   └── about/page.tsx  /about
└── (shop)/
    ├── layout.tsx      a different shell
    └── cart/page.tsx   /cart
```

The `(marketing)` and `(shop)` segments do not appear in the URL. This is how one
application serves two different layouts at the top level.

**Parallel routes** `@name` render several independent subtrees in one layout:

```txt
app/
├── layout.tsx
├── @team/page.tsx
├── @analytics/page.tsx
└── page.tsx
```

```tsx
export default function Layout({
  children,
  team,
  analytics,
}: {
  children: React.ReactNode;
  team: React.ReactNode;
  analytics: React.ReactNode;
}) {
  return (
    <>
      {children}
      <div className="grid">{team}{analytics}</div>
    </>
  );
}
```

Each slot streams and errors independently, which suits dashboards.

**Intercepting routes** `(.)` show a route in the current layout instead of
navigating — the classic photo-modal pattern, where a direct link shows the full page
but an in-app click opens a modal.

```txt
app/
├── feed/page.tsx
└── feed/(..)photo/[id]/page.tsx   intercepts /photo/:id
```

Use cases: modals with shareable URLs, previews, and login dialogs that are also real
pages.

## 18. How Do Navigation And Prefetching Work?

`<Link>` performs client-side navigation and prefetches automatically.

```tsx
import Link from "next/link";

<Link href="/posts">Posts</Link>
<Link href={`/posts/${id}`} prefetch={false}>Details</Link>
```

By default Next.js prefetches the linked route when the link enters the viewport, so
the navigation feels instant. Setting `prefetch={false}` disables it for links that
are unlikely to be followed.

Programmatic navigation from a Client Component:

```tsx
"use client";

import { useRouter } from "next/navigation";

export function SaveButton() {
  const router = useRouter();

  return (
    <button
      onClick={async () => {
        await save();
        router.refresh();       // re-fetch Server Component data
        router.push("/posts");  // navigate
      }}
    >
      Save
    </button>
  );
}
```

Important:

`useRouter` comes from `next/navigation` in the App Router, not `next/router`, which
is the Pages Router version and throws if used in `app/`.

`router.refresh()` re-fetches server data for the current route while preserving
client state — useful after a mutation that did not use a Server Function.

## 19. How Does The Metadata API Work?

Static metadata is an exported object:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Interview Prep",
  description: "Interview preparation guides",
  openGraph: {
    title: "Interview Prep",
    images: ["/og.png"],
  },
};
```

Dynamic metadata is an exported async function:

```tsx
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: { images: [post.coverImage] },
  };
}
```

A title template in the root layout applies to every child:

```tsx
export const metadata: Metadata = {
  title: {
    default: "Interview Prep",
    template: "%s | Interview Prep",
  },
};
```

A child exporting `title: "SQL"` renders `SQL | Interview Prep`.

Interview note:

`generateMetadata` and the page often need the same data. Wrapping the fetch in
React's `cache()` means it runs once rather than twice.

## 20. How Do You Deploy A Next.js Application?

`next build` produces a `.next` directory, and `next start` serves it.

**Standalone output** is the usual choice for containers — it traces only the files
actually needed:

```ts
// next.config.ts
const nextConfig: NextConfig = {
  output: "standalone",
};
```

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

**Static export** produces plain HTML with no Node server, at the cost of Server
Functions, Route Handlers, and dynamic rendering:

```ts
const nextConfig: NextConfig = {
  output: "export",
};
```

Environment variables:

| Prefix | Available in |
| --- | --- |
| none | server only |
| `NEXT_PUBLIC_` | server **and** browser |

Important:

`NEXT_PUBLIC_` values are inlined into the client bundle at build time. Never give a
secret that prefix, and remember that changing one requires a rebuild, not just a
restart.

Interview note:

Self-hosting needs a persistent cache directory or a shared cache handler across
instances. Without one, each replica keeps its own cache and users see inconsistent
content depending on which instance serves them.

## Sources Used

- <https://nextjs.org/docs/app/getting-started/layouts-and-pages>
- <https://nextjs.org/docs/app/getting-started/server-and-client-components>
- <https://nextjs.org/docs/app/getting-started/fetching-data>
- <https://nextjs.org/docs/app/getting-started/mutating-data>
- <https://nextjs.org/docs/app/getting-started/caching>
- <https://nextjs.org/docs/app/getting-started/revalidating>
- <https://nextjs.org/docs/app/getting-started/error-handling>
- <https://nextjs.org/docs/app/getting-started/route-handlers>
- <https://nextjs.org/docs/app/getting-started/proxy>
- <https://nextjs.org/docs/app/api-reference/directives/use-cache>
