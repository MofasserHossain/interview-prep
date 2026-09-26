# React Performance Interview Guide

React performance interview questions based on re-rendering,
memoization, derived state, debouncing, throttling, code splitting,
virtualization, concurrency, context optimization, stable keys, and React
Compiler.

Use this guide after the general frontend guide. The goal is not to memorize
every API. The goal is to learn how to explain performance problems, choose
the right optimization, and mention tradeoffs.

## Interview Answer Flow

For React performance questions, answer in this order:

1. Measure the problem first.
2. Identify the bottleneck.
3. Pick the smallest useful optimization.
4. Explain the tradeoff.
5. Verify the improvement.

Example:

> I would first profile the page with React Profiler and browser Performance
> tools. If the bottleneck is unnecessary rendering, I would isolate state,
> stabilize props, or use memoization carefully. If the bottleneck is a large
> list, I would use virtualization. If the bottleneck is bundle size, I would
> use code splitting. I would not add memoization everywhere without measuring.

## Course Topic Map

- Re-rendering: why components render again
- `memo`: skip child renders when props are equal
- `useCallback`: keep function references stable
- `useMemo`: cache expensive computed values
- Derived state: avoid storing values that can be computed
- Debouncing: wait until rapid events stop
- Throttling: run at most once per interval
- React Compiler: automatic memoization support
- Code splitting and lazy loading: reduce initial bundle size
- Virtualization: render only visible rows
- Concurrency: keep urgent UI updates responsive
- Component isolation: reduce render blast radius
- Context optimization: avoid oversized providers
- Stable keys: help reconciliation work correctly
- Wisdom: do not optimize before there is a real bottleneck

## 1. How Do You Improve Performance In A React Application?

Start by measuring. Performance optimization should be based on evidence, not
guessing.

Common tools:

- React Profiler
- Chrome Performance tab
- Lighthouse
- bundle analyzer
- real user monitoring

Common optimization areas:

- avoid unnecessary re-renders
- move state closer to where it is used
- memoize expensive work only when needed
- split large bundles
- lazy load heavy screens or widgets
- virtualize long lists
- debounce search and input-driven API calls
- throttle scroll and resize handlers
- cache server data
- optimize images and static assets

Strong interview answer:

> I improve performance by measuring first. Then I check whether the bottleneck
> is rendering, JavaScript execution, network, bundle size, images, or large
> DOM size. For React rendering problems I use state isolation, stable props,
> `memo`, `useMemo`, or `useCallback` carefully. For large lists I use
> virtualization. For bundle issues I use code splitting and lazy loading.

## 2. Why Do React Components Re-render?

A React component re-renders when React needs to calculate its next UI.

Common causes:

- its own state changes
- its props change
- a parent component re-renders
- a consumed context value changes
- an external store subscription updates

Example:

```tsx
function Parent() {
  const [count, setCount] = useState(0);

  return (
    <>
      <button onClick={() => setCount(count + 1)}>Increment</button>
      <Child />
    </>
  );
}

function Child() {
  console.log("Child rendered");
  return <p>Child</p>;
}
```

When `Parent` re-renders, `Child` is called again too. That does not always
mean the DOM changed. React may call components to calculate the next tree.

Interview note:

> A re-render is not automatically bad. It becomes a problem when rendering is
> frequent, expensive, or causes visible lag.

## 3. How Do You Detect Unnecessary Re-renders?

Use profiling tools instead of guessing.

Practical steps:

1. Use React DevTools Profiler.
2. Record the interaction that feels slow.
3. Check which components rendered.
4. Check why they rendered.
5. Optimize only the expensive or frequently-rendering parts.

You can also temporarily log renders:

```tsx
function ProductCard({ product }: { product: Product }) {
  console.log("ProductCard rendered", product.id);
  return <h2>{product.name}</h2>;
}
```

Logging is useful while debugging, but profiling is better for real analysis.

Strong answer:

> I use React Profiler to find expensive commits and components that render too
> often. Then I inspect whether the cause is unstable props, state placed too
> high, context updates, or expensive calculations during render.

## 4. What Is `React.memo`?

`React.memo` memoizes a component. It lets React skip rendering that component
when its props are the same as the previous render.

Example:

```tsx
const UserCard = memo(function UserCard({ name }: { name: string }) {
  console.log("UserCard rendered");
  return <p>{name}</p>;
});
```

