# React Testing Interview Guide

React testing interview guidance covering Testing Library queries, `user-event`,
`act` warnings, async assertions, network mocking with MSW, custom hooks,
Suspense and error boundaries, the test pyramid, flaky tests, and what to test
first in a codebase that has no tests.

The theme throughout: test what the user does, not what the component is. Most
bad React tests fail because they assert implementation details, so they break on
every refactor and pass while the feature is broken.

## Interview Answer Flow

For a testing question, answer in this order:

1. What is the user-visible behaviour being verified?
2. Which level of the pyramid does that belong at?
3. What is the smallest real dependency you can keep, and what must be faked?
4. How does the test fail — and does the failure message point at the cause?
5. What would make this test flaky, and how is that prevented?

## 1. What Should A React Test Actually Assert?

Assert what a user could observe: rendered text, roles, enabled and disabled
states, what happens after an interaction, and what request went out.

Do not assert state, props, hook call counts, or which internal function ran.
Those are implementation details, and a test coupled to them fails when you
refactor working code and passes when you break user-facing behaviour.

```tsx
// Bad: asserts implementation. Breaks if you rename state or switch to useReducer.
expect(wrapper.state("isOpen")).toBe(true);

// Good: asserts behaviour. Survives any refactor that keeps the feature working.
await user.click(screen.getByRole("button", { name: "Open menu" }));
expect(screen.getByRole("menu")).toBeVisible();
```

The rule:

> The more your tests resemble the way your software is used, the more confidence
> they can give you. That is the Testing Library guiding principle, and every
> other rule in this guide follows from it.

Tradeoff:

> Behavioural tests are slower to write and sometimes harder to debug, because a
> failure tells you the outcome is wrong without telling you which line caused
> it. That cost is worth paying, but it means failure messages matter — a test
> that fails with "expected true, received false" has wasted the trade.

## 2. What Is The Testing Library Query Priority, And Why?

Queries are ordered by how closely they resemble how a user finds an element.

| Priority | Query | Use for |
| --- | --- | --- |
| 1 | `getByRole` | almost everything — buttons, headings, inputs, dialogs |
| 2 | `getByLabelText` | form fields |
| 3 | `getByPlaceholderText` | only when there is no label (which is itself a bug) |
| 4 | `getByText` | non-interactive content |
| 5 | `getByDisplayValue` | filled-in form values |
| 6 | `getByAltText`, `getByTitle` | images, and elements with no better handle |
| 7 | `getByTestId` | last resort, for things with no accessible handle at all |

Why `getByRole` first:

> It queries the accessibility tree, so it only finds the element if assistive
> technology can find it too. A `getByRole("button", { name: "Save" })` that fails
> is often telling you about a real accessibility bug — a `<div onClick>` with no
> role, or a button with no accessible name. That makes it the one query that
> tests two things at once.

Interview note:

> `getByTestId` is not forbidden, it is just the query that proves nothing. If a
> test suite is mostly test ids, the suite cannot tell you whether the UI is
> usable, only whether it rendered. Reaching for a test id is a prompt to ask
> whether the element should have had a role or a label in the first place.

## 3. `user-event` vs `fireEvent` — Which And Why?

`fireEvent` dispatches one synthetic DOM event. `user-event` simulates what a
real user does, which is usually many events.

```tsx
// fireEvent: one change event. No focus, no keydown, no keyup, no blur.
fireEvent.change(input, { target: { value: "hello" } });

// user-event: pointer down/up, focus, then keydown/keypress/input/keyup per key.
await user.type(input, "hello");
```

Why it matters:

> Any component that reacts to focus, blur, key events, or typing sequence
> behaves differently under the two. A masked input, a field that validates on
> blur, a dropdown that opens on focus, or a `maxLength` are all invisible to
> `fireEvent` and all correctly exercised by `user-event`. `fireEvent` can make a
> broken component pass.

Setup, since v14:

```tsx
const user = userEvent.setup(); // before render
await user.click(button); // every API is async now
```

