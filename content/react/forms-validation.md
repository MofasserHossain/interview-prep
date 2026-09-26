# React Forms & Validation Interview Guide

React forms interview guidance covering controlled and uncontrolled inputs, why
large forms re-render, React Hook Form's model, schema validation with zod,
validation timing, multi-step wizards, server-side error mapping, file uploads,
double submission, unsaved-changes guards, React 19 form Actions, and testing.

Forms are where state ownership, validation, accessibility, and error handling all
meet, which is why interviewers use them. A candidate who can explain *why* a
60-field form is slow understands React state better than one who can only name a
library that fixes it.

## Interview Answer Flow

For a form question, answer in this order:

1. Who owns the value — React state, the DOM, or the URL?
2. What re-renders on each keystroke, and does it need to?
3. When does validation run, and what does the user hear when it fails?
4. What happens on a slow network, a double click, and a server rejection?
5. How is the whole journey verified in a test?

## 1. Controlled vs Uncontrolled — What Actually Changes?

The question is only ever "where does the value live".

```tsx
// Controlled: React state is the source of truth. The DOM mirrors it.
<input value={email} onChange={(e) => setEmail(e.target.value)} />

// Uncontrolled: the DOM is the source of truth. React reads it when it needs to.
<input name="email" defaultValue="" ref={inputRef} />
```

| | Controlled | Uncontrolled |
| --- | --- | --- |
| Source of truth | React state | the DOM |
| Re-render per keystroke | yes | no |
| Transform while typing | easy | awkward |
| Validate while typing | easy | needs a read |
| Reading the value | already have it | `ref.current.value` or `FormData` |
| Resetting | set state | `form.reset()` |

When you genuinely need controlled:

- you transform input as the user types — masking, currency, uppercase
- another part of the UI reacts to the value live — a preview, a dependent field
- the value comes from somewhere other than typing — a map click, a calendar

Interview note:

> The framing that lands is that "controlled" is not a best practice, it is a
> *cost* you pay for live access to the value. The React docs default to it because
> it is easier to explain, not because it is always right. Most fields in most
> forms only need their value on submit, and for those, uncontrolled is both
> simpler and faster.

## 2. Why Does A 60-Field Form Re-render On Every Keystroke?

Because of where the state lives, not because of the inputs.

```tsx
// Every keystroke calls setState on the form root, so all 60 fields re-render.
function ProfileForm() {
  const [values, setValues] = useState(initialValues);

  return (
    <form>
      {fields.map((field) => (
        <Input
          key={field.name}
          value={values[field.name]}
          onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
        />
      ))}
    </form>
  );
}
```

One `useState` at the root means the root owns every value, so changing any value
re-renders the root and therefore its whole subtree. Add schema validation on
change and you are also re-validating 60 fields per character.

Three fixes, no library required:

| Fix | How |
| --- | --- |
| Colocate state | each field owns its own `useState`; the root only sees values on submit |
| Go uncontrolled | `FormData` on submit — re-renders **never** |
| Split the component | memoised field components with stable per-field callbacks |

```tsx
// The zero-dependency version. No state, no re-renders, works without JS.
function ProfileForm() {
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    save(data);
  }

  return <form onSubmit={onSubmit}>{/* plain inputs with name= */}</form>;
}
```

Interview note:

> Naming the state-ownership cause before naming a library is what makes this a
> senior answer. "Use React Hook Form" is a correct recommendation that does not
> demonstrate you know why it helps — and colocation fixes the same problem with no
> dependency at all.

## 3. How Does React Hook Form Avoid Per-Keystroke Re-renders?

It keeps form values in a ref-based store outside React state, and registers
inputs as uncontrolled.

```tsx
const { register, handleSubmit, formState: { errors } } = useForm();

// register returns { name, onChange, onBlur, ref } — native handlers, no state.
<input {...register("email")} />
```

Typing mutates the DOM and the internal store. No React state changes, so nothing
re-renders.

| Mechanism | Effect |
| --- | --- |
| Values in a ref store | typing does not touch React state |
| `register` wires native handlers and a ref | the input is uncontrolled |
| `formState` is a Proxy | you subscribe only to the properties you actually read |
| `useWatch` | scopes a subscription to one field's subtree |

The Proxy detail is the interesting one:

> Reading `formState.errors.email` during render subscribes that component to
> error changes only. If you never read `isDirty`, you never re-render when
> dirtiness changes. This is why destructuring `formState` matters — the
> subscription is created by the property *access*, so pulling properties out
> inside a callback rather than during render silently subscribes to nothing.

