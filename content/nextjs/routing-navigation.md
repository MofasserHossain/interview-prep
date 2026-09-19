# Next.js Routing And Navigation Interview Guide

Routing guidance covering file-system routes, dynamic and catch-all segments,
root parameters, nested layouts and templates, route groups, parallel and
intercepting routes, client-side navigation, redirects, the navigation hooks,
typed routes, internationalization, and multi-zones. Written against
**Next.js 16**.

## 1. How Does File-System Routing Work In The App Router?

Folders create URL segments. A folder becomes publicly routable only when it
contains a `page.tsx` or a `route.ts`.

```txt
app/
├── layout.tsx              required root layout
├── page.tsx                /
├── about/page.tsx          /about
├── blog/
│   ├── page.tsx            /blog
│   └── [slug]/page.tsx     /blog/:slug
├── components/             NOT routable - no page.tsx
└── api/posts/route.ts      /api/posts
```

The reserved filenames and what each one does:

| File | Purpose |
| --- | --- |
| `page.tsx` | the route's UI; makes the segment routable |
| `layout.tsx` | shared shell that wraps children and **preserves state** |
| `template.tsx` | like a layout, but **remounts** on navigation |
| `loading.tsx` | Suspense fallback for the segment |
| `error.tsx` | error boundary; must be a Client Component |
| `not-found.tsx` | UI for `notFound()` |
| `route.ts` | an API endpoint instead of a page |
| `default.tsx` | fallback for an unmatched parallel route slot |

Benefits:

Colocation. Because a folder without `page.tsx` is not routable, components,
tests, and helpers can live beside the route that uses them rather than in a
distant `components/` tree.

Important:

`route.ts` and `page.tsx` cannot coexist in the same folder — both claim the
segment.

## 2. What Are The Dynamic Segment Conventions?

Three bracket forms, each matching a different shape of URL.

| Convention | Folder | Matches | `params` |
| --- | --- | --- | --- |
| Dynamic | `[slug]` | `/blog/a` | `{ slug: 'a' }` |
| Catch-all | `[...slug]` | `/shop/a/b/c` | `{ slug: ['a','b','c'] }` |
| Optional catch-all | `[[...slug]]` | `/shop` **and** `/shop/a/b` | `{}` or `{ slug: ['a','b'] }` |

```tsx
// app/blog/[slug]/page.tsx
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <div>Post: {slug}</div>;
}
```

```tsx
// app/shop/[...categories]/page.tsx
export default async function Page({
  params,
}: {
  params: Promise<{ categories: string[] }>;
}) {
  const { categories } = await params;
  return <Breadcrumbs path={categories} />;
}
```

The difference between the two catch-alls is whether the **parent route itself**
matches. `[...slug]` does not match `/shop`; `[[...slug]]` does.

`params` is passed to `layout`, `page`, `route`, and `generateMetadata`.

Important:

`params` is a **Promise** in Next.js 15 and later and must be awaited. Code
written for Next.js 13 or 14 destructures it directly and silently produces
`undefined`.

## 3. What Are Root Parameters And `next/root-params`?

A dynamic segment that appears **before the root layout** is a root parameter.
Next.js 16 lets you read it from any Server Component without prop drilling.

```txt
app/
└── [lang]/
    ├── layout.tsx     the root layout
    └── page.tsx
```

`next/root-params` exports one async getter **per root segment**, named after the
folder:

```tsx
import { lang } from "next/root-params";

export default async function Nav() {
  const locale = await lang(); // "en", "bn", ...
  return <LanguageSwitcher current={locale} />;
}
```

Why it matters:

A locale or tenant segment is needed in layouts, deeply nested components, and
shared utilities. Without this you thread `params` through every intermediate
component, or duplicate a `params` prop on every layout.

Important:

It works in **Server Components** only, and the export name comes from the folder
name — `app/[locale]` exports `locale`, `app/[tenant]` exports `tenant`.

## 4. How Do Layouts Nest, And How Is A Layout Different From A Template?

Layouts nest, and a layout **preserves state** across navigations within its
subtree.

```txt
app/layout.tsx              wraps everything
└── app/dashboard/layout.tsx    wraps /dashboard/*
    └── app/dashboard/settings/page.tsx
```

