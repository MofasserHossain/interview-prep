# Next.js Optimizations Interview Guide

Performance guidance covering image and font optimization, script loading,
`next/form`, lazy loading, prefetching and the client router cache, bundle size,
data-fetching waterfalls, `after()`, view transitions, Turbopack, and measuring
Core Web Vitals. Written against **Next.js 16**.

## 1. How Does `next/image` Optimize Images?

`<Image>` does several things a plain `<img>` does not.

```tsx
import Image from "next/image";
import hero from "./hero.png";

export default function Page() {
  return (
    <>
      <Image src={hero} alt="Hero" placeholder="blur" priority />
      <Image src="https://cdn.example.com/p.jpg" alt="Product" width={400} height={300} />
    </>
  );
}
```

What it handles:

| Concern | How |
| --- | --- |
| Layout shift | requires `width`/`height`, or infers them from a static import |
| Oversized files | resizes per device via `sizes` and `srcset` |
| Modern formats | serves WebP or AVIF when the browser accepts them |
| Offscreen images | lazy-loads by default |
| Perceived speed | `placeholder="blur"` while loading |

A static import is the best case — dimensions and a blur placeholder come for free:

```tsx
import hero from "./hero.png"; // width, height, blurDataURL inferred
```

Remote images need explicit dimensions and an allowlist:

```ts
// next.config.ts
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.example.com", pathname: "/**" }],
  },
};
```

Important:

`priority` disables lazy loading and raises fetch priority. Set it on the LCP
image — usually the hero — and nowhere else. Marking everything `priority`
removes the benefit entirely.

Interview trap:

`sizes` is what makes `srcset` useful. Without it the browser assumes the image is
viewport-width and downloads a needlessly large file:

```tsx
<Image src={img} alt="" fill sizes="(max-width: 768px) 100vw, 33vw" />
```

## 2. What Changed For `next/image` In Next.js 16?

Local image sources with **query strings** now require explicit configuration, to
prevent enumeration attacks:

```tsx
<Image src="/assets/photo?v=1" alt="Photo" width={100} height={100} />
```

```ts
const nextConfig: NextConfig = {
  images: {
    localPatterns: [{ pathname: "/assets/**", search: "?v=1" }],
  },
};
```

Without the `localPatterns` entry that image is rejected.

Interview note:

The general pattern across Next.js 16 is that image sources must be declared —
`remotePatterns` for external hosts, `localPatterns` for local paths with query
strings. Both exist because the image optimizer is a public endpoint that would
otherwise be usable as an open proxy.

## 3. How Does `next/font` Prevent Layout Shift?

`next/font` self-hosts fonts at build time and generates a matched fallback.

```tsx
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
```

Benefits:

- **no external request** to Google Fonts, so no extra DNS, TLS, or privacy
  exposure
- **no layout shift** — Next.js computes fallback font metrics so the substituted
  font occupies the same space
- only the subsets you ask for are downloaded

Local fonts work the same way:

```tsx
import localFont from "next/font/local";

const body = localFont({
  src: [{ path: "./Body.woff2", weight: "400", style: "normal" }],
  variable: "--font-body",
});
```

Important:

Call the font loader at **module scope**, not inside a component. It runs at build
time, and calling it per render defeats it.

Interview note:

This directly targets Cumulative Layout Shift. The classic flash-of-unstyled-text
happens because a fallback font has different metrics than the web font; matching
those metrics is what removes the shift.

## 4. How Does `next/script` Control Third-Party Scripts?

```tsx
import Script from "next/script";

<Script src="https://analytics.example.com/s.js" strategy="afterInteractive" />
<Script src="https://chat.example.com/w.js" strategy="lazyOnload" />
<Script src="https://consent.example.com/c.js" strategy="beforeInteractive" />
```

| Strategy | Loads | Use for |
| --- | --- | --- |
| `beforeInteractive` | before hydration, blocking | consent managers, bot detection |
| `afterInteractive` | after hydration (default) | analytics, tag managers |
| `lazyOnload` | during browser idle | chat widgets, social embeds |
| `worker` | in a web worker (experimental) | heavy third-party scripts |

```tsx
<Script
  src="https://example.com/s.js"
  strategy="afterInteractive"
  onLoad={() => console.log("ready")}
/>
```

When not to use it:

`beforeInteractive` blocks hydration, so it delays interactivity for every
visitor. Reserve it for scripts that legally or functionally must run first.

Interview note:

Third-party scripts are usually the largest single performance problem in a real
application, and the one the framework has least control over. `lazyOnload` for
anything non-essential is the highest-leverage change.

## 5. What Is `next/form`?

`<Form>` extends the HTML form with prefetching, client-side navigation on
submit, and progressive enhancement. It is aimed at forms that update URL search
params — search boxes and filters.

