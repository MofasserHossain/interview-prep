# React Core Concepts Through React 17 Interview Guide

React interview guidance covering the core concepts that matter before React
18: components, JSX, props, state, lifecycle, forms, composition, context,
refs, portals, error boundaries, higher-order components, render props, pure
components, memoization, and hooks.

Hooks arrived in React 16.8. React 17 was mainly a compatibility and gradual
upgrade release, not a release with a new hook set. Treat this guide as the
classic React foundation from beginner to advanced before studying React 18
and React 19 release features separately.

## Course Topic Map

- Beginner: components, JSX, props, state, events, conditional rendering, lists,
  keys, and forms
- Intermediate: controlled vs uncontrolled inputs, lifting state, composition,
  Context, refs, portals, fragments, and effects
- Advanced: class lifecycle, HOCs, render props, pure components,
  `React.memo`, reconciliation, error boundaries, custom hooks, and hook
  dependency traps
- React 17 context: gradual upgrades, root-level event delegation, no event
  pooling on the web, and the new JSX transform

## 1. What Is React?

React is a JavaScript library for building user interfaces from components.
Components receive input through props, hold local state when needed, and return
UI.

Example:

```tsx
function Greeting({ name }: { name: string }) {
  return <h1>Hello {name}</h1>;
}
```

Why it matters:

React lets developers split UI into reusable pieces and describe what the UI
should look like for a given state. React then updates the DOM when that state
changes.

Strong interview answer:

> React is a component-based UI library. I think of a component as a function
> from props and state to UI, with effects used only when the component needs
> to synchronize with something outside React.

## 2. What Is JSX?

JSX is a JavaScript syntax extension that lets you write markup-like UI inside
JavaScript or TypeScript.

Example:

```tsx
const element = <button disabled={isSaving}>Save</button>;
```

JSX is compiled into JavaScript calls that create React elements.

Why it matters:

JSX keeps component rendering logic and UI structure close together. It also
lets you use JavaScript expressions directly inside markup.

Tradeoff:

JSX is not HTML. Attribute names often use JavaScript-style names, such as
`className`, `htmlFor`, and camel-cased event handlers like `onClick`.

## 3. What Is A Component?

A component is a reusable unit of UI. It can be a function component or a class
component.

Function component:

```tsx
function UserCard({ name }: { name: string }) {
  return <article>{name}</article>;
}
```

Class component:

```tsx
class UserCard extends React.Component<{ name: string }> {
  render() {
    return <article>{this.props.name}</article>;
  }
}
```

Modern React usually prefers function components with hooks. Class components
still appear in older codebases and are still useful to understand for
lifecycle and error boundary questions.

## 4. Stateless vs Stateful Components

A stateless component receives props and renders UI without owning changing
state.

```tsx
function Price({ amount }: { amount: number }) {
  return <span>${amount}</span>;
}
```

A stateful component owns state that can change over time.

