# Next.js Server And Client Components Interview Guide

Boundary guidance covering Server versus Client Components, what `"use client"`
and `"use server"` actually do, composition patterns, serialisation rules,
hydration mismatches, preventing theme and locale flashes, keeping server code
off the client, context providers, and client-side data fetching. Written
against **Next.js 16**.

## 1. What Is The Difference Between Server And Client Components?

Every component in `app/` is a **Server Component** by default.

| | Server Component | Client Component |
| --- | --- | --- |
| Runs | on the server only | server (prerender) **then** browser |
| Ships JavaScript | **no** | yes |
| `async` / `await` | yes | no |
| Database and secrets | yes | never |
| `useState`, `useEffect` | no | yes |
| Event handlers | no | yes |
| Browser APIs | no | yes |

```tsx
// Server Component - no directive needed
import { db } from "@/lib/db";

export default async function UsersPage() {
  const users = await db.user.findMany();
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

Benefits of the server default:

- credentials and API keys never reach the browser
- no client-side loading waterfall for initial data
- heavy dependencies such as a Markdown parser stay on the server

Interview note:

The naming misleads people. A "Client Component" still renders on the **server**
during the initial request — the name means it *also* runs on the client, not that
it runs only there.

## 2. What Does `"use client"` Actually Do?

It marks a **boundary in the module graph**, not a single file.

```txt
app/page.tsx              Server Component
└── Dashboard.tsx         "use client"  <- boundary starts here
    ├── Chart.tsx         client (imported by a Client Component)
    ├── Table.tsx         client
    └── formatters.ts     client - shipped to the browser
```

Everything **imported by** a Client Component becomes client code, whether or not
it has its own directive. One `"use client"` at the top of a page sends the entire
subtree to the browser.

```tsx
// Bad example: the whole page becomes client code
"use client";

import { Header } from "./header";
import { HeavyChart } from "./heavy-chart";
import { Footer } from "./footer";

export default function Page() {
  const [open, setOpen] = useState(false);
  return <>...</>;
}
```

```tsx
// Better: only the interactive part is a Client Component
import { Header } from "./header";
import { Footer } from "./footer";
import { Toggle } from "./toggle"; // "use client" lives here

export default function Page() {
  return (
    <>
      <Header />
      <Toggle />
      <Footer />
    </>
  );
}
```

The rule:

Push `"use client"` as far **down** the tree as possible. The boundary should wrap
the smallest component that genuinely needs state, effects, or events.

## 3. How Do You Compose Server And Client Components?

A Client Component **cannot import** a Server Component, but it can **receive one
as a prop** — usually `children`.

```tsx
// Bad: importing a Server Component turns it into client code
"use client";
import { ServerSidebar } from "./server-sidebar"; // now client
```

```tsx
// Good: pass it through from a Server Component
// app/layout.tsx - a Server Component
import { ClientShell } from "./client-shell";
import { ServerSidebar } from "./server-sidebar";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ClientShell sidebar={<ServerSidebar />}>{children}</ClientShell>;
}
```

```tsx
"use client";

export function ClientShell({
  children,
  sidebar,
}: {
  children: React.ReactNode;
  sidebar: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      {open ? sidebar : null}
      {children}
    </div>
  );
}
```

Why this works:

The Server Component is rendered **on the server**, and the Client Component
receives its finished output as an opaque `ReactNode`. It never imports the
module, so nothing is bundled.

The rule:

Client Components are holes, not roots. Slot server content into them rather than
importing it.

## 4. What Can Cross The Boundary?

Props passed from a Server Component to a Client Component must be
**serialisable**, because they travel as part of the RSC payload.

| Allowed | Not allowed |
| --- | --- |
| strings, numbers, booleans, `null` | functions (except Server Functions) |
| plain objects and arrays | class instances |
| `Date`, `Map`, `Set` | `Symbol` |
| `Promise` | closures over server state |
| JSX elements | Node.js objects (streams, handles) |

```tsx
// Bad: a function is not serialisable
<ClientChart formatter={(v) => v.toFixed(2)} />
```

```txt
Error: Functions cannot be passed directly to Client Components
```

```tsx
// Good: pass data, format on the client
<ClientChart values={values} precision={2} />
```

```tsx
// Also good: a Server Function IS allowed
import { saveItem } from "@/lib/actions";