Interview trap:

> `user-event` v14 returns promises, and forgetting the `await` produces a test
> that passes for the wrong reason — the assertion runs before the interaction
> finishes, so it reads the pre-interaction DOM. It will usually still pass, which
> is the dangerous part, and then fail intermittently when timing shifts.

When `fireEvent` is still right:

- events a user cannot produce directly: `scroll`, `resize`, `animationend`
- dispatching on `window` or `document`
- a deliberately narrow unit test of one handler

## 4. What Does An `act()` Warning Actually Mean?

```txt
Warning: An update to Thing inside a test was not wrapped in act(...)
```

It means React state updated outside of a window where React could flush the
resulting render and effects before your assertions ran. The DOM you are
asserting against may not reflect that update yet.

Almost always the cause is an async update that the test did not wait for:

```tsx
// Warns: the fetch resolves and calls setState after the test moved on.
test("shows the user", () => {
  render(<Profile />);
  expect(screen.getByText("Ada")).toBeInTheDocument();
});

// Fixed: findBy* is async and act-wrapped, so it waits for the update.
test("shows the user", async () => {
  render(<Profile />);
  expect(await screen.findByText("Ada")).toBeInTheDocument();
});
```

Important:

> You should almost never write `act()` yourself in a component test. `render`,
> `fireEvent`, `user-event`, `findBy*`, and `waitFor` are all already wrapped. If
> you are reaching for a manual `act`, the usual real problem is a missing
> `await` — wrapping it manually silences the warning without fixing the race.

Edge cases:

> The warning can also fire on a state update after the test finished and the
> component unmounted — a timer or a request that outlived the test. That is a
> real bug: in production it is a wasted render or a memory leak, so the fix is
> cleanup in the component, not suppression in the test.

## 5. `getBy`, `queryBy`, `findBy` — When Does Each Apply?

| Prefix | Returns | Missing element | Async |
| --- | --- | --- | --- |
| `getBy` | the element | **throws** | no |
| `queryBy` | the element or `null` | returns `null` | no |
| `findBy` | a promise of the element | rejects after the timeout | yes |

The decision is mechanical:

- asserting something **is** there right now → `getBy`
- asserting something is **not** there → `queryBy`, because `getBy` throws before
  your `expect` can run
- asserting something **will** be there → `findBy`

```tsx
expect(screen.getByRole("heading")).toHaveTextContent("Profile"); // now
expect(screen.queryByRole("alert")).not.toBeInTheDocument(); // absent
expect(await screen.findByText("Saved")).toBeInTheDocument(); // eventually
```

Interview trap:

> `expect(screen.queryByText("Saved")).toBeInTheDocument()` after an async action
> is the most common false negative in React test suites. It does not wait, so it
> fails on a correct component. And its mirror — `await waitFor(() =>
> expect(screen.queryByText("x")).not.toBeInTheDocument())` — passes instantly on
> the *first* check before the element has even appeared, so it can never fail.

## 6. `findBy*` vs `waitFor` — What Is The Difference?

`findBy*` is `getBy*` wrapped in `waitFor`. Prefer it, because the failure message
is better.

```tsx
// Preferred: on failure, prints the DOM and the query that could not match.
await screen.findByText("Saved");

// Same behaviour, worse failure output.
await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
```

Use `waitFor` when the condition is not "an element appeared":

```tsx
await waitFor(() => expect(onSave).toHaveBeenCalledWith({ id: "1" }));
await waitForElementToBeRemoved(() => screen.queryByText("Loading…"));
```

Tradeoff:

> `waitFor` polls, retrying the callback until it stops throwing. So the callback
> must be side-effect free and cheap — putting a `user.click` inside `waitFor`
> means the click may fire several times. That is a real bug people ship, and it
> usually surfaces as a duplicated request.

## 7. Should You Mock `fetch`, Or The Module That Calls It?

Neither, if you can mock the network instead. MSW intercepts at the network layer,
so your component's real fetching code runs.