```tsx
function Counter() {
  const [count, setCount] = useState(0);

  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

Why it matters:

Stateless components are easier to test and reuse. Stateful components are
needed for local interaction, forms, and UI flows.

Tradeoff:

Putting state too high causes unnecessary re-renders and prop drilling. Putting
state too low can make sibling coordination difficult.

## 5. Props vs State

Props are inputs passed from a parent component. A child should treat props as
read-only.

State is data owned by a component that changes over time and can trigger a
re-render.

Example:

```tsx
function UserRow({ user }: { user: User }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button onClick={() => setExpanded(!expanded)}>
      {user.name} {expanded ? "open" : "closed"}
    </button>
  );
}
```

Why it matters:

Props model parent-to-child data flow. State models interaction and local
memory.

Interview line:

> Props are owned by the parent. State is owned by the component that changes
> it.

## 6. What Is One-Way Data Flow?

One-way data flow means data usually moves from parent to child through props,
and changes move upward through callbacks.

Example:

```tsx
function Parent() {
  const [name, setName] = useState("");

  return <NameInput value={name} onChange={setName} />;
}
```

Why it matters:

One-way data flow makes ownership clear. You can usually find the source of
truth by walking up the component tree.

Tradeoff:

Deeply passing props through many layers becomes prop drilling. Composition,
Context, or a state library can help when the same data is needed far away.

## 7. What Is Conditional Rendering?

Conditional rendering means returning different UI based on state or props.

Examples:

```tsx
return isLoggedIn ? <Dashboard /> : <LoginPage />;
```

```tsx
return (
  <>
    {error ? <ErrorMessage error={error} /> : null}
    {items.length > 0 && <ItemList items={items} />}
  </>
);
```

Why it matters:

Real interfaces often depend on loading, empty, error, permission, and success
states.

Tradeoff:

Avoid deeply nested conditional JSX. Extract small components when the render
path becomes hard to read.

## 8. How Do Lists And Keys Work?

React uses keys to match list items between renders.

Example:

```tsx
{users.map((user) => (
  <UserRow key={user.id} user={user} />
))}
```

Why it matters:

Stable keys help React preserve the right component state when items are
inserted, removed, or reordered.

Interview trap:

Array indexes are risky keys when list order can change. They can make state,
focus, or animations attach to the wrong row.

## 9. What Is Reconciliation?

Reconciliation is React's process of comparing the previous element tree with
the next element tree and deciding what work is needed.

React uses component type and keys to decide whether to preserve or replace
parts of the tree.

Example:

```tsx
return isEditing ? <Editor key="edit" /> : <Preview key="preview" />;
```

Changing the key tells React to treat the component as a different instance.

Why it matters:

Reconciliation explains why stable keys matter and why moving state to the
right component changes rendering behavior.

## 10. Controlled vs Uncontrolled Components

A controlled input is driven by React state.

```tsx
const [email, setEmail] = useState("");

return <input value={email} onChange={(event) => setEmail(event.target.value)} />;
```

An uncontrolled input stores its current value in the DOM.

```tsx
const inputRef = useRef<HTMLInputElement>(null);

return <input ref={inputRef} defaultValue="hello@example.com" />;
```

Use controlled inputs when validation, formatting, conditional UI, or submit
state depends on the value.

Use uncontrolled inputs when you only need the value at submit time or when
integrating with non-React code.

## 11. What Is Lifting State Up?

Lifting state up means moving state to the nearest common parent that needs to
coordinate multiple children.

Example:

```tsx
function Accordion() {
  const [openId, setOpenId] = useState<string | null>(null);

  return items.map((item) => (
    <Panel
      key={item.id}
      item={item}
      open={openId === item.id}
      onOpen={() => setOpenId(item.id)}
    />
  ));
}
```

Why it matters:

If siblings need to agree about selected item, open panel, or shared form data,
their common parent should usually own that state.

Tradeoff:

Do not lift state all the way to the app root by default. Keep state as local
as the workflow allows.

## 12. Composition vs Inheritance

React favors composition over inheritance. Instead of subclassing components,
you pass children, render slots, or smaller components into a parent.

Example:

```tsx
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
```

Why it matters:

Composition keeps components flexible without coupling them to a deep class
hierarchy.

Interview line:

> In React, I usually reuse UI through composition: props, children, slots, and
> custom hooks rather than inheritance.

## 13. What Is Context?

Context lets a component read a value from the nearest provider above it
without passing that value through every intermediate component.

Example:

```tsx
const ThemeContext = createContext("light");

function Toolbar() {
  const theme = useContext(ThemeContext);

  return <div data-theme={theme}>Tools</div>;
}
```

Use context for values many components need:

- theme
- locale
- authenticated user summary
- feature flags
- app-level service objects

Tradeoff:

Every consumer can re-render when the context value changes. Split context or
use a state library when updates need fine-grained subscriptions.

## 14. What Are Refs?

Refs hold mutable values that persist between renders. They are commonly used
to access DOM nodes or store instance-like values.

Example:

```tsx
const inputRef = useRef<HTMLInputElement>(null);