```viz
type: stack
title: What renders for /dashboard/settings
settings/page.tsx :: the leaf, replaced on navigation
dashboard/layout.tsx :: persists across /dashboard/* routes
app/layout.tsx :: the root layout, never unmounts
```

```tsx
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard">
      <Sidebar />
      {children}
    </div>
  );
}
```

Navigating from `/dashboard/a` to `/dashboard/b` re-renders only the page. The
sidebar keeps its scroll position and any client state, because the layout does
not unmount.

`template.tsx` is the opposite — a new instance mounts on every navigation:

| | `layout.tsx` | `template.tsx` |
| --- | --- | --- |
| On navigation | persists | **remounts** |
| Client state | preserved | reset |
| `useEffect` | runs once | runs per navigation |

When to use a template:

An enter animation that should replay per route, or a per-route effect such as
logging a page view that must fire on every navigation.

Important:

The root layout is required, must render `<html>` and `<body>`, and cannot be a
Client Component.

## 5. What Are Route Groups?

A folder wrapped in parentheses organises files **without** adding a URL segment.

```txt
app/
├── (marketing)/
│   ├── layout.tsx       marketing shell
│   ├── page.tsx         /
│   └── about/page.tsx   /about
└── (shop)/
    ├── layout.tsx       a different shell
    └── cart/page.tsx    /cart
```

Neither `(marketing)` nor `(shop)` appears in the URL.

Use cases:

- two different top-level layouts in one application
- grouping routes by team or feature without changing URLs
- opting a subtree into a layout that siblings do not get

Interview trap:

Two route groups cannot both define a route that resolves to the same URL —
`(a)/about/page.tsx` and `(b)/about/page.tsx` both claim `/about` and the build
fails. Route groups organise files; they do not namespace URLs.

## 6. What Are Parallel Routes?

Parallel routes render several independent subtrees in one layout, using `@slot`
folders. Each slot is passed to the layout as a prop named after the folder.

```txt
app/
├── layout.tsx
├── page.tsx           -> children
├── @team/page.tsx     -> team
└── @analytics/page.tsx -> analytics
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
      <div className="grid">
        {team}
        {analytics}
      </div>
    </>
  );
}
```

Benefits:

Each slot streams and errors **independently**, so a failing analytics widget
shows its own error boundary rather than taking down the dashboard. Each slot can
have its own `loading.tsx` and `error.tsx`.

Use cases:

- dashboards composed of independent panels
- conditional routes — render an admin slot or a user slot from the same URL
- modals with real URLs, combined with intercepting routes

Important:

A slot folder is **not** a route segment. `@team` does not appear in the URL and
does not count when calculating intercepting-route levels.

## 7. Why Does `default.js` Matter?

`default.tsx` renders a fallback for a parallel route slot when Next.js cannot
recover the slot's active state.

On a **soft navigation** — an in-app `<Link>` click — Next.js tracks which subpage
each slot is showing. On a **hard navigation** — a refresh or a pasted URL — that
state is gone.

```txt
app/
├── @team/
│   ├── settings/page.tsx
│   └── default.tsx        <- required
└── @analytics/
    └── default.tsx        <- required
```

Navigating to `/settings` renders `@team/settings` while `@analytics` keeps its
current page. On **refresh**, Next.js has no active state for `@analytics`, so it
renders `@analytics/default.tsx`.

Important:

In Next.js 16, if `default.tsx` does not exist for a named slot, an **error is
returned** and you must add one. To restore the older 404 behaviour, make the
default call `notFound()`:

```tsx
// app/@team/default.tsx
import { notFound } from "next/navigation";

export default function Default() {
  notFound();
}
```

Interview note:

This is the single most common parallel-routes bug — it works while clicking
around and breaks the moment someone refreshes.

## 8. What Are Intercepting Routes?

Intercepting routes show a route **in the current layout** instead of navigating
to it, while a direct visit still renders the full page.

The matchers work on **route segments**, like relative paths:

| Matcher | Matches |
| --- | --- |
| `(.)` | the **same** level |
| `(..)` | **one** level above |
| `(..)(..)` | **two** levels above |
| `(...)` | from the **root** `app` directory |

```txt
app/
├── feed/page.tsx
├── photo/[id]/page.tsx          full page, direct visit
└── @modal/
    └── (..)photo/[id]/page.tsx  intercepts from /feed
```

