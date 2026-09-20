# React Basics Interview Guide

A short primer on the React fundamentals that come up in every interview:
components, props and state, reconciliation, render and commit phases, hook
comparisons, error boundaries, list rendering, and code splitting.

This is the on-ramp for the React track. Each answer is deliberately brief, and
points at the topic that covers it properly — start here, then go deep.

For browser fundamentals such as script loading, the CSS box model, and custom
elements, see the Browser & Web Platform track. For Next.js rendering, hydration,
and error handling, see the Next.js track.

## 1. What Is React?

React is a JavaScript library for building component-based user interfaces. Components receive props, hold state, and return UI.

```tsx
function Greeting({ name }) {
  return <h1>Hello {name}</h1>;
}
```

Goes deeper: **Core Concepts Through 17**, question 1.

## 2. Props vs State

Props are passed from parent to child and should be treated as read-only.

State is managed inside a component and can change over time.

```tsx
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

Goes deeper: **Core Concepts Through 17**, question 5.

## 3. What Is Reconciliation?

Reconciliation is React's process of comparing the previous UI tree with the new UI tree and deciding what DOM changes are needed.

Keys help React track list items.

```tsx
{users.map((user) => (
  <UserRow key={user.id} user={user} />
))}
```

Avoid using array index as key when list order can change.

Goes deeper: **Internals & Fiber**, questions 9 and 10.

## 4. Render Phase vs Commit Phase

Render phase:

- React calls components.
- Calculates the next UI.
- Should be pure.

Commit phase:

- React applies changes to the DOM.
- Effects run after commit.

Goes deeper: **Internals & Fiber**, questions 2 and 3.

## 5. useState vs useRef

`useState` stores reactive state and causes re-render when updated.

`useRef` stores mutable data that persists across renders without causing re-render.

```tsx
const [count, setCount] = useState(0);
const intervalRef = useRef<number | null>(null);
```

Use `useRef` for DOM nodes, timers, previous values, and instance-like values.

Goes deeper: **Core Concepts Through 17**, question 30.

## 6. useMemo vs useCallback

`useMemo` memoizes a calculated value.

```tsx
const total = useMemo(() => {
  return items.reduce((sum, item) => sum + item.price, 0);
}, [items]);
```

`useCallback` memoizes a function reference.

```tsx
const handleSave = useCallback(() => {
  saveForm(form);
}, [form]);
```

Do not use them everywhere. Use them when they prevent real expensive work or unnecessary child renders.

Goes deeper: **Performance Optimization**, question 9, and **React Compiler** for
why most of this is becoming automatic.

## 7. Controlled vs Uncontrolled Components

Controlled:

```tsx
const [email, setEmail] = useState("");

<input value={email} onChange={(e) => setEmail(e.target.value)} />;
```

Uncontrolled:

```tsx
const inputRef = useRef<HTMLInputElement>(null);

<input ref={inputRef} />;
```

Controlled inputs are easier to validate and synchronize with UI state.

Goes deeper: **Forms & Validation**, questions 1 and 2 — including why controlled
is a cost, not a best practice.

## 8. Error Boundaries

Error boundaries catch rendering errors in child components and show fallback UI.

```tsx
class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error(error, info);
  }

  render() {
    if (this.state.hasError) return <h1>Something went wrong</h1>;
    return this.props.children;
  }
}
```

They do not catch event handler errors, async errors, or server-side errors.

Goes deeper: **Core Concepts Through 17**, question 17, and **React Testing**,
question 10.

## 9. How Do You Render 10,000 List Items?

Do not render all DOM nodes at once. Use:

- pagination
- infinite scroll
- virtualization

Example with `react-window`:

```tsx
<FixedSizeList height={400} width={300} itemCount={10000} itemSize={35}>
  {({ index, style }) => <div style={style}>Row {index}</div>}
</FixedSizeList>
```

Virtualization renders only visible rows plus a small buffer.

Goes deeper: **Performance Optimization**, questions 20 to 22, and **Senior
Frontend Scenarios**, question 27.

## 10. What Is Code Splitting?

Code splitting breaks a large JavaScript bundle into smaller chunks loaded on demand.

React:

```tsx
const AdminPage = React.lazy(() => import("./AdminPage"));
```

Next.js:

```tsx
const Chart = dynamic(() => import("./Chart"), { ssr: false });
```

Goes deeper: **Bundle Optimization**, questions 2 and 3.
