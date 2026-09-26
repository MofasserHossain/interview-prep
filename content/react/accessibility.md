# React Accessibility Interview Guide

React accessibility interview guidance covering semantic HTML, the rules of ARIA,
accessible names, focus management in a single-page app, modals and focus traps,
roving `tabindex`, live regions, accessible form errors, colour and motion
preferences, and what automated testing can and cannot prove.

Accessibility questions separate candidates quickly, because most React
developers have never navigated their own application without a mouse. The
answers below are the ones that show you have.

## Interview Answer Flow

For an accessibility question, answer in this order:

1. What does the user experience right now — keyboard, screen reader, zoom?
2. Is there a native HTML element that already solves this?
3. What is the accessible name, role, and state of the thing?
4. Where does focus go, and where does it come back to?
5. How is this verified, and what part cannot be automated?

## 1. Why Is Accessibility An Engineering Concern, Not A Compliance Checkbox?

Because the defects are ordinary defects. A button a keyboard user cannot reach is
a broken button; it is not a different category of bug because of who found it.

Why it matters:

- roughly one in six people has a disability, and far more use assistive
  behaviour temporarily — a broken arm, bright sunlight, a trackpad that died
- the same fixes improve everyone's experience: keyboard support helps power
  users, good contrast helps outdoor use, clear focus helps everyone
- accessible markup is machine-readable markup, so it improves SEO and makes
  automated testing dramatically easier
- retrofitting is expensive. A custom dropdown built without a11y in mind is
  usually rewritten, not patched

Interview note:

> The framing that lands is treating it as a correctness property rather than a
> feature request. "Our checkout cannot be completed with a keyboard" is a P1 bug
> in the same way "our checkout cannot be completed in Safari" is a P1 bug. Once
> it is scoped as a browser-support question rather than a charity question, it
> gets prioritised like one.

## 2. Why Semantic HTML Before ARIA?

Because a native element brings role, state, keyboard behaviour, and focus
management with it, and ARIA brings none of those — ARIA only changes how an
element is *described*, never how it behaves.

```tsx
// Needs: role, tabIndex, Enter, Space, :disabled, focus ring, form submission.
<div onClick={save}>Save</div>

// Has all of it already.
<button onClick={save}>Save</button>
```

The five rules of ARIA, which is the answer to "when should I use it":

1. Use a native HTML element or attribute if one exists.
2. Do not change native semantics unless you really have to.
3. Every interactive ARIA control must be usable with the keyboard.
4. Do not put `role="presentation"` or `aria-hidden="true"` on a focusable
   element.
5. Every interactive element must have an accessible name.

Important:

> No ARIA is better than bad ARIA. A wrong `role` actively lies to a screen
> reader, which is worse than saying nothing — a `role="button"` on something that
> does not respond to Space tells the user it will work when it will not. A plain
> `<div>` with no role is merely unhelpful; a mislabelled one is misleading.

The list of elements that do most of the work: `button`, `a` with `href`, `input`
with a `label`, `select`, `textarea`, `dialog`, `details`, `table` with `th`,
`fieldset` with `legend`, and the landmarks — `main`, `nav`, `header`, `footer`,
`aside`.

## 3. What Is An Accessible Name, And How Is It Computed?

The accessible name is the string assistive technology announces for an element.
It is computed from several sources in a fixed precedence order, and only the
first one found is used.

For a typical control, highest priority first:

| Source | Example |
| --- | --- |
| `aria-labelledby` | `<button aria-labelledby="t1">` pointing at another element's text |
| `aria-label` | `<button aria-label="Close">` |
| Native labelling | `<label for>`, `alt` on an image, `<caption>` on a table |
| Content | the text inside `<button>Save</button>` |
| `title` | a fallback, and a poor one — it is not shown on touch or to keyboard users |

Why the order matters in practice:

```tsx
// The visible text is ignored. Screen reader users hear "Close",
// voice-control users saying "click Save" hit nothing.
<button aria-label="Close">Save</button>
```

Interview trap:

> `aria-label` **overrides** visible text rather than supplementing it. That
> breaks voice control, because the user says what they see and nothing matches.
> The rule is that the accessible name must contain the visible label — so for
> anything with visible text, do not add `aria-label` at all.

Where `aria-label` is genuinely right: an icon-only button, and disambiguating
repeated controls.