If the parent re-renders but `name` is still the same, React can skip
rendering `UserCard`.

Use it when:

- the child component renders often
- the child component is expensive
- props are stable between renders

Avoid it when:

- the component is cheap
- props change every render
- you are using it without a measured problem

## 5. Why Can `React.memo` Fail To Prevent Re-renders?

`React.memo` compares props shallowly. New object, array, or function
references are considered different even if their contents look the same.

Example:

```tsx
const UserCard = memo(function UserCard({
  user,
}: {
  user: { name: string };
}) {
  return <p>{user.name}</p>;
});

function Parent() {
  const user = { name: "Asha" };
  return <UserCard user={user} />;
}
```

Every render creates a new `user` object, so `UserCard` receives a new prop
reference each time.

Better:

```tsx
function Parent({ name }: { name: string }) {
  return <UserCard name={name} />;
}
```

Or memoize the object if there is a reason:

```tsx
const user = useMemo(() => ({ name }), [name]);
```

Interview note:

> `memo` works best when the child receives primitive props or stable
> references.

## 6. What Is `useCallback`?

`useCallback` caches a function reference between renders.

It is most useful when passing callbacks to memoized children.

Example:

```tsx
const SaveButton = memo(function SaveButton({
  onSave,
}: {
  onSave: () => void;
}) {
  return <button onClick={onSave}>Save</button>;
});

function Editor({ documentId }: { documentId: string }) {
  const handleSave = useCallback(() => {
    saveDocument(documentId);
  }, [documentId]);

  return <SaveButton onSave={handleSave} />;
}
```

Without `useCallback`, `handleSave` would be a new function on every render.
That can make a memoized child render again.

Important:

> `useCallback` does not make the function run faster. It only keeps the
> function identity stable.

## 7. When Should You Use `useCallback`?

Use `useCallback` when stable function identity matters.

Good cases:

- passing callbacks to `memo` children
- passing callbacks into custom hooks with dependency arrays
- avoiding repeated subscription setup when a callback is a dependency

Bad cases:

- wrapping every function automatically
- using it when there is no memoized child or dependency problem
- hiding incorrect dependencies

Example of dependency-sensitive code:

```tsx
function SearchBox({ onSearch }: { onSearch: (value: string) => void }) {
  useEffect(() => {
    const id = window.setInterval(() => {
      onSearch("latest");
    }, 10000);

    return () => window.clearInterval(id);
  }, [onSearch]);

  return null;
}
```

If `onSearch` changes every parent render, the interval is recreated every
time. A stable callback can avoid that.

## 8. What Is `useMemo`?

`useMemo` caches the result of a calculation.

Example:

```tsx
function CartSummary({ items }: { items: CartItem[] }) {
  const total = useMemo(() => {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [items]);

  return <p>Total: {total}</p>;
}
```

React recalculates `total` only when `items` changes.

Use it for:

- expensive calculations
- derived values passed to memoized children
- stable object or array references when identity matters

Avoid it for:

- cheap calculations
- side effects
- making code look optimized without evidence

## 9. What Is The Difference Between `useMemo` And `useCallback`?

`useMemo` caches a value.

```tsx
const sortedUsers = useMemo(() => sortUsers(users), [users]);
```

`useCallback` caches a function reference.

```tsx
const handleClick = useCallback(() => {
  setOpen(true);
}, []);
```

You can think of `useCallback(fn, deps)` as similar to
`useMemo(() => fn, deps)`.

Interview answer:

> `useMemo` is for computed values. `useCallback` is for function references.
> Both are dependency-based and should be used when they prevent real work or
> stabilize props for memoized children.

## 10. What Is Derived State?

Derived state is data that can be calculated from existing props or state.

Avoid storing derived values in state unless there is a strong reason.

Bad:

```tsx
function Cart({ items }: { items: CartItem[] }) {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setTotal(items.reduce((sum, item) => sum + item.price, 0));
  }, [items]);

  return <p>{total}</p>;
}
```

This creates extra state, extra render cycles, and possible sync bugs.

Better:

```tsx
function Cart({ items }: { items: CartItem[] }) {
  const total = items.reduce((sum, item) => sum + item.price, 0);
  return <p>{total}</p>;
}
```

If the calculation is expensive:

```tsx
const total = useMemo(() => calculateTotal(items), [items]);
```

## 11. Why Is Derived State A Performance Problem?

Derived state often causes double renders.

Flow:

1. Props or state change.
2. Component renders with old derived state.
3. Effect runs and updates derived state.
4. Component renders again.

It also creates two sources of truth.

Strong answer:

> If a value can be computed from current props or state, I compute it during
> render. I only store it in state when the user can independently edit it or
> when it represents real external state.

## 12. What Is Debouncing?

Debouncing waits until rapid calls stop for a specified delay, then runs the
function once.

Use cases:

- search input API calls
- autocomplete
- form validation after typing stops
- resize events when only final value matters

Example:

```ts
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timerId: number | undefined;

  return function (...args: Parameters<T>) {
    window.clearTimeout(timerId);

    timerId = window.setTimeout(() => {
      fn(...args);
    }, delay);
  };
}
```

Interview answer:

> Debounce is useful when I only care about the final action after a burst of
> events. For search, I do not want an API call for every keystroke; I want one
> call after the user pauses typing.

## 13. How Do You Debounce A Search Input In React?

A common approach is to keep the input responsive but delay the effect.

Example:

```tsx
function SearchPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => window.clearTimeout(timerId);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery) return;
    searchProducts(debouncedQuery);
  }, [debouncedQuery]);

  return (
    <input value={query} onChange={(event) => setQuery(event.target.value)} />
  );
}
```

Key point:

> Always clear the timer in cleanup so old timers do not fire after the value
> changes or the component unmounts.

## 14. What Is Throttling?

Throttling runs a function at most once per interval.

Use cases:

- scroll tracking
- resize handlers
- mouse movement
- analytics events

Example:

```ts
function throttle<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let lastCall = 0;

  return function (...args: Parameters<T>) {
    const now = Date.now();

    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  };
}
```

Interview answer:

> Throttle is useful when an event fires continuously, but I still want regular
> updates. For example, during scrolling I might update progress at most once
> every 100ms instead of on every scroll event.

## 15. Debounce vs Throttle

Debounce waits until events stop.

Throttle runs at a fixed maximum rate.

Example:

```txt
Search box typing: debounce
Scroll position tracking: throttle
Window resize final layout calculation: debounce
Drag position updates: throttle
```

Strong answer:

> I use debounce when I care about the final value after rapid input. I use
> throttle when I need updates during the activity, but not too frequently.

## 16. What Is React Compiler?

React Compiler is a build-time optimization tool that can automatically
memoize components, values, and functions when the code follows React rules.

It can reduce the need for manual `memo`, `useMemo`, and `useCallback`.

Interview answer:

> React Compiler helps automate memoization. In new code, the preferred
> direction is to rely on the compiler where it is configured and use manual
> memoization only when precise control is needed. In existing code, I would
> avoid blindly removing manual memoization without testing because it can
> change performance behavior.

Important:

- it is not a replacement for good state design
- it still depends on code following React rules
- manual memoization can still be useful as an escape hatch

## 17. Does React Compiler Mean Manual Memoization Is Dead?

No. Manual memoization is less necessary when React Compiler is enabled, but it
is still useful in some cases.

Manual memoization can still help when:

- you need exact control over a dependency reference
- a memoized value is used as an effect dependency
- a library boundary needs stable props
- you are working in code not compiled by React Compiler
- you are preserving existing behavior in a mature app

Strong answer:

> I would treat React Compiler as the default optimization layer where the
> project supports it, but I would still understand `memo`, `useMemo`, and
> `useCallback` because interviews and existing codebases still rely on them.

## 18. What Is Code Splitting?

Code splitting breaks a large JavaScript bundle into smaller chunks that can be
loaded when needed.

Example:

```tsx
const SettingsPage = lazy(() => import("./SettingsPage"));
```

Usage:

```tsx
<Suspense fallback={<p>Loading...</p>}>
  <SettingsPage />
</Suspense>
```

Why it helps:

- smaller initial bundle
- faster first load
- heavy routes load only when visited
- admin-only features do not slow down all users

Tradeoff:

> Lazy chunks can introduce loading states and extra network requests, so they
> should be split around meaningful routes or heavy components.

## 19. What Is Lazy Loading In React?

Lazy loading delays loading a component until it is needed.

Example:

```tsx
import { lazy, Suspense } from "react";

const Chart = lazy(() => import("./Chart"));

function Dashboard({ showChart }: { showChart: boolean }) {
  return (
    <Suspense fallback={<p>Loading chart...</p>}>
      {showChart ? <Chart /> : null}
    </Suspense>
  );
}
```

Use lazy loading for:

- route-level screens
- charts
- editors
- maps
- admin panels
- rarely used modals

Avoid lazy loading tiny components because the overhead may not be worth it.

## 20. What Is Virtualization?

Virtualization renders only the items visible in the viewport plus a small
buffer.

If a page has 10,000 rows but only 20 are visible, virtualization avoids
putting all 10,000 DOM nodes on the page.

Benefits:

- smaller DOM
- faster rendering
- smoother scrolling
- lower memory usage

Tradeoffs:

- more complex keyboard/accessibility behavior
- dynamic row heights can be harder
- browser find may not find non-rendered rows
- printing the full list may need a separate path

## 21. How Would You Render 10,000 Items In React?

Do not render all items at once.

Options:

- pagination
- infinite scrolling
- virtualization
- server-side filtering and search

Virtualization example:

```tsx
import { FixedSizeList } from "react-window";

function UsersList({ users }: { users: User[] }) {
  return (
    <FixedSizeList
      height={500}
      width={400}
      itemCount={users.length}
      itemSize={40}
    >
      {({ index, style }) => (
        <div style={style}>{users[index].name}</div>
      )}
    </FixedSizeList>
  );
}
```

Strong answer:

> I would avoid rendering all 10,000 DOM nodes. If users need to browse a long
> list, I would use virtualization. If they need to find specific data, I would
> add server-side search, filters, and pagination.

## 22. What Is `react-window`?

`react-window` is a lightweight virtualization library for rendering large
lists and grids efficiently.

It renders only visible rows and positions them inside a scrollable container.

Good use cases:

- long tables
- message history
- logs
- autocomplete results
- large select menus

Interview note:

> `react-window` improves rendering performance by reducing DOM nodes, but it
> does not reduce the amount of data fetched unless you also paginate or load
> data incrementally.

## 23. What Is Concurrent Rendering In React?

Concurrent rendering lets React work on updates with different priorities.

The user-facing idea:

> Keep urgent updates responsive while slower updates happen in the background.

Common APIs:

- `useTransition`
- `useDeferredValue`

Example problems it helps with:

- typing into an input while filtering a large list
- switching tabs while a heavy result panel updates
- keeping current UI visible while new content loads

Concurrency does not make expensive work disappear. It helps React schedule
work so the UI stays responsive.

## 24. What Is `useTransition`?

`useTransition` marks a state update as non-urgent.

Example:

```tsx
function ProductSearch({ products }: { products: Product[] }) {
  const [query, setQuery] = useState("");
  const [filtered, setFiltered] = useState(products);
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    setQuery(value);

    startTransition(() => {
      setFiltered(filterProducts(products, value));
    });
  }

  return (
    <>
      <input value={query} onChange={(e) => handleChange(e.target.value)} />
      {isPending ? <p>Updating results...</p> : null}
      <ProductList products={filtered} />
    </>
  );
}
```

Here, updating the input is urgent. Updating the heavy filtered list is less
urgent.

Important:

> Do not use transition updates to control text inputs directly. Keep the input
> state urgent and put the heavy update in the transition.

## 25. What Is `useDeferredValue`?

`useDeferredValue` returns a deferred version of a value. React can keep
showing the old value while rendering the new value in the background.

Example:

```tsx
function SearchResults({ query }: { query: string }) {
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => searchItems(deferredQuery), [deferredQuery]);

  return <ResultsList results={results} />;
}
```

Use it when:

- a value changes quickly
- rendering based on that value is expensive
- you want the input to stay responsive

Interview answer:

> `useDeferredValue` is useful when a parent value updates urgently, but a
> child can lag behind slightly. It improves perceived responsiveness, but it
> does not automatically reduce network requests.

## 26. Component Isolation

Component isolation means keeping state and expensive rendering close to the
smallest part of the UI that needs it.

Bad:

```tsx
function Page() {
  const [search, setSearch] = useState("");

  return (
    <>
      <Header />
      <SearchBox value={search} onChange={setSearch} />
      <ExpensiveDashboard />
    </>
  );
}
```