```tsx
import Form from "next/form";

export default function Search() {
  return (
    <Form action="/search">
      <input name="query" />
      <button type="submit">Search</button>
    </Form>
  );
}
```

Submitting navigates to `/search?query=...` on the client, and the loading UI for
that route is prefetched.

Benefits:

- works with JavaScript disabled, because it is a real form
- the URL carries the state, so results are shareable and bookmarkable
- less boilerplate than wiring `useRouter` to an `onSubmit`

When to use which:

| Need | Use |
| --- | --- |
| Search or filters reflected in the URL | `next/form` with a path `action` |
| A mutation that writes data | a plain `<form>` with a Server Function |

## 6. How Do You Lazy-Load A Component?

`next/dynamic` code-splits a component so its JavaScript is fetched only when
needed.

```tsx
import dynamic from "next/dynamic";

const Chart = dynamic(() => import("./chart"), {
  loading: () => <ChartSkeleton />,
});

const Editor = dynamic(() => import("./editor"), {
  ssr: false, // browser-only; skip server rendering
});
```

Good candidates:

- heavy libraries used on one route — charts, editors, map widgets
- content behind an interaction, such as a modal or a tab
- components that genuinely need `window` and cannot server-render

```tsx
// Load only when the user opens it
const [open, setOpen] = useState(false);
const Modal = dynamic(() => import("./modal"));

return (
  <>
    <button onClick={() => setOpen(true)}>Open</button>
    {open ? <Modal /> : null}
  </>
);
```

Tradeoff:

Every dynamic import is an extra network round trip at the moment of use. Splitting
a small component makes the interaction slower, not faster. Split things that are
large, not things that are merely optional.

Important:

`ssr: false` is only allowed in Client Components. In a Server Component it has no
meaning, because there is no client bundle boundary to defer.

## 7. How Does Prefetching Work?

Next.js prefetches routes for `<Link>`s as they enter the viewport, so the
navigation is already in the client cache when the user clicks.

```tsx
import Link from "next/link";

<Link href="/posts">Posts</Link>                  {/* prefetched */}
<Link href="/heavy" prefetch={false}>Heavy</Link> {/* not prefetched */}
```

```tsx
"use client";

import { useRouter } from "next/navigation";

const router = useRouter();
router.prefetch("/checkout"); // prefetch programmatically
```

Important:

Prefetching is **disabled in development**. Measuring navigation speed with
`next dev` and concluding it is slow is a common mistake — test against
`next build && next start`.

Interview note:

`connection()` blocks prefetching, because it waits for a real user request. That
is the main reason to prefer `io()` when you only need to keep a value out of the
static shell.

## 8. What Is The Client Router Cache?

After a navigation, Next.js keeps the rendered segments in memory so going back is
instant. `staleTimes` tunes how long.

```ts
const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 30,  // default 0 — not cached
      static: 180,  // default 300 (5 minutes)
    },
  },
};
```

- `dynamic` applies when a page is neither statically generated nor fully
  prefetched
- `static` applies to statically generated pages, `prefetch={true}` links, and
  `router.prefetch`

Important:

Shared layouts are **not** refetched on every navigation — only the segment that
changes. This is partial rendering, and it is why a sidebar keeps its scroll
position across route changes.

Interview trap:

A stale client cache is a frequent "my data does not update" bug. After a mutation,
`router.refresh()` re-fetches server data for the current route while preserving
client state.

## 9. What Are `instant` And `useLinkStatus`?

`instant` is a route segment config that tells Next.js what kind of navigation to
expect into a segment, and surfaces anything that would block an instant UI.

```tsx
// app/dashboard/layout.tsx
export const instant = true;
```

Next.js then flags code that would prevent the UI updating immediately on
navigation — client-side data fetching, or a partially prerendered result that
still blocks.

`useLinkStatus` tracks the pending state of a specific `<Link>`:

```tsx
"use client";

import { useLinkStatus } from "next/link";

function Spinner() {
  const { pending } = useLinkStatus();
  return pending ? <span className="shimmer" /> : null;
}

<Link href="/slow">
  Slow page <Spinner />
</Link>
```

When to use it:

Only when prefetching is disabled or still in flight, **and** the destination has
no `loading.tsx`. Prefer a route-level `loading.tsx` and prefetching, which make
the navigation instant rather than merely explaining the wait.

## 10. How Do You Avoid A Data-Fetching Waterfall?

Sequential awaits block each other:

```tsx
// Bad example: three round trips in series
const user = await getUser(id);
const posts = await getPosts(id);
const stats = await getStats(id);
```

```tsx
// Better: one round trip's worth of latency
const [user, posts, stats] = await Promise.all([
  getUser(id),
  getPosts(id),
  getStats(id),
]);
```

Sequential is only necessary when a request genuinely depends on a previous result:

```tsx
const user = await getUser(id);
const orders = await getOrders(user.accountId); // genuinely dependent
```

