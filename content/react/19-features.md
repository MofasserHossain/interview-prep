# React 19 Features Interview Guide

React 19 interview guidance covering Actions, form hooks, `use`, optimistic UI,
Server Components, Server Functions, refs, metadata, assets, static APIs, and
React 19.2 additions.

For interviews, describe React 19 as the release that made async mutations,
forms, framework-level rendering, and resource handling more first-class in
React itself.

## Course Topic Map

- Actions and form actions
- `useActionState`, `useFormStatus`, and the old `useFormState` name
- `useOptimistic` for optimistic UI
- `use` for promises and context during render
- React Server Components and Server Functions
- refs as props and ref cleanup callbacks
- document metadata, stylesheets, scripts, and resource hints
- static rendering APIs
- React 19.2 additions such as `useEffectEvent`, `<Activity>`, and
  `cacheSignal`

## 1. What Changed In React 19?

React 19 added stable APIs for common async and full-stack React workflows.

Key features:

- Actions for async mutations
- form actions
- `useActionState`
- `useOptimistic`
- `useFormStatus` from `react-dom`
- `use` for promises and context
- React Server Components support for frameworks
- Server Functions
- refs as props
- ref cleanup callbacks
- context provider shorthand
- document metadata support
- stylesheet, script, preload, and preinit support
- improved hydration and error reporting
- static rendering APIs like `prerender`
- improved Custom Element support

Strong interview answer:

> React 19 is mostly about async workflows and framework-level rendering:
> Actions, form status, optimistic state, `use`, Server Components, Server
> Functions, better refs, metadata, asset handling, and static APIs.

## 2. What Are Actions In React 19?

Actions are functions that perform async mutations and integrate with React's
pending, error, optimistic, and form behavior.

Example:

```tsx
function RenameForm() {
  async function rename(formData: FormData) {
    await updateName(String(formData.get("name")));
  }

  return (
    <form action={rename}>
      <input name="name" />
      <button type="submit">Save</button>
    </form>
  );
}
```

Why it matters:

Before Actions, teams often repeated the same mutation boilerplate:
`isLoading`, `error`, submit handling, optimistic state, and cleanup. Actions
give React and frameworks a common mutation model.

Tradeoff:

Actions are not a replacement for validation, authorization, idempotency,
database transactions, or server-side error handling.

## 3. How Are Form Actions Different From `onSubmit`?

An `onSubmit` handler is a normal event handler. You manually prevent default,
collect data, call async work, and update local state.

Example:

```tsx
async function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  await saveProfile(formData);
}
```

A form `action` lets React treat the mutation as an Action:

```tsx
async function saveProfileAction(formData: FormData) {
  await saveProfile(formData);
}

return <form action={saveProfileAction}>...</form>;
```

Why it matters:

Form Actions compose with `useActionState`, `useFormStatus`, and framework
server mutations.

Tradeoff:

For purely client-side interactions that are not form submissions, a normal
event handler can still be simpler.

## 4. How Does `useActionState` Work?

`useActionState` wraps an Action and gives the component the latest action
state, a form action function, and pending status.

Example:

```tsx
const [message, submit, isPending] = useActionState(
  async (_previousMessage: string | null, formData: FormData) => {
    const email = String(formData.get("email"));
    return subscribe(email);
  },
  null,
);

return (
  <form action={submit}>
    <input name="email" type="email" />
    <button disabled={isPending}>Subscribe</button>
    {message ? <p>{message}</p> : null}
  </form>
);
```

Why it matters:

The hook keeps the mutation result next to the UI that needs it. That is often
cleaner than manually coordinating local state and try/catch blocks.

## 5. Is `useFormState` A React 19 Hook?

Use `useActionState` in stable React 19 answers.

`useFormState` was an earlier canary name exposed from `react-dom`. It was
renamed to `useActionState` and moved to `react` for the stable React 19 API.

Interview-safe phrasing:

> If someone says `useFormState`, I would clarify that the stable React 19 API
> is `useActionState`. It serves the same general purpose: track an Action's
> result and pending state.

Why it matters:

Using the stable name avoids outdated examples and helps interview answers
match current React docs.

## 6. How Does `useFormStatus` Work?

`useFormStatus` is a `react-dom` hook that reads the status of the nearest
parent form.

Example:

```tsx
import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();

  return <button disabled={pending}>Save</button>;
}

function ProfileForm({ action }: { action: (data: FormData) => void }) {
  return (
    <form action={action}>
      <input name="displayName" />
      <SubmitButton />
    </form>
  );
}
```

Why it matters:

Design system buttons can show pending UI without every form manually passing
status props.

Tradeoff:

The hook only reads the nearest parent form. If the status belongs to a wider
workflow, use `useActionState`, local state, or framework mutation state.

## 7. How Does `useOptimistic` Work?

`useOptimistic` shows an expected UI state while an async Action is pending.

Example:

```tsx
const [optimisticTodos, addOptimisticTodo] = useOptimistic(
  todos,
  (currentTodos, title: string) => [
    ...currentTodos,
    { id: "pending", title, pending: true },
  ],
);

async function addTodo(formData: FormData) {
  const title = String(formData.get("title"));
  addOptimisticTodo(title);
  await saveTodo(title);
}
```

Why it matters:

Optimistic UI makes an app feel faster when the expected server result is
predictable.

Tradeoffs:

- handle rollback or error display
- prevent duplicate submissions
- replace temporary IDs with real IDs
- avoid optimistic UI for destructive or uncertain operations

## 8. What Is The React 19 `use` API?

`use` reads a resource during render. In React 19, it can read promises and
context.

Example with a promise:

```tsx
function Product({ productPromise }: { productPromise: Promise<Product> }) {
  const product = use(productPromise);

  return <h2>{product.name}</h2>;
}
```

If the promise is pending, React can suspend the component and show the nearest
Suspense fallback.

Example with context:

```tsx
function Heading({ muted }: { muted: boolean }) {
  if (muted) {
    return <h2>Muted</h2>;
  }

  const theme = use(ThemeContext);
  return <h2 className={theme.heading}>Dashboard</h2>;
}
```

Important difference:

`use` can be called conditionally in render, unlike normal hooks. It still must
be called during render, not inside event handlers or effects.

Tradeoff:

Promise creation and caching matter. Creating a new promise on every render can
cause repeated suspension or repeated work.

## 9. What Should You Know About React Server Components In React 19?

React Server Components let supported frameworks render some components in a
server environment before bundling or client hydration.

They can:

- keep secrets and database access off the client
- reduce client JavaScript
- render close to the data source
- stream UI through Suspense boundaries

Example mental model:

```tsx
export default async function ProductPage({ id }: { id: string }) {
  const product = await db.product.find(id);

  return <ProductDetails product={product} />;
}
```

Tradeoff:

Server Components are not a replacement for Client Components. Client
Components are still needed for state, effects, browser APIs, and event
handlers.

## 10. What Are Server Functions In React 19?

Server Functions are functions that run on the server and can be called from
client-side interactions when a framework supports the integration.

Example mental model:

```tsx
async function updateProfile(formData: FormData) {
  "use server";

  await db.profile.update({
    name: String(formData.get("name")),
  });
}
```

Why it matters:

Server Functions pair naturally with Actions and form actions. They let a
framework keep mutation logic on the server while exposing a callable reference
to the client UI.

Tradeoff:

Treat every server function as an untrusted entry point. Validate input,
authorize the user, and handle failures server-side.

## 11. What Changed For Refs In React 19?

React 19 lets function components receive `ref` as a normal prop, reducing the
need for `forwardRef` in many new components.

Example:

```tsx
function TextInput({ ref, label }: { ref: React.Ref<HTMLInputElement>; label: string }) {
  return (
    <label>
      {label}
      <input ref={ref} />
    </label>
  );
}
```

Existing `forwardRef` code still works.

Tradeoff:

For shared libraries, consider which React versions you support before
replacing `forwardRef`.

## 12. What Are Ref Cleanup Functions?

React 19 supports cleanup functions from ref callbacks.

Example:

```tsx
<input
  ref={(node) => {
    if (!node) return;

    observe(node);

    return () => unobserve(node);
  }}
/>
```

Why it matters:

This is useful for DOM observation, measurement libraries, focus management,
and integrations that need cleanup when a node is removed.

Tradeoff:

Prefer simple object refs for normal DOM access. Use callback refs and cleanup
when lifecycle around the node itself matters.

## 13. What Is Context Provider Shorthand In React 19?

React 19 lets you render the context object itself as a provider.

Before:

```tsx
<ThemeContext.Provider value={theme}>
  <App />
</ThemeContext.Provider>
```

React 19:

```tsx
<ThemeContext value={theme}>
  <App />
</ThemeContext>
```

Why it matters:

This makes providers less noisy, especially in app shells with several
providers.

Tradeoff:

Existing `.Provider` usage is still valid. In mixed-version libraries, keep the
older style if React 18 support is required.

## 14. What Improved Around Errors And Hydration In React 19?

React 19 improved error reporting and hydration mismatch messages.

Why it matters:

Hydration errors used to be difficult to diagnose because the message often
did not show the exact mismatch. Better diagnostics make server/client
rendering issues easier to fix.

Common hydration mismatch causes:

- reading `Date.now()` or `Math.random()` during render
- rendering browser-only data on the server
- locale differences between server and client
- invalid HTML nesting
- data changing between server render and hydration

Strong interview answer:

> I prevent hydration bugs by keeping the first client render consistent with
> the server HTML. Browser-only values belong in effects or client-only
> boundaries.

## 15. What React 19 Metadata Features Matter?

React 19 supports rendering document metadata such as `<title>`, `<meta>`, and
`<link>` inside components.

Example:

```tsx
function ProductPage({ product }: { product: Product }) {
  return (
    <>
      <title>{product.name}</title>
      <meta name="description" content={product.summary} />
      <h1>{product.name}</h1>
    </>
  );
}
```

Why it matters:

React can coordinate metadata declared by components instead of requiring every
app to use a separate document-head library.

Tradeoff:

Framework conventions still matter. In Next.js, route metadata is often better
handled through Next's metadata APIs.

## 16. What Changed For Stylesheets, Scripts, And Resource Hints?

React 19 improved support for stylesheets, async scripts, preloading, and
preinitializing resources.

Examples:

```tsx
<link rel="stylesheet" href="/theme.css" precedence="default" />
<script async src="/analytics.js" />
```

React DOM also exposes resource hint APIs such as `preload`, `preinit`,
`preconnect`, and `prefetchDNS`.

Why it matters:

Frameworks and component libraries can coordinate resource loading more
predictably and avoid duplicated scripts or ordering bugs.

Tradeoff:

Do not scatter resource hints everywhere. Use them for important resources that
are needed soon and verify the network impact.

## 17. What Are React 19 Static APIs?

React 19 added static rendering APIs for prerendering pages into static HTML.

Examples include:

- `prerender`
- `prerenderToNodeStream`

Why it matters:

Static APIs help frameworks generate static HTML while still integrating with
React's rendering model.

Tradeoff:

Most application teams use these indirectly through a framework. In Next.js,
the framework decides how static generation, streaming, caching, and
revalidation fit together.

## 18. What Changed For Custom Elements In React 19?

React 19 improved Custom Element support.

Why it matters:

React apps sometimes need to use Web Components from design systems or
third-party widgets. Better Custom Element behavior reduces wrapper code and
edge cases around properties and attributes.

Example:

```tsx
<date-picker value={selectedDate} onchange={handleChange}></date-picker>
```

Tradeoff:

Custom Elements can still have different event and property conventions than
React components. Test the integration carefully.

## 19. What Changed In React 19.2?

React 19.2 added more advanced APIs around effects, hidden UI, caching, and
performance tooling.

Key additions:

- `useEffectEvent`
- `<Activity>`
- `cacheSignal`
- React Performance Tracks
- partial pre-rendering support for framework authors

Example with `useEffectEvent`:

```tsx
function ChatRoom({ roomId, theme }: { roomId: string; theme: Theme }) {
  const onConnected = useEffectEvent(() => {
    showToast("Connected", theme);
  });

  useEffect(() => {
    const connection = createConnection(roomId);
    connection.on("connected", onConnected);
    connection.connect();

    return () => connection.disconnect();
  }, [roomId]);
}
```

Why it matters:

`useEffectEvent` separates non-reactive logic inside effects from dependencies
that should actually resubscribe. `<Activity>` can hide UI while preserving
state. `cacheSignal` helps cached server work clean up when React no longer
needs it.

Tradeoff:

These are advanced tools. Explain the problem they solve before reaching for
them in an app.

## 20. How Would You Adopt React 19 Features In A Real App?

Adopt React 19 features incrementally.

Practical order:

1. Upgrade React, React DOM, TypeScript types, framework, and test utilities.
2. Fix warnings and hydration errors.
3. Keep existing forms working.
4. Introduce Actions and `useActionState` in one form workflow.
5. Add `useFormStatus` to shared submit controls.
6. Add `useOptimistic` only where rollback is clear.
7. Use `use` through framework-supported patterns.
8. Keep Server Functions behind validation and authorization.
9. Profile and monitor user-facing behavior after rollout.

Strong interview answer:

> I would not rewrite every form at once. I would upgrade safely, pick one
> mutation workflow, use Actions with `useActionState`, add form status where
> it improves UX, and reserve optimistic UI for cases where rollback is simple.

## Quick Revision Checklist

Before a React 19 interview, be ready to explain:

- Actions and form actions
- `useActionState` as the stable name, not `useFormState`
- `useFormStatus` for nested form controls
- `useOptimistic` and rollback concerns
- `use` for promises and context during render
- Server Components vs Client Components
- Server Functions and security concerns
- refs as props and ref cleanup callbacks
- context provider shorthand
- metadata and asset loading support
- static APIs
- React 19.2 additions: `useEffectEvent`, `<Activity>`, and `cacheSignal`

## Sources Used

- [React v19](https://react.dev/blog/2024/12/05/react-19)
- [React 19.2](https://react.dev/blog/2025/10/01/react-19-2)
- [React use](https://react.dev/reference/react/use)
- [React useActionState](https://react.dev/reference/react/useActionState)
- [React useOptimistic](https://react.dev/reference/react/useOptimistic)
- [React DOM useFormStatus](https://react.dev/reference/react-dom/hooks/useFormStatus)
- [React Server Components](https://react.dev/reference/rsc/server-components)
- [React Server Functions](https://react.dev/reference/rsc/server-functions)
- [React DOM static APIs](https://react.dev/reference/react-dom/static)