```tsx
const server = setupServer(
  http.get("/api/todos", () => HttpResponse.json([{ id: "1", title: "Ship it" }])),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

Why this is better than `jest.mock("./api")`:

| Mocking the module | Mocking the network |
| --- | --- |
| Tests the mock's shape, not the real request | Catches a wrong URL, method, or header |
| Breaks when you refactor how you fetch | Survives swapping fetch for a query library |
| Response parsing never runs | Parsing, error handling, and retry all run |
| Every test restates the API contract | One set of handlers shared with dev and e2e |

`onUnhandledRequest: "error"` is the setting that earns its keep:

> It fails the test when the component makes a request you did not declare.
> Without it, an unexpected request silently returns nothing and you debug a
> mysterious empty state instead of seeing the real cause.

Tradeoff:

> MSW is more setup than `jest.mock`, and it will not help for a non-HTTP
> dependency. For a module that reads `localStorage`, talks to an SDK, or wraps a
> native API, module mocking is still the tool — the preference is about network
> calls specifically.

## 8. How Do You Test A Custom Hook?

Prefer testing it through a component that uses it, because that is how it will
be used. When the hook is a genuinely reusable primitive, `renderHook` is fine.

```tsx
test("increments", async () => {
  const { result } = renderHook(() => useCounter({ start: 3 }));

  expect(result.current.count).toBe(3);

  await act(async () => result.current.increment());

  expect(result.current.count).toBe(4);
});
```

Two things that catch people out:

- **`result.current` is a snapshot.** Destructuring it once gives you a stale
  value after a re-render. Always read through `result.current`.
- **This is the one place a manual `act` is normal,** because there is no
  component interaction to wrap the update for you.

Passing a provider:

```tsx
renderHook(() => useUser(), {
  wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
});
```

Interview note:

> If a hook is only used by one component, testing it directly is usually a
> mistake — you end up with two tests of the same logic, one of which asserts an
> API nobody else calls. Test the component, and the hook is covered as a
> consequence.

## 9. How Do You Test A Component That Suspends?

Provide the boundary, assert the fallback synchronously, then await the resolved
state.

```tsx
render(
  <ErrorBoundary fallback={<p>Something went wrong</p>}>
    <Suspense fallback={<p>Loading…</p>}>
      <Profile id="1" />
    </Suspense>
  </ErrorBoundary>,
);

expect(screen.getByText("Loading…")).toBeInTheDocument();
expect(await screen.findByText("Ada")).toBeInTheDocument();
```

Each piece matters:

- the fallback assertion must be **synchronous**, before the await, or the
  fallback has already been replaced
- the resolved assertion must be `findBy*`, because the resolution is async
- the error boundary belongs in the same tree, since the rejected path is half
  the behaviour and the half that usually ships broken

Interview trap:

> Three ways this hangs instead of failing: a promise created during render, so
> nothing ever resolves the same promise twice; query retries left on, so a
> failing request takes three attempts past the test timeout; and fake timers
> without advancing them, which deadlocks the await. All three look like
> flakiness, so they get skipped rather than read.

With a query library, disable retries and use a fresh client per test:

```tsx
new QueryClient({ defaultOptions: { queries: { retry: false } } });
```

## 10. How Do You Test An Error Boundary?

Render the boundary around a component that throws, and assert the fallback.

```tsx
function Boom() {
  throw new Error("kaboom");
}

