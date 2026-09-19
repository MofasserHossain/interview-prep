# TypeScript And React Architecture Interview Guide

Senior React preparation focused on TypeScript, component architecture, state
management, Redux, API typing, testing, and maintainable frontend design.

## 1. What TypeScript topics matter most for a senior React role?

The important TypeScript topics are the ones that make product code safer and
easier to change:

| Topic | Why it matters |
| --- | --- |
| `type` vs `interface` | Shapes component props, DTOs, and extension boundaries. |
| `unknown` vs `any` | Keeps unsafe external data contained. |
| Generics | Reusable API clients, hooks, and components. |
| Discriminated unions | Reliable UI states and reducer actions. |
| Utility types | DTO transformation without duplication. |
| Type guards | Runtime validation plus compile-time narrowing. |
| Strict null checks | Prevents common production undefined/null bugs. |

Strong answer:

> In React I use TypeScript to model API data, component contracts, UI states,
> and business rules. The goal is not fancy types; the goal is making invalid
> states harder to represent.

## 2. `type` vs `interface`: when should you use each?

Both can describe object shapes.

Use `interface` when defining public object contracts that may be extended.

```ts
interface UserCardProps {
  id: string;
  name: string;
}

interface AdminUserCardProps extends UserCardProps {
  permissions: string[];
}
```

Use `type` for unions, intersections, mapped types, function aliases, and
derived types.

```ts
type LoadState = "idle" | "loading" | "success" | "error";

type ApiResponse<T> = {
  data: T;
  requestId: string;
};
```

Strong answer:

> I do not treat one as always better. I usually use `interface` for extendable
> object contracts and `type` for unions, composition, and derived types.

## 3. Why is `unknown` safer than `any`?

`any` disables type checking. `unknown` forces you to narrow before using the
value.

Bad:

```ts
function parsePayload(value: any) {
  return value.user.name.toUpperCase();
}
```

Better:

```ts
type UserPayload = {
  user: {
    name: string;
  };
};

function isUserPayload(value: unknown): value is UserPayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const user = record.user;

  return (
    typeof user === "object" &&
    user !== null &&
    typeof (user as Record<string, unknown>).name === "string"
  );
}

function parsePayload(value: unknown) {
  if (!isUserPayload(value)) {
    throw new Error("Invalid payload");
  }

  return value.user.name.toUpperCase();
}
```

Interview answer:

> I use `unknown` at trust boundaries such as API responses, local storage,
> webhooks, or `JSON.parse`. Then I validate and narrow before using the value.

## 4. How do discriminated unions help React UI state?

A discriminated union models each valid state explicitly.

```ts
type UsersState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; users: User[] }
  | { status: "error"; message: string };

function UsersPanel({ state }: { state: UsersState }) {
  switch (state.status) {
    case "idle":
      return <p>Select a filter.</p>;
    case "loading":
      return <p>Loading...</p>;
    case "success":
      return <UserList users={state.users} />;
    case "error":
      return <ErrorMessage message={state.message} />;
  }
}
```

Benefits:

| Without union | With discriminated union |
| --- | --- |
| `users` may be undefined accidentally. | `users` exists only in success state. |
| Error message may be missing. | Message is required in error state. |
| Many boolean flags conflict. | One `status` controls the shape. |

Strong answer:

> Discriminated unions are useful for async UI because loading, success, and
> error states have different data requirements.

## 5. How do you use generics for API clients?

Generics let one function keep the response type specific.

```ts
type ApiError = {
  code: string;
  message: string;
};

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

async function getJson<T>(url: string): Promise<ApiResult<T>> {
  const response = await fetch(url);
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    return {
      ok: false,
      error: body as ApiError,
    };
  }

  return {
    ok: true,
    data: body as T,
  };
}

type User = {
  id: string;
  name: string;
};

const result = await getJson<User[]>("/api/users");
```

Important:

> A generic type does not validate runtime data. For external APIs, pair this
> pattern with validation when correctness matters.

## 6. How do utility types help with API DTOs?

Utility types reduce duplication when related shapes are intentionally similar.

