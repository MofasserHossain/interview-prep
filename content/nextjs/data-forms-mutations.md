# Next.js Data Fetching And Forms Interview Guide

Data and mutation guidance covering fetching in Server Components, avoiding
waterfalls, Server Functions and how they actually work over the wire, form
handling, validation, pending and optimistic state, Route Handlers, Server Action
security, and choosing a cache update. Written against **Next.js 16**.

## 1. How Do You Fetch Data In The App Router?

The component is `async` and awaits directly — no `getServerSideProps`, no
`useEffect`.

```tsx
export default async function PostsPage() {
  const res = await fetch("https://api.example.com/posts");

  if (!res.ok) {
    throw new Error("Failed to load posts");
  }

  return <PostList posts={await res.json()} />;
}
```

Or skip HTTP entirely and query the database from the component:

```tsx
import { db } from "@/lib/db";

export default async function PostsPage() {
  const posts = await db.post.findMany({ orderBy: { createdAt: "desc" } });
  return <PostList posts={posts} />;
}
```

Why it matters:

A Server Component runs on the server, so there is no reason to call your own API
route from it. Querying directly removes a serialise, an HTTP round trip, and a
deserialise.

Interview note:

Route Handlers are for **external** consumers — mobile apps, webhooks, third
parties. Building `/api/posts` purely so your own page can fetch it is a habit
carried over from the Pages Router.

## 2. How Do You Avoid A Data-Fetching Waterfall?

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

Sequential is correct only when a request genuinely depends on a previous result.

A **component-level** waterfall is subtler — a nested Server Component that fetches
does not start until its parent has finished rendering:

```tsx
// Each Suspense boundary fetches in parallel
<Suspense fallback={<StatsSkeleton />}><Stats /></Suspense>
<Suspense fallback={<FeedSkeleton />}><Feed /></Suspense>
```

Preloading starts a request before you await it:

```tsx
function preload(id: string) {
  void getUser(id); // fire, do not await
}

export default async function Page({ params }) {
  const { id } = await params;
  preload(id);                     // starts now
  const other = await getOther();
  const user = await getUser(id);  // already in flight, deduped by cache()
  return <Profile user={user} other={other} />;
}
```

## 3. How Does React `cache()` Deduplicate Requests?

`cache()` memoises a function for the duration of **one render pass**.

```ts
import { cache } from "react";

export const getUser = cache(async (id: string) => {
  return db.user.findUnique({ where: { id } });
});
```

A layout, a page, and `generateMetadata` all calling `getUser("1")` produce one
query instead of three.

Important:

`cache()` does **not** persist between requests. It is request-scoped
deduplication, not caching. Cross-request persistence is `use cache` on Cache
Components, or `unstable_cache` on the classic model.

## 4. What Are Server Functions, And How Do They Work Over The Wire?

A Server Function is an async function marked `"use server"` that runs on the
server but can be invoked from the client.

```ts
// app/lib/actions.ts
"use server";

export async function createPost(formData: FormData) {
  const title = formData.get("title") as string;
  await db.post.create({ data: { title } });
}
```

What actually happens at build time:

```viz
type: flow
title: How a Server Function reaches the server
Build :: "use server" tells the compiler to split the function
Client bundle :: the implementation is replaced by an action ID and a dispatcher
User submits :: the dispatcher POSTs the action ID plus arguments
Server :: looks up the ID, runs the real implementation
Response :: carries the return value AND the updated UI in one payload
```

A Server Function runs as a **POST request against the page that invokes it**. The
implementation never ships, but the route is reachable by anyone who can send the
same POST.

Interview note:

That last point is the whole security story. It is not a private function — it is
a public endpoint with a generated name.

## 5. How Do You Handle A Form With A Server Function?

Pass the function straight to the form's `action`:

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

- **progressive enhancement** — it is a real form POST, so it works before
  hydration and with JavaScript disabled
- no API route, no `fetch`, no manual serialisation
- one response carries both the action's return value and the updated UI

Passing extra arguments uses `bind`, because the form only supplies `FormData`:

```tsx
import { updatePost } from "@/lib/actions";

export function EditForm({ postId }: { postId: string }) {
  const updatePostWithId = updatePost.bind(null, postId);
  return <form action={updatePostWithId}>...</form>;
}
```

Important:

`bind` sends the bound argument to the client as part of the action reference.
Next.js encrypts it, but it is still round-tripped — never bind a secret.

## 6. How Do You Validate Form Input?

Validate on the server, inside the action, and return errors as values.

