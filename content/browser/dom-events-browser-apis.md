# DOM Events And Browser APIs Interview Guide

DOM interview guidance covering node traversal and updates, event propagation,
delegation, custom events, storage options, observers, cancellable fetch, frame
scheduling, and custom elements.

## 1. What Is The DOM, And How Is It Different From HTML And The Render Tree?

The DOM is a live in-memory tree of objects the browser builds from HTML and that
JavaScript can read and change.

```txt
HTML string   -> parsed once at load
DOM tree      -> live objects, changes at runtime
render tree   -> only what paints, styles resolved
```

```html
<div id="app"><p>Hi</p></div>
```

```js
document.getElementById("app").innerHTML = "<p>Changed</p>";
```

The HTML source still says `Hi`. The DOM says `Changed`, and that is what renders.

Why it matters:

"View source" shows the HTML the server sent. DevTools' Elements panel shows the
current DOM. When they disagree, the difference is everything JavaScript has done
since load — which is exactly the gap that server rendering and hydration bugs
live in.

Interview note:

The DOM includes nodes that never paint, such as `<head>` and anything with
`display: none`. The render tree excludes them. They are different trees.

## 2. What Is The Difference Between The DOM Query Methods?

They differ in what they accept and, importantly, whether the result is **live**.

| Method | Returns | Live |
| --- | --- | --- |
| `getElementById` | one element or `null` | n/a |
| `getElementsByClassName` | `HTMLCollection` | **yes** |
| `getElementsByTagName` | `HTMLCollection` | **yes** |
| `querySelector` | first match or `null` | n/a |
| `querySelectorAll` | `NodeList` | no, static snapshot |

A live collection updates itself as the DOM changes:

```js
const live = document.getElementsByClassName("item"); // live
const stat = document.querySelectorAll(".item");      // static

console.log(live.length, stat.length);

document.body.append(
  Object.assign(document.createElement("div"), { className: "item" }),
);

console.log(live.length, stat.length);
```

Output:

```txt
3 3
4 3
```

Interview trap:

Looping over a live collection while removing elements skips items, because the
collection shrinks underneath the index:

```js
// Bad example: removes only half the items.
const items = document.getElementsByClassName("item");
for (let i = 0; i < items.length; i += 1) {
  items[i].remove();
}
```

Fix:

```js
document.querySelectorAll(".item").forEach((item) => item.remove());
```

Important:

`querySelectorAll` returns a `NodeList`, which has `forEach` but not `map` or
`filter`. Use `Array.from()` when you need real array methods.

## 3. How Do You Insert Many DOM Nodes Efficiently?

Each insertion into the live document can invalidate layout. Building off-document
and inserting once is far cheaper.

```js
// Bad example: 1000 separate insertions.
for (const user of users) {
  const li = document.createElement("li");
  li.textContent = user.name;
  list.append(li);
}
```

```js
// Better: one insertion.
const fragment = document.createDocumentFragment();

for (const user of users) {
  const li = document.createElement("li");
  li.textContent = user.name;
  fragment.append(li);
}

list.append(fragment);
```

A `DocumentFragment` is a lightweight container that is not part of the document.
Appending it moves its children in and leaves the fragment empty.

Important:

Prefer `textContent` over `innerHTML` for untrusted text. `innerHTML` parses the
string as markup and will execute injected event handlers, which is a cross-site
scripting risk.

```js
element.textContent = userInput; // safe, always text
element.innerHTML = userInput;   // unsafe with untrusted input
```

Tradeoff:

Modern browsers batch style and layout work until the next frame, so the gap
between these two approaches is smaller than it once was. The fragment still
wins, and it still matters with forced synchronous layout in the loop.

## 4. What Are The Three Phases Of Event Propagation?

An event travels down to the target and back up.

```txt
        ┌─────── document ───────┐
        │   1. CAPTURE  ↓        │
        │   ┌──── div ────┐      │
        │   │  2. TARGET  │      │
        │   └──── button ─┘      │
        │   3. BUBBLE   ↑        │
        └────────────────────────┘
```

```js
document.body.addEventListener("click", () => console.log("body capture"), true);
document.body.addEventListener("click", () => console.log("body bubble"));
button.addEventListener("click", () => console.log("button"));

button.click();
```

Output:

```txt
body capture
button
body bubble
```

The third argument `true` — or `{ capture: true }` — registers on the capture
phase. The default is the bubble phase.

Why it matters:

Capture lets an ancestor see an event **before** the target does, which is how you
build things like a global "close on outside click" that cannot be stopped by a
child.

Interview note:

`focus` and `blur` do not bubble. Use `focusin` and `focusout`, which do, when you
need delegation for focus.