Every search update re-renders `Page` and all children.

Better:

```tsx
function Page() {
  return (
    <>
      <Header />
      <SearchPanel />
      <ExpensiveDashboard />
    </>
  );
}

function SearchPanel() {
  const [search, setSearch] = useState("");
  return <SearchBox value={search} onChange={setSearch} />;
}
```

Now search state only affects `SearchPanel`.

Strong answer:

> Before adding memoization, I check whether state is placed too high in the
> tree. Moving state down can be simpler and more reliable than memoizing many
> children.

## 27. How Do You Optimize React Context?

Context updates re-render all consuming components when the context value
changes.

Problems happen when one large context contains unrelated state.

Bad:

```tsx
<AppContext.Provider value={{ user, theme, notifications, cart }}>
  {children}
</AppContext.Provider>
```

If `cart` changes, components that only read `theme` may still re-render.

Better:

```tsx
<UserProvider>
  <ThemeProvider>
    <CartProvider>{children}</CartProvider>
  </ThemeProvider>
</UserProvider>
```

Other techniques:

- split contexts by domain
- memoize provider values
- avoid recreating functions inside provider values
- use selector-based state libraries for high-frequency updates

Example:

```tsx
const value = useMemo(() => ({ theme, setTheme }), [theme]);

return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
```

## 28. Why Are Stable Keys Important?

Keys help React match list items between renders.

Good:

```tsx
{users.map((user) => (
  <UserRow key={user.id} user={user} />
))}
```

Bad when list order can change:

```tsx
{users.map((user, index) => (
  <UserRow key={index} user={user} />
))}
```

Using indexes as keys can cause:

- incorrect state reuse
- wrong input values
- unnecessary DOM work
- confusing animation behavior

Interview answer:

> I use stable unique IDs as keys. Index keys are acceptable only for static
> lists that never reorder, insert, or delete items.

## 29. How Would You Optimize A Slow Search Page?

A strong answer should combine multiple techniques.

Approach:

1. Profile the page.
2. Debounce the query before making API calls.
3. Cancel stale requests with `AbortController`.
4. Cache repeated queries if useful.
5. Use server-side search for large datasets.
6. Virtualize large result lists.
7. Use `useDeferredValue` or `useTransition` for heavy rendering.
8. Keep input state isolated so typing stays responsive.

Example request cleanup:

```tsx
useEffect(() => {
  if (!query) return;

  const controller = new AbortController();

  fetch(`/api/search?q=${encodeURIComponent(query)}`, {
    signal: controller.signal,
  });

  return () => controller.abort();
}, [query]);
```

Strong answer:

> I would not solve a slow search page with only `useMemo`. Search performance
> can involve network, rendering, and data size. I would debounce input, cancel
> stale requests, use server-side search, and virtualize results if the list is
> large.

## 30. When Should You Avoid Optimization?

Avoid optimization when there is no real bottleneck.

Reasons:

- memoization adds complexity
- dependency arrays can become a bug source
- cached values use memory
- premature optimization can hide simpler design problems
- some optimizations make code harder to read

Good interview line:

> I do not optimize by default. I write clear code first, measure performance,
> and optimize the specific bottleneck. If a component is cheap and renders
> rarely, memoization may add more complexity than value.

## Quick Revision Checklist

Before a React performance interview, be ready to explain:

- why React components re-render
- why re-rendering is not always bad
- how `memo`, `useMemo`, and `useCallback` differ
- why stable references matter
- why derived state can create bugs and extra renders
- debounce vs throttle
- when to use code splitting
- when to use virtualization
- how `useTransition` and `useDeferredValue` improve responsiveness
- why large context providers can be expensive
- why stable list keys matter
- what React Compiler changes about manual memoization
- why you should measure before optimizing

## Sources Used

- [React memo](https://react.dev/reference/react/memo)
- [React useMemo](https://react.dev/reference/react/useMemo)
- [React useCallback](https://react.dev/reference/react/useCallback)
- [React lazy](https://react.dev/reference/react/lazy)
- [React Suspense](https://react.dev/reference/react/Suspense)
- [React useTransition](https://react.dev/reference/react/useTransition)
- [React useDeferredValue](https://react.dev/reference/react/useDeferredValue)
- [React Compiler](https://react.dev/learn/react-compiler)