function focusInput() {
  inputRef.current?.focus();
}

return <input ref={inputRef} />;
```

Why it matters:

Refs are useful for focus, selection, measuring DOM nodes, timers, and
integrating non-React libraries.

Tradeoff:

Refs are not reactive. If changing a value should update the UI, use state.

## 15. What Are Fragments?

Fragments let a component return multiple elements without adding an extra DOM
node.

Example:

```tsx
return (
  <>
    <dt>Name</dt>
    <dd>{name}</dd>
  </>
);
```

Why it matters:

Extra wrapper elements can break layouts, table structures, definition lists,
and CSS selectors.

Tradeoff:

Use the long form when a fragment needs a key:

```tsx
<React.Fragment key={item.id}>
  <dt>{item.label}</dt>
  <dd>{item.value}</dd>
</React.Fragment>
```

## 16. What Are Portals?

Portals render children into a DOM node outside the parent component's DOM
hierarchy while keeping them in the React tree.

Example:

```tsx
createPortal(<Modal onClose={onClose} />, document.body);
```

Use portals for:

- modals
- tooltips
- dropdowns
- popovers
- overlays

Why it matters:

Portals solve layout and stacking problems when an overlay should escape
overflow or z-index boundaries.

Tradeoff:

Events still bubble through the React tree, not only the DOM tree. That can be
useful but surprising.

## 17. What Are Error Boundaries?

Error boundaries catch rendering errors in child components and show fallback
UI.

Example:

```tsx
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (this.state.hasError) {
      return <h1>Something went wrong</h1>;
    }

    return this.props.children;
  }
}
```

They do not catch errors in event handlers, async callbacks, or server-side
rendering.

Why it matters:

Error boundaries keep one broken section from crashing the entire React tree.

## 18. What Are Lifecycle Methods?

Class component lifecycle methods run at specific points in a component's life.

Common lifecycle methods:

- `componentDidMount`: run after first mount
- `componentDidUpdate`: run after updates
- `componentWillUnmount`: cleanup before unmount
- `shouldComponentUpdate`: decide whether a class component should re-render
- `getDerivedStateFromError`: render fallback UI after an error
- `componentDidCatch`: log error boundary details

Hooks often combine lifecycle-style logic in `useEffect`:

```tsx
useEffect(() => {
  subscribe(id);

  return () => unsubscribe(id);
}, [id]);
```

Interview line:

> Effects are not a one-to-one lifecycle replacement. They synchronize with an
> external system for a particular render.

## 19. What Is A Pure Component?

A pure component renders the same output for the same props and state and does
not cause side effects during render.

Class API:

```tsx
class UserRow extends React.PureComponent<{ user: User }> {
  render() {
    return <div>{this.props.user.name}</div>;
  }
}
```

Function component equivalent:

```tsx
const UserRow = React.memo(function UserRow({ user }: { user: User }) {
  return <div>{user.name}</div>;
});
```

Why it matters:

Purity lets React safely re-render, skip rendering, retry rendering, and
optimize work.

Tradeoff:

`PureComponent` and `React.memo` use shallow comparison. New object, array, or
function references can still trigger renders.

## 20. What Is A Higher-Order Component?

A higher-order component, or HOC, is a function that takes a component and
returns an enhanced component.

Example:

```tsx
function withAuth<P>(Component: React.ComponentType<P>) {
  return function AuthenticatedComponent(props: P) {
    const user = useCurrentUser();

    if (!user) {
      return <LoginPrompt />;
    }

    return <Component {...props} />;
  };
}
```

Why it matters:

Before hooks, HOCs were a common way to reuse stateful logic such as auth,
subscriptions, analytics, and data loading.

Tradeoff:

HOCs can create wrapper-heavy trees, prop collisions, and unclear data flow.
Modern React often prefers custom hooks plus composition.

## 21. What Is The Render Props Pattern?

Render props means passing a function prop that returns UI.

Example:

```tsx
function MouseTracker({
  children,
}: {
  children: (point: { x: number; y: number }) => React.ReactNode;
}) {
  const point = useMousePosition();

  return <>{children(point)}</>;
}
```

Use:

```tsx
<MouseTracker>
  {({ x, y }) => <p>{x}, {y}</p>}
