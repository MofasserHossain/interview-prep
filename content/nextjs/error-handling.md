# Next.js Error Handling Interview Guide

Error handling guidance covering expected errors versus uncaught exceptions,
`error.tsx` boundaries and the `retry` prop, `global-error.tsx`, `error.digest`,
`notFound()`, `forbidden()` and `unauthorized()`, `unstable_rethrow`,
`catchError`, and errors in Route Handlers and during the build. Written against
**Next.js 16**.

## 1. How Does Next.js Distinguish Expected Errors From Uncaught Exceptions?

This split drives every decision in this area.

| | Expected error | Uncaught exception |
| --- | --- | --- |
| Example | invalid form input, item not found | database down, null dereference |
| How you signal it | **return** it as a value | **throw** it |
| Where it surfaces | inline in the UI | the nearest `error.tsx` boundary |
| User sees | a field message | a fallback screen |

```ts
"use server";

export async function createPost(prevState: unknown, formData: FormData) {
  const title = formData.get("title");

  if (!title) {
    return { error: "Title is required" }; // expected -> returned
  }

  await db.post.create({ data: { title: title as string } }); // may throw
}
```

Why it matters:

Throwing for a validation failure replaces the whole page with an error screen for
something the user can simply fix. Returning it keeps them in the form with their
input intact.

Strong answer:

> I return expected errors and throw unexpected ones. A validation failure is a
> normal outcome, so it belongs in the return value. An error boundary is for
> things the user cannot act on.

## 2. What Is `error.tsx`, And What Props Does It Receive?

`error.tsx` defines a React error boundary for its segment and everything below.

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

Two requirements that trip people up:

1. It **must** be a Client Component — `"use client"` is mandatory, because error
   boundaries rely on client-side lifecycle.
2. It receives exactly two props: `error` and `retry`.

Placement decides scope:

```txt
app/
├── error.tsx                 catches everything below the root layout
└── dashboard/
    ├── error.tsx             catches /dashboard and below
    └── settings/page.tsx
```

The **nearest** boundary above the throwing component handles it, so the rest of
the app keeps working.

## 3. `retry()` vs `reset()`

`retry()` is the current API and the one to use.

| | `retry()` | `reset()` |
| --- | --- | --- |
| Re-fetches data | **yes** | no |
| Re-renders children | yes | yes |
| Runs in a Transition | yes | — |
| Preserves client state outside the boundary | yes | — |

```tsx
<button onClick={() => retry()}>Try again</button>
```

`retry()` re-fetches and re-renders the boundary's children. If it succeeds, the
fallback is replaced by the real content. Because it runs inside a React
Transition, Client Component state **outside** the boundary is preserved.

`reset()` still exists, but it only clears the error state and re-renders without
re-fetching. Reach for it only when you specifically do not want a refetch.

Interview note:

Code written for Next.js 14 or earlier destructures `reset`. In Next.js 16 the
prop passed is `retry`, so an old example silently gives you `undefined` and the
button does nothing.

## 4. What Does `error.tsx` Not Catch?

Three important gaps.

**Its own layout.** `app/dashboard/error.tsx` does not catch errors thrown by
`app/dashboard/layout.tsx`, because that layout is its **parent**. The boundary
one level up handles it.

```txt
app/
├── error.tsx              <- catches dashboard/layout.tsx errors
└── dashboard/
    ├── layout.tsx         throws here...
    └── error.tsx          ...and this does NOT catch it
```

**The root layout.** Nothing in `app/` can catch an error in `app/layout.tsx` —
that is what `global-error.tsx` is for.

**Server Function errors that you catch yourself.** If your action has a
`try`/`catch`, the boundary never sees the error.

Interview trap:

This layout-versus-boundary relationship is the most common "why is my error.tsx
not firing?" question. The fix is to move the boundary up a level, or to move the
throwing work out of the layout.

## 5. What Is `global-error.tsx`?

`global-error.tsx` replaces the **entire page**, including the root layout, when
the root layout itself fails.

```tsx
"use client";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong</h2>
        <button onClick={() => retry()}>Try again</button>
      </body>
    </html>
  );
}
```

Important:

Because it replaces the root layout, it **must render its own `<html>` and
`<body>` tags**. Omitting them produces a broken document.