## 5. `event.target` vs `event.currentTarget`

`target` is where the event started. `currentTarget` is the element whose listener
is currently running.

```html
<div id="card">
  <button id="save">Save</button>
</div>
```

```js
card.addEventListener("click", (event) => {
  console.log("target:", event.target.id);
  console.log("currentTarget:", event.currentTarget.id);
});

save.click();
```

Output:

```txt
target: save
currentTarget: card
```

Interview trap:

`currentTarget` is only valid while the handler runs. Reading it later — inside a
`setTimeout` or after an `await` — gives `null`:

```js
card.addEventListener("click", async (event) => {
  await fetch("/save");
  console.log(event.currentTarget); // null
});
```

Fix — capture it synchronously:

```js
card.addEventListener("click", async (event) => {
  const element = event.currentTarget;
  await fetch("/save");
  console.log(element); // the div
});
```

## 6. What Is Event Delegation?

Event delegation attaches one listener to a common ancestor and identifies the
real target when the event bubbles up.

```js
// Bad example: one listener per row, and new rows get none.
document.querySelectorAll(".row button").forEach((button) => {
  button.addEventListener("click", handleClick);
});
```

```js
// Better: one listener for the whole table.
table.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-id]");

  if (!button || !table.contains(button)) {
    return;
  }

  handleClick(button.dataset.id);
});
```

`closest()` walks up from the target to find the matching ancestor, which handles
clicks landing on an icon inside the button.

Benefits:

- one listener instead of hundreds, so less memory
- works for rows added later without rebinding
- no cleanup needed when rows are removed

When not to use it:

For events that do not bubble, such as `focus`, `blur`, and most media events. Use
the bubbling equivalents or bind directly.

Strong answer:

> Delegation puts a single listener on a stable ancestor and uses
> `event.target.closest()` to find what was actually clicked. It scales to large
> lists and keeps working when rows are added or removed dynamically.

## 7. `preventDefault` vs `stopPropagation` vs `stopImmediatePropagation`

They solve three different problems and are frequently confused.

| Method | Stops |
| --- | --- |
| `preventDefault()` | the browser's default action, not propagation |
| `stopPropagation()` | travel to other elements, not other listeners here |
| `stopImmediatePropagation()` | other listeners here **and** propagation |

```js
form.addEventListener("submit", (event) => {
  event.preventDefault(); // no page reload; still bubbles
  submitViaFetch();
});
```

```js
button.addEventListener("click", (event) => {
  event.stopPropagation(); // ancestors never see it
});
```

```js
input.addEventListener("keydown", (event) => {
  console.log("first");
  event.stopImmediatePropagation();
});

input.addEventListener("keydown", () => {
  console.log("second"); // never runs
});
```

Output:

```txt
first
```

Interview note:

`preventDefault()` has no effect on a passive listener, and no effect at all if
the event is not cancellable — check `event.cancelable`.

Tradeoff:

`stopPropagation()` is convenient but invisible from the outside. It silently
breaks delegation and analytics listeners higher in the tree. Prefer a guard
condition in the ancestor over stopping the event in the child.

## 8. What Are Passive Event Listeners?

A passive listener promises never to call `preventDefault()`, which lets the
browser scroll immediately instead of waiting to find out.

```js
window.addEventListener("scroll", onScroll, { passive: true });
element.addEventListener("touchstart", onTouch, { passive: true });
```

Why it matters:

Without the hint, the browser must run your handler before it can scroll, because
the handler might cancel the scroll. On a slow handler this produces visible
scroll jank.

Important:

Browsers already treat `touchstart`, `touchmove`, and `wheel` on `window`,
`document`, and `document.body` as passive by default. Calling `preventDefault()`
in one of those is ignored, with a console warning.

When not to use it:

When you genuinely need to cancel the gesture — a custom drag surface or a
pull-to-refresh implementation. Then pass `{ passive: false }` explicitly.

## 9. How Do You Create And Dispatch Custom Events?

`CustomEvent` carries application data in its `detail` property.

```js
const event = new CustomEvent("cart:add", {
  detail: { id: 42, quantity: 2 },
  bubbles: true,
  cancelable: true,
});

element.dispatchEvent(event);
```

```js
document.addEventListener("cart:add", (event) => {
  console.log(event.detail.id, event.detail.quantity);
});
```

Output:

```txt
42 2
```

Important:

Custom events do **not** bubble by default. Omitting `bubbles: true` is the usual
reason an ancestor listener never fires.

`dispatchEvent` is synchronous — it returns only after every listener has run, and
returns `false` if a listener called `preventDefault()`:

```js
const allowed = element.dispatchEvent(event);

if (allowed) {
  addToCart();
}
```

Use cases:

- decoupling a web component from the page that hosts it
- letting non-framework code signal framework code
- a cancellable hook where a listener can veto an action

## 10. `localStorage` vs `sessionStorage` vs Cookies vs IndexedDB

| | localStorage | sessionStorage | Cookies | IndexedDB |
| --- | --- | --- | --- | --- |
| Lifetime | until cleared | until tab closes | until expiry | until cleared |
| Scope | origin | origin + tab | origin + path | origin |
| Size | ~5–10MB | ~5–10MB | ~4KB | large, disk-limited |
| Sent to server | no | no | **every request** | no |
| API | sync | sync | sync | async |
| Stores | strings | strings | strings | structured data |

```js
localStorage.setItem("theme", "dark");
console.log(localStorage.getItem("theme"));
```

Output:

```txt
dark
```

Objects must be serialised:

```js
localStorage.setItem("user", JSON.stringify({ id: 1 }));
const user = JSON.parse(localStorage.getItem("user") ?? "null");
```

Important:

`localStorage` is synchronous and blocks the main thread, so it is fine for a few
small values and wrong for large or frequent writes. It also throws in some
privacy modes and when the quota is exceeded, so wrap access in `try`/`catch`.

Interview note:

Never store authentication tokens in `localStorage` — any injected script can read
them. An `HttpOnly`, `Secure`, `SameSite` cookie is unreadable from JavaScript,
which is the point.

When to use it:

- **localStorage** — theme, last-used filter, non-sensitive preferences
- **sessionStorage** — per-tab wizard state
- **cookies** — anything the server needs, especially sessions
- **IndexedDB** — offline data, large caches, structured records

## 11. What Is `IntersectionObserver`?

It reports when an element enters or leaves the viewport, asynchronously and
without scroll handlers.

```js
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.src = entry.target.dataset.src;
        observer.unobserve(entry.target);
      }
    }
  },
  { rootMargin: "200px", threshold: 0 },
);

document.querySelectorAll("img[data-src]").forEach((img) => observer.observe(img));
```

| Option | Meaning |
| --- | --- |
| `root` | the scroll container, default the viewport |
| `rootMargin` | grows or shrinks the trigger area, `"200px"` fires early |
| `threshold` | how much must be visible: `0` any pixel, `1` fully |

Use cases:

- lazy-loading images and below-the-fold components
- infinite scroll, by observing a sentinel at the list end
- impression tracking

Benefits over scroll listeners:

- runs off the main thread, so no scroll jank
- no manual `getBoundingClientRect()` calls forcing synchronous layout
- no throttling or debouncing to write

Important:

Always `unobserve` or `disconnect` when done. An observer holding a reference to a
removed element keeps it alive.

## 12. What Are `MutationObserver` And `ResizeObserver`?

`MutationObserver` watches DOM changes:

```js
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    console.log(mutation.type, mutation.addedNodes.length);
  }
});

observer.observe(target, { childList: true, subtree: true, attributes: true });
```

`ResizeObserver` watches element size, not viewport size:

```js
const observer = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const { width } = entry.contentRect;
    entry.target.classList.toggle("narrow", width < 400);
  }
});

observer.observe(card);
```

Why it matters:

`ResizeObserver` reacts to the element's own box. A media query only knows the
viewport, so a component inside a resizable panel cannot respond with media
queries alone.

Interview trap:

Changing size inside a `ResizeObserver` callback can loop. The browser detects
this and logs `ResizeObserver loop completed with undelivered notifications`.
Guard the write so it cannot retrigger the same change.

Tradeoff:

`MutationObserver` is powerful but easy to overuse. If your own code makes the
change, call the function directly instead of observing for it.

## 13. How Do You Cancel A `fetch` Request?

With an `AbortController` and its signal.

```js
const controller = new AbortController();

fetch("/api/search?q=react", { signal: controller.signal })
  .then((response) => response.json())
  .then(render)
  .catch((error) => {
    if (error.name === "AbortError") {
      return; // expected, not a failure
    }
    throw error;
  });

controller.abort();
```

The canonical use is cancelling a stale request when the input changes:

```js
let controller;

input.addEventListener("input", async (event) => {
  controller?.abort();
  controller = new AbortController();

  try {
    const response = await fetch(`/api/search?q=${event.target.value}`, {
      signal: controller.signal,
    });
    render(await response.json());
  } catch (error) {
    if (error.name !== "AbortError") {
      throw error;
    }
  }
});
```

Why it matters:

Without cancellation, responses can arrive out of order and an older, slower
response overwrites a newer one.

