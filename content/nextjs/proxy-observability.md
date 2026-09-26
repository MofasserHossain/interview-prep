# Next.js Proxy And Observability Interview Guide

Guidance covering Proxy (formerly Middleware), matchers and execution order,
cookies and header rewriting, rewrites versus redirects, `instrumentation.ts`,
`onRequestError`, client instrumentation, OpenTelemetry, Web Vitals reporting,
logging, and debugging. Written against **Next.js 16**.

## 1. What Is Proxy, And What Happened To Middleware?

**Starting with Next.js 16, Middleware is renamed Proxy.** The functionality is
unchanged; the name better describes what it is for.

The file is `proxy.ts` at the project root, beside `app/` or inside `src/`:

```ts
// proxy.ts
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("x-request-id", crypto.randomUUID());
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

Only **one** `proxy.ts` is supported per project. Split the logic into modules and
import them if it grows.

Interview note:

Naming this correctly signals current knowledge. An answer describing
`middleware.ts` describes Next.js 15 and earlier.

## 2. What Should Proxy Be Used For, And What Should It Not?

Good uses:

- rewriting for A/B tests or experiments
- setting headers across many routes
- programmatic redirects based on request properties
- geolocation or locale detection
- generating a CSP nonce per request

```ts
export function proxy(request: NextRequest) {
  if (!request.cookies.get("session") && request.nextUrl.pathname.startsWith("/app")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
```

What it is **not** for:

- **slow data fetching** — it runs on every matched request and adds latency
- **full session management or authorisation** — it is suited to optimistic checks
  such as "does a session cookie exist", not to validating one

Important:

`fetch` options `cache`, `next.revalidate`, and `next.tags` have **no effect**
inside Proxy. It is not a data-fetching layer, and treating it as one silently
produces uncached requests on every page view.

The rule:

Optimistic check in Proxy, authoritative check next to the data.

## 3. How Does The Matcher Work, And Why Is It Essential?

**Without a `matcher`, Proxy runs on every request** — including `_next/static`,
`_next/image`, and everything in `public/`.

```ts
export const config = {
  matcher: ["/about/:path*", "/dashboard/:path*"],
};
```

Negative matching excludes the paths you almost never want to touch:

```ts
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)",
  ],
};
```

Why it matters:

Auth logic without a matcher redirects requests for CSS, JavaScript, and images.
The symptom is a login page that renders completely unstyled, or an infinite
redirect loop as the browser retries assets.

Interview trap:

The matcher must be **statically analysable** — it is read at build time. Building
it from a variable or a function call does not work.

```ts
// Bad: not statically analysable
export const config = { matcher: getRoutes() };