It is deliberately rare. A root layout that only renders a shell rarely throws;
if yours does, that is usually the real bug.

## 6. What Is `error.digest`, And Why Are Messages Hidden In Production?

In production, errors forwarded from Server Components show a **generic message**
with an identifier, to avoid leaking sensitive detail.

```txt
Error: An error occurred in the Server Components render.
The specific message is omitted in production builds to avoid leaking
sensitive details. A digest property is included on this error instance
which may provide additional details about the nature of the error.
```

`error.digest` is a hash of the original error. Log it in your fallback and match
it against your server logs:

```tsx
"use client";

import { useEffect } from "react";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportToSentry(error); // includes the digest
  }, [error]);

  return (
    <div>
      <h2>Something went wrong</h2>
      {error.digest ? <p>Reference: {error.digest}</p> : null}
      <button onClick={() => retry()}>Try again</button>
    </div>
  );
}
```

Why it matters:

A raw error message can disclose table names, file paths, and query structure.
The digest gives support a reference to correlate with, without exposing any of
that to the browser.

Interview note:

In development you see the full message and stack. Testing error UI against
`next dev` and assuming production looks the same is a common surprise.

## 7. How Do `notFound()` And `not-found.tsx` Work?

`notFound()` throws an internal signal that renders the nearest `not-found.tsx`
and sends a 404 status.

```tsx
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    notFound();
  }

  return <article>{post.title}</article>;
}
```

```tsx
// app/blog/not-found.tsx
export default function NotFound() {
  return <p>That post does not exist.</p>;
}
```

Because it throws, code after it is unreachable — TypeScript narrows correctly, so
`post` is non-null below the call.

Important:

`notFound()` is not an error in the `error.tsx` sense. It renders `not-found.tsx`,
not the error boundary — unless you accidentally catch it (see question 9).

## 8. What Are `forbidden()` And `unauthorized()`?

Two navigation interrupts for authorisation, behind the experimental
`authInterrupts` flag.

```ts
const nextConfig: NextConfig = {
  experimental: { authInterrupts: true },
};
```

```ts
import { forbidden, unauthorized } from "next/navigation";

const session = await auth();

if (!session) {
  unauthorized(); // renders unauthorized.tsx, sends 401
}

if (!session.user.isAdmin) {
  forbidden();    // renders forbidden.tsx, sends 403
}
```

```tsx
// app/unauthorized.tsx
export default function Unauthorized() {
  return <LoginPrompt />;
}
```

The distinction matters and interviewers ask about it:

- **401 Unauthorized** — we do not know who you are; log in
- **403 Forbidden** — we know who you are, and you may not do this

Benefits:

Dedicated UI per case, with the correct status code, rather than a generic error
screen or a redirect that loses the original intent.

## 9. What Is `unstable_rethrow`, And Why Do You Need It?

Several Next.js APIs work by **throwing an internal signal**: `notFound()`,
`redirect()`, `forbidden()`, `unauthorized()`. A `try`/`catch` around them
swallows the signal, and the expected behaviour silently never happens.

```tsx
// Bad example: not-found.tsx never renders
import { notFound } from "next/navigation";

export default async function Page() {
  try {
    const post = await getPost();
    if (!post) notFound();
    return <article>{post.title}</article>;
  } catch (error) {
    return <p>Something went wrong</p>; // catches Next's internal signal
  }
}
```

```tsx
// Good: rethrow the framework's signals, handle only your own errors
import { notFound, unstable_rethrow } from "next/navigation";

export default async function Page() {
  try {
    const post = await getPost();
    if (!post) notFound();
    return <article>{post.title}</article>;
  } catch (error) {
    unstable_rethrow(error); // re-throws internal errors, returns for yours
    return <p>Something went wrong</p>;
  }
}
```

`unstable_rethrow(error)` re-throws if the error is one of Next.js's internal
signals, and returns normally otherwise — so your own handling continues.

The rule:

Call the navigation helpers **outside** any `try` block where possible. Where that
is not practical, put `unstable_rethrow(error)` as the first line of the `catch`.

Interview trap:

This is the single most common cause of "my `redirect()` does nothing" and "my
`notFound()` renders the error page instead of the 404 page". A broad
`try`/`catch` around a data fetch is usually the culprit.

## 10. What Is `catchError`?