Tradeoff:

> The DOM being the source of truth is awkward exactly where you need controlled
> behaviour, and `mode: "onChange"` puts validation back on every keystroke, which
> undoes a good part of the benefit. `onTouched` — validate on first blur, then on
> change — is usually the right default: no errors before the user has had a
> chance, then live feedback while they fix it.

## 4. `register` vs `Controller` — When Do You Need Each?

`register` is for anything that behaves like a native input. `Controller` is for
components that do not.

```tsx
// Native, or any component that forwards ref and fires native events.
<input {...register("email")} />

// A third-party component with value/onChange props and no native input.
<Controller
  name="country"
  control={control}
  render={({ field }) => <ReactSelect {...field} options={countries} />}
/>
```

Use `Controller` for:

- most component-library selects, date pickers, and rich text editors
- masked or formatted inputs that transform as you type
- anything whose `onChange` gives you a value rather than an event

Important:

> `Controller` **is** controlled, so that field does re-render on every keystroke.
> That is fine — it is one field, not sixty. The mistake is wrapping every field
> in `Controller` for consistency, which reintroduces exactly the re-render
> behaviour you adopted the library to avoid.

Interview trap:

> `fireEvent.change` often does nothing with `register`, because RHF listens for
> native input events that `fireEvent` does not fully simulate. This is the single
> most common "my form test does not work" question, and `user-event` is the fix —
> it is also a good illustration of why `user-event` catches bugs `fireEvent`
> misses.

## 5. How Do You Share One Validation Schema Between Client And Server?

Define the schema once, infer the type from it, and validate on both sides.

```tsx
// shared/schemas/profile.ts — imported by the form and by the API handler.
export const ProfileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  age: z.coerce.number().int().min(18, "You must be 18 or older"),
});

export type Profile = z.infer<typeof ProfileSchema>;
```

```tsx
// Client: instant feedback.
const form = useForm<Profile>({ resolver: zodResolver(ProfileSchema) });

// Server: the actual enforcement.
const result = ProfileSchema.safeParse(await request.json());
if (!result.success) return badRequest(result.error.flatten());
```

Why both, not either:

| Side | Purpose | Skipping it means |
| --- | --- | --- |
| Client | fast feedback, fewer round trips | the user learns about mistakes one request at a time |
| Server | the actual security boundary | anyone with `curl` writes whatever they like |

Important:

> Client validation is a user-experience feature, never a security control. It
> runs on a machine the user controls and can be bypassed by anyone who opens
> DevTools. The server must validate independently even when the schema is shared,
> because sharing the file does not mean the client ran it.

Interview note:

> `z.infer` giving you the TypeScript type from the runtime schema is the part
> worth calling out: one definition produces validation, types, defaults, and
> coercion together, so they cannot drift. Hand-written types plus separate
> validation rules is two sources of truth for the same contract.

## 6. When Should Validation Run?

Validation timing is a user-experience decision, and the wrong choice makes a form
feel hostile.

| Mode | Behaviour | Feels |
| --- | --- | --- |
| `onSubmit` | validate only on submit | safe, but slow to discover errors |
| `onBlur` | validate when leaving a field | good |
| `onTouched` | validate on first blur, then on change | best default |
| `onChange` | validate every keystroke | aggressive, and expensive |

Why `onChange` is usually wrong:

> It tells the user their email is invalid after they have typed one character.
> Being told you are wrong while still typing is the most complained-about form
> behaviour there is, and it is also the most expensive — a schema parse per
> keystroke across a large form is real work.

Why `onTouched` wins:

> No error until the user has finished a field and moved on. After that, live
> feedback while they correct it, so the error clears the moment it is fixed
> rather than on the next blur. That is the behaviour people expect without being
> able to name it.

Edge cases:

> Validate on submit regardless of mode — fields never touched must still be
> checked, or an untouched required field submits silently. And on a failed submit,
> move focus to the first invalid field or to an error summary, so a keyboard or
> screen reader user is not left wondering why nothing happened.

## 7. How Do You Handle Async Validation?

The classic case: "is this username taken?"

```tsx
const UsernameSchema = z.string().min(3).refine(
  async (value) => (await checkAvailability(value)).available,
  { message: "That username is taken" },
);
```

What makes it hard is not the check, it is everything around it:

| Concern | Handling |
| --- | --- |
| A request per keystroke | debounce the *request*, not the validation |
| Out-of-order responses | a sequence token or an abort signal — the same race as any search |
| Submitting while it is in flight | block submit until pending validation settles |
| The server is the real check | it can be taken between your check and the submit |
| The network fails | do not report "taken" for a failed request |

Important:

> An async check is advisory, always. The username can be taken in the seconds
> between the check passing and the form submitting, so the server must enforce
> uniqueness and the client must handle a rejection on submit anyway. Async
> validation improves the experience; it does not remove the server-error path.

Interview note:

> Debouncing here is legitimate, unlike debouncing as a fix for out-of-order
> responses. The goal is genuinely to make fewer requests, and correctness is
> handled separately by the abort signal — worth saying explicitly, because it
> shows you know what debouncing does and does not solve.

## 8. How Do You Handle Cross-Field Validation?

Validate the object, not the field. Any rule involving two fields belongs at the
schema level.

```tsx
const PasswordSchema = z
  .object({
    password: z.string().min(12),
    confirm: z.string(),
    startDate: z.date(),
    endDate: z.date(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Passwords do not match",
    path: ["confirm"], // attach the error to the field the user should fix
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "End date must be after the start date",
    path: ["endDate"],
  });
```

The `path` option is the detail that matters:

> Without it the error lands on the form root and renders nowhere near the
> problem. With it, the error attaches to the specific field, so
> `aria-describedby` wires up correctly and focus-to-first-error works. An error
> the user cannot locate is barely better than no error.

Edge cases:

> Re-validating the partner field is the part people miss: fixing `password` should
> clear the mismatch error on `confirm`, but nothing changed on `confirm` itself.
> In React Hook Form that is `trigger("confirm")` when `password` changes, or
> `mode: "onChange"` scoped to the pair. Otherwise the user fixes the problem and
> the error stubbornly remains.

## 9. How Do You Build A Multi-Step Wizard?

The real question is where the state lives, and the answer depends on one thing:
what happens if the user refreshes on step 3.

| Where | Survives refresh | Shareable | Good for |
| --- | --- | --- | --- |
| One `useForm` across all steps | no | no | short flows, 2–3 steps |
| URL for the step, form state in memory | step only | partly | most wizards |
| Draft persisted to the server | yes | yes | long or high-value flows |
| `sessionStorage` | yes, same tab | no | a cheap middle ground |

The structure that works for most cases:

```tsx
// One form instance, steps render subsets of it. Validate per step on "Next".
const form = useForm<Application>({ resolver: zodResolver(ApplicationSchema) });

async function next() {
  const valid = await form.trigger(stepFields[step]); // only this step's fields
  if (valid) setStep((s) => s + 1);
}
```

Why one form instance rather than one per step:

> Cross-step validation works, the final submit has every value without merging,
> and going back preserves what was entered. Separate forms per step means
> reconciling several partial objects and losing values on back-navigation, which
> is the most common wizard complaint.

Important:

> Put the step in the URL. It makes the back button work — which users *will*
> press, and which otherwise exits the entire wizard — and it makes the flow
> linkable and testable. This is the same "the URL is an under-used state
> container" point that applies across the data layer.

Tradeoff:

> Server-side drafts are the only thing that survives a closed laptop, and for a
> 30-minute mortgage application that is not optional. The cost is an endpoint, a
> draft lifecycle, and deciding what a half-valid persisted object means — so it
> is overkill for a three-step signup.

## 10. How Do You Map Server-Side Validation Errors Back Onto Fields?

The server must be able to reject per field, and the client must be able to place
those errors.

```ts
// A shape the client can act on, rather than a single string.
{
  "errors": {
    "email": "That email is already registered",
    "age": "Must be 18 or older"
  }
}
```

```tsx
async function onSubmit(values: Profile) {
  const response = await save(values);

  if (!response.ok) {
    const { errors } = await response.json();

    Object.entries(errors).forEach(([field, message]) => {
      form.setError(field as keyof Profile, { type: "server", message });
    });

    // Send focus to the first problem, or it is announced to nobody.
    form.setFocus(Object.keys(errors)[0] as keyof Profile);
    return;
  }

  onSuccess();
}
```

The contract that makes this possible:

| Requirement | Why |
| --- | --- |
| Errors keyed by field path | otherwise the client can only show a banner |
| Paths matching the client's field names | `user.email` versus `email` breaks the mapping silently |
| A form-level error slot | some failures are not about one field — "card declined" |
| A distinct status for validation | `422` for "you sent bad data", `500` for "we broke" |