// Good: a literal
export const config = { matcher: ["/dashboard/:path*"] };
```

## 4. What Is The Execution Order Of Redirects, Rewrites, And Proxy?

Proxy sits third in a fixed chain:

```viz
type: queues
title: Request handling order
headers :: from next.config.js
redirects :: from next.config.js
Proxy :: proxy.ts - rewrites, redirects, headers
beforeFiles rewrites :: from next.config.js
Filesystem routes :: public/, _next/static/, app/, pages/
afterFiles rewrites :: from next.config.js
Dynamic routes :: /blog/[slug]
fallback rewrites :: from next.config.js
```

Consequences worth naming:

- a `redirects()` entry in `next.config.ts` fires **before** Proxy ever runs
- `beforeFiles` rewrites happen after Proxy but before the filesystem, so they can
  intercept a real file
- `afterFiles` rewrites only apply when no file matched, which is the usual choice
  for proxying to a legacy backend

## 5. Why Do Server Functions Not Get Reliable Proxy Coverage?

Because **Server Functions are not separate routes**. They are handled as POST
requests to the route where they are used.

That has a sharp consequence: a matcher that excludes a path also skips Server
Function calls on that path.

```ts
export const config = {
  matcher: ["/dashboard/:path*"], // /settings actions get NO proxy coverage
};
```

And it gets worse over time — a matcher change, or a refactor that moves a Server
Function to a different route, **silently removes** whatever protection Proxy was
providing. Nothing errors.

The rule:

Always verify authentication and authorisation **inside each Server Function**
rather than relying on Proxy. Proxy is a convenience layer, not a boundary.

Interview note:

This is the clearest concrete argument for the "check next to the data" principle.
The coverage gap is invisible in code review, because the matcher and the action
live in different files.

## 6. How Do You Read And Write Cookies In Proxy?

`NextRequest` and `NextResponse` both expose a cookies API.

```ts
export function proxy(request: NextRequest) {
  // read
  const theme = request.cookies.get("theme")?.value;
  const all = request.cookies.getAll();
  const hasSession = request.cookies.has("session");

  const response = NextResponse.next();

  // write
  response.cookies.set("visited", "true", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
  });

  response.cookies.delete("stale-flag");

  return response;
}
```

Important:

Cookies set on the **response** are what reach the browser. Setting a cookie on
the request object only affects what downstream rendering sees in this request —
it is not sent to the client.

## 7. How Do You Pass Data From Proxy To The App?

Rewrite the **request** headers and read them in a Server Component.

```ts
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-request-id", crypto.randomUUID());
  headers.set("x-pathname", request.nextUrl.pathname);

  return NextResponse.next({ request: { headers } });
}
```

```tsx
import { headers } from "next/headers";

export default async function Page() {
  const requestId = (await headers()).get("x-request-id");
  return <Footer requestId={requestId} />;
}
```

This is the canonical way to make the current pathname available to a Server
Component, which otherwise has no access to it.

Tradeoff:

Reading `headers()` is a Request-time API, so it opts that component into dynamic
rendering. Read it inside a `<Suspense>`-wrapped child so the rest of the page can
still prerender.

## 8. Rewrites vs Redirects

```ts
// Redirect: the browser navigates, the URL changes
return NextResponse.redirect(new URL("/login", request.url));

// Rewrite: the URL stays, different content is served
return NextResponse.rewrite(new URL("/experiment-b", request.url));
```

| | Redirect | Rewrite |
| --- | --- | --- |
| URL in the address bar | changes | **unchanged** |
| Status code | 307 / 308 | 200 |
| Extra round trip | yes | no |
| Visible to the user | yes | no |

A/B testing is the classic rewrite use:

```ts
export function proxy(request: NextRequest) {
  const bucket = request.cookies.get("bucket")?.value ?? (Math.random() < 0.5 ? "a" : "b");

  const response = NextResponse.rewrite(
    new URL(`/home-${bucket}`, request.url),
  );

  response.cookies.set("bucket", bucket, { maxAge: 60 * 60 * 24 * 30 });
  return response;
}
```

The user stays on `/` while seeing one of two implementations, and the cookie keeps
them in the same bucket.

Important:

Prefer `redirects()` in `next.config.ts` for a **static** list of URL mappings. It
runs earlier, needs no Proxy invocation, and is easier to audit.

## 9. What Runtime Does Proxy Use?

Proxy defaults to the **Node.js runtime** in Next.js 16.

The `runtime` route segment config is **not available** in Proxy files — setting
it throws an error.

```ts
// Error: cannot set runtime in proxy.ts
export const runtime = "edge";
```

Interview note:

Earlier versions ran Middleware on the Edge runtime, which restricted it to Web
APIs with no Node built-ins. Node.js by default means database drivers and Node
APIs now work there — which makes it more tempting to misuse for data fetching.
The advice not to do slow work in Proxy still stands.

## 10. What Are The Advanced Proxy Flags?

Two flags for URL handling edge cases:

```ts
const nextConfig: NextConfig = {
  skipProxyUrlNormalize: true,   // formerly skipMiddlewareUrlNormalize
  skipTrailingSlashRedirect: true,
};
```

`skipTrailingSlashRedirect` stops Next.js automatically redirecting `/about/` to
`/about`, letting you handle trailing slashes yourself — useful when migrating
from a system with different conventions and you need to preserve old URLs.

`skipProxyUrlNormalize` gives Proxy the raw, un-normalised URL, which matters when
you need to inspect the exact path the client sent.

When to use them:

Rarely. Both exist for migrations and unusual routing requirements. Reach for them
only when the default normalisation is demonstrably breaking something.

## 11. What Is `instrumentation.ts`?

`instrumentation.ts` at the project root exports a `register` function called
**once** when a new server instance starts, before it handles any requests.

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation.node");
  }
}
```