```tsx
// Icon-only: the SVG is decorative, the button carries the name.
<button aria-label="Delete comment">
  <TrashIcon aria-hidden="true" />
</button>

// Repeated controls: "Edit" five times is useless out of context.
<button aria-label={`Edit ${user.name}`}>Edit</button>
```

## 4. What Do The `tabindex` Values Mean?

| Value | Focusable by click | In tab order | Use for |
| --- | --- | --- | --- |
| absent | depends on element | natively interactive elements only | the default, and usually correct |
| `0` | yes | yes, in DOM order | an element made interactive that has no native equivalent |
| `-1` | yes, and programmatically | **no** | focus targets you move focus to in code |
| positive | yes | yes, **before** everything else | essentially never |

`tabindex="-1"` is the one that does real work:

```tsx
// A heading is not focusable, but you need to send focus here after navigation.
<h1 tabIndex={-1} ref={headingRef}>Dashboard</h1>
```

Why positive values are wrong:

> A positive `tabindex` jumps ahead of every element in the natural order, across
> the whole document. One `tabindex="1"` anywhere reorders the entire page's
> keyboard flow, and the effect compounds as components are reused in contexts
> their author never saw. If the tab order is wrong, fix the DOM order.

Interview note:

> The deeper point is that DOM order *is* tab order. So a layout that uses CSS
> `order`, `grid-area`, or `row-reverse` to move something visually has decoupled
> what the user sees from what they tab through — you can produce a page where
> focus appears to jump randomly without a single `tabindex` in the codebase.

## 5. How Do You Manage Focus On A Client-Side Route Change?

A real navigation resets focus to the top of the document and the screen reader
announces the new page. A client-side route change does neither: the URL and the
DOM change, focus stays wherever it was — often on a link that no longer exists,
which drops focus to `<body>` — and nothing is announced.

The user experience is that they activate a nav link and nothing appears to
happen.

```tsx
function RouteAnnouncer() {
  const { pathname } = useLocation();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Skip the initial load: a real page load already did this.
    headingRef.current?.focus();
  }, [pathname]);

  return <h1 ref={headingRef} tabIndex={-1}>{title}</h1>;
}
```

Two valid approaches, and they are usually combined:

- **Move focus** to the main heading or the `<main>` container, both with
  `tabindex="-1"`. This fixes keyboard users, because the next Tab continues from
  the new content rather than from the top of the page.
- **Announce the route** into a live region, so screen reader users hear that
  navigation happened even though focus handling is imperfect.

Important:

> Do not focus `document.body`. It is what happens by accident already, and it
> means the next Tab starts from the very beginning of the document — so the user
> tabs through the entire header again on every navigation.

Edge cases:

> Skip the focus move on the very first render, or you steal focus from a user who
> deep-linked and is already interacting. And do not move focus on a *partial*
> navigation such as a filter change that updates the query string — that yanks
> focus away from the control they are still using.

## 6. How Do You Build An Accessible Modal?

The requirements, all of which are load-bearing:

| Requirement | Detail |
| --- | --- |
| Focus moves in on open | to the dialog or the first meaningful control |
| Focus is constrained | Tab and Shift+Tab wrap within the dialog |
| The background is inert | out of the tab order **and** out of the accessibility tree |
| Escape closes it | as does the backdrop, if the design says so |
| Focus returns on close | to the element that opened it |
| It is announced | `role="dialog"`, `aria-modal="true"`, and an accessible name |

What a keyboard user experiences without these: focus stays on the trigger behind
the overlay, Tab walks invisibly through the page underneath, Tab past the last
control escapes into browser chrome, Escape does nothing, and on close focus is
lost so the next Tab restarts from the top of the document.

The answer that saves the most work:

```tsx
// The platform gives you the top layer, background inertness,
// Escape-to-close, and the modal semantics.
useEffect(() => {
  if (open) dialogRef.current?.showModal();
  else dialogRef.current?.close();
}, [open]);

return (
  <dialog ref={dialogRef} aria-labelledby="dialog-title" onClose={onClose}>
    <h2 id="dialog-title">Edit profile</h2>
    {children}
  </dialog>
);
```

Fix:

> Use `<dialog>` with `showModal()`, or a tested primitive like Radix or React
> Aria. Hand-rolled focus traps have a long tail — iframes, shadow DOM,
> `contenteditable`, radio groups, and nodes added while the dialog is open — and
> that tail is where every one of them fails.