Important:

> Server errors must not be cleared by the next keystroke on an unrelated field, and
> must be cleared when the user edits the field they apply to. Getting this wrong
> produces the two worst behaviours: an error that vanishes before the user reads
> it, or one that persists after it has been fixed.

Interview note:

> Zod's `error.flatten()` gives you `fieldErrors` keyed by path on the server,
> which is already the shape above — so a shared schema plus `flatten` means the
> mapping needs no bespoke translation layer on either side.

## 11. How Do You Handle A File Upload With Progress?

The detail that catches people out: `fetch` cannot report upload progress.

```tsx
// XMLHttpRequest is still the answer for upload progress in 2025.
function upload(file: File, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress((event.loaded / event.total) * 100);
    });

    request.addEventListener("load", () => resolve());
    request.addEventListener("error", () => reject(new Error("Upload failed")));

    request.open("POST", "/api/upload");
    request.send(formDataWith(file));
  });
}
```

Why not `fetch`:

> `fetch` exposes *download* progress through a response body stream, but the
> request body is not observable — there is no upload progress event. Request
> streaming exists but requires HTTP/2, a duplex flag, and is not broadly usable
> for this. So either `XMLHttpRequest`, or an upload library that wraps it.

What a production upload needs beyond progress:

| Concern | Handling |
| --- | --- |
| Validate before uploading | type and size checked client-side, then again server-side |
| Cancel | `request.abort()`, wired to a visible cancel button |
| Large files | chunked or resumable upload, not one request |
| Direct to storage | a presigned URL, so the file never passes through your API |
| Retry | resume from the last chunk, not from zero |
| Accessibility | progress in a live region, not only a visual bar |

Interview note:

> Presigned direct-to-storage uploads are the answer that shows production
> experience. Routing a 2 GB file through your application server costs memory,
> request timeouts, and bandwidth for no benefit — the browser should upload
> straight to object storage and hand your API the resulting key.

## 12. How Do You Prevent Double Submission?

Three layers, because the first two can both fail.

```tsx
// 1. Disable while in flight. Handles the double-click.
<button type="submit" disabled={isSubmitting}>
  {isSubmitting ? "Saving…" : "Save"}
</button>
```

```tsx
// 2. React 19: the submit button reads the parent form's state directly.
function SubmitButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? "Saving…" : "Save"}</button>;
}
```

```ts
// 3. The only real guarantee: an idempotency key the server deduplicates on.
await fetch("/api/orders", {
  method: "POST",
  headers: { "Idempotency-Key": submissionId },
  body,
});
```

Why the third layer is necessary:

> Disabling the button does not stop a retried request after a timeout, a user
> with two tabs open, a flaky connection that resends, or anyone using the API
> directly. For anything that creates a charge or an order, the server must be
> able to recognise a repeat of the same logical submission and return the
> original result rather than doing it twice.

Important:

> `useFormStatus` must be called from a component *inside* the `<form>`, not from
> the component that renders the form. Calling it in the form component returns
> `pending: false` forever, which looks like the hook is broken and is the most
> common React 19 form question.

## 13. How Do You Warn About Unsaved Changes?

Two different navigations, two different mechanisms, and you need both.

```tsx
// Leaving the site entirely: close tab, reload, type a new URL.
useEffect(() => {
  if (!isDirty) return;

  function onBeforeUnload(event: BeforeUnloadEvent) {
    event.preventDefault();
    event.returnValue = ""; // the browser shows its own generic message
  }

  window.addEventListener("beforeunload", onBeforeUnload);
  return () => window.removeEventListener("beforeunload", onBeforeUnload);
}, [isDirty]);
```

```tsx
// In-app navigation: beforeunload never fires, because the document never unloads.
useBlocker(({ currentLocation, nextLocation }) =>
  isDirty && currentLocation.pathname !== nextLocation.pathname,
);
```

| Navigation | Mechanism | Custom message |
| --- | --- | --- |
| Close, reload, external link | `beforeunload` | no — browsers show a fixed string |
| Router navigation | the router's blocker API | yes, your own dialog |
| Browser back within the SPA | router blocker, with caveats | yes |

Edge cases:

> Register `beforeunload` only while the form is dirty. A permanently registered
> handler disables the back-forward cache, which makes every back navigation a
> full page load for every user — a real performance regression in exchange for a
> warning nobody needed.

Tradeoff:

> The better answer is often to not need the prompt: autosave a draft and tell the
> user it is saved. A confirmation dialog interrupts, and people click through
> dialogs reflexively — so a prompt protects the form less well than a draft does.

## 14. How Do React 19 Form Actions Change Things?

A `<form action={fn}>` takes a function instead of a URL, and React wires
submission, pending state, and errors around it.

```tsx
function UpdateProfile() {
  const [state, formAction, isPending] = useActionState(
    async (previous: State, formData: FormData) => {
      const parsed = ProfileSchema.safeParse(Object.fromEntries(formData));
      if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

      await save(parsed.data);
      return { success: true };
    },
    { errors: {} },
  );

  return (
    <form action={formAction}>
      <input name="name" aria-invalid={!!state.errors?.name} />
      <button disabled={isPending}>Save</button>
    </form>
  );
}
```

What it gives you:

| Feature | Detail |
| --- | --- |
| Pending state | from `useActionState` or `useFormStatus`, no manual flag |
| Automatic reset | the form resets on a successful action |
| Progressive enhancement | in a server-rendered framework, the form submits before JS loads |
| Uncontrolled by design | the action receives `FormData`, so no per-keystroke state |
| Composes with `useOptimistic` | an optimistic value that is discarded when the action settles |

Progressive enhancement is the real differentiator:

> With a Server Function as the action, the form works as a plain HTML form
> submission before hydration. A user on a slow connection who submits during
> those two seconds gets their submission handled instead of silently dropped.
> That is not achievable with an `onSubmit` handler, which needs JavaScript to
> exist.

Tradeoff:

> `FormData` is all strings, and `Object.fromEntries` keeps only the last value for
> a repeated name — so checkboxes and multi-selects need `formData.getAll()`.
> Zod's `coerce` handles the string-to-number problem, and this is exactly why the
> schema layer belongs in the action rather than trusting the shape.

Interview note:

> For a complex client-side form with live cross-field validation and conditional
> sections, React Hook Form is still the better tool — Actions shine for
> submission-centric forms where progressive enhancement matters. They are
> complementary, and saying so is better than treating Actions as a replacement.

## 15. How Do You Make Form Errors Accessible?

Three things must be true: the error is associated with its field, the field is
marked invalid, and the user is told the submit failed.

```tsx
<label htmlFor="email">Email</label>
<input
  id="email"
  type="email"
  {...register("email")}
  aria-invalid={errors.email ? true : undefined}
  aria-describedby={errors.email ? "email-error" : undefined}
/>
{errors.email && <p id="email-error">{errors.email.message}</p>}
```

| Piece | Why |
| --- | --- |
| `<label htmlFor>` | the accessible name, and clicking it focuses the field |
| `aria-invalid` | the field announces as invalid when focused |
| `aria-describedby` | the message is read as part of the field |
| `type="email"` | native semantics and the right mobile keyboard |

On a failed submit, move focus to the first invalid field or to an error summary
with links to each problem. Without that, a keyboard user presses Save and
nothing appears to happen.

Interview trap:

> A placeholder is not a label. It disappears on typing, is usually too
> low-contrast to read, and in some browser and screen-reader combinations is never
> announced. A form built on placeholders alone is unusable for anyone who needs to
> check what they entered.

See `react/accessibility.md` for the error summary pattern and live regions.

## 16. How Do You Test A Form?

Test the journey the user takes, not the fields in isolation.

```tsx
test("submits the profile", async () => {
  const user = userEvent.setup();
  render(<ProfileForm />);

  await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
  await user.type(screen.getByLabelText("Email"), "ada@example.com");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Profile saved")).toBeInTheDocument();
});

test("shows a server error on the right field", async () => {
  server.use(
    http.post("/api/profile", () =>
      HttpResponse.json({ errors: { email: "Already registered" } }, { status: 422 }),
    ),
  );

  // …fill and submit…
  expect(await screen.findByText("Already registered")).toBeInTheDocument();
  expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
});
```

Worth asserting:

- the happy path sends the right request body — the MSW handler captures it
- a validation error is shown and associated with its field
- the submit button is disabled while in flight
- a server field error lands on the right field
- `getByLabelText` works at all — if it does not, the field has no label, and the
  test just caught an accessibility bug

Interview note:

> Using `getByLabelText` rather than a test id is the choice that makes a form
> suite double as accessibility coverage. Every field must be labelled for the test
> to even find it, so an unlabelled field fails a test instead of shipping.