`register` may be async, and the server waits for it to complete.

Use cases:

- initialising OpenTelemetry
- starting an APM agent
- opening a database connection pool
- validating required environment variables at boot

Important:

It runs **per server instance**, not per request. In a serverless deployment that
means per cold start, so keep it fast — every millisecond is added to the first
request that instance serves.

The `NEXT_RUNTIME` guard matters because the file is loaded in more than one
runtime, and Node-only packages break elsewhere.

## 12. What Is `onRequestError`?

An optional export from `instrumentation.ts` that receives **server** errors, for
forwarding to a custom observability provider.

```ts
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  await fetch("https://errors.example.com/ingest", {
    method: "POST",
    body: JSON.stringify({
      message: error.message,
      digest: (error as { digest?: string }).digest,
      path: request.path,
      method: request.method,
      routerKind: context.routerKind,   // "App Router" | "Pages Router"
      routeType: context.routeType,     // "render" | "route" | "action" | ...
      renderSource: context.renderSource,
    }),
  });
};
```

Why it matters:

It catches errors that **never reach a client error boundary** — failures in Route
Handlers, Server Functions, and during prerendering. An `error.tsx` that reports to
Sentry covers only the rendering path.

Important:

Await any async work inside it. It is triggered when the server captures the
error, and an unawaited promise may be dropped when the function freezes.

## 13. What Is `instrumentation-client.ts`?

A root-level file whose code runs **before the application becomes interactive**,
for client-side monitoring.

```ts
// instrumentation-client.ts
import posthog from "posthog-js";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: "https://app.posthog.com",
});

window.addEventListener("error", (event) => {
  reportClientError(event.error);
});
```

Unlike server instrumentation, it exports nothing — the module body is the setup.

Use cases:

Performance tracking, error monitoring, polyfills, and analytics that must be in
place before user interaction.

Tradeoff:

Everything here is in the critical path to interactivity. A heavy analytics SDK
loaded this way directly worsens Interaction to Next Paint.

## 14. How Do You Set Up OpenTelemetry?

```bash
npm install @vercel/otel @opentelemetry/api
```

```ts
// instrumentation.ts
import { registerOTel } from "@vercel/otel";

export function register() {
  registerOTel({ serviceName: "interview-prep" });
}
```

Next.js emits spans for rendering, data fetching, Route Handlers, and Server
Functions, so a slow page becomes a readable trace rather than a guess.

Custom spans for your own work:

```ts
import { trace } from "@opentelemetry/api";

export async function getPosts() {
  return trace.getTracer("app").startActiveSpan("getPosts", async (span) => {
    try {
      return await db.post.findMany();
    } finally {
      span.end();
    }
  });
}
```

Why it matters:

In a streamed, partially prerendered page, "the page is slow" is ambiguous — the
shell may be instant while one hole is slow. A trace shows which span dominates.

## 15. How Do You Report Core Web Vitals?

```tsx
"use client";

import { useReportWebVitals } from "next/web-vitals";

export function WebVitals() {
  useReportWebVitals((metric) => {
    navigator.sendBeacon("/api/vitals", JSON.stringify(metric));
  });

  return null;
}
```

Mount it once in the root layout. `sendBeacon` is the right transport because it
survives page unload, which `fetch` does not.

Attribution explains **why** a score is poor, not just what it is:

```ts
const nextConfig: NextConfig = {
  experimental: {
    webVitalsAttribution: ["CLS", "LCP"],
  },
};
```

With attribution, a CLS report names the element that shifted, rather than giving
you a number with no lead.

Important:

Measure in **production**. Development has no minification, no prefetching, and
extra dev-only work, so lab numbers from `next dev` are meaningless.

## 16. How Do You Configure Logging?

```ts
const nextConfig: NextConfig = {
  logging: {
    fetches: {
      fullUrl: true,      // log the complete URL, not a truncated one
      hmrRefreshes: true, // also log fetches restored from the HMR cache
    },
  },
};
```

In development this prints every server-side `fetch` with its cache status, which
is the fastest way to answer "is this actually being cached?".

By default, fetches restored from the Server Components HMR cache are **not**
logged — `hmrRefreshes: true` surfaces them, which matters when you are debugging
why a change is not reflected.

For production logging, write structured JSON to stdout and let the platform
collect it:

```ts
console.log(JSON.stringify({
  level: "info",
  event: "order.created",
  orderId,
  requestId: (await headers()).get("x-request-id"),
}));
```

Interview note:

The `x-request-id` set in Proxy is what ties a client error, a server log, and a
trace together. Generating it once at the edge of the system is the cheapest
observability win available.

## 17. How Do You Debug A Next.js Application?

**Server-side**, attach a debugger to the Node process:

```bash
NODE_OPTIONS='--inspect' next dev
```

Then connect from Chrome DevTools or your editor, and set breakpoints in Server
Components and Route Handlers.

**Client-side**, ordinary browser DevTools work, with `debugger` statements or
breakpoints in the Sources panel.

Useful signals:

| Symptom | Where to look |
| --- | --- |
| Is this route static or dynamic? | `next build` route table |
| Is this fetch cached? | `logging.fetches` output in dev |
| Did the server or client render this? | React DevTools component badges |
| What crossed the boundary? | the RSC payload in the network tab |
| Why is the page slow? | OpenTelemetry trace, then the performance profile |

Important:

`next dev` and `next build` behave differently in ways that matter — prefetching is
disabled in development, error messages are redacted in production, and prerender
failures only appear at build time. Reproduce production bugs against
`next build && next start`.

## 18. What Are The Common Proxy And Observability Gotchas?

**No matcher** — Proxy runs on static assets and images, breaking styling or
looping redirects.

**A dynamic matcher** — it must be statically analysable at build time.

**Relying on Proxy for authorisation** — Server Functions are POSTs to their own
route and can fall outside the matcher.

**Data fetching in Proxy** — `fetch` cache options do nothing there, and it runs on
every matched request.

**Setting `runtime` in `proxy.ts`** — it throws; Proxy is Node.js by default in
Next.js 16.

**Cookies set on the request instead of the response** — they never reach the
browser.

**Forgetting the `NEXT_RUNTIME` guard** in `instrumentation.ts` — Node-only imports
break in other runtimes.

**Unawaited async work in `onRequestError`** — reports are dropped.

**Heavy SDKs in `instrumentation-client.ts`** — they sit in the critical path to
interactivity.

**Measuring vitals in development** — the numbers are not comparable to
production.

Strong answer:

> Proxy runs before a request completes and is the right place for cheap,
> request-shaped decisions — redirects, rewrites, headers, a CSP nonce. The thing I
> keep in mind is that Server Functions are POSTs to the route that uses them, so a
> matcher can silently stop covering them. That is why I treat Proxy as an
> optimisation and keep the real check next to the data, with
> `instrumentation.ts` and `onRequestError` catching what never reaches a client
> boundary.

## Sources Used

- <https://nextjs.org/docs/app/getting-started/proxy>
- <https://nextjs.org/docs/app/api-reference/file-conventions/proxy>
- <https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation>
- <https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client>
- <https://nextjs.org/docs/app/guides/open-telemetry>
- <https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/logging>
- <https://nextjs.org/docs/app/guides/debugging>
