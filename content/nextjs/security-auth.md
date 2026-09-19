# Next.js Security And Authentication Interview Guide

Security guidance covering where auth checks belong, why layouts are the wrong
place, the Data Access Layer and DTOs, session strategies, optimistic checks with
Proxy, Server Action security, closure encryption, tainting, Content Security
Policy with nonces, rate limiting, and auditing for data leaks. Written against
**Next.js 16**.

## 1. Where Should Auth Checks Live In The App Router?

**Close to the data**, not close to the UI.

```txt
Proxy          optimistic check only - is there a session cookie?
   ↓
Page/Layout    convenience, not a boundary
   ↓
DAL            <- the real check, next to every query
   ↓
Database
```

The principle: every path that can reach the data must pass the check. UI-level
gating protects the UI, and the UI is not the only way in — Server Functions and
Route Handlers are separate entry points.

```ts
// data/dal.ts
import { cache } from "react";
import { cookies } from "next/headers";

export const verifySession = cache(async () => {
  const token = (await cookies()).get("session")?.value;
  const session = token ? await decrypt(token) : null;

  if (!session?.userId) {
    redirect("/login");
  }

  return session;
});
```

Strong answer:

> I treat the UI as presentation and put the authorisation check in the data
> access layer. That way it runs whether the caller is a page, a Server Function,
> or a Route Handler — I cannot forget it in one of them.

## 2. Why Is A Layout The Wrong Place For An Auth Check?

Two independent reasons, and interviewers like this question because both are
non-obvious.

**Layouts do not re-render on navigation.** Because of partial rendering, a layout
persists across route changes within its subtree. A session check there runs on
first load and **not on every route change**.

```tsx
// Bad example: this check does not re-run when navigating /dashboard/* 
export default async function DashboardLayout({ children }) {
  const session = await auth();
  if (!session) redirect("/login");
  return <div>{children}</div>;
}
```

**A layout does not control whether the rest of the route renders.** Route segments
and parallel route slots are rendered by the **router**, not by the layout. A
layout that hides or swaps children does not stop them executing, and their output
can still appear in the RSC payload.

```tsx
// Bad example: children still render and still reach the payload
export default async function Layout({ children }) {
  const session = await auth();
  return <div>{session ? children : <Login />}</div>;
}
```

Fix — check in the page, or better, in the DAL that the page calls:

```tsx
// app/dashboard/page.tsx
import { verifySession } from "@/app/lib/dal";

export default async function DashboardPage() {
  const session = await verifySession(); // redirects if unauthenticated
  const user = await getUserData(session.userId);
  return <h1>Welcome, {user.name}</h1>;
}
```

Interview note:

Fetching user data in a layout is fine — displaying an avatar in the nav is a
legitimate use. What must not live there is the **authorisation decision**.

## 3. What Is A Data Access Layer?

A DAL is an internal module that owns every read and write, and is the single
place authorisation is enforced.

A DAL should:

- run **only on the server**
- perform authorisation checks
- return safe, minimal **Data Transfer Objects**

```ts
// data/auth.ts
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get("AUTH_TOKEN");
  const decoded = await decryptAndValidate(token);

  // do not include secret tokens or private fields
  return new User(decoded.id);
});
```

Benefits:

- one place to enforce authorisation, so it cannot be forgotten per call site
- `cache()` shares an in-memory result across a single request
- returning a **class instance** makes accidental serialisation to a Client
  Component fail loudly rather than silently leaking fields

Why the caching matters:

A cached helper lets any component call `getCurrentUser()` directly instead of
threading the user object from Server Component to Server Component — which is
exactly how it ends up being passed to a Client Component by accident.

## 4. What Are DTOs, And Why Do They Matter?

A Data Transfer Object is a deliberately shaped, minimal projection of a record —
never the raw database row.

```ts
// Bad example: the whole row crosses the boundary
export async function getProfile(id: string) {
  return db.user.findUnique({ where: { id } });
  // includes passwordHash, stripeCustomerId, internalNotes, isAdmin...
}
```