## 17. What Are The Most Common React Form Bugs?

| Bug | Fix |
| --- | --- |
| Controlled input with `value` and no `onChange` | add the handler, or use `defaultValue` |
| `value={undefined}` then a real value | the input switches from uncontrolled to controlled — default to `""` |
| The whole form re-rendering per keystroke | colocate state, or go uncontrolled |
| Validating on change from the first character | `onTouched` |
| No focus move on a failed submit | focus the first invalid field or a summary |
| Only a banner for field-level server errors | key errors by field path |
| Double submission possible | disable while pending, plus an idempotency key |
| Server error cleared by editing an unrelated field | scope clearing to the field it applies to |
| `Object.fromEntries(formData)` with checkboxes | `formData.getAll()` |
| Number input producing a string | `z.coerce.number()` |
| Placeholder used as the label | a real `<label htmlFor>` |
| Resetting with state instead of `defaultValues` | `form.reset(values)` |

Interview note:

> The uncontrolled-to-controlled warning is worth knowing by name, because the
> cause is almost always an async default — the form renders before the data
> arrives, so `value` is `undefined` on the first render and a string afterwards.
> The fix is either `?? ""` or not rendering the form until the defaults exist.

## 18. How Would You Design A Reusable Form Field Component?

Wrap label, control, help text, and error into one component, so the
accessibility wiring cannot be forgotten.

```tsx
type FieldProps = {
  name: string;
  label: string;
  hint?: string;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
};

function Field({ name, label, hint, children }: FieldProps) {
  const id = useId();
  const { formState: { errors } } = useFormContext();
  const error = errors[name]?.message as string | undefined;

  const describedBy = [hint && `${id}-hint`, error && `${id}-error`]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && <p id={`${id}-hint`}>{hint}</p>}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error && <p id={`${id}-error`}>{error}</p>}
    </div>
  );
}
```

What this buys:

| Property | Why it matters |
| --- | --- |
| `useId` for ids | unique per instance, and SSR-safe — no collisions when the field is reused |
| Wiring is internal | nobody can ship a field with an unassociated error |
| Render prop for the control | works with `input`, `select`, or a `Controller`-wrapped component |
| One place to change | an accessibility fix lands everywhere at once |

Tradeoff:

> A render prop is more ceremony than a `<TextField>` that renders its own input,
> and for a design system with a fixed set of control types the simpler API is
> better. The render prop earns its place when product teams need to drop in
> arbitrary controls — the alternative is a `Field` with twenty boolean props,
> which is the API smell this avoids.

Interview note:

> `useId` is the detail to volunteer. Hand-rolled id generation with a counter or
> `Math.random()` produces a server/client mismatch and a hydration error, and
> that is precisely the problem `useId` was added to solve.

## Quick Revision Checklist

Be ready to explain:

- controlled versus uncontrolled is about where the value lives, not best practice
- why a 60-field form re-renders, and three fixes with no library
- how React Hook Form's ref store and `formState` Proxy avoid re-renders
- `Controller` is controlled — use it per field, not everywhere
- one zod schema, `z.infer` for the type, validated on both sides
- client validation is UX; the server is the security boundary
- `onTouched` as the default validation mode, and why `onChange` feels hostile
- async validation is advisory — the server still enforces
- cross-field rules belong on the object, with `path` to place the error
- one form instance across wizard steps, and the step in the URL
- server errors keyed by field path, with focus moved to the first
- `fetch` cannot report upload progress — `XMLHttpRequest` or a presigned upload
- disable, `useFormStatus`, and an idempotency key for the real guarantee
- `beforeunload` for leaving the site, a router blocker for in-app navigation
- what form Actions give you, and why progressive enhancement is the differentiator
- `aria-invalid` plus `aria-describedby`, and why a placeholder is not a label
- `getByLabelText` makes a form suite double as accessibility coverage
- `useId` for field ids, because hand-rolled ids break hydration

## Sources Used

- React documentation for form Actions, `useActionState`, `useFormStatus`,
  `useOptimistic`, and `useId`
- React Hook Form documentation: `register`, `Controller`, `formState`
  subscriptions, validation modes, and `setError`
- Zod documentation for `refine`, `superRefine`, `coerce`, `flatten`, and `infer`
- MDN documentation for `FormData`, `XMLHttpRequest.upload`, and `beforeunload`
- Related topics in this repository: `react/accessibility.md` for error
  announcement, and `react/19-features.md` for Actions