</MouseTracker>
```

Why it matters:

Render props were a flexible way to share behavior before custom hooks became
the common choice.

Tradeoff:

Render props can add nesting and make JSX harder to scan. Custom hooks are
often cleaner for reusable behavior.

## 22. What Is `React.memo`?

`React.memo` memoizes a function component. React can skip rendering it when
its props are shallowly equal.

Example:

```tsx
const UserCard = React.memo(function UserCard({ name }: { name: string }) {
  return <p>{name}</p>;
});
```

Use it when:

- the component renders often
- rendering is expensive
- props are stable between renders

Tradeoff:

Do not wrap every component in `memo`. It adds comparison work and can hide
simpler state-design problems.

## 23. Why Were Hooks Introduced?

Hooks let function components use state and React features without classes.
They also let teams reuse stateful logic without wrapper-heavy patterns like
HOCs and render props.

Example:

```tsx
function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
```

Why it matters:

Hooks keep related setup, update, and cleanup logic together and avoid class
`this` binding problems.

Tradeoff:

Hooks require correct dependency arrays and stable call order.

## 24. What Are The Rules Of Hooks?

Hooks must be called at the top level of a React function component or another
custom hook.

Rules:

- only call hooks at the top level
- only call hooks from React functions

Bad:

```tsx
if (isLoggedIn) {
  const [user, setUser] = useState(null);
}
```

Good:

```tsx
const [user, setUser] = useState(null);