Interview note:

> Focusing the close button by reflex is a small but real mistake: the first thing
> the user hears is how to leave. Focus the dialog container so the name and
> content are announced, or the first input if the dialog's purpose is to fill one
> in.

## 7. What Does `aria-hidden` Do, And What Is The Inert Problem?

`aria-hidden="true"` removes an element and its subtree from the accessibility
tree. It does **not** remove anything from the tab order.

That gap is the bug:

```tsx
// Broken: the background is hidden from screen readers but still tabbable.
// A keyboard screen-reader user tabs into a button that announces nothing.
<div id="app" aria-hidden={modalOpen}>…</div>
```

This is the "focusable element inside `aria-hidden`" violation, and it is one of
the few things axe reliably catches.

| Tool | Removes from a11y tree | Removes from tab order | Blocks pointer events |
| --- | --- | --- | --- |
| `aria-hidden="true"` | yes | **no** | no |
| `display: none` / `hidden` | yes | yes | yes |
| `inert` | yes | yes | yes |
| `<dialog>` + `showModal()` | yes, for everything below the top layer | yes | yes |

So the correct background treatment is `inert`, not `aria-hidden`:

```tsx
<div id="app" inert={modalOpen ? "" : undefined}>…</div>
```

Where `aria-hidden` *is* right: decorative content that is already
non-interactive, most commonly an icon sitting next to a text label.

```tsx
<button>
  <CheckIcon aria-hidden="true" /> Approve
</button>
```

Interview trap:

> A portal makes this worse. Rendering the dialog at the end of `<body>` means it
> is a *sibling* of your app root, not a child — so `inert` or `aria-hidden` on the
> app root does not affect it, which is why the naive version appears to work. It
> also means you must not apply either to a common ancestor, or you hide the
> dialog from itself.

## 8. What Is Roving `tabindex`, And When Do You Need It?

A composite widget — tabs, a menu, a toolbar, a listbox, a grid — should be **one**
stop in the tab order, with arrow keys moving between its items. Roving
`tabindex` is how you implement that: exactly one item has `tabindex="0"`, every
other has `-1`, and arrow keys move both focus and the `0`.

```tsx
function Tabs({ tabs }) {
  const [active, setActive] = useState(0);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowRight") setActive((i) => (i + 1) % tabs.length);
    if (event.key === "ArrowLeft") setActive((i) => (i - 1 + tabs.length) % tabs.length);
  }

  return (
    <div role="tablist" onKeyDown={onKeyDown}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={index === active}
          tabIndex={index === active ? 0 : -1}
          ref={index === active ? activeRef : undefined}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

Why not just leave everything tabbable:

> A 40-item listbox would be 40 tab stops, so reaching the content after it means
> 40 presses. Arrow-key navigation inside a single tab stop is what the platform
> does for `<select>` and radio groups, and users expect the same from anything
> that looks like them.

The alternative pattern:

> `aria-activedescendant` keeps DOM focus on the container and points at the
> "virtually focused" item by id. It suits a combobox, where focus must stay in
> the text input while the highlighted option changes. Roving `tabindex` moves real
> focus, which is simpler to reason about and works better with browser scrolling.

Edge cases:

> After moving the `0`, you must also call `.focus()` on the new item — changing
> `tabindex` alone moves the *tab stop* but not the current focus, so the user's
> next arrow press goes to the wrong place. And radio groups already do all of
> this natively, so do not rebuild one.

## 9. How Do You Announce Something That Changed Without Moving Focus?

A live region. It announces its own content changes without stealing focus, which
is what you want for a save confirmation, a search result count, a validation
summary, or a toast.

```tsx
// Rendered ALWAYS, empty when there is nothing to say.
<div role="status" aria-live="polite" className="visually-hidden">
  {message}