```ts
"use server";

import { z } from "zod";

const schema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  email: z.string().email("Invalid email"),
});

export async function createPost(prevState: unknown, formData: FormData) {
  const parsed = schema.safeParse({
    title: formData.get("title"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  await db.post.create({ data: parsed.data });
  redirect("/posts");
}
```

The `prevState` first parameter is what `useActionState` requires.

Important:

Expected errors are **returned**, not thrown. Throwing is for genuinely unexpected
failures, which an `error.tsx` boundary catches. A validation failure is a normal
outcome and should render inline.

Interview trap:

Schema validation checks the **shape** of the input, not the caller's right to
send it. A well-formed object can still reference a row the user does not own —
see question 15.

## 7. How Do You Show Pending And Error States?

`useActionState` gives you the returned value, a wrapped action, and a pending
flag.

```tsx
"use client";

import { useActionState } from "react";
import { createPost } from "@/lib/actions";

export function PostForm() {
  const [state, formAction, isPending] = useActionState(createPost, null);

  return (
    <form action={formAction}>
      <input name="title" required />
      {state?.errors?.title ? <p role="alert">{state.errors.title[0]}</p> : null}

      <button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Create"}
      </button>
    </form>
  );
}
```

`useFormStatus` reads the nearest parent form's status, which keeps a submit button
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

`useFormStatus` must be called in a component **inside** the `<form>`. Calling it
in the component that renders the form always returns `pending: false` — it reads
a context the form provides to its descendants.

## 8. How Do Optimistic Updates Work?

`useOptimistic` shows the result immediately and reconciles when the action
settles.

```tsx
"use client";

import { useOptimistic } from "react";
import { send } from "./actions";

type Message = { message: string };

export function Thread({ messages }: { messages: Message[] }) {
  const [optimisticMessages, addOptimisticMessage] = useOptimistic<Message[], string>(
    messages,
    (state, newMessage) => [...state, { message: newMessage }],
  );

  const formAction = async (formData: FormData) => {
    const message = formData.get("message") as string;
    addOptimisticMessage(message);
    await send(message);
  };

  return (
    <div>
      {optimisticMessages.map((m, i) => (
        <div key={i}>{m.message}</div>
      ))}
      <form action={formAction}>
        <input name="message" type="text" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

How it behaves:

The optimistic value is shown while the action runs. When it completes and the
real data arrives, React **discards** the optimistic state and renders the truth —
including on failure, which reverts automatically.

When to use it:

High-confidence, low-stakes mutations — sending a message, liking a post, toggling
a checkbox.

When not to use it:

Payments, deletions, or anything where showing a success that later reverts is
worse than a brief spinner.

## 9. What Is `next/form`, And When Do You Use It?

`<Form>` extends the HTML form with prefetching, client-side navigation on submit,
and progressive enhancement. It targets forms that put state in the **URL**.

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

When to use which:

| Need | Use |
| --- | --- |
| Search or filters reflected in the URL | `next/form` with a **path** action |
| A mutation that writes data | plain `<form>` with a Server Function |

Benefits of the URL approach: results are shareable, bookmarkable, and survive a
refresh, with no client state to manage.

## 10. How Do You Trigger A Server Function Outside A Form?

From an event handler or an effect, using a transition so the pending state is
tracked.

```tsx
"use client";

import { useTransition } from "react";
import { deletePost } from "@/lib/actions";

export function DeleteButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(() => deletePost(id))}
      type="button"
    >
      {isPending ? "Deleting..." : "Delete"}
    </button>
  );
}
```

Important:

Server Functions dispatch **sequentially** from the client — a second call queues
behind the first rather than running in parallel. That keeps mutations ordered,
but it means firing many actions at once serialises them.

For independent parallel work, prefer a single action that does the batch.

## 11. What Are Route Handlers, And When Do You Need Them?

Route Handlers define HTTP endpoints in `route.ts` using the Web `Request` and
`Response` APIs.

```ts
// app/api/posts/route.ts
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? 10);
  return NextResponse.json(await db.post.findMany({ take: limit }));
}