The same signal removes event listeners, which is often cleaner than keeping
function references:

```js
const controller = new AbortController();

window.addEventListener("resize", onResize, { signal: controller.signal });
window.addEventListener("scroll", onScroll, { signal: controller.signal });

controller.abort(); // removes both
```

Important:

Aborting rejects the promise with an `AbortError`. Treat it as expected control
flow, not an error to report.

## 14. `requestAnimationFrame` vs `requestIdleCallback` vs `setTimeout`

| API | Runs | Use for |
| --- | --- | --- |
| `requestAnimationFrame` | just before the next paint | animation, DOM measurement |
| `requestIdleCallback` | when the main thread is idle | low-priority background work |
| `setTimeout` | a task, after the delay | deferring to a later turn |

```js
function step(timestamp) {
  element.style.transform = `translateX(${timestamp / 10}px)`;
  requestAnimationFrame(step);
}

requestAnimationFrame(step);
```

`requestAnimationFrame` matches the display refresh rate and pauses in background
tabs, so it does not burn battery when nothing is visible.

```js
requestIdleCallback(
  (deadline) => {
    while (deadline.timeRemaining() > 0 && queue.length > 0) {
      process(queue.pop());
    }
  },
  { timeout: 2000 },
);
```

The `timeout` guarantees it eventually runs even on a busy thread.

Interview note:

`setTimeout(fn, 0)` does not run in zero milliseconds. Nested timeouts are clamped
to about 4ms, and background tabs throttle them heavily. For visual work use
`requestAnimationFrame`, which is tied to the actual frame schedule.

Study path:

How these queue relative to promises and tasks is covered in the JavaScript Event
Loop & Runtime guide.

## 15. Can You Create Custom HTML Tags?

Yes. Browsers render unknown tags as inline elements, but a real custom element
must contain a hyphen and be registered.

```js
class UserCard extends HTMLElement {
  static observedAttributes = ["name"];

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  disconnectedCallback() {
    // cleanup: listeners, observers, timers
  }

  render() {
    this.innerHTML = `<p>${this.getAttribute("name") ?? "Unknown"}</p>`;
  }
}

customElements.define("user-card", UserCard);
```

```html
<user-card name="Mofasser"></user-card>
```

The lifecycle callbacks:

| Callback | Fires when |
| --- | --- |
| `constructor` | the instance is created |
| `connectedCallback` | inserted into the document |
| `disconnectedCallback` | removed from the document |
| `attributeChangedCallback` | an `observedAttributes` entry changes |

The hyphen is required: it guarantees your name can never collide with a future
standard HTML element.

Shadow DOM gives real style encapsulation:

```js
class StyledCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>p { color: red; }</style>
      <p><slot></slot></p>
    `;
  }
}
```

Those styles cannot leak out and page styles cannot leak in.

Tradeoff:

Custom elements are framework-neutral and survive framework migrations, which
makes them good for design systems shared across teams. They are more verbose than
a React component and their server rendering story is weaker.

## 16. How Do You Avoid Memory Leaks With Event Listeners?

A leak happens when something still references a DOM node you meant to discard.

```js
// Bad example: the listener on window outlives the component.
function mount() {
  const panel = document.querySelector("#panel");
  window.addEventListener("resize", () => panel.classList.toggle("wide"));
}
```

The closure holds `panel`, and `window` holds the closure, so removing `#panel`
from the DOM does not free it — it becomes a detached node.

```js
// Better: tear the listener down.
function mount() {
  const panel = document.querySelector("#panel");
  const controller = new AbortController();

  window.addEventListener(
    "resize",
    () => panel.classList.toggle("wide"),
    { signal: controller.signal },
  );

  return () => controller.abort();
}
```

Common leak sources:

- listeners on `window`, `document`, or `body` that are never removed
- `setInterval` without a matching `clearInterval`
- observers without `disconnect()`
- caches keyed by DOM node — use a `WeakMap` so entries are collectable

Important:

A listener attached **to the removed element itself** is collected with it. The
leak comes from listeners on long-lived objects whose closures capture short-lived
elements.

Interview note:

Detached nodes are visible in a DevTools heap snapshot by filtering for
"Detached". A growing detached count across repeated mount and unmount cycles is
the signature of this bug.

## Sources Used

- <https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Introduction>
- <https://developer.mozilla.org/en-US/docs/Web/API/Event>
- <https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Event_bubbling>
- <https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener>
- <https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API>
- <https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API>
- <https://developer.mozilla.org/en-US/docs/Web/API/Resize_Observer_API>
- <https://developer.mozilla.org/en-US/docs/Web/API/AbortController>
- <https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements>