</div>
```

| Politeness | Behaviour | Use for |
| --- | --- | --- |
| `aria-live="polite"` / `role="status"` | waits for a pause in speech | search counts, save confirmations, loading finished |
| `aria-live="assertive"` / `role="alert"` | interrupts immediately | errors that block the user, session expiry |

Important:

> The live region must already be in the DOM **before** the content changes.
> Mounting a `<div role="alert">Saved</div>` at the same moment the message
> appears frequently announces nothing, because some screen readers only watch
> regions they were already observing. Render an empty region and change its text.

Tradeoff:

> `assertive` interrupts whatever the user is currently hearing, including their
> own typing feedback. Overusing it makes an app hostile to listen to. Default to
> `polite` and reserve `assertive` for something the user must act on now.

Interview note:

> Live regions are the answer to "how do I make this accessible without changing
> the visual design," which is often what the question is really asking. A
> visually hidden `role="status"` announcing "12 results" after a filter change is
> a two-line fix that turns a silent interaction into a comprehensible one.

## 10. How Do You Make Form Errors Accessible?

Three things have to be true: the error is *associated* with its field, the field
is marked *invalid*, and the user is *told* the submit failed.

```tsx
<label htmlFor="email">Email</label>
<input
  id="email"
  type="email"
  aria-invalid={error ? true : undefined}
  aria-describedby={error ? "email-error" : undefined}
/>
{error && <p id="email-error">{error}</p>}
```

| Piece | Why |
| --- | --- |
| `<label for>` | the accessible name, and clicking it focuses the field |
| `aria-invalid` | announces the field as invalid when focused |
| `aria-describedby` | reads the error message as part of the field |
| `type="email"` | native validation and the right mobile keyboard |

For a long form, add an error summary and move focus to it on a failed submit:

```tsx
// Focused on submit failure, so the user hears the problem immediately
// and can jump straight to each field.
<div role="alert" tabIndex={-1} ref={summaryRef}>
  <h2>There are 3 problems with this form</h2>
  <ul>
    <li><a href="#email">Email is not valid</a></li>
  </ul>
</div>
```

Interview trap:

> A placeholder is not a label. It disappears the moment the user types, it is
> usually too low-contrast to read, and in some browser and screen reader
> combinations it is never announced at all. A form built with placeholders only
> is unusable for anyone who needs to check what they have entered — which is
> everyone, eventually.

Edge cases:

> Only set `aria-invalid` once the user has had a chance to be wrong. Marking every
> empty required field invalid on first render announces a broken form before the
> user has typed anything. Validate on blur or submit, not on mount.

## 11. What Is A Skip Link, And Why Does A Single-Page App Need One Especially?

A skip link is the first focusable element on the page, letting a keyboard user
jump past the header and navigation straight to the content.

```tsx
<a href="#main" className="skip-link">Skip to main content</a>
…
<main id="main" tabIndex={-1}>{children}</main>
```

```css
/* Visible only when focused: off-screen, not display:none, or it is not focusable. */
.skip-link {
  position: absolute;
  left: -9999px;
}

.skip-link:focus {
  left: 0;
  top: 0;
}
```

Why a SPA needs it more:

> With a persistent header and 20 nav links, a keyboard user pays that cost once
> on a traditional site — a real navigation resets focus, but each page is a fresh
> document with a fresh skip link. In a SPA, if you also fail to manage focus on
> route change, focus falls to `<body>` and they tab through the whole header on
> *every* navigation.

Important:

> The target needs `tabindex="-1"`. Browsers historically did not move focus to a
> non-focusable fragment target — they scrolled without focusing, so the next Tab
> continued from the skip link and defeated the entire purpose. The attribute is
> what makes the link actually work.

## 12. Why Must Focus Be Visible, And What Is `:focus-visible`?

Without a visible focus indicator, a keyboard user has no cursor. They cannot tell
what Enter will activate. This is the single most common accessibility regression
shipped by design, usually as one line in a CSS reset:

```css
/* The most damaging line in frontend CSS. */
*:focus {
  outline: none;
}
```

`:focus-visible` resolves the tension that caused people to write it — designers
objected to a focus ring appearing on mouse click.

```css
/* Ring for keyboard users, nothing for mouse users, by browser heuristic. */
:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

/* Only suppress the always-on ring where you have provided focus-visible. */
:focus:not(:focus-visible) {
  outline: none;
}
```

Requirements worth knowing:

- the indicator needs **3:1 contrast** against the adjacent background
- `outline-offset` keeps it legible against a same-coloured border
- never rely on colour change alone — a border that only changes hue fails for a
  user with low colour vision
- `outline: none` with a `box-shadow` replacement is fine, *except* in Windows
  High Contrast mode where box-shadow is dropped. `outline` survives it, which is
  why outline is the safer primitive

Interview note:

> It is also worth knowing this is a *design* conversation, not only a code one.
> The productive version is offering `:focus-visible` as the answer to the
> objection — the ring they dislike on click disappears, and the ring keyboard
> users need stays.

## 13. How Do You Make A Custom Select Or Combobox Accessible?

The honest answer first: do not build one.

```tsx
// Accessible, keyboard-navigable, type-ahead, mobile-native, zero code.
<select name="role">
  <option value="admin">Admin</option>