<ClientForm onSave={saveItem} />
```

Interview note:

A Server Function passed as a prop is not really a function crossing the boundary
— it is a reference that React turns into a network call back to the server.

## 5. What Does `"use server"` Do, And How Is It Different From `"use client"`?

They are not opposites, which is a common misconception.

| | `"use client"` | `"use server"` |
| --- | --- | --- |
| Marks | a module as the client boundary | functions as **Server Functions** |
| Placed | top of a file | top of a file, or inside a function |
| Effect | code ships to the browser | creates a callable server endpoint |

```ts
// lib/actions.ts - every export becomes a Server Function
"use server";

export async function createPost(formData: FormData) {
  await db.post.create({ data: { title: formData.get("title") as string } });
}
```

```tsx
// or inline, inside a Server Component
export default function Page() {
  async function createPost(formData: FormData) {
    "use server";
    await db.post.create({ data: { title: formData.get("title") as string } });
  }

  return <form action={createPost}>...</form>;
}
```

Important:

`"use server"` does **not** mean "make this a Server Component" — components are
server-side by default. It exclusively marks functions that the client is allowed
to call.

Every Server Function is a public HTTP endpoint, so each one must validate its own
input and check authorisation.

## 6. Why Does A Client Component Still Render On The Server?

Because Next.js prerenders Client Components to HTML so the first paint has
content. React then **hydrates** that HTML in the browser.

```viz
type: flow
title: Lifecycle of a Client Component
Server prerender :: the component runs in Node, producing HTML
HTML sent :: user sees content immediately, nothing interactive yet
JS bundle downloads :: the client component code arrives
Hydration :: React attaches handlers and re-runs the render
Interactive :: state and events now work
```

Two consequences that cause real bugs:

1. The component body runs **twice** — once on the server, once on the client.
2. Anything unavailable on the server, such as `window` or `localStorage`, throws
   during that first server render.

```tsx
// Bad example: window does not exist on the server
"use client";

export function Width() {
  const [width] = useState(window.innerWidth); // ReferenceError during SSR
  return <span>{width}</span>;
}
```

```tsx
// Good: read it after mount
"use client";

export function Width() {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => setWidth(window.innerWidth), []);
  return <span>{width ?? "—"}</span>;
}
```

To skip server rendering entirely for a browser-only component:

```tsx
const Map = dynamic(() => import("./map"), { ssr: false });
```

## 7. What Causes A Hydration Mismatch?

React compares the server HTML against what the client renders. Any difference is
a hydration error.

Common causes:

| Cause | Example |
| --- | --- |
| Time and locale | `toLocaleDateString()` uses different settings |
| Randomness | `Math.random()`, `crypto.randomUUID()` |
| Browser-only state | `localStorage`, `window.matchMedia` |
| Invalid HTML nesting | `<p><div/></p>` — the browser silently fixes it |
| Browser extensions | injecting attributes into `<body>` |

```txt
Error: Text content does not match server-rendered HTML.
```

What React does on a mismatch:

Without `suppressHydrationWarning`, React treats it as an error and **recovers by
client-rendering from the nearest error or Suspense boundary**. The user sees a
flash, and any inline-script corrections to other components inside that boundary
are lost, because those scripts do not re-execute when React rebuilds the DOM.

Interview note:

Invalid HTML nesting is the sneakiest cause. The browser repairs `<div>` inside
`<p>` while parsing, so the DOM no longer matches what React produced — and the
error message points at hydration rather than at the markup.

## 8. How Do You Fix A Locale Or Timezone Hydration Mismatch?

The problem:

```tsx
"use client";