export async function POST(request: Request) {
  const body = await request.json();

  if (!body.title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  return NextResponse.json(await db.post.create({ data: body }), { status: 201 });
}
```

Dynamic segments — `params` is a Promise here too:

```ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const post = await db.post.findUnique({ where: { id } });
  return post
    ? NextResponse.json(post)
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
```

Supported methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.

When to use which:

| Need | Use |
| --- | --- |
| A mutation from your own UI | Server Function |
| A public API for external clients | Route Handler |
| Webhook receiver | Route Handler |
| Reading data for your own pages | fetch directly in a Server Component |

Important:

`route.ts` and `page.tsx` cannot coexist in one folder.

## 12. How Do You Choose A Cache Update After A Mutation?

Four options, for four situations.

| Approach | Effect |
| --- | --- |
| `updateTag(tag)` | expires immediately; Server Actions only |
| `revalidateTag(tag, profile)` | stale-while-revalidate; actions and handlers |
| `revalidatePath(path)` | invalidates a route |
| `router.refresh()` | re-fetches the current route, keeps client state |

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

The rule:

Use `updateTag` when the person who made the change must see it — read-your-own-
writes. Use `revalidateTag` when a few seconds of staleness is fine and you would
rather nobody wait.

## 13. What Is `refresh()`, And How Is It Different From `router.refresh()`?

`refresh()` from `next/cache` refreshes the client router **from inside a Server
Action**.

```ts
"use server";

import { refresh } from "next/cache";

export async function toggleFavourite(id: string) {
  await db.favourite.toggle(id);
  refresh();
}
```

It can **only** be called from within a Server Action — not from Route Handlers,
Client Components, or anywhere else.

`router.refresh()` is the Client Component equivalent:

```tsx
"use client";

const router = useRouter();
await saveSomething();
router.refresh();
```

Both re-fetch server data for the current route while preserving client state.
Reach for them when a mutation did not go through a Server Function, or when the
change affects data that is not tagged.

## 14. What Is `after()`, And When Should You Use It?

`after()` schedules work to run **once the response has been sent**, so it does not
delay the user.

```ts
import { after } from "next/server";

export async function POST(request: Request) {
  const result = await save(await request.json());

  after(async () => {
    await logAnalytics({ event: "saved", id: result.id });
    await sendWebhook(result);
  });

  return Response.json(result); // returns immediately
}
```

Available in Server Components, `generateMetadata`, Server Functions, Route
Handlers, and Proxy.

Tradeoff:

Work in `after()` is best-effort. On a serverless platform the function may be
frozen once the response is sent, so anything that must not be lost belongs in a
durable queue.

## 15. How Do You Secure A Server Function?

This is the highest-value question in this area, because the framework protections
are only half the story.

**What Next.js gives you:**

- **CSRF check** — the request `Origin` is compared against `Host` (or
  `X-Forwarded-Host`); mismatches are rejected. Configure
  `serverActions.allowedOrigins` for proxy or CDN domains.
- **Body size limit** — 1MB by default, via `serverActions.bodySizeLimit`.
- **Encrypted action IDs and dead-code elimination** — unused Server Functions are
  stripped from client bundles, so they have no public endpoint.
- **Closure variable encryption** — variables captured by an inline action are
  encrypted before being sent to the client.

**What you must do yourself:**

```ts
"use server";

import { auth } from "@/lib/auth";

export async function deletePost(postId: string) {
  const session = await auth();

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  if (!(await canDelete(session.user, postId))) {
    throw new Error("Forbidden");
  }

  await db.post.delete({ where: { id: postId } });
}
```

Important:

**Render-time gating is not a security boundary.** Only rendering a form on an
authenticated page does not protect the action — the POST can be sent without ever
loading the UI.

The ownership rule:

A client legitimately says **which** item to act on, but must not supply the row's
contents or its ownership. Send a reference plus the change, and re-read the rest
from a trusted source:

```ts
// Unsafe: the whole item, including its id, comes from the client
export async function completeItemUnsafe(item: Item) {
  await db.item.update({ where: { id: item.id }, data: { completed: true } });
}
```

```ts
// Safe: take only the change, derive identity from the session
export async function completeItem(itemId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await db.item.update({
    where: { id: itemId, ownerId: session.user.id }, // ownership in the query
    data: { completed: true },
  });
}
```

Also constrain what you return — action return values are serialised to the
client, so shape them to what the UI renders rather than returning raw database
records.

Edge case:

For self-hosted, multi-instance deployments, set
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` to a stable key shared across instances.
Without it, each instance generates its own and actions fail across replicas.

## 16. How Do You Configure Server Actions?

```ts
const nextConfig: NextConfig = {
  serverActions: {
    allowedOrigins: ["my-proxy.com", "*.my-proxy.com"],
    bodySizeLimit: "2mb",
  },
};
```

`allowedOrigins` is needed when the app sits behind a proxy, CDN, or tunnel, since
the CSRF check would otherwise see a mismatched `Origin`. This is the usual cause
of actions working locally and failing behind a load balancer.

`bodySizeLimit` accepts bytes or a string such as `'500kb'` or `'3mb'`. Raise it
only as far as needed — the limit is a denial-of-service protection.

Interview note:

For genuinely large uploads, do not raise this limit. Upload directly to object
storage with a presigned URL and send only the resulting key through the action.

## 17. How Do You Handle Errors In An Action?

Return expected errors; throw unexpected ones.

```ts
"use server";

export async function createPost(prevState: unknown, formData: FormData) {
  const title = formData.get("title");

  if (!title) {
    return { error: "Title is required" }; // expected -> render inline
  }

  try {
    await db.post.create({ data: { title: title as string } });
  } catch (error) {
    console.error(error);
    return { error: "Could not save. Please try again." };
  }

  redirect("/posts");
}
```

Important:

`redirect()` works by throwing an internal signal. Calling it **inside** a
`try`/`catch` means the catch swallows it and the redirect never happens. Call it
after the block, or rethrow with `unstable_rethrow`.

With the experimental `authInterrupts` flag you can throw navigation interrupts
instead, and Next.js renders the matching segment UI:

```ts
import { unauthorized, forbidden } from "next/navigation";

if (!session) unauthorized(); // renders unauthorized.tsx
if (!allowed) forbidden();    // renders forbidden.tsx
```

## 18. How Do You Upload A File?

Small files go through `FormData` on an action, within the body size limit:

```ts
"use server";

export async function upload(formData: FormData) {
  const file = formData.get("file") as File;

  if (file.size > 1_000_000) {
    return { error: "File too large" };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  await storage.put(file.name, bytes);
}
```

Large files should bypass the server entirely with a presigned URL:

```ts
"use server";

export async function getUploadUrl(filename: string, contentType: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  return createPresignedUrl({ key: `${session.user.id}/${filename}`, contentType });
}
```

The browser then `PUT`s directly to storage, and only the resulting key is sent
back through an action.

Tradeoff:

Presigned uploads avoid the body limit and the server's bandwidth, at the cost of
more moving parts and a storage bucket policy to get right.

## 19. How Do You Fetch Data In A Client Component?

Prefer fetching on the server and passing data down. When you genuinely need
client fetching — polling, infinite scroll, or data keyed by client state — use
SWR or TanStack Query.

```tsx
"use client";

import useSWR from "swr";

export function Notifications({ initialData }: { initialData: Notification[] }) {
  const { data } = useSWR("/api/notifications", fetcher, {
    fallbackData: initialData,
    refreshInterval: 30_000,
  });

  return <List items={data} />;
}
```

The hybrid above is usually best: the server renders the first payload so there is
no loading spinner, and the client keeps it fresh.

When not to use it:

For the initial page data. A client fetch means an empty first paint, an extra
round trip, and the data is invisible to search engines.

## 20. What Are The Common Data And Mutation Gotchas?

**Calling your own API route from a Server Component** — query the database
directly instead.

**Sequential awaits that could be parallel** — `Promise.all` removes a full round
trip.

**Trusting render-time gating** — a Server Function is a public POST endpoint.

**Accepting whole objects from the client** — send an id plus the change, and
re-read ownership server-side.

**`useFormStatus` outside the form** — always returns `pending: false`.

**`redirect()` inside `try`/`catch`** — the catch swallows the signal.

**Throwing for validation errors** — return them so they render inline.

**Raising `bodySizeLimit` for uploads** — use presigned URLs instead.

**Forgetting `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`** on multi-instance self-hosted
deployments — actions fail intermittently across replicas.

Strong answer:

> Server Functions look like local function calls but compile to a POST endpoint
> with a generated id, so I treat every one as untrusted input. The framework
> gives me a CSRF origin check, a body limit, and encrypted action ids, but
> authentication, authorisation, and ownership are mine. The rule I follow is to
> accept a reference and a change from the client, and read everything else from
> the session.

## Sources Used

- <https://nextjs.org/docs/app/getting-started/fetching-data>
- <https://nextjs.org/docs/app/getting-started/mutating-data>
- <https://nextjs.org/docs/app/guides/server-actions>
- <https://nextjs.org/docs/app/guides/forms>
- <https://nextjs.org/docs/app/guides/data-security>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions>
- <https://nextjs.org/docs/app/api-reference/components/form>
- <https://nextjs.org/docs/app/api-reference/functions/after>
- <https://nextjs.org/docs/app/api-reference/functions/refresh>
- <https://nextjs.org/docs/app/api-reference/file-conventions/route>