```ts
// Good: an explicit projection
export async function getProfileDto(id: string) {
  const session = await verifySession();
  const user = await db.user.findUnique({ where: { id } });

  const canSeeEmail = session.userId === id || session.role === "admin";

  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
    email: canSeeEmail ? user.email : undefined,
  };
}
```

Why it matters:

Anything a Server Component passes to a Client Component is serialised into the
RSC payload, which is **visible in the browser**. Returning a raw row leaks every
column, even if the UI renders only the name.

Interview note:

This is the practical answer to "how do you stop sensitive data reaching the
client?" — not a framework feature, but a discipline about what the data layer
returns.

## 5. Stateless vs Database Sessions

| | Stateless (JWT in a cookie) | Database session |
| --- | --- | --- |
| Where state lives | the token itself | a server-side store |
| Lookup per request | none | one query |
| Revocation | hard — valid until expiry | immediate |
| Size | limited by cookie size | unlimited |
| Scaling | trivial | needs a shared store |

```ts
// stateless: encrypt the payload into the cookie
import { SignJWT, jwtVerify } from "jose";

const key = new TextEncoder().encode(process.env.SESSION_SECRET);

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}
```

```ts
// database: store an opaque id, look it up
const sessionId = crypto.randomUUID();
await db.session.create({ data: { id: sessionId, userId, expiresAt } });
```

Tradeoff:

Stateless sessions avoid a lookup but cannot be revoked before expiry — a
compromised token stays valid. Short access tokens with a refresh token narrow the
window; a denylist reintroduces the lookup you were avoiding.

When to use which:

Stateless for low-risk, high-traffic reads. Database sessions anywhere immediate
logout or forced revocation matters — banking, admin, anything with a "sign out
all devices" feature.

## 6. How Do You Store A Session Cookie Securely?

```ts
import { cookies } from "next/headers";

export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const session = await encrypt({ userId, expiresAt });

  (await cookies()).set("session", session, {
    httpOnly: true,   // unreadable from JavaScript
    secure: true,     // HTTPS only
    sameSite: "lax",  // CSRF mitigation
    expires: expiresAt,
    path: "/",
  });
}
```

| Flag | Protects against |
| --- | --- |
| `httpOnly` | XSS reading the token |
| `secure` | interception over plain HTTP |
| `sameSite: "lax"` | cross-site request forgery |
| `expires` / `maxAge` | indefinite validity |

Important:

**Never store tokens in `localStorage`.** Any injected script can read it. An
`HttpOnly` cookie is invisible to JavaScript, which is the entire point.

Interview note:

`sameSite: "strict"` breaks the common flow where a user follows an email link
into your app — the cookie is not sent on that first cross-site navigation, so
they appear logged out. `lax` is the usual correct choice.

## 7. What Are Optimistic Checks With Proxy, And What Are Their Limits?

Proxy can do a cheap check before rendering — but only an optimistic one.

```ts
// proxy.ts
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get("session")?.value);

  if (!hasSession && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = { matcher: ["/dashboard/:path*"] };
```

What it is good for:

Redirecting obviously-unauthenticated traffic before any rendering work happens —
a performance and UX win.

What it is **not**:

A security boundary. The docs are explicit that Proxy should not be used as a full
session-management or authorisation solution. It checks that a cookie **exists**,
not that it is valid, unexpired, or authorised for that resource.

Important:

`fetch` options `cache`, `next.revalidate`, and `next.tags` have **no effect** in
Proxy, and it is not intended for slow data fetching. Doing a database lookup there
adds latency to every matched request.

The rule:

Optimistic check in Proxy, authoritative check in the DAL.

## 8. What Security Does Next.js Give Server Actions For Free?

- **CSRF check** — the request `Origin` is compared against `Host` (or
  `X-Forwarded-Host`); mismatches are rejected.
- **Body size limit** — 1MB by default, configurable.
- **Encrypted action IDs and dead-code elimination** — action references are
  encrypted at build time, and unused Server Functions are stripped from client
  bundles so they have no public endpoint.