Clicking a photo in the feed opens a modal at `/photo/123`; pasting that URL loads
the full page. The URL is shareable either way.

Interview trap:

The matcher counts **route segments, not folders**. `@modal` is a slot, not a
segment, so a file at `app/@modal/(..)photo/[id]/page.tsx` is only one segment
above `photo` despite being two folders deep. Counting folders is the usual reason
an interception silently does not fire.

Use cases:

Photo lightboxes, login dialogs that are also real pages, and previews — anywhere
the content needs its own URL but should not lose the page behind it.

## 9. How Does Client-Side Navigation Work?

`<Link>` renders an `<a>` and upgrades the navigation to a client-side transition.

```viz
type: flow
title: What happens on a Link click
Link enters the viewport :: Next.js prefetches the route in the background
User clicks :: no full page load; the browser does not reload
Shared layouts are reused :: only the changed segment re-renders
New segment renders :: from prefetched payload, or streamed if not ready
URL updates :: history.pushState, scroll resets to the top
```

```tsx
import Link from "next/link";

<Link href="/posts">Posts</Link>
<Link href={`/posts/${id}`}>Details</Link>
```

Partial rendering is the important part: navigating between two routes that share
a layout re-renders **only the segment that changed**. The shared layout is not
refetched, which is why sidebar state survives.

Programmatic navigation:

```tsx
"use client";

import { useRouter } from "next/navigation";

const router = useRouter();

router.push("/posts");      // navigate, add a history entry
router.replace("/posts");   // navigate, replace the entry
router.back();              // history back
router.refresh();           // re-fetch server data, keep client state
```

Important:

`useRouter` comes from **`next/navigation`** in the App Router. Importing it from
`next/router` is the Pages Router version and throws.

## 10. `redirect()` vs `permanentRedirect()` vs Config Redirects vs Proxy

Four ways to redirect, for four different situations.

```tsx
import { redirect, permanentRedirect } from "next/navigation";

// in a Server Component, Server Function, or Route Handler
if (!session) {
  redirect("/login"); // 307 temporary
}

if (movedPermanently) {
  permanentRedirect("/new-home"); // 308 permanent
}
```

```ts
// next.config.ts — static, known at build time
const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/old-blog/:slug", destination: "/blog/:slug", permanent: true }];
  },
};
```

```ts
// proxy.ts — needs request data
export function proxy(request: NextRequest) {
  if (!request.cookies.get("session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
```

| Approach | Use when |
| --- | --- |
| `redirect()` | the decision needs data you already fetched |
| `permanentRedirect()` | the URL has permanently moved; tells search engines |
| `next.config` redirects | a static list of URL mappings |
| Proxy | the decision needs the request, before rendering |

Important:

`redirect()` works by **throwing** a special error that Next.js catches. Calling it
inside a `try`/`catch` swallows it and the redirect never happens:

```ts
// Bad example: the catch swallows the redirect
try {
  redirect("/login");
} catch (error) {
  console.error(error); // catches Next's internal redirect signal
}
```

Call it outside the `try`, or rethrow with `unstable_rethrow`.

## 11. How Do You Read The Current Route In A Client Component?

| Hook | Returns |
| --- | --- |
| `usePathname()` | the current path string |
| `useParams()` | dynamic segment values |
| `useSearchParams()` | a read-only `URLSearchParams` |
| `useSelectedLayoutSegment()` | the active child segment of this layout |
| `useSelectedLayoutSegments()` | all active segments below this layout |

```tsx
"use client";

import { usePathname, useSearchParams } from "next/navigation";

export function Breadcrumb() {
  const pathname = usePathname();        // "/blog/hello"
  const searchParams = useSearchParams(); // ?page=2
  const page = searchParams.get("page");

  return <nav>{pathname} — page {page}</nav>;
}
```

`useSelectedLayoutSegment` is how a nav highlights the active tab from inside a
layout:

```tsx
"use client";

import { useSelectedLayoutSegment } from "next/navigation";

export function Tabs() {
  const segment = useSelectedLayoutSegment(); // "settings" on /dashboard/settings
  return <Tab active={segment === "settings"} />;
}
```

## 12. Why Does `useSearchParams` Need A Suspense Boundary?