A component-level waterfall is subtler — a nested Server Component that fetches
does not start until its parent finishes rendering. Two fixes:

```tsx
// 1. Separate Suspense boundaries — they fetch in parallel
<Suspense fallback={<A />}><SlowA /></Suspense>
<Suspense fallback={<B />}><SlowB /></Suspense>
```

```tsx
// 2. Preload — start the request before awaiting it
function preload(id: string) {
  void getUser(id); // fire, do not await
}

export default async function Page({ params }) {
  const { id } = await params;
  preload(id);              // starts now
  const other = await getOther();
  const user = await getUser(id); // already in flight, deduped by cache()
  return <Profile user={user} other={other} />;
}
```

## 11. How Does React `cache()` Deduplicate?

`cache()` memoises a function for the duration of one render pass.

```ts
import { cache } from "react";

export const getUser = cache(async (id: string) => {
  return db.user.findUnique({ where: { id } });
});
```

Three components calling `getUser("1")` in one render hit the database once.

```tsx
// layout.tsx, page.tsx, and generateMetadata all call getUser("1")
// -> one query
```

Important:

`cache()` does **not** persist between requests. It is request-scoped
deduplication, not caching. Persisting across requests is `use cache` on Cache
Components, or `unstable_cache` on the classic model.

Interview note:

The canonical use is `generateMetadata` and the page needing the same data. Wrap
the fetch in `cache()` and it runs once instead of twice.

## 12. What Is `after()`?

`after()` schedules work to run once the response has been sent, so it does not
delay the user.

```ts
import { after } from "next/server";

export async function POST(request: Request) {
  const data = await request.json();
  const result = await save(data);

  after(async () => {
    await logAnalytics({ event: "saved", id: result.id });
    await sendWebhook(result);
  });

  return Response.json(result); // returns immediately
}
```

Available in Server Components, `generateMetadata`, Server Functions, Route
Handlers, and Proxy.

Use cases:

- analytics and logging
- cache warming
- sending a notification after a mutation

Tradeoff:

Work in `after()` is best-effort. On a serverless platform the function may be
frozen after the response, so anything that must not be lost belongs in a queue,
not in `after()`.

## 13. How Do You Reduce Bundle Size?

**Measure first:**

```bash
npm install --save-dev @next/bundle-analyzer
ANALYZE=true npm run build
```

**Optimize barrel imports.** A package with an index re-exporting hundreds of
modules can pull all of them in:

```ts
const nextConfig: NextConfig = {
  optimizePackageImports: ["lucide-react", "date-fns", "lodash-es"],
};
```

Next.js transforms `import { X } from "pkg"` into a direct module import, so only
`X` is bundled. Several popular packages are optimized by default.

**Keep server-only dependencies off the client:**

```ts
const nextConfig: NextConfig = {
  serverExternalPackages: ["pino", "sharp"],
};
```

**Transpile packages that ship untranspiled code:**

```ts
const nextConfig: NextConfig = {
  transpilePackages: ["@acme/ui"],
};
```

**Move work to Server Components.** A Markdown parser or a syntax highlighter used
only for rendering never needs to reach the browser — that is the single largest
bundle win the App Router offers.

## 14. How Do You Keep Server-Only Code Out Of The Client Bundle?

The `server-only` package turns an accidental import into a build error:

```ts
// lib/data.ts
import "server-only";

export async function getSecretData() {
  return db.query("SELECT * FROM secrets");
}
```

Importing that file from a Client Component now fails the build instead of leaking
the code.

The mirror image exists too:

```ts
import "client-only"; // errors if imported into a Server Component
```

Why it matters:

A module shared between server and client components is easy to import from the
wrong side. Without the guard, server logic — and anything it closes over —
silently ships to the browser.

Important:

Environment variables without the `NEXT_PUBLIC_` prefix are already stripped from
the client bundle. `server-only` protects the **code**, not just the values.

The experimental `taint` config goes further, letting React reject specific
objects or values passed across the boundary:

```ts
const nextConfig: NextConfig = {
  experimental: { taint: true },
};
```

Enabling it also taints `process.env`, so it cannot be passed whole to a Client
Component.

## 15. How Do You Wrap A Third-Party Component That Needs The Client?

A package using `useState` without a `"use client"` directive errors inside a
Server Component. Wrap it once in your own Client Component:

```tsx
// app/carousel.tsx
"use client";

export { Carousel as default } from "acme-carousel";
```

```tsx
// app/page.tsx — a Server Component
import Carousel from "./carousel";

export default function Page() {
  return <Carousel />;
}
```

Interview note:

If you publish a component library, add `"use client"` to entry points relying on
client-only features so consumers do not need wrappers. Some bundlers strip the
directive, so it needs explicit build configuration to survive.

## 16. What Are View Transitions?