if (!isLoggedIn) {
  return null;
}
```

Why it matters:

React associates hook state with call order. Conditional hook calls can attach
state to the wrong hook on the next render.

## 25. How Does `useState` Work?

`useState` stores local reactive state. Updating state schedules a render with
the new value.

Example:

```tsx
function Toggle() {
  const [open, setOpen] = useState(false);

  return <button onClick={() => setOpen((value) => !value)}>{open ? "Close" : "Open"}</button>;
}
```

Use a functional update when the next value depends on the previous value:

```tsx
setCount((count) => count + 1);
```

Tradeoff:

Do not mutate object or array state in place. Return a new reference so React
can see that state changed.

## 26. How Does `useEffect` Work?

`useEffect` runs after React commits a render. Use it to synchronize with
external systems.

Example:

```tsx
useEffect(() => {
  const controller = new AbortController();

  fetch(`/api/users/${userId}`, { signal: controller.signal });

  return () => controller.abort();
}, [userId]);
```

Use effects for:

- subscriptions
- timers
- browser APIs
- network requests caused by client-only state
- analytics

Interview trap:

Do not use effects for values that can be calculated during render.

## 27. How Do Effect Dependencies Work?

The dependency array tells React when an effect should re-run.

Example:

```tsx
useEffect(() => {
  document.title = `${unreadCount} unread`;
}, [unreadCount]);
```

Common forms:

- no dependency array: run after every render
- empty array: run after mount, then cleanup on unmount
- dependency list: run when listed reactive values change

Interview trap:

Omitting dependencies often creates stale closures. Prefer redesigning the
effect, moving calculations into render, or stabilizing the dependency when
identity matters.

## 28. When Should You Use `useContext`?

`useContext` reads the nearest matching context provider.

Example:

```tsx
const theme = useContext(ThemeContext);
```

Use it when many components need the same value and passing props through every
layer would be noisy.

Tradeoff:

Changing a context value can re-render many consumers. Split context by update
frequency and ownership when needed.

## 29. When Should You Use `useReducer`?

`useReducer` is useful when state transitions are complex or event-driven.

Example:

```tsx
type State = { status: "idle" | "saving" | "error" };
type Action = { type: "save" } | { type: "fail" } | { type: "reset" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "save":
      return { status: "saving" };
    case "fail":
      return { status: "error" };
    case "reset":
      return { status: "idle" };
  }
}
```

Why it matters:

Reducers make transitions explicit and easier to test.

Tradeoff:

For simple independent fields, `useState` is usually clearer.

## 30. When Should You Use `useRef`?

`useRef` stores a mutable value that persists across renders without triggering
a render when it changes.

Example:

```tsx
const timerRef = useRef<number | null>(null);
```

Use refs for:

- DOM nodes
- timers
- previous values
- integration objects
- values event handlers need but the UI does not render

Tradeoff:

If the UI should update when the value changes, use state instead.

## 31. What Is The Difference Between `useMemo` And `useCallback`?

`useMemo` caches a calculated value.

```tsx
const total = useMemo(() => {
  return items.reduce((sum, item) => sum + item.price, 0);
}, [items]);
```

`useCallback` caches a function reference.

```tsx
const handleSave = useCallback(() => {
  saveDocument(documentId);
}, [documentId]);
```

Use them when:

- a calculation is expensive
- a memoized child needs stable props
- an effect dependency needs stable identity

Tradeoff:

Memoization adds complexity. Use it for real render or identity problems, not
as a default style.

## 32. When Should You Use `useLayoutEffect`?

`useLayoutEffect` runs after DOM mutations but before the browser paints.

Use it for layout reads or writes that must happen before the user sees the
screen.

Example:

```tsx
useLayoutEffect(() => {
  const rect = tooltipRef.current?.getBoundingClientRect();
  setPosition(rect ? calculatePosition(rect) : null);
}, []);
```

Tradeoff:

Layout effects block paint. Use `useEffect` by default unless the work is
layout-sensitive.

## 33. What Is `useImperativeHandle`?

`useImperativeHandle` customizes what a parent receives through a ref.

Example:

```tsx
const SearchInput = forwardRef(function SearchInput(_, ref) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus() {
      inputRef.current?.focus();
    },
  }));

  return <input ref={inputRef} />;
});
```

Use it for focus management, component libraries, and narrow imperative APIs.

Tradeoff:

Prefer declarative props unless the parent truly needs to command child
behavior.

## 34. What Is `useDebugValue`?

`useDebugValue` labels custom hooks in React DevTools.

Example:

```tsx
function useOnlineStatus() {
  const online = useBrowserOnlineStatus();
  useDebugValue(online ? "online" : "offline");
  return online;
}
```

Use it in shared hooks when the label saves real debugging time.

Tradeoff:

Most app-level hooks do not need it.

## 35. What Is A Custom Hook?

A custom hook is a function that starts with `use` and calls other hooks to
package reusable stateful behavior.

Example:

```tsx
function useLocalStorageState(key: string, initialValue: string) {
  const [value, setValue] = useState(() => {
    return localStorage.getItem(key) ?? initialValue;
  });

  useEffect(() => {
    localStorage.setItem(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
```

Why it matters:

Custom hooks share behavior without adding extra wrapper components.

Interview trap:

Custom hooks share logic, not state instances. Each component call gets its own
hook state unless the hook connects to a shared external store.

## 36. What Changed In React 17?

React 17 did not add major new developer-facing features or hooks. It was
mainly a compatibility release that made gradual upgrades easier.

Important React 17 notes:

- event delegation moved from `document` to the root container
- event pooling was removed on the web
- the new JSX transform became available in supported toolchains
- different React versions could coexist more safely during gradual upgrades

Why it matters:

React 17 is still useful interview context because it explains why many apps
could upgrade incrementally before adopting React 18's concurrent features.

Strong interview answer:

> React 17 was not a feature-heavy release. It made upgrades smoother, changed
> event delegation, removed web event pooling, and prepared the ecosystem for
> React 18.

## 37. What Is The Difference Between A React Node, A React Element, And A Component?

Three different levels of the same system, and interviewers ask this to find out
whether you know that JSX produces data rather than DOM.

**A component** is the blueprint: a function (or class) that takes props and
returns what should be rendered. It is a definition — it does nothing until
something renders it.

```tsx
function Greeting({ name }: { name: string }) {
  return <h1>Hello {name}</h1>;
}
```

**A React element** is the object that describes *one rendered use* of a
component or host tag. JSX compiles to a `createElement` call (or `jsx()` with
the modern transform), and the result is a plain, immutable object.

```tsx
const element = <Greeting name="Ada" />;

// roughly:
{ type: Greeting, props: { name: "Ada" }, key: null }
```

An element is a **description, not an instance**. Creating one is cheap and
renders nothing by itself; React reads it during reconciliation and decides what
to do.

**A React node** is anything React can render. It is the widest of the three and
mostly appears as the TypeScript type `ReactNode`:

- a React element
- a string or a number
- `null`, `undefined`, or a boolean (all render nothing)
- an array or fragment containing any of the above

```tsx
type CardProps = {
  children: ReactNode;   // anything renderable
  icon: ReactElement;    // must be an element specifically
};
```

Mental model:

`Component` is the recipe, `element` is the order ticket, `node` is anything the
kitchen will accept. `ReactNode` is what you type `children` as; `ReactElement`
is what you type a prop as when you genuinely need an element and not a string.

Interview trap:

`<Greeting />` and `Greeting` are not interchangeable. The first is an element
(an object); the second is a function reference. Passing `<Icon />` where a
component type is expected — or `Icon` where an element is expected — is the bug
this question is really about.

## 38. What Is The React Event System And How Does It Differ From Native DOM Events?

React does not attach a listener to every element. It attaches a small number of
listeners at the **root container** and dispatches events to your handlers using
its own synthetic system.

```viz
type: flow
title: How a click reaches your onClick
User clicks a button :: a real native DOM event fires
Native event bubbles :: up the real DOM to the React root container
React's root listener :: one listener per event type, not per element
React finds the path :: walks its own component tree from the target up
Handlers run :: onClick fires as if it had bubbled through the React tree
```

What a **SyntheticEvent** is: a cross-browser wrapper around the native event
with a normalised API (`stopPropagation`, `preventDefault`, `target`,
`currentTarget`). The real event is always available at `event.nativeEvent`.

The differences that matter in practice:

- **Delegation, not direct binding.** React attaches at the root (since React 17;
  before that, at `document`). Your `onClick` never becomes an `addEventListener`
  on that button.
- **Handlers fire later than native ones.** A native listener attached directly to
  an inner element runs *before* React's handler, because the event has to bubble
  up to the root first. That is why calling `stopPropagation` in a native
  listener can silently kill your React handlers.
- **Events bubble through the React tree, not the DOM tree.** A click inside a
  portal bubbles to the portal's React parent even though the DOM node lives
  elsewhere in `document.body`. This surprises people building modals.
- **`onChange` behaves like the native `input` event.** It fires on every
  keystroke, not on blur like native `change`.
- **Naming is camelCase**, and the value is a function, not a string.
- **Capture phase** is available with the `Capture` suffix — `onClickCapture`.
- **Some events are not delegated.** Events that do not bubble — `scroll`, media
  events — are attached to the node directly.
- **Passive listeners.** React attaches `touchstart`, `touchmove`, and `wheel`
  passively at the root, so `preventDefault()` inside those handlers does not
  work. You need a ref and a manual `addEventListener` with `{ passive: false }`.

Interview note:

Event **pooling** — where React reused the event object and nulled its fields
after the handler, forcing `event.persist()` — was removed in React 17. If you
learned that rule, it is now historical. Mentioning that it *used to* exist and
was removed is a nice signal of depth.

Strong answer:

> React uses one delegated listener per event type at the root container and
> dispatches a SyntheticEvent through its own component tree, which gives
> consistent cross-browser behaviour and lets events follow the React tree rather
> than the DOM tree — portals being the obvious case. The practical consequences
> are that native listeners on inner nodes fire before React's, that
> `onChange` fires per keystroke, and that `preventDefault` does not work in
> wheel and touch handlers because React attaches those passively.

## 39. What Is The Difference Between Client-Side And Server-Side Routing?

**Server-side routing** is the original model: every navigation is a full HTTP
request. The browser unloads the current document, the server returns a complete
HTML page, and everything restarts.

**Client-side routing** intercepts link clicks, changes the URL with the History
API (`pushState`), and swaps components in place. No document is fetched; no
JavaScript state is lost.

```tsx
// Client-side: the browser never navigates
<Link to="/profile">Profile</Link>

// Server-side: a full page load
<a href="/profile">Profile</a>
```

| | Server-side | Client-side |
| --- | --- | --- |
| Per navigation | full HTML document | JSON data at most |
| JS state | destroyed | preserved |
| First paint | fast, HTML is ready | waits for the JS bundle |
| Later navigation | another round trip | near-instant |
| SEO | trivially crawlable | depends on the crawler |
| Works without JS | yes | no |
| Scroll / focus | handled by the browser | your responsibility |

What client-side routing forces you to re-implement:

- **Scroll restoration** — the browser no longer does it for you.
- **Focus management and announcements** — a screen reader is not told the page
  changed, so route changes need an explicit focus move or a live region.
- **The 404-on-refresh problem.** Deep-linking to `/profile` sends a real request
  to the server. A static host must be configured to serve `index.html` for all
  unknown paths, or a hard refresh 404s.
- **Loading and error states**, since there is no browser progress bar.

Why it matters:

Almost every production app now runs a hybrid: the first request is
server-rendered for fast first paint and SEO, then the client router takes over
for subsequent navigation. That is exactly what Next.js does — server-render or
prerender the entry, hydrate, then navigate client-side with prefetching.

Strong answer:

> Server-side routing trades a round trip per navigation for simplicity, working
> without JavaScript, and SEO by default. Client-side routing trades a heavier
> initial load and taking over scroll, focus, and error handling yourself for
> near-instant navigation and preserved state. Modern frameworks do not pick one
> — they server-render the first response and then use client-side routing, so
> you get the first-paint characteristics of one and the navigation feel of the
> other.

## 40. How Do You Localize A React Application?

Localization is more than swapping strings, and a good answer covers all four
layers.

**1. Externalise every string.** No user-visible text in JSX. Keys live in
per-locale resource files, loaded by a provider at the root.

```tsx
import { useTranslation } from "react-i18next";

function Cart({ count }: { count: number }) {
  const { t } = useTranslation();
  return <Text>{t("cart.items", { count })}</Text>;
}
```

```json
{ "cart": { "items_one": "{{count}} item", "items_other": "{{count}} items" } }
```

**2. Use ICU-style plurals and formatting — never string concatenation.**
`"You have " + n + " items"` is untranslatable: word order differs by language,
and many languages have more than two plural forms. `Intl.PluralRules` and ICU
message syntax exist precisely for this.

**3. Format data with `Intl`, not by hand.** Dates, numbers, currencies, relative
times, and list joins are all locale-dependent and all built into the platform.

```ts
new Intl.NumberFormat(locale, { currency: "EUR", style: "currency" }).format(12.5);
new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
new Intl.RelativeTimeFormat(locale).format(-3, "day");
```

**4. Handle layout and direction.** Arabic and Hebrew are right-to-left. Set `dir`
on the document, use CSS logical properties (`margin-inline-start` rather than
`margin-left`), and mirror directional icons. German text runs 30% longer than
English, so fixed-width buttons break.

The operational parts interviewers probe:

- **Locale detection order** — explicit user setting, then URL or cookie, then
  `Accept-Language`, then a default. Put the locale in the URL if you want it
  shareable and indexable.
- **Bundle size.** Load only the active locale, lazily. Shipping forty locale
  files to every user is a common mistake.
- **Translation workflow.** Keys are extracted from source, sent to translators,
  and merged back. Missing keys need a defined fallback rather than a blank UI.
- **Testing.** Pseudo-localization (`[[Ŝàvé Ĉĥàñĝéŝ››]]`) reveals hard-coded
  strings and overflow before real translations arrive.

Tradeoff:

`react-i18next` is the most common choice and is framework-agnostic; FormatJS
(`react-intl`) is closer to the ICU standard; Lingui does compile-time extraction
with smaller runtime output. In Next.js, locale-prefixed routes plus
server-loaded dictionaries keep translations out of the client bundle entirely.

## 41. How Do You Subscribe To An External Data Source And Clean Up Correctly?

The classic version uses `useEffect` with a cleanup function:

```tsx
useEffect(() => {
  const socket = new WebSocket(url);
  socket.addEventListener("message", handleMessage);

  return () => {
    socket.removeEventListener("message", handleMessage);
    socket.close();
  };
}, [url]); // re-subscribes only when url changes
```

The rules this pattern depends on:

- Cleanup runs **before every re-run** of the effect and once on unmount, so the
  old subscription is always torn down before a new one is created.
- The dependency array decides how often you resubscribe. Missing `url` means you
  keep listening to a stale socket; including an unstable object or function
  means you tear down and resubscribe on every render.
- In development, StrictMode intentionally mounts, unmounts, and remounts, so a
  missing cleanup shows up immediately as a duplicated subscription.

For subscribing to an **external store** — something outside React that holds
state and can change at any time — `useSyncExternalStore` is the correct hook:

```tsx
const isOnline = useSyncExternalStore(
  (onChange) => {
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
    };
  },
  () => navigator.onLine,      // client snapshot
  () => true,                  // server snapshot, for SSR
);
```

Why it matters:

With concurrent rendering, an effect-based subscription can **tear** — one part of
the tree renders with the old external value and another with the new one, inside
the same commit. `useSyncExternalStore` tells React about the store directly so
it can keep the whole tree consistent. This is why every serious state library
(Redux, Zustand) uses it internally.

Interview trap:

`getSnapshot` must return a **cached, referentially stable** value. Returning a
new object or array each call (`() => ({ ...state })`) makes React think the
store changed on every check and throws "The result of getSnapshot should be
cached to avoid an infinite loop". The `subscribe` function must also be stable —
define it outside the component or wrap it in `useCallback`.

## Quick Revision Checklist

Before a classic React interview, be ready to explain:

- components, JSX, props, and state
- stateless vs stateful components
- one-way data flow
- list keys and reconciliation
- controlled vs uncontrolled forms
- lifting state up
- composition over inheritance
- Context tradeoffs
- refs, fragments, and portals
- error boundaries
- class lifecycle methods
- pure components and `React.memo`
- HOCs and render props
- why hooks were introduced
- Rules of Hooks and effect dependencies
- the core hook set through React 17
- what React 17 changed and why it had no new hook set
- React node vs React element vs component
- the synthetic event system and how it differs from native DOM events
- client-side vs server-side routing
- localization, plurals, and `Intl` formatting
- subscribing to external stores with `useSyncExternalStore`

## Sources Used

- [React Components](https://react.dev/learn/your-first-component)
- [React JSX](https://react.dev/learn/writing-markup-with-jsx)
- [React State](https://react.dev/learn/state-a-components-memory)
- [React Sharing State](https://react.dev/learn/sharing-state-between-components)
- [React Context](https://react.dev/learn/passing-data-deeply-with-context)
- [React Refs](https://react.dev/learn/referencing-values-with-refs)
- [React Escape Hatches](https://react.dev/learn/escape-hatches)
- [React v16.8: The One With Hooks](https://legacy.reactjs.org/blog/2019/02/06/react-v16.8.0.html)
- [Built-in React Hooks](https://react.dev/reference/react/hooks)
- [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks)
- [React v17.0](https://legacy.reactjs.org/blog/2020/10/20/react-v17.html)
- [Introducing the New JSX Transform](https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html)