```ts
type User = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  createdAt: string;
};

type CreateUserRequest = Pick<User, "email" | "name" | "role">;
type UpdateUserRequest = Partial<Pick<User, "name" | "role">>;
type PublicUser = Omit<User, "email">;
type UserById = Record<string, User>;
```

Use carefully:

| Good use | Bad use |
| --- | --- |
| DTOs intentionally derived from domain type. | Hiding unclear domain modeling. |
| Removing duplicated field lists. | Creating unreadable nested utility chains. |
| Keeping create/update shapes aligned. | Reusing database model directly as API response. |

Strong answer:

> I use utility types when the relationship between types is real. If the API
> contract is different from the database model, I define a separate explicit
> type.

## 7. How should you type React props, events, and custom hooks?

Keep component contracts explicit.

```tsx
type SearchBoxProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

function SearchBox({ value, onChange, disabled = false }: SearchBoxProps) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }

  return <input disabled={disabled} onChange={handleChange} value={value} />;
}
```

Custom hook example:

```ts
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debounced;
}
```

Interview note:

> I avoid overtyping JSX. I type component boundaries, API data, state, events,
> and custom hooks where the type information prevents real mistakes.

## 8. Redux Toolkit vs Context vs local state: how do you choose?

Choose state location based on ownership and update frequency.

| State type | Good home |
| --- | --- |
| Input value used by one component | Local state |
| Modal open state for one feature | Feature component state |
| Theme/auth/session basics | Context |
| Cross-screen client state with many events | Redux Toolkit |
| Server data | Query/cache library or RTK Query |

Redux Toolkit is useful when:

- many screens need the same client state
- updates are event-like and need reducers
- time-travel/debug tooling helps
- state changes are complex enough to centralize

Context is not a full Redux replacement:

```tsx
<AppContext.Provider value={{ user, theme, notifications, cart }}>
  <App />
</AppContext.Provider>
```

If this value changes often, all consumers can re-render. Split context by
domain or use a store selector pattern.

Strong answer:

> I use local state by default, Context for low-frequency app-level values, and
> Redux Toolkit when shared client state becomes complex enough to need actions,
> reducers, selectors, and predictable updates.

## 9. How do you structure a large React app?

A feature-first structure usually scales better than grouping everything only
by technical type.

```txt
src/
  app/
    routes/
    providers/
  features/
    work-orders/
      api/
      components/
      hooks/
      types.ts
      work-order-page.tsx
    technicians/
      api/
      components/
  shared/
    ui/
    hooks/
    lib/
```

Rules:

| Rule | Reason |
| --- | --- |
| Feature code stays near the feature. | Easier ownership and deletion. |
| Shared UI is generic. | Avoids business logic leaking everywhere. |
| API clients are typed. | Keeps backend/frontend contract explicit. |
| State is scoped. | Reduces unnecessary re-render radius. |
| Tests sit near behavior. | Easier maintenance. |

Strong answer:

> I structure the app around product features and keep shared code intentional.
> If every feature imports everything from a global shared folder, boundaries
> become unclear.

## 10. How do you test React and TypeScript code?

Test behavior, not implementation details.

Example:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

it("submits the search text", async () => {
  const user = userEvent.setup();
  const onSearch = vi.fn();

  render(<SearchForm onSearch={onSearch} />);

  await user.type(screen.getByRole("searchbox"), "react");
  await user.click(screen.getByRole("button", { name: /search/i }));

  expect(onSearch).toHaveBeenCalledWith("react");
});
```

Good senior testing mix:

| Level | What to test |
| --- | --- |
| Unit | Pure functions, reducers, formatters. |
| Component | User-visible behavior and accessibility queries. |
| Integration | Feature flow with mocked network. |
| E2E | Critical paths such as login, checkout, order creation. |

Strong answer:

> TypeScript catches many static mistakes, but tests still verify behavior,
> integration, accessibility, and user workflows.

## Sources Used

- <https://www.typescriptlang.org/docs/handbook/2/narrowing.html>
- <https://www.typescriptlang.org/docs/handbook/utility-types.html>
- <https://react.dev/reference/react/useMemo>
- <https://redux.js.org/introduction/getting-started>
- <https://redux-toolkit.js.org/introduction/getting-started>