`catchError` from `next/error` creates an error boundary **programmatically**,
as an alternative to the `error.tsx` file convention. It enables component-level
recovery anywhere in the tree.

```tsx
"use client";

import { catchError, type ErrorInfo } from "next/error";

function ErrorFallback(props: { title: string }, { error, retry }: ErrorInfo) {
  return (
    <div>
      <h3>{props.title}</h3>
      <button onClick={() => retry()}>Retry</button>
    </div>
  );
}

export const WidgetBoundary = catchError(ErrorFallback);
```

```tsx
<WidgetBoundary title="Could not load analytics">
  <AnalyticsWidget />
</WidgetBoundary>
```

Why not a plain React error boundary:

- **built-in recovery** — `retry()` re-renders inside a Transition, preserving
  Client Component state outside the boundary
- **framework aware** — `redirect()` and `notFound()` throw internally, and
  `catchError` lets those pass through instead of swallowing them
- **client navigation handling** — the error state clears automatically when the
  user navigates to a different route

A hand-written React error boundary does none of these, which is why it tends to
break `redirect()` in subtle ways.

When to use it:

For one widget inside a page, where a whole-segment `error.tsx` would be too
coarse — a dashboard panel that can fail without taking the page with it.

## 11. How Do Nested Error Boundaries Work?

Boundaries compose, and the nearest one wins.

```viz
type: stack
title: Which boundary catches a throw in settings/page.tsx
> dashboard/settings/error.tsx :: nearest boundary, catches first
dashboard/error.tsx :: catches if settings has no boundary
app/error.tsx :: catches errors from dashboard/layout.tsx
app/global-error.tsx :: only if the ROOT layout itself throws
```

Granular boundaries keep more of the UI alive:

```tsx
export default function Dashboard() {
  return (
    <>
      <Header />                                 {/* survives */}
      <Suspense fallback={<StatsSkeleton />}>
        <Stats />                                {/* can fail alone */}
      </Suspense>
      <Suspense fallback={<FeedSkeleton />}>
        <Feed />
      </Suspense>
    </>
  );
}
```

With parallel routes, each slot has its own `error.tsx`, so a failing analytics
panel does not take down the team panel.

The rule:

Put a boundary wherever a failure should be **contained** rather than escalated.
One root boundary means any error blanks the whole app.

## 12. How Do Errors Interact With Streaming?

Once streaming has begun, the HTTP status is already sent — so a later error
cannot change it.

```tsx
export default function Page() {
  return (
    <>
      <h1>Dashboard</h1>          {/* already streamed, status 200 sent */}
      <Suspense fallback={<Skeleton />}>
        <SlowWidget />             {/* if this throws, status stays 200 */}
      </Suspense>
    </>
  );
}
```

React swaps in the error boundary's UI inline via the stream, but the response
code remains what was already committed.

Why it matters:

Monitoring that alerts on 5xx status codes will **miss** these failures. Report
errors from the boundary itself rather than relying on status codes alone.

Important:

`notFound()` called after streaming starts cannot send a 404 either. Do the
existence check **before** rendering anything streamable — typically at the top of
the page component.

## 13. How Do You Handle Errors In Route Handlers?

Route Handlers are plain functions; there is no `error.tsx` for them. Return the
response you want.

```ts
export async function GET(request: Request) {
  try {
    const data = await getData();
    return Response.json(data);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

A consistent error shape is worth standardising:

```ts
function errorResponse(message: string, status: number) {
  return Response.json({ error: { message, status } }, { status });
}

if (!body.title) return errorResponse("Title is required", 400);
if (!session) return errorResponse("Unauthorized", 401);
```

Important:

Never return the raw error message to the client. Log the full error server-side
and return something generic — database errors disclose schema and infrastructure
detail.

## 14. What Happens To Errors During The Build?

An error thrown while prerendering **fails the build**, because the page cannot be
generated.

```txt
Error occurred prerendering page "/blog/hello".
Export encountered an error on /blog/[slug]/page: /blog/hello, exiting the build.
```

Common causes:

- an API that is unreachable at build time
- a missing environment variable used at module scope
- a `generateStaticParams` entry whose data no longer exists

Fixes, in order of preference:

1. Make the page dynamic if it genuinely needs request-time data
2. Handle the missing case with `notFound()` rather than throwing
3. Remove the stale param from `generateStaticParams`

```tsx
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    notFound(); // builds fine, renders the 404 page
  }

  return <article>{post.title}</article>;
}
```

Interview note:

`next dev` renders on demand, so a build-time failure often appears only in CI.
Running `next build` locally before pushing catches it.

## 15. How Do You Report Errors To A Monitoring Service?

Report from the boundary, because that is where the error is guaranteed to land.

```tsx
"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { digest: error.digest } });
  }, [error]);

  return <Fallback onRetry={retry} />;
}
```

For server-side instrumentation, `instrumentation.ts` provides a hook that runs
once per server process:

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

export const onRequestError = (error, request, context) => {
  reportToService(error, { path: request.path, context });
};
```