</select>
```

Native `<select>` cannot be styled much, which is why teams replace it — and the
replacement is one of the hardest widgets in ARIA to get right.

What the ARIA combobox pattern requires:

| Concern | Requirement |
| --- | --- |
| Roles | `role="combobox"` on the input, `role="listbox"` on the popup, `role="option"` on items |
| Wiring | `aria-expanded`, `aria-controls`, `aria-activedescendant` |
| Selection | `aria-selected` on the active option |
| Keyboard | Up, Down, Home, End, Enter, Escape, Tab, type-ahead |
| Announcement | option count announced when the list opens or filters |
| Scrolling | the active option scrolled into view without moving DOM focus |
| Mobile | works with a touch screen reader and the on-screen keyboard |

Fix:

> Use Radix, React Aria, Headless UI, or Downshift. These are headless, so you
> keep full styling control — the thing you wanted from a custom select — and
> inherit an implementation that has been tested against real screen readers on
> real devices. Writing this from scratch is weeks of work to reach parity with a
> free dependency.

Interview note:

> Naming the tradeoff is the senior part: the reason to hand-roll is bundle size
> or a genuinely unusual interaction, and those are rarely the actual reason. If a
> team has built its own select, the useful question is which of those seven rows
> they have covered — the answer is usually two.

## 14. How Do You Handle Images, Icons, And Decorative Content?

The question for every image is: does it carry information the surrounding text
does not?

```tsx
// Informative: describe the information, not the picture.
<img src="/chart.png" alt="Revenue grew 40% from Q1 to Q2" />

// Decorative: empty alt, so screen readers skip it entirely.
<img src="/swoosh.svg" alt="" />

// Icon beside a text label: hide it, the text is the name.
<button><SaveIcon aria-hidden="true" /> Save</button>

// Icon-only control: the button needs the name, the icon stays hidden.
<button aria-label="Save"><SaveIcon aria-hidden="true" /></button>
```

The critical distinction:

> `alt=""` and a missing `alt` are completely different. `alt=""` says "this is
> decorative, skip it" and is correct. A missing `alt` makes the screen reader fall
> back to announcing the filename — so users hear "i c n underscore chevron
> underscore right dot s v g".

Rules of thumb:

- if removing the image would lose information, it needs alt text
- do not start alt text with "image of" — the role is already announced
- a linked image's alt text describes the *destination*, not the picture
- a complex chart needs a real text alternative nearby, not a 200-character alt
- background images in CSS are invisible to assistive technology, so never put
  meaningful content there

## 15. How Do You Honour `prefers-reduced-motion`?

Motion causes real symptoms — nausea, dizziness, migraine — for people with
vestibular disorders. The operating system exposes their preference, and honouring
it is a media query.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

For JavaScript-driven animation, read the same signal:

```tsx
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false, // server snapshot
  );
}
```

Tradeoff:

> Reduce is not remove. A blanket kill-switch can break interfaces whose meaning
> depends on transition — a user may lose track of what moved where, and an
> animation used as a loading signal disappears entirely. The better treatment is
> to keep opacity fades and instant state changes while dropping large
> translations, parallax, auto-playing video, and anything that scales across the
> viewport.

Interview note:

> The `useSyncExternalStore` version above is the correct way to read *any* media
> query in React, and it is a good answer to give for that reason. The
> `useState` + `useEffect` version tears under concurrent rendering and misses
> changes between mount and effect.

## 16. How Do You Make A Data Table Accessible?

Use a real table. The semantics are what let a screen reader announce "Revenue,
row 4, £1,200" instead of reading 200 disconnected numbers.

```tsx
<table>
  <caption>Q2 revenue by region</caption>
  <thead>
    <tr>
      <th scope="col">Region</th>
      <th scope="col">Revenue</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">EMEA</th>
      <td>£1,200</td>
    </tr>
  </tbody>