test("renders the fallback", () => {
  render(
    <ErrorBoundary fallback={<p>Something went wrong</p>}>
      <Boom />
    </ErrorBoundary>,
  );

  expect(screen.getByText("Something went wrong")).toBeInTheDocument();
});
```

Two practical problems:

- **React logs the error to the console** even when the boundary handles it, which
  can trip a "fail on console.error" rule. Silence it for that test only, and
  restore it afterwards — never globally, or you lose the signal everywhere.
- **Boundaries do not catch async errors, event handler errors, or errors during
  SSR.** A test that proves the boundary catches a render throw has not proven it
  catches the failure your users actually hit. Test the real failure path:
  usually a rejected request surfaced through a query library.

Interview note:

> The more valuable test is often the `onError` reporting call, not the fallback.
> A boundary whose fallback works but whose Sentry call is broken looks fine in
> staging and leaves you blind in production.

## 11. How Do You Test Something That Needs Context Or A Router?

Build one custom render that wires up the providers the app actually uses, and
export it instead of Testing Library's.

```tsx
// test-utils.tsx
function renderWithProviders(ui: ReactElement, { route = "/" } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return {
    ...render(
      <MemoryRouter initialEntries={[route]}>
        <QueryClientProvider client={client}>
          <ThemeProvider>{ui}</ThemeProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    ),
    user: userEvent.setup(),
  };
}

export * from "@testing-library/react";
export { renderWithProviders as render };
```

Why:

> A test that stubs out providers is testing a tree that does not exist in the
> app. Wiring the real ones means a broken provider order or a missing default
> fails a test instead of only failing in production.

Important:

> Create per-test instances of anything stateful — a `QueryClient`, a store, a
> router. A shared one leaks cache and state between tests, which produces the
> worst kind of failure: a suite that passes individually and fails in CI, or
> passes in CI and fails when someone adds a test above yours.

## 12. Are Snapshot Tests Worth It?

Rarely, for components. Usually, for serialisable data.

What goes wrong with component snapshots:

- they assert everything, so they fail on every intentional change
- the failure says "the snapshot differs," not "the button is now unreachable"
- the fix is `-u`, which people run without reading, so the snapshot stops being
  a test and becomes a changelog

Where they work:

- a reducer's output for a given action sequence
- a serialised API response shape
- a generated config, a compiled query, a formatted string
- a small, stable, low-level component where the whole markup *is* the contract

Tradeoff:

> An inline snapshot is better than an external one, because the expected value is
> in the test file where a reviewer will actually see it change. A 400-line
> external snapshot in a diff gets approved unread, every time.

The rule:

> If you cannot say what a snapshot failure would mean, it is not a test.

## 13. What Belongs In A Unit, Integration, And End-To-End Test?

| Level | Scope | Cost | What it proves |
| --- | --- | --- | --- |
| Unit | one pure function, one reducer, one hook | milliseconds | the logic is right |
| Integration | a component tree with real providers, mocked network | tens of ms | the feature works |
| End-to-end | the real app against a real or seeded backend | seconds | the system is wired up |

For React specifically, integration is where the value is:

> Most React bugs are wiring bugs — a provider missing, a prop not passed, a state
> update in the wrong place, a request with the wrong key. Unit tests of
> individual components cannot see those, and end-to-end tests see them but cost
> too much to cover every case. A component-tree test with MSW hits the ratio.

Where end-to-end earns its cost:

- the critical path: sign in, checkout, the one flow that must never break
- anything involving a real navigation, redirect, or cookie
- hydration and server rendering, which jsdom cannot reproduce at all
- accessibility checks on the real rendered page

Interview note:

> The pyramid is guidance, not a quota. A common failure is a large suite of
> shallow component unit tests, high coverage, and no test that ever completes a
> user journey. That suite is expensive to maintain and does not stop the
> incidents people care about.

## 14. Why Are Tests Flaky, And How Do You Fix Them?

Flakiness is nearly always a real race being tested at a real speed.

| Cause | Fix |
| --- | --- |
| Missing `await` on an interaction or query | await it — do not add a `waitFor` around the assertion |
| Fixed `setTimeout` in the test | wait for the condition, never for a duration |
| Shared state between tests | fresh client, store, and server handlers per test |
| Test-order dependence | run with a random seed in CI so it fails loudly |
| Real timers with debounced code | fake timers, advanced explicitly, with `userEvent.setup({ advanceTimers })` |
| Animations and transitions | disable them in the test environment |
| Unmocked network | `onUnhandledRequest: "error"` turns a hang into a message |

Important:

> Retrying a flaky test hides the race instead of fixing it, and the race is
> usually in the component, not the test. A test that intermittently sees a stale
> DOM is often reporting a genuine double-render or a missing cleanup that your
> users experience as a flash.

Fix:

> Quarantine, do not retry. Move the flaky test out of the blocking suite with an
> owner and a date, so the signal stays trustworthy while the cause gets fixed.
> A suite people re-run until it goes green has stopped being a gate.

## 15. How Do You Test A Form?

Test the journey, not the fields: fill it in the way a user would, submit, and
assert the request and the resulting UI.

```tsx
test("submits the profile", async () => {
  const { user } = render(<ProfileForm />);

  await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
  await user.selectOptions(screen.getByLabelText("Role"), "admin");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Profile saved")).toBeInTheDocument();
});
```

What is worth asserting:

- the happy path produces the right request body (MSW handler captures it)
- a validation error is announced and associated with its field
- the submit button is disabled while in flight, so double submission is blocked
- a server-side field error lands on the right field
- `getByLabelText` works at all — if it does not, the field has no label, which is
  an accessibility bug your test just caught

Interview note:

> With React Hook Form or another uncontrolled library, `fireEvent.change` often
> does not register the value at all, because the library listens to native input
> events. This is the most common "my form test does not work" question, and
> `user-event` fixes it.

## 16. How Do You Test Accessibility?

In layers, and know what each layer cannot do.

```tsx
// 1. Static violations, in the unit suite.
const { container } = render(<Dialog open />);
expect(await axe(container)).toHaveNoViolations();
```

```tsx
// 2. Keyboard behaviour, which axe cannot see.
await user.click(screen.getByRole("button", { name: "Edit" }));
const dialog = screen.getByRole("dialog", { name: "Edit profile" });