`onRequestError` catches server-side errors that never reach a client boundary —
including those thrown in Route Handlers and Server Functions.

## 16. Where Do Server Function Errors Go?

It depends on whether you catch them.

```ts
"use server";

export async function createPost(formData: FormData) {
  await db.post.create({ data: {} }); // throws -> bubbles to error.tsx
}
```

An uncaught throw propagates to the nearest `error.tsx` of the page that invoked
the action.

```ts
"use server";

export async function createPost(prevState: unknown, formData: FormData) {
  try {
    await db.post.create({ data: {} });
  } catch (error) {
    console.error(error);
    return { error: "Could not save. Please try again." }; // stays in the form
  }

  redirect("/posts"); // OUTSIDE the try - or the catch swallows it
}
```

Returning keeps the user on the form with their input. That is almost always the
better experience for a mutation.

Important:

Note where `redirect()` sits. Inside the `try`, its internal signal is caught by
the `catch` and the navigation silently never happens.

## 17. How Do You Test Error States?

```tsx
// Temporarily force the boundary to render
export default function Page() {
  throw new Error("Test error");
}
```

A checklist worth naming in an interview:

- throw in a **page** and confirm the nearest `error.tsx` renders
- throw in a **layout** and confirm the boundary one level **up** catches it
- throw in the **root layout** and confirm `global-error.tsx` renders with its own
  `<html>` and `<body>`
- call `notFound()` and confirm `not-found.tsx` renders with a 404
- click **Try again** and confirm `retry()` actually recovers
- run `next build` and confirm no page fails to prerender
- check the production build — messages are redacted and only `digest` shows

Interview note:

Testing only in `next dev` misses two whole categories: build-time prerender
failures, and the production message redaction.

## 18. What Are The Common Error Handling Gotchas?

**Forgetting `"use client"`** on `error.tsx` — error boundaries must be Client
Components.

**Destructuring `reset` instead of `retry`** — outdated for Next.js 16; the button
does nothing.

**Expecting `error.tsx` to catch its own layout** — that layout is its parent.

**`global-error.tsx` without `<html>` and `<body>`** — it replaces the root layout,
so it must supply them.

**Wrapping `notFound()` or `redirect()` in `try`/`catch`** — the catch swallows the
internal signal; use `unstable_rethrow`.

**Throwing for validation errors** — return them so they render inline.

**Expecting a 500 status after streaming started** — the status was already sent.

**Relying on status-code alerting** — streamed errors stay 200; report from the
boundary.

**Returning raw error messages from Route Handlers** — they leak schema detail.

**Only testing in `next dev`** — you miss prerender failures and message
redaction.

Strong answer:

> I split errors into expected and unexpected. Expected ones are returned as
> values and render inline; unexpected ones throw and hit the nearest `error.tsx`,
> which gets `error` and `retry`. The subtlety is that Next.js implements
> `notFound()` and `redirect()` by throwing, so a broad `try`/`catch` silently
> breaks them — that is what `unstable_rethrow` exists for.

## Sources Used

- <https://nextjs.org/docs/app/getting-started/error-handling>
- <https://nextjs.org/docs/app/api-reference/file-conventions/error>
- <https://nextjs.org/docs/app/api-reference/file-conventions/not-found>
- <https://nextjs.org/docs/app/api-reference/file-conventions/forbidden>
- <https://nextjs.org/docs/app/api-reference/file-conventions/unauthorized>
- <https://nextjs.org/docs/app/api-reference/functions/unstable_rethrow>
- <https://nextjs.org/docs/app/api-reference/functions/catchError>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/authInterrupts>
- <https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation>