- **Closure variable encryption** — variables captured by an inline action are
  encrypted before being sent to the client.

What it does **not** give you:

Authentication, authorisation, ownership checks, input validation, rate limiting,
or control over what you return.

```ts
"use server";

import { auth } from "@/lib/auth";

export async function deletePost(postId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (!(await canDelete(session.user, postId))) throw new Error("Forbidden");

  await db.post.delete({ where: { id: postId } });
}
```

Important:

A Server Function runs as a POST against the page that invokes it. **Render-time
gating is not a security boundary** — the POST can be sent without ever loading
the UI that renders the form.

## 9. What Is Closure Encryption, And Why Does It Matter When Self-Hosting?

An inline Server Function can capture variables from its enclosing scope. Those
values must travel to the client as part of the action reference, so Next.js
**encrypts** them.

```tsx
export default async function Page() {
  const secretKey = await getKey(); // captured by the closure

  async function doThing() {
    "use server";
    await useKey(secretKey); // encrypted in transit
  }

  return <form action={doThing}>...</form>;
}
```

The encryption key is generated per build. On a **multi-instance, self-hosted**
deployment, each instance generating its own key means an action created by one
instance cannot be decrypted by another.

```bash
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<stable shared key>
```

Symptom without it:

Actions fail intermittently, depending on which replica serves the request —
classically "works locally, fails in production about half the time".

Interview note:

Even encrypted, a captured value round-trips through the client. Prefer reading
secrets **inside** the action rather than capturing them.

## 10. What Is `allowedOrigins`?

The CSRF check compares `Origin` to `Host`. Behind a proxy, CDN, or tunnel those
differ, and every action is rejected.

```ts
const nextConfig: NextConfig = {
  serverActions: {
    allowedOrigins: ["my-proxy.com", "*.my-proxy.com"],
    bodySizeLimit: "2mb",
  },
};
```

Symptom:

Server Actions work on `localhost` and return a CSRF failure once deployed behind a
load balancer or accessed through a tunnel such as ngrok.

Important:

Only list origins you control. Wildcarding broadly reintroduces the CSRF exposure
the check exists to prevent.

## 11. What Is Tainting?

React's taint APIs let you mark an object or value as forbidden from crossing to
the client. Next.js exposes them behind a flag.

```ts
const nextConfig: NextConfig = {
  experimental: { taint: true },
};
```

```ts
import { experimental_taintObjectReference, experimental_taintUniqueValue } from "react";

export async function getUser(id: string) {
  const user = await db.user.findUnique({ where: { id } });

  experimental_taintObjectReference(
    "Do not pass the whole user object to the client",
    user,
  );

  experimental_taintUniqueValue(
    "Do not pass the session token to the client",
    user,
    user.sessionToken,
  );

  return user;
}
```

Passing a tainted object to a Client Component now throws at render time instead
of silently serialising.

Important:

Enabling the flag also taints `process.env`, so it cannot be passed whole to a
Client Component.

Tradeoff:

It is an **additional layer**, not a replacement. The docs are explicit that you
should still filter and sanitise in the DAL — tainting catches mistakes, DTOs
prevent them.

## 12. How Do You Keep Server-Only Code Off The Client?

```ts
// lib/data.ts
import "server-only";

export async function getSecretData() {
  return db.query("SELECT * FROM secrets");
}
```

Importing that module from a Client Component now **fails the build** rather than
shipping the code.

```ts
import "client-only"; // the mirror image
```

Environment variables are already split by prefix:

| Prefix | Available in |
| --- | --- |
| none | server only |
| `NEXT_PUBLIC_` | server **and** browser, inlined at build time |

Important:

`NEXT_PUBLIC_` values are **inlined into the client bundle at build time**. Giving
a secret that prefix publishes it, and changing one requires a rebuild rather than
a restart.

Interview note:

`server-only` protects the **code path**, not just the values. A helper that reads
no env var can still leak business logic and query structure if it ships.

## 13. How Do You Implement A Content Security Policy With A Nonce?

A nonce is a unique random string per request that whitelists specific inline
scripts, so a strict CSP can still allow your own.

```ts
// proxy.ts
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'nonce-${nonce}';
    img-src 'self' blob: data:;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
  `.replace(/\s{2,}/g, " ").trim();

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}
```

Important:

A fresh nonce is required per request, which means **the route must render
dynamically**. A statically prerendered page would bake one nonce into HTML served
to everyone, defeating the purpose.

`'unsafe-eval'` is required in **development only**, because React uses `eval` to
reconstruct server-side error stacks in the browser. Neither React nor Next.js use
`eval` in production by default.

Tradeoff:

A strict CSP with nonces is the strongest XSS mitigation available, and it forces
every route it covers to be dynamic. Applying it selectively via `matcher` keeps
marketing pages static.

## 14. How Do You Rate Limit?

Nothing is built in, so it belongs in the action or handler — usually keyed by
user and by IP.

```ts
"use server";

import { headers } from "next/headers";

export async function sendMessage(formData: FormData) {
  const session = await verifySession();
  const ip = (await headers()).get("x-forwarded-for") ?? "unknown";

  const { success } = await limiter.limit(`msg:${session.userId}:${ip}`);

  if (!success) {
    return { error: "Too many requests. Try again shortly." };
  }

  await db.message.create({ data: { userId: session.userId } });
}
```

Where it matters most:

- login and password reset — brute force and user enumeration
- anything that sends email or SMS — cost amplification
- expensive queries or AI calls
- signup — spam accounts

Important:

Rate limit **before** the expensive work, and key on something the attacker cannot
trivially rotate. IP alone is weak behind NAT and trivial to change; user id alone
does not help pre-authentication.

## 15. How Do You Control What A Server Component Returns?

Return values from Server Components and Server Functions are serialised into the
RSC payload, which is readable in the browser.

```tsx
// Bad example: the whole record is in the payload
export default async function Page() {
  const user = await db.user.findUnique({ where: { id } });
  return <Profile user={user} />; // passwordHash included
}
```

```tsx
// Good: project first
export default async function Page() {
  const user = await getProfileDto(id);
  return <Profile user={user} />;
}
```

The same applies to action returns:

```ts
"use server";

export async function updateProfile(formData: FormData) {
  const updated = await db.user.update({ ... });

  return { id: updated.id, name: updated.name }; // not the whole row
}
```

How to check:

Open the network tab and read the RSC payload for the page. Anything in there
reached the browser, whether or not the UI renders it.

## 16. How Should Auth Interact With Streaming?

Session data usually appears in shell UI — a header or nav — that repeats across
routes. A top-level `await` on `cookies()` or the DAL in a layout **delays the
first streamed chunk** and holds `{children}` behind that work.

```tsx
// Bad example: the whole page waits for the session
export default async function Layout({ children }) {
  const user = await getCurrentUser(); // blocks everything
  return (
    <>
      <Nav user={user} />
      {children}
    </>
  );
}
```

```tsx
// Better: push the dynamic access down
import { Suspense } from "react";

export default function Layout({ children }) {
  return (
    <>
      <Nav>
        <Suspense fallback={<AvatarSkeleton />}>
          <UserMenu />          {/* only this waits */}
        </Suspense>
      </Nav>
      {children}                {/* streams immediately */}
    </>
  );
}
```

Important:

Client Components **cannot import the DAL**. Run `verifySession()` or
`getCurrentUser()` in a parent Server Component and pass the result down as props
or through a context provider — with `taintUniqueValue` on the sensitive fields.

## 17. How Do You Avoid Side Effects During Rendering?

Rendering can happen more than once — during prerender, on retry, during
streaming. A mutation in a render path can therefore run more than once.

```tsx
// Bad example: a write during render
export default async function Page() {
  await db.pageView.create({ data: { path: "/" } }); // may run repeatedly
  return <Content />;
}
```

```tsx
// Better: after the response, or in an action
import { after } from "next/server";