await user.tab();
await user.tab();
expect(dialog).toContainElement(document.activeElement); // focus never escaped

await user.keyboard("{Escape}");
expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus();
```

Then `@axe-core/playwright` against the real page, because jsdom computes neither
layout nor colour and so cannot check contrast, focus visibility, or overlap.

Important:

> Automated tooling catches roughly a third of real accessibility problems. It
> cannot tell you whether a label is *meaningful*, whether focus went somewhere
> *sensible*, or whether the reading order makes sense. So these tests prevent
> regressions; they do not prove accessibility. A manual screen-reader pass
> belongs in the definition of done.

The highest-value free win:

> Writing every query as `getByRole(..., { name })` means the whole suite fails if
> an element loses its accessible name. That is accessibility coverage you get
> without writing a single accessibility test.

## 17. Is Coverage A Useful Gate?

Coverage tells you what was executed, not what was verified. A test with no
assertions gives full coverage of everything it touches.

Where it helps:

- **as a ratchet** — the number may not go down, which stops a large untested
  feature from landing without anyone noticing
- **on the diff, not the total** — "this pull request's new lines are covered" is
  an actionable review comment; "the repo is at 74%" is not
- **as a map** — uncovered branches are a list of things to look at, and error
  paths are usually top of it

Where it misleads:

- a high number with no integration tests means every unit is exercised and the
  feature was never run
- chasing the last few percent drives tests of trivial code and of error branches
  that cannot occur
- it says nothing about assertion quality, which is the thing that matters

Tradeoff:

> A hard threshold changes behaviour, and not always for the better: people write
> a test to pass the gate rather than to catch a bug. Diff coverage plus a review
> culture beats a global percentage, though a global floor is a reasonable
> backstop against regression.

## 18. What Do You Test First In A Legacy App With No Tests?

Not the code that is easiest to test. The code that would cost the most to break.

In order:

1. **A single end-to-end test of the money path.** Sign in, the core action,
   checkout. One test that proves the app is alive catches more real incidents
   than fifty component tests, and it can be written without touching any
   production code.
2. **Characterisation tests around whatever you are about to change.** Not the
   correct behaviour — the *current* behaviour, bugs included. That is what lets
   you refactor safely, and it is the only kind of test worth writing before you
   understand the code.
3. **Pure logic with high branch counts.** Pricing, permissions, date handling,
   discount rules. Highest value per line of test, no rendering required, and
   usually where the subtle bugs live.
4. **The bug you just fixed.** Every production incident gets a regression test as
   part of its fix. This grows the suite along the axis of things that actually
   break in this codebase.
5. **Integration tests for the areas you touch most,** growing outward from the
   code you are working in.

Interview note:

> The instinct to pause feature work for a testing sprint is the wrong answer, and
> saying so is the senior part. Coverage bought that way is coverage of code
> nobody was changing. Testing along the path of the work you are already doing
> means the suite grows where it pays.

Tradeoff:

> Characterisation tests lock in bugs, so each one needs a comment saying it
> describes current behaviour and not desired behaviour. Without that, the next
> person treats a bug as a requirement and the test becomes a reason not to fix
> it.

## 19. How Do You Test Server Components And Server Functions?

Server Components are async functions that return JSX and often touch a database
or a request-scoped API, which makes jsdom the wrong place for them.

Practical split:

| What | Where |
| --- | --- |
| The data function the Server Component calls | a plain unit test — this is where the logic should live |
| The rendered output of a route | end-to-end, against the real server |
| A Server Function's validation and authorisation | a unit test of the exported function |
| The Client Component that consumes the result | a normal integration test, props passed in directly |

The design point:

> Keep Server Components thin. If a Server Component is "await this query, pass it
> to a Client Component," there is very little left to test in the component
> itself — the query is unit-testable and the Client Component is testable with
> props. A Server Component that is hard to test is usually a Server Component
> doing too much.

Important:

> Hydration is not testable in jsdom, because nothing hydrates there. Mismatches
> and streaming behaviour need a real browser against a real server, which is why
> one Playwright smoke test per critical route — asserting zero console errors —
> closes a whole class of bug that unit tests structurally cannot see.

## 20. What Does A Good React Test Suite Look Like In CI?

```txt
on every pull request:
  typecheck        -> fastest, catches the most
  lint             -> includes rules-of-hooks and a11y lint
  unit + integration (parallel, random order, fail on console.error)
  diff coverage report as a PR comment
  build
  e2e smoke on the critical paths only