</table>
```

| Element | Why |
| --- | --- |
| `<caption>` | the table's accessible name, announced on entry |
| `<th scope="col">` | column headers, announced with each cell |
| `<th scope="row">` | makes the row identifiable while moving across it |
| `<thead>` / `<tbody>` | lets headers stay announced when the body scrolls |

Where it gets hard in React:

- **Virtualisation** breaks the table. Rows not in the DOM are not in the
  accessibility tree, so "row 400 of 5,000" is wrong and the screen reader cannot
  see most of the data. Mitigate with `aria-rowcount` and `aria-rowindex` on a
  `role="grid"`, and provide a non-virtualised export or a paginated view.
- **`display: flex` or `grid` on table elements** destroys the table semantics in
  several browsers. If you must lay out with flex, add the roles back explicitly
  (`role="table"`, `role="row"`, `role="cell"`) — or reconsider the layout.
- **Sortable headers** need `aria-sort="ascending" | "descending" | "none"` on the
  `<th>`, and the sort control must be a real button inside it.
- **Interactive cells** make it a grid, which brings arrow-key navigation and the
  full `role="grid"` pattern — a significant step up in complexity.

## 17. What Are The Colour And Contrast Requirements?

WCAG 2.1 level AA, which is what most organisations commit to:

| Content | Minimum ratio |
| --- | --- |
| Body text | 4.5:1 |
| Large text (24px, or 18.66px bold) | 3:1 |
| UI components, borders, icons, focus rings | 3:1 |
| Decorative or disabled elements | no requirement |

The second requirement people miss entirely:

> Colour must never be the only way information is conveyed. A red border on an
> invalid field, a green dot for "online", a red line and a green line on a chart —
> each is invisible to a user with colour vision deficiency, which is about 8% of
> men. Pair colour with an icon, a label, a pattern, or text.

```tsx
// Colour alone.
<span className="status-red" />

// Colour plus a name, so it works in greyscale.
<span className="status-red"><AlertIcon aria-hidden="true" /> Failed</span>
```

Interview note:

> Contrast is the one area where automated tooling is genuinely reliable, because
> it is pure arithmetic on two colour values. So there is no excuse for shipping a
> contrast failure — axe in CI catches every one. What it cannot catch is text over
> an image or a gradient, where the effective background varies per pixel.

Tradeoff:

> Disabled controls are formally exempt, and designers often take that to mean
> very low contrast is fine. It is compliant and still bad: users cannot read what
> the control would have done, or even reliably tell it is a control. Exempt is not
> the same as unreadable.

## 18. How Do You Test Accessibility?

In layers, and know the ceiling of each.

```tsx
// 1. Static violations in the unit suite: axe on the rendered output.
const { container } = render(<Dialog open />);
expect(await axe(container)).toHaveNoViolations();
```

```tsx
// 2. Keyboard behaviour, which axe cannot see at all.
await user.click(screen.getByRole("button", { name: "Edit" }));
const dialog = screen.getByRole("dialog", { name: "Edit profile" });

await user.tab();
await user.tab();
expect(dialog).toContainElement(document.activeElement);