export default async function Page() {
  after(async () => {
    await db.pageView.create({ data: { path: "/" } });
  });

  return <Content />;
}
```

The rule:

Rendering reads; actions and Route Handlers write. A `GET` that mutates is both a
correctness problem and a CSRF exposure, because it can be triggered by a link or
an image tag.

## 18. How Do You Audit For Data Leaks?

Method:

1. **Read the RSC payload** in the network tab for a representative page. Search it
   for field names that should never appear — `passwordHash`, `token`, `secret`.
2. **Grep the client bundle** for anything that looks like a credential.
3. **Check every `NEXT_PUBLIC_`** variable and confirm each is genuinely public.
4. **List every Server Function** and confirm each starts with an auth check.
5. **List every Route Handler** and do the same.
6. **Confirm `server-only`** is imported by every module that touches secrets.
7. **Try an action without the UI** — `curl` a POST to a page with an action id and
   confirm it rejects.

```bash
grep -rEo 'sk_live_[A-Za-z0-9]+|SECRET|PRIVATE_KEY' .next/static/ | head
```

Interview note:

The highest-value check is the RSC payload, because it is the leak people forget.
Developers reason about what the UI renders, but serialisation includes everything
passed across the boundary.

## 19. How Do You Handle Authorisation Beyond Authentication?

Authentication answers *who*; authorisation answers *may they*. Both belong in the
DAL.

```ts
export async function getPostForEdit(postId: string) {
  const session = await verifySession();
  const post = await db.post.findUnique({ where: { id: postId } });

  if (!post) notFound();

  const allowed = post.authorId === session.userId || session.role === "admin";

  if (!allowed) {
    forbidden(); // 403, renders forbidden.tsx
  }

  return toPostDto(post);
}
```

Put ownership **in the query** wherever possible, so there is no window between
check and use:

```ts
await db.post.update({
  where: { id: postId, authorId: session.userId }, // ownership in the WHERE
  data: { title },
});
```

The ownership rule:

A client legitimately says **which** record to act on. It must never supply the
record's contents or its ownership. Accept a reference plus the change, and read
everything else from the session.

## 20. What Are The Common Security Gotchas?

**Auth check in a layout** — layouts do not re-render on navigation, and do not
stop siblings rendering.

**Trusting Proxy as a boundary** — it checks a cookie exists, not that it is valid.

**Render-time gating** — a Server Function POST does not need the UI.

**Returning raw database rows** — everything crosses in the RSC payload.

**Tokens in `localStorage`** — readable by any injected script.

**`sameSite: "strict"`** — breaks inbound links from email.

**Accepting whole objects in actions** — send an id plus the change.

**Missing `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`** on multi-instance self-hosting.

**Secrets behind `NEXT_PUBLIC_`** — inlined into the client bundle at build time.

**A nonce on a static page** — everyone gets the same nonce, defeating the CSP.

**Writes during render** — rendering can repeat.

Strong answer:

> The rule I follow is that the check goes next to the data, not next to the UI. A
> layout is the tempting place and the wrong one, because partial rendering means
> it does not re-run on navigation and it does not control whether sibling
> segments render. Putting `verifySession()` in a cached Data Access Layer means
> every entry point — page, Server Function, Route Handler — passes the same
> check, and returning DTOs keeps anything sensitive out of the RSC payload.

## Sources Used

- <https://nextjs.org/docs/app/guides/authentication>
- <https://nextjs.org/docs/app/guides/data-security>
- <https://nextjs.org/docs/app/guides/content-security-policy>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/taint>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions>
- <https://nextjs.org/docs/app/api-reference/functions/cookies>
- <https://nextjs.org/docs/app/api-reference/file-conventions/proxy>
- <https://nextjs.org/docs/app/api-reference/functions/forbidden>
- <https://nextjs.org/docs/app/api-reference/functions/after>