Because search params are only known at request time. On a prerendered route,
calling `useSearchParams` forces the Client Component tree **up to the nearest
Suspense boundary** to be client-side rendered.

```tsx
// Bad example: the production build fails
"use client";

import { useSearchParams } from "next/navigation";

export default function Page() {
  const searchParams = useSearchParams();
  return <Results query={searchParams.get("q")} />;
}
```

```txt
Error: Missing Suspense boundary with useSearchParams
```

Fix — wrap the consumer so everything above it can still prerender:

```tsx
import { Suspense } from "react";

export default function Page() {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <SearchResults />
    </Suspense>
  );
}
```

```tsx
"use client";

import { useSearchParams } from "next/navigation";

function SearchResults() {
  const searchParams = useSearchParams();
  return <Results query={searchParams.get("q")} />;
}
```

The rule:

Put the boundary as low as possible. Everything above it keeps prerendering and
ships in the initial HTML; only the part that genuinely needs the URL is
client-rendered.

Interview note:

In a Server Component, use the `searchParams` **prop** instead — it is one of the
four Request-time APIs and needs no hook.

## 13. What Are Typed Routes?

`typedRoutes` generates TypeScript types from your actual route files, so a typo
in an `href` is a compile error. It is **stable** in Next.js 16 — no longer under
`experimental`.

```ts
const nextConfig: NextConfig = {
  typedRoutes: true,
};
```

```tsx
<Link href="/blog/hello">Post</Link>   // ok
<Link href="/blogg/hello">Post</Link>  // type error
```

Next.js 16 also ships route prop helpers, so page props no longer need hand-written
types:

```tsx
export default async function Page({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params; // typed as string
}
```

Benefits:

Renaming a folder surfaces every broken link at build time rather than as a 404 in
production.

## 14. How Do You Handle Internationalized Routing?

The usual shape is a root dynamic segment for the locale.

```txt
app/
└── [lang]/
    ├── layout.tsx
    ├── page.tsx         /en, /bn
    └── about/page.tsx   /en/about, /bn/about
```

```tsx
export async function generateStaticParams() {
  return [{ lang: "en" }, { lang: "bn" }];
}

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  );
}
```

Detect and redirect in Proxy:

```ts
// proxy.ts
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (/^\/(en|bn)(\/|$)/.test(pathname)) {
    return;
  }

  const locale = request.headers.get("accept-language")?.startsWith("bn") ? "bn" : "en";
  return NextResponse.redirect(new URL(`/${locale}${pathname}`, request.url));
}
```

Deep components read the locale without prop drilling:

```tsx
import { lang } from "next/root-params";

const locale = await lang();
```

Tradeoff:

A locale segment multiplies the number of prerendered pages by the number of
locales. With many locales, prerender the common ones and let the rest render on
demand.

## 15. What Are Multi-Zones?

Multi-zones split one domain across **several independent Next.js applications**,
each owning a path prefix.

```ts
// the main app proxies /blog to a separate deployment
const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/blog", destination: `${process.env.BLOG_URL}/blog` },
      { source: "/blog/:path*", destination: `${process.env.BLOG_URL}/blog/:path*` },
    ];
  },
};
```

Each zone sets `basePath` so its assets resolve correctly:

```ts
const nextConfig: NextConfig = {
  basePath: "/blog",
};
```

Benefits:

Independent deploys and independent build times. A large marketing site and a
complex dashboard can ship on their own schedules under one domain.

Tradeoff:

Navigating **between** zones is a full page load, not a client-side transition —
they are separate applications. Shared UI must be duplicated or published as a
package.

When not to use it:

For code organisation. Route groups handle that with none of the operational
cost. Multi-zones are for separate teams and separate deploy pipelines.

## 16. How Do You Preserve UI State Across Navigation?

Layouts already preserve state for anything inside them. Beyond that:

```tsx
// URL as the source of truth - survives refresh and is shareable
const searchParams = useSearchParams();
const tab = searchParams.get("tab") ?? "overview";
```

For state that must survive a route change but does not belong in the URL, lift it
into a layout — layouts do not unmount:

```tsx
// app/dashboard/layout.tsx
"use client";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState(defaultFilters);
  return <FilterContext value={{ filters, setFilters }}>{children}</FilterContext>;
}
```

Important:

`router.refresh()` re-fetches server data while **preserving** client state, which
is the correct call after a mutation. A full `window.location.reload()` throws
everything away.

## 17. Where Does `loading.tsx` Apply?

`loading.tsx` wraps its segment — and everything below it — in a Suspense boundary
automatically.

```txt
app/
├── loading.tsx              covers every route
└── dashboard/
    ├── loading.tsx          covers /dashboard and below
    └── settings/page.tsx
```

The nearest `loading.tsx` above a navigating segment provides the fallback.

Important:

`loading.tsx` also makes a navigation feel instant. Without it, clicking a link to
a slow dynamic route leaves the user on the old page with no feedback until the
server responds.

Interview note:

This is what `useLinkStatus` exists to patch — but adding `loading.tsx` is the
better fix, because it shows the new route's shell immediately instead of just
indicating that something is happening.

## 18. How Do You Build A Modal With A Shareable URL?

Combine a parallel route with an intercepting route.

```txt
app/
├── layout.tsx              renders {children} and {modal}
├── @modal/
│   ├── default.tsx         renders null when no modal is open
│   └── (.)photo/[id]/page.tsx
├── photo/[id]/page.tsx     the full page
└── page.tsx
```

```tsx
// app/@modal/default.tsx
export default function Default() {
  return null;
}
```

```tsx
// app/@modal/(.)photo/[id]/page.tsx
import { Modal } from "@/components/modal";

export default async function PhotoModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Modal>
      <Photo id={id} />
    </Modal>
  );
}
```

Behaviour:

- clicking a photo in-app intercepts and opens the modal, feed still behind it
- pasting `/photo/123` renders the full page
- browser back closes the modal, because it is a real history entry

The `default.tsx` returning `null` is what stops the modal slot erroring on a hard
navigation.

## 19. How Does Routing Differ From The Pages Router?

| | Pages Router | App Router |
| --- | --- | --- |
| Directory | `pages/` | `app/` |
| Route file | any file is a route | only `page.tsx` / `route.ts` |
| Dynamic segment | `[slug].tsx` | `[slug]/page.tsx` |
| Layouts | `_app.tsx`, manual | nested `layout.tsx` |
| Navigation hook | `next/router` | `next/navigation` |
| `router.query` | params **and** search | split into `useParams` / `useSearchParams` |
| API routes | `pages/api/*` | `route.ts` anywhere |
| Nested layouts | no | yes |
| Streaming | no | yes |

Interview note:

The two routers can coexist during a migration. `app/` takes precedence when both
define the same route, which is how incremental migration works.

## 20. What Are The Common Routing Gotchas?

**Missing `default.tsx`** for a parallel slot — works when clicking, errors on
refresh.

**Counting folders instead of segments** in intercepting routes — `@modal` is not
a segment.

**`useSearchParams` without Suspense** — the production build fails even though
`next dev` is fine.

**`next/router` instead of `next/navigation`** — throws in the App Router.

**`redirect()` inside `try`/`catch`** — the catch swallows the internal signal.

**Forgetting `params` is a Promise** — silent `undefined` rather than an error.

**Two route groups claiming the same URL** — groups organise files, not URLs.

**Expecting prefetching in development** — it is disabled in `next dev`; measure
against a production build.

**A layout that should have been a template** — an effect meant to run per
navigation runs only once, because layouts do not remount.

Strong answer:

> Most App Router routing bugs come from the difference between soft and hard
> navigation. Parallel routes need `default.tsx` because hard navigation cannot
> recover slot state, and `useSearchParams` needs Suspense because the prerender
> has no URL. Both work fine while clicking around and break on refresh, which is
> why I test routing with a reload rather than only with links.

## Sources Used

- <https://nextjs.org/docs/app/getting-started/layouts-and-pages>
- <https://nextjs.org/docs/app/getting-started/linking-and-navigating>
- <https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes>
- <https://nextjs.org/docs/app/api-reference/file-conventions/route-groups>
- <https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes>
- <https://nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes>
- <https://nextjs.org/docs/app/api-reference/file-conventions/default>
- <https://nextjs.org/docs/app/api-reference/functions/next-root-params>
- <https://nextjs.org/docs/app/api-reference/functions/use-search-params>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/typedRoutes>
- <https://nextjs.org/docs/app/guides/multi-zones>