nightly:
  full e2e suite
  axe scan across key routes
  bundle size report
```

The reasoning:

- **ordered by speed** so the common failure is the fastest one to find out about
- **random order** surfaces test-order dependence instead of letting it lurk
- **fail on unexpected `console.error`** catches act warnings, key warnings, and
  hydration mismatches that otherwise scroll past
- **smoke on PR, full suite nightly** keeps the pull-request loop fast while still
  running broad coverage daily
- **no retries in the blocking suite** so the signal stays meaningful

Interview note:

> The metric that matters is whether people trust the suite. A pipeline that is
> red half the time gets ignored and has negative value, because it trains the
> team to merge past failures. Fewer, more reliable tests beat more, flakier ones
> — and being willing to delete a test that has never caught a bug is part of
> owning a suite.

## Quick Revision Checklist

Be ready to explain:

- assert user-visible behaviour, never state or props
- the query priority, and why `getByRole` is first
- why `user-event` catches bugs `fireEvent` does not
- what an `act` warning means, and why the fix is usually a missing `await`
- `getBy` throws, `queryBy` returns null, `findBy` waits
- why mocking the network beats mocking your own module
- why `onUnhandledRequest: "error"` is worth setting
- how to test a suspending component without hanging the test
- fresh provider instances per test, always
- when a snapshot test is legitimate
- why integration is the sweet spot for React specifically
- flakiness is a real race — quarantine, do not retry
- what accessibility testing can and cannot prove
- coverage on the diff, not the total
- what to test first in an untested codebase, and why not a testing sprint

## Sources Used

- Testing Library guiding principles and query priority documentation
- `user-event` v14 API notes
- MSW request-interception documentation
- React documentation on `act`, StrictMode, and error boundaries
- TanStack Query testing guidance