View Transitions animate between routes using the browser's View Transition API.

```ts
const nextConfig: NextConfig = {
  experimental: { viewTransition: true },
};
```

They give native-feeling transitions without a JavaScript animation library, and
degrade gracefully in browsers that do not support the API.

Tradeoff:

Still experimental, and support varies by browser. Treat it as an enhancement, and
make sure the experience is correct without it.

## 17. What Is Turbopack, And What Changed In Next.js 16?

Turbopack is the Rust-based bundler, and in Next.js 16 it is the **default** for
both `next dev` and `next build`.

```bash
next dev    # Turbopack
next build  # Turbopack
```

Related options:

| Option | Purpose |
| --- | --- |
| `turbopackFileSystemCache` | persists compiler artifacts between runs |
| `turbopackMemoryEviction` | bounds memory during long dev sessions |
| `turbopack` | custom loaders and resolve aliases |

Important:

A project with a custom `webpack` config in `next.config.ts` needs that
configuration ported. Webpack-specific loaders do not transfer automatically.

Next.js 16 also allows `dev` and `build` to run concurrently, which previously
conflicted over the `.next` directory.

## 18. How Do You Measure Core Web Vitals In Next.js?

```tsx
"use client";

import { useReportWebVitals } from "next/web-vitals";

export function WebVitals() {
  useReportWebVitals((metric) => {
    // metric.name: LCP | CLS | INP | FCP | TTFB
    navigator.sendBeacon("/api/vitals", JSON.stringify(metric));
  });

  return null;
}
```

Attribution tells you *what* caused a poor score, not just the number:

```ts
const nextConfig: NextConfig = {
  experimental: {
    webVitalsAttribution: ["CLS", "LCP"],
  },
};
```

Which Next.js feature helps which metric:

| Metric | Lever |
| --- | --- |
| LCP | `priority` on the hero image, static shell via PPR, caching |
| CLS | `next/font`, explicit image dimensions, sized Suspense fallbacks |
| INP | smaller client bundles, `lazyOnload` scripts, Server Components |
| TTFB | caching, `use cache`, CDN, avoiding needless dynamic rendering |

Interview note:

Lab numbers from `next dev` are meaningless — no minification, no prefetching, and
extra dev-only work. Always measure a production build, and prefer field data over
lab data.

## 19. What Is On The Production Checklist?

Things worth naming in an interview:

- run `next build` and read the route table — is anything `ƒ` that should be `○`?
- images through `next/image` with `priority` on the LCP image only
- fonts through `next/font`
- third-party scripts on `lazyOnload` unless they must run earlier
- `Promise.all` for independent fetches; check for component waterfalls
- bundle analyzer run at least once; `optimizePackageImports` for barrel packages
- `server-only` on modules touching secrets
- caching strategy stated per route rather than inherited by accident
- a shared cache handler if self-hosting more than one instance
- error boundaries and `not-found` at meaningful segments
- Core Web Vitals reported from the field, not just measured locally

Strong answer:

> I start from the build output, because it tells me what is actually static. Then
> I look at the client bundle, since Server Components mean most code should never
> reach the browser. Images, fonts, and third-party scripts are usually the
> remaining wins, in that order.

## 20. Which Optimizations Are Not Worth Doing Early?

**Splitting every component with `next/dynamic`.** Each split is a round trip.
Split large things, not optional ones.

**Caching everything aggressively.** A wrong cached value costs more than a slow
correct one. Set `cacheLife` from how stale the data may actually be.

**`priority` on many images.** It only helps the one image that is the LCP
element; beyond that it competes for bandwidth.

**Preloading many resources.** Preload competes for bandwidth, so a long list
delays the very resources that matter.

**Micro-optimising server render time before measuring TTFB.** The bottleneck is
usually an uncached query or an accidental dynamic route, not rendering.

**Adopting experimental flags in production.** `staleTimes`, `taint`, and view
transitions are experimental, and experimental APIs change between minor versions.

Interview answer:

> I optimise from measurement rather than instinct. The build output tells me the
> rendering mode, the analyzer tells me the bundle, and field vitals tell me what
> users experience. Most premature optimisation in Next.js comes from caching
> things that should not be cached and splitting things too small to matter.

## Sources Used

- <https://nextjs.org/docs/app/api-reference/components/image>
- <https://nextjs.org/docs/app/api-reference/components/font>
- <https://nextjs.org/docs/app/api-reference/components/script>
- <https://nextjs.org/docs/app/api-reference/components/form>
- <https://nextjs.org/docs/app/guides/lazy-loading>
- <https://nextjs.org/docs/app/guides/prefetching>
- <https://nextjs.org/docs/app/guides/package-bundling>
- <https://nextjs.org/docs/app/api-reference/functions/after>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes>
- <https://nextjs.org/docs/app/guides/production-checklist>