await user.keyboard("{Escape}");
expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus();
```

```ts
// 3. Contrast, focus visibility, and overlap need a real browser.
const results = await new AxeBuilder({ page }).analyze();
expect(results.violations).toEqual([]);
```

| Layer | Catches | Cannot catch |
| --- | --- | --- |
| `jest-axe` | missing names, bad ARIA, `aria-hidden` on focusables | anything about layout, colour, or focus order |
| RTL keyboard tests | focus traps, return focus, arrow navigation | whether the announcement makes sense |
| `@axe-core/playwright` | contrast, focus visibility, real computed styles | intent, reading order, meaningful labels |
| Manual screen reader | everything that actually matters | nothing — but it does not scale |

Important:

> Automated tooling catches roughly a third of real accessibility problems. It
> cannot tell you whether a label is *meaningful*, whether focus went somewhere
> *sensible*, or whether the page makes sense read top to bottom. So these tests
> prevent regressions; they do not prove accessibility. A manual pass with
> VoiceOver or NVDA belongs in the definition of done for any new interactive
> component.

The highest-value free win:

> Write every Testing Library query as `getByRole(role, { name })`. The whole
> suite then fails if an element loses its accessible name or its role — real
> accessibility coverage from tests you were writing anyway.

## 19. What Are The Most Common React Accessibility Bugs?

| Bug | Fix |
| --- | --- |
| `<div onClick>` as a button | use `<button>` |
| Icon-only button with no name | `aria-label` on the button, `aria-hidden` on the icon |
| Placeholder used as the label | a real `<label htmlFor>` |
| `outline: none` in a reset | `:focus-visible` with a 3:1 indicator |
| Focus not managed on route change | focus the `<h1>` with `tabindex="-1"` |
| `aria-hidden` on the background behind a modal | `inert`, or `<dialog>` + `showModal()` |
| Error message rendered with no association | `aria-describedby` and `aria-invalid` |
| Async status change with no announcement | a persistent `role="status"` region |
| `aria-label` on an element with visible text | remove it — it breaks voice control |
| `autoFocus` on page load | focus deliberately, and only where the user expects it |
| Modal with no `aria-modal` or accessible name | `role="dialog"`, `aria-labelledby` |
| Heading levels chosen for font size | choose by structure, style with CSS |

Interview note:

> The pattern across almost all of these is a native element replaced by a `<div>`
> for styling reasons. So the highest-leverage habit is not memorising ARIA — it is
> reaching for the native element first and styling it, which removes most of this
> table from your codebase permanently.

## 20. How Would You Introduce Accessibility To A Team That Has Never Considered It?

Not with an audit that produces 4,000 violations and no plan. That gets filed and
ignored.

The sequence that works:

1. **Make it visible once.** A five-minute screen-reader recording of someone
   failing to complete your signup flow changes more minds than any document. Do
   this before proposing any process.
2. **Stop the bleeding first.** Add `eslint-plugin-jsx-a11y` and `jest-axe` to CI,
   but scoped to *new and changed* code so the existing backlog does not block
   every pull request. New violations become impossible; old ones stay on a list.
3. **Fix the critical path.** Not everything — signup, checkout, the primary
   workflow. Depth on the path that matters beats breadth across pages nobody
   uses.
4. **Fix the design system next.** One accessible `<Button>`, `<Input>`,
   `<Dialog>`, and `<Select>` propagate to every product team at once. This is by
   far the best return per hour in the whole programme.
5. **Put it in the definition of done.** Keyboard-only walkthrough for new
   interactive components, and a screen-reader pass for anything novel.
6. **Then** audit, because now findings land in a codebase that can absorb them.

Interview note:

> The ordering argument is the substance of this answer. Steps 2 and 4 are where
> the leverage is — a lint rule prevents an entire class of bug forever at near-zero
> ongoing cost, and fixing a shared component fixes every consumer. Auditing first
> inverts that: maximum effort, maximum noise, and no mechanism to stop the next
> violation being written the same afternoon.

Tradeoff:

> Scoping CI rules to changed files means the codebase stays non-compliant for a
> while, which is uncomfortable if there is a legal deadline. The alternative —
> turning every rule on globally — breaks the build for every team at once and gets
> the rules switched back off within a week. Partial enforcement that survives
> beats total enforcement that gets reverted.

## Quick Revision Checklist

Be ready to explain:

- why semantic HTML beats ARIA, and the five rules of ARIA
- how the accessible name is computed, and why `aria-label` can break voice control
- `tabindex` 0 vs -1 vs positive, and why DOM order is tab order
- what happens to focus on a client-side route change, and how to fix it
- the six requirements of an accessible modal, and why `<dialog>` gives you most
- `aria-hidden` does not affect the tab order — `inert` does
- roving `tabindex`, and when `aria-activedescendant` is the better pattern
- live regions, politeness levels, and why the region must pre-exist
- `aria-invalid` plus `aria-describedby` for form errors, and the error summary
- why a placeholder is not a label
- `:focus-visible`, and the 3:1 indicator requirement
- why you should not hand-roll a combobox
- `alt=""` versus a missing `alt`
- reduce motion, do not remove it
- contrast ratios, and that colour alone is never sufficient
- what automated a11y testing cannot prove
- design system first, audit last

## Sources Used

- WAI-ARIA Authoring Practices, including the dialog, tabs, and combobox patterns
- Rules of ARIA use (Using ARIA, W3C)
- Accessible Name and Description Computation specification
- WCAG 2.1 level AA success criteria for contrast, focus visibility, and use of
  colour
- MDN documentation for `inert`, `<dialog>`, `:focus-visible`, and
  `prefers-reduced-motion`
- axe-core rule descriptions and documented coverage limits