export function EventDate({ date }: { date: string }) {
  return <p>{new Date(date).toLocaleDateString()}</p>;
}
```

During SSR, `toLocaleDateString()` runs in Node and uses the **server's** locale,
producing `6/15/2026`. On hydration the browser produces the **user's** locale,
`2026/6/15`. React detects the mismatch, errors, and the user sees a flash.

Fix — an inline script that runs synchronously during HTML parsing, **before the
first paint**:

```tsx
export default async function Page() {
  const event = await getEvent("nextjs-conf");

  return (
    <section>
      <h1>{event.name}</h1>
      <p id="event-date" suppressHydrationWarning>
        {new Date(event.date).toLocaleDateString()}
      </p>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById("event-date").textContent=new Date("${event.date}").toLocaleDateString()`,
        }}
      />
    </section>
  );
}
```

Why the inline script and not `useEffect`:

- `useEffect` runs **after** hydration and paint, so the user sees the server value
  first, then a correction. Setting state in an effect also triggers a re-render,
  which can reactivate parent Suspense boundaries.
- `useLayoutEffect` runs before paint but still after hydration. On a slow
  connection the browser paints the server HTML long before React loads.
- The inline script runs during HTML **parsing**, before React is involved at all.

Interview hack:

This is easy to miss locally when your machine's locale matches your browser's.
Run the dev server with different settings to catch it:

```bash
TZ=UTC LANG=ja_JP.UTF-8 next dev
```

`TZ=UTC` is a good default, since most servers run in UTC.

## 9. How Do You Prevent A Theme Flash?

Same technique. The server renders a default theme; the user's real preference is
in `localStorage`, which the server cannot read.

```tsx
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

The script sets `data-theme` on `<html>` **before the browser paints**, so there is
no white flash before dark mode applies.

Note the `try`/`catch` — `localStorage` throws in some privacy modes, and an
uncaught error in a head script would block the rest of the page.

Alternative:

Store the theme in a **cookie** instead. The server can read it, so the correct
theme is in the initial HTML with no script at all. The tradeoff is that the route
becomes dynamic, because `cookies()` is a Request-time API.

## 10. What Does `suppressHydrationWarning` Actually Do?

It tells React: for this element, **the DOM wins**.

- **Without it** — React treats a text mismatch as an error and client-renders
  from the nearest boundary, causing a flash and discarding inline-script fixes
  elsewhere in that boundary.
- **With it** — React keeps whatever is in the DOM and discards the client's
  output for that element.

That is exactly what the inline-script pattern needs: the script has already put
the correct value in the DOM, and React should accept it.

Important:

It applies **one level deep only** — the element it is on, not its descendants. It
is not a general "ignore hydration errors" switch, and using it to silence a
mismatch you do not understand hides a real bug.

Edge case:

React warns in development when rendering produces `<script>` tags. A reusable
wrapper avoids the warning by changing the type across environments:

```tsx
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

Interview trap:

Scripts inserted via DOM updates do **not** execute. On a client-side navigation
React renders from the RSC payload and the inline script never runs — so a
component relying on it must also work as a Client Component for soft navigations.

## 11. How Do You Keep Server-Only Code Out Of The Client Bundle?

The `server-only` package turns an accidental import into a **build error**.

```ts
// lib/data.ts
import "server-only";

export async function getSecretData() {
  return db.query("SELECT * FROM secrets");
}
```

Importing that module from a Client Component now fails the build instead of
silently shipping the code.

```ts
import "client-only"; // the mirror image
```

Why it matters:

A module shared between both sides is easy to import from the wrong one.
Environment variables without `NEXT_PUBLIC_` are already stripped, but
`server-only` protects the **code**, not just the values.

Going further, the experimental `taint` config lets React reject specific objects
crossing the boundary:

```ts
const nextConfig: NextConfig = {
  experimental: { taint: true },
};
```

Enabling it also taints `process.env`, so it cannot be passed whole to a Client
Component.

## 12. How Do You Use A Third-Party Component That Needs The Client?

A package using `useState` without its own `"use client"` errors inside a Server
Component, because Next.js cannot know it needs the client.

```tsx
// app/carousel.tsx - wrap it once
"use client";

export { Carousel as default } from "acme-carousel";
```

```tsx
// app/page.tsx - a Server Component
import Carousel from "./carousel";

export default function Page() {
  return <Carousel />;
}
```

Interview note:

If you publish a component library, add `"use client"` to entry points that rely
on client-only features so consumers do not need wrappers. Some bundlers strip the
directive, so the build must be configured to preserve it.

## 13. How Do You Use Context In The App Router?

Context requires a Client Component. Mount the provider once, usually in the root
layout.

```tsx
// app/providers.tsx
"use client";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>{children}</QueryProvider>
    </ThemeProvider>
  );
}
```

```tsx
// app/layout.tsx - still a Server Component
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

Because `children` is passed **through** the provider rather than imported by it,
the rest of the tree stays server-rendered.

Important:

Server Components cannot consume context. Data they need should be fetched
directly or passed as props — which is usually simpler, since a Server Component
can just query the database.

## 14. How Do You Fetch Data In A Client Component?

Prefer fetching in a Server Component and passing the data down. When you
genuinely need client fetching — polling, infinite scroll, or data that depends on
client state — use SWR or TanStack Query.

```tsx
"use client";

import useSWR from "swr";

export function Notifications() {
  const { data, error, isLoading } = useSWR("/api/notifications", fetcher, {
    refreshInterval: 30_000,
  });

  if (isLoading) return <Skeleton />;
  if (error) return <Error />;
  return <List items={data} />;
}
```

A common hybrid is server-rendered initial data with client revalidation:

```tsx
// Server Component
const initial = await getNotifications();
return <Notifications initialData={initial} />;
```

```tsx
"use client";

const { data } = useSWR("/api/notifications", fetcher, { fallbackData: initialData });
```

The user sees content immediately, and it stays fresh afterwards.

When to use which:

| Need | Approach |
| --- | --- |
| Initial page data | Server Component |
| Polling or real-time | SWR / TanStack Query |
| Depends on client state | client fetch |
| Mutations | Server Function |

## 15. How Do You Preserve UI State Across Navigation?

Layouts do not unmount, so anything inside one keeps its state. For finer control,
React's `<Activity>` can keep hidden content mounted rather than destroying it.

```tsx
"use client";

import { Activity } from "react";

export function Tabs({ active }: { active: string }) {
  return (
    <>
      <Activity mode={active === "a" ? "visible" : "hidden"}>
        <PanelA />
      </Activity>
      <Activity mode={active === "b" ? "visible" : "hidden"}>
        <PanelB />
      </Activity>
    </>
  );
}
```

Hidden content keeps its state and its DOM, so switching tabs does not lose scroll
position, form input, or fetched data.

Tradeoff:

Keeping content mounted costs memory, and effects in hidden subtrees are cleaned
up rather than left running. Use it for a handful of panels, not for a long list.

Simplest option first:

Put the state in the **URL**. It survives refresh, is shareable, and needs no
client state at all:

```tsx
const tab = useSearchParams().get("tab") ?? "overview";
```

## 16. Where Should The Boundary Go For The Smallest Bundle?

Work inward from the leaves.

```tsx
// Bad: the whole page is client code because of one button
"use client";

export default function ProductPage({ product }) {
  const [qty, setQty] = useState(1);
  return (
    <>
      <ProductGallery images={product.images} />  {/* heavy, static */}
      <ProductDescription html={product.html} />  {/* heavy, static */}
      <button onClick={() => setQty(qty + 1)}>+</button>
    </>
  );
}
```

```tsx
// Better: only the quantity picker ships
export default function ProductPage({ product }) {
  return (
    <>
      <ProductGallery images={product.images} />     {/* server */}
      <ProductDescription html={product.html} />     {/* server */}
      <QuantityPicker />                              {/* "use client" */}
    </>
  );
}
```

Checklist for deciding:

1. Does it need state, effects, events, or browser APIs? If not, leave it on the
   server.
2. If part of it does, can that part be extracted into a smaller component?
3. Does it import something heavy that would now ship to the browser?

## 17. How Do You Handle CSS-in-JS?

Runtime CSS-in-JS libraries need a Client Component and a style registry, because
they generate styles during render.

```tsx
"use client";

import { useServerInsertedHTML } from "next/navigation";

export function StyleRegistry({ children }: { children: React.ReactNode }) {
  const [sheet] = useState(() => new ServerStyleSheet());

  useServerInsertedHTML(() => sheet.getStyleElement());

  return <StyleSheetManager sheet={sheet.instance}>{children}</StyleSheetManager>;
}
```

`useServerInsertedHTML` is the hook Next.js provides for injecting collected
styles into the streamed HTML.

Tradeoff:

Runtime CSS-in-JS forces a client boundary high in the tree, which works against
Server Components. Zero-runtime options — CSS Modules, plain CSS, or a
compile-time library — keep more of the tree on the server.

## 18. How Do You Debug Boundary Errors?

```txt
Error: You're importing a component that needs `useState`.
It only works in a Client Component, but none of its parents are marked
with "use client".
```

Method:

1. Read the import chain in the error — it names the file that needs the client.
2. Decide **where** the boundary belongs: usually on that component, not on the
   page importing it.
3. If it is third-party, wrap it in your own `"use client"` re-export.

```txt
Error: Functions cannot be passed directly to Client Components.
```

You passed a callback across the boundary. Either move the logic into the Client
Component, or make it a Server Function with `"use server"`.

```txt
Error: Text content does not match server-rendered HTML.
```

Something rendered differently on the two passes — check for dates, randomness,
`localStorage`, or invalid HTML nesting.

## 19. When Should You Reach For A Client Component?

Use one when the component needs:

- `useState`, `useReducer`, `useEffect`, or any hook with client state
- event handlers such as `onClick` or `onChange`
- browser APIs — `window`, `localStorage`, `IntersectionObserver`
- a class component
- a library that depends on any of the above

Keep it a Server Component when it only needs to:

- fetch data
- read secrets or query the database
- render static markup
- use a heavy formatting or parsing dependency

Strong answer:

> I default to Server Components and add `"use client"` only at the leaf that
> genuinely needs interactivity. The directive is a boundary in the module graph,
> so anything it imports ships too — which means the real skill is keeping that
> boundary small and slotting server content in as `children` rather than
> importing it.

## 20. What Are The Common Boundary Gotchas?

**`"use client"` at the top of a page** — the whole subtree becomes client code.

**Importing a Server Component into a Client Component** — it silently becomes
client code; pass it as `children` instead.

**Passing a function as a prop** — not serialisable unless it is a Server
Function.

**Assuming a Client Component runs only in the browser** — it prerenders on the
server, so `window` throws.

**`useEffect` to fix a flash** — it runs after paint, so the flash still happens;
use an inline script.

**`suppressHydrationWarning` to silence an error you have not diagnosed** — it
hides a real mismatch and only applies one level deep.

**Forgetting `try`/`catch` around `localStorage`** in a head script — it throws in
private mode and blocks the page.

**A provider that imports its children** rather than accepting them — it drags the
whole tree client-side.

## Sources Used

- <https://nextjs.org/docs/app/getting-started/server-and-client-components>
- <https://nextjs.org/docs/app/guides/server-and-client-boundary>
- <https://nextjs.org/docs/app/api-reference/directives/use-client>
- <https://nextjs.org/docs/app/api-reference/directives/use-server>
- <https://nextjs.org/docs/app/guides/preventing-flash-before-hydration>
- <https://nextjs.org/docs/app/guides/preserving-ui-state>
- <https://nextjs.org/docs/app/guides/client-side-data-fetching>
- <https://nextjs.org/docs/app/guides/css-in-js>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/taint>
