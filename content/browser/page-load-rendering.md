# Browser Page Load And Rendering Interview Guide

Browser interview guidance covering navigation, DNS and TLS, HTTP responses,
how content types are decided, HTML parsing, CSSOM, the render tree, layout,
paint, compositing, script loading order, and Core Web Vitals.

## 1. What Happens When You Type A URL And Press Enter?

The browser turns a typed string into pixels through a fixed sequence of steps.

```txt
URL parsing
  -> DNS lookup          (hostname -> IP address)
  -> TCP connection      (three-way handshake)
  -> TLS handshake       (https only)
  -> HTTP request
  -> HTTP response       (status, headers, body)
  -> content type decided from headers
  -> HTML parsing        (DOM)
  -> CSS parsing         (CSSOM)
  -> render tree
  -> layout -> paint -> composite
```

Why it matters:

Most "the page is slow" questions are really about which of these steps is slow.
Naming the step lets you name the fix: DNS and TLS cost is fixed by `preconnect`,
server time by caching, parsing time by smaller payloads, and paint time by
simpler CSS.

Interview note:

The steps before the first byte arrives are network cost. Everything after it is
rendering cost. Say which half you are optimizing.

## 2. How Does The Browser Know Whether A File Is HTML, CSS, Or JavaScript?

The **`Content-Type` response header decides**, not the file extension.

```txt
GET /app.js HTTP/1.1

HTTP/1.1 200 OK
Content-Type: text/javascript; charset=utf-8
```

The server maps an extension to a MIME type when it builds the response, but the
browser only ever sees the header. A file named `styles.css` served as
`text/plain` is not treated as CSS.

Common MIME types:

| Resource | Content-Type |
| --- | --- |
| HTML | `text/html` |
| CSS | `text/css` |
| JavaScript | `text/javascript` |
| JSON | `application/json` |
| SVG | `image/svg+xml` |
| Plain text | `text/plain` |

Important:

In standards mode a stylesheet is ignored unless it is served as `text/css`, and
an ES module is rejected unless it has a JavaScript MIME type. This is why a
misconfigured server produces an unstyled page with no obvious error.

Example of the failure:

```txt
Refused to apply style from '/styles.css' because its MIME type
('text/plain') is not a supported stylesheet MIME type.
```

Tradeoff:

When the header is missing or generic such as `application/octet-stream`, the
browser may **sniff** the bytes and guess. Sniffing is convenient but a security
risk: a user-uploaded file guessed as HTML can run script on your origin.

Fix:

```txt
X-Content-Type-Options: nosniff
```

This tells the browser to trust the declared type and never guess.

Interview note:

Local `file://` URLs have no headers, so the browser falls back to the file
extension. That is why some things work locally and break once deployed.

## 3. What Is The Critical Rendering Path?

The critical rendering path is the minimum set of work between receiving HTML and
painting the first pixels.

```txt
HTML -> DOM  ─┐
              ├─> render tree -> layout -> paint -> composite
CSS  -> CSSOM ┘
```

Both the DOM and the CSSOM are required before anything can render, which is why
CSS is described as render-blocking.

```viz
type: flow
title: Critical rendering path
HTML bytes :: tokenized and parsed incrementally
DOM tree :: structure only, no styles
CSSOM :: every stylesheet must arrive first
Render tree :: DOM + CSSOM, minus display:none
Layout :: geometry for every box
Paint :: fill pixels into layers
Composite :: stack layers on the GPU
```

Why it matters:

Anything you remove from this path shows content sooner. Anything you add to it
delays the first paint for every visitor.

Strong answer:

> The critical rendering path is DOM plus CSSOM into a render tree, then layout,
> paint, and composite. To speed it up I shrink and inline critical CSS, defer
> non-essential JavaScript, and remove render-blocking requests from the head.

## 4. How Does The Browser Turn HTML Into The DOM?

Parsing runs in two stages and is **incremental** — the browser does not wait for
the whole document.

```txt
bytes -> characters -> tokens -> nodes -> DOM tree
```

```html
<p>Hello <span>world</span></p>
```

Produces:

```txt
p
└── #text "Hello "
└── span
    └── #text "world"
```

Why it matters:

Because parsing is streaming, the browser can show content before the HTML
finishes downloading. Anything that stops the parser, such as a blocking script,
throws that advantage away.

Interview note:

The DOM is a tree of nodes, not the HTML string and not what you see on screen.
The visual result is the render tree, which comes later.

## 5. How Does The Browser Build The CSSOM, And Why Is CSS Render-Blocking?

CSS is parsed into the CSSOM, a tree of rules with computed values inherited down
the tree.

```css
body { font-size: 16px; }
p    { font-size: 0.875em; }
```

The browser cannot know a paragraph's final size until it has seen **every**
stylesheet, because a later rule can override an earlier one.

Why it matters:

Partial CSS would cause a flash of wrongly styled content, so the browser blocks
rendering until the CSSOM is complete.

```html
<link rel="stylesheet" href="/theme.css" />
```

Important:

CSS blocks rendering, not HTML parsing. The DOM keeps building while stylesheets
download. CSS does, however, block any script that follows it, because a script
may read computed styles.

Tradeoff:

Splitting CSS into many small files improves caching but adds requests to the
critical path. Inlining critical CSS paints sooner but cannot be cached
separately.

## 6. What Is The Render Tree, And How Is It Different From The DOM?

The render tree contains only what will actually be painted, with styles already
resolved.

```txt
DOM  (structure)  +  CSSOM (styles)  ->  render tree (what paints)
```

Excluded from the render tree:

- `<head>`, `<meta>`, `<script>`, `<title>`
- any element with `display: none`

Included in the render tree:

- elements with `visibility: hidden` — they occupy space but are not drawn
- generated `::before` and `::after` content, which has no DOM node

Example:

```css
.a { display: none; }    /* not in the render tree, takes no space */
.b { visibility: hidden; } /* in the render tree, still takes space */
```

Interview note:

This is the precise reason `display: none` and `visibility: hidden` behave
differently in layout. One never enters the tree; the other enters it and is
skipped at paint time.

## 7. What Happens During Layout, Paint, And Compositing?

These are the three stages after the render tree exists.

| Stage | Question it answers | Typical cost |
| --- | --- | --- |
| Layout | where and how big is every box | expensive, geometry for the whole subtree |
| Paint | what colour is each pixel | moderate, fills layers with draw commands |
| Composite | how are the layers stacked | cheap, runs on the GPU |

Layout is also called reflow. It computes exact positions and sizes, so changing
one element's width can move everything after it.

Paint fills those boxes into one or more layers. Compositing then stacks the
layers to produce the final frame.

Why it matters:

The later the stage you can confine a change to, the cheaper the change. A
property that only composites is far cheaper than one that forces layout.

## 8. How Do Script Tags Block Parsing, And What Do `async` And `defer` Change?

A plain `<script>` stops HTML parsing while it downloads **and** executes.

```html
<script src="/app.js"></script>
```

```txt
parsing ──stop──[ download ][ execute ]──resume── parsing
```

The three loading modes:

```html
<script src="/a.js"></script>          <!-- blocks parsing -->
<script src="/b.js" async></script>    <!-- parallel, runs ASAP -->
<script src="/c.js" defer></script>    <!-- parallel, runs after parsing -->
```

| Mode | Blocks parsing | Execution time | Order guaranteed |
| --- | --- | --- | --- |
| none | yes | immediately, mid-parse | yes, document order |
| `async` | no | as soon as it downloads | **no** |
| `defer` | no | after parsing, before `DOMContentLoaded` | yes, document order |
| `type="module"` | no | deferred by default | yes, document order |

When to use it:

- `defer` for application code that needs the DOM and depends on other scripts
- `async` for genuinely independent scripts such as analytics
- `type="module"` for modern code — it is deferred automatically

Interview trap:

`async` scripts execute in **download order**, not document order. Two `async`
scripts where one depends on the other is a race condition that passes locally
and fails on a slow network.

Interview note:

Putting scripts at the end of `<body>` was the old workaround for the same
problem. `defer` is better because downloading starts earlier while execution
still waits.

## 9. How Do Multiple Scripts Execute In Order On One Page?

Every classic script shares one global environment, and they run as separate jobs
in a defined order.

```html
<script src="/one.js"></script>
<script>console.log("inline");</script>
<script src="/two.js" defer></script>
<script src="/three.js" async></script>
```

Execution order:

```txt
1. one.js       blocking, in document order
2. inline       blocking, in document order
3. three.js     async, whenever it finishes downloading (may be earlier)
4. two.js       defer, after parsing completes
```

Because classic scripts share the same global object, a `var` or function
declared in one file is visible in the next:

```js
// one.js
var appName = "prep";

// two.js
console.log(appName);
```

Output:

```txt
prep
```

Important:

Module scripts do **not** work this way. Each module has its own scope, so a
top-level `const` in a module is private to that module and must be exported.

```html
<script type="module" src="/main.js"></script>
```

Tradeoff:

Shared globals across classic scripts make load order load-bearing and fragile.
Modules trade that implicit sharing for explicit imports and a real dependency
graph.

Study path:

For the specification-level mechanics of how these scripts get their scope, see
the JavaScript Execution Context & Lexical Environment guide.

## 10. What Is The Preload Scanner?

The preload scanner is a lightweight secondary parser that reads ahead through the
raw HTML while the main parser is blocked, and starts downloading resources it
finds.

```html
<script src="/blocking.js"></script>
<img src="/hero.jpg" />
<link rel="stylesheet" href="/theme.css" />
```

While `blocking.js` stalls the main parser, the preload scanner has already
started fetching `hero.jpg` and `theme.css`.

Why it matters:

It is a large part of why blocking scripts are survivable at all. It also
explains a common performance trap.

Interview trap:

The scanner only sees markup in the HTML response. Resources injected by
JavaScript are invisible to it:

```js
// Bad example: the scanner cannot see this.
const img = new Image();
img.src = "/hero.jpg";
```

Fix:

Keep important resources in the HTML, or declare them explicitly with
`<link rel="preload">`.

## 11. What Do `preload`, `preconnect`, And `dns-prefetch` Do?

They are resource hints that move network work earlier.

```html
<link rel="preconnect" href="https://cdn.example.com" />
<link rel="dns-prefetch" href="https://cdn.example.com" />
<link rel="preload" href="/fonts/body.woff2" as="font" crossorigin />
<link rel="prefetch" href="/next-page.js" />
```

| Hint | What it does | Use it for |
| --- | --- | --- |
| `dns-prefetch` | resolves DNS only | third-party origins you will probably use |
| `preconnect` | DNS + TCP + TLS | an origin you will definitely use soon |
| `preload` | downloads a resource now, high priority | fonts, hero images, critical CSS |
| `prefetch` | downloads at low priority for a **future** navigation | the likely next page |

When not to use it:

Preloading everything is self-defeating. Preload competes for bandwidth, so a
long list of preloads delays the very resources that matter. Preload the few
things on the critical path and nothing else.

Interview note:

`preload` is for the current page. `prefetch` is for the next one. Mixing them up
is a common answer mistake.

## 12. What Is The Difference Between Reflow, Repaint, And Composite?

They are the three tiers of cost when something changes.

```txt
change geometry      -> layout -> paint -> composite   (most expensive)
change colour only   ->          paint -> composite
change transform     ->                   composite    (cheapest)
```

```viz
type: queues
title: Cost tiers, most expensive first
Layout :: width, height, top, margin, font-size
Paint :: color, background-color, box-shadow, visibility
Composite :: transform, opacity
```

| Change | Triggers |
| --- | --- |
| `width`, `height`, `top`, `margin`, `font-size` | layout, paint, composite |
| `color`, `background-color`, `box-shadow`, `visibility` | paint, composite |
| `transform`, `opacity` | composite only |

Example:

```js
// Bad example: forces layout on every frame.
element.style.left = `${x}px`;

// Better: composite only.
element.style.transform = `translateX(${x}px)`;
```

Why it matters:

A 60fps animation has about 16ms per frame. Layout on a large subtree does not
fit in that budget; a compositor-only change does.

## 13. What Is Layout Thrashing And How Do You Fix It?

Layout thrashing is forcing the browser to recompute layout repeatedly inside one
frame by interleaving reads and writes.

```js
// Bad example: read, write, read, write...
items.forEach((item) => {
  const width = item.offsetWidth; // read: forces layout
  item.style.width = `${width * 2}px`; // write: invalidates layout
});
```

Reading `offsetWidth` after a write forces a **synchronous layout**, so the loop
triggers one layout per item.

Fix — batch all reads, then all writes:

```js
const widths = items.map((item) => item.offsetWidth); // all reads

items.forEach((item, index) => {
  item.style.width = `${widths[index] * 2}px`; // all writes
});
```

Properties that force synchronous layout when read:

- `offsetTop`, `offsetLeft`, `offsetWidth`, `offsetHeight`
- `scrollTop`, `scrollWidth`, `scrollHeight`
- `clientWidth`, `clientHeight`
- `getBoundingClientRect()`
- `getComputedStyle()`

Strong answer:

> Layout thrashing is interleaving DOM reads and writes so each read forces a
> synchronous layout. I fix it by batching reads before writes, or by measuring
> inside `requestAnimationFrame` so the work happens once per frame.

## 14. Why Do `transform` And `opacity` Animate More Cheaply?

Because they can be handled by the compositor without redoing layout or paint.

An element promoted to its own compositor layer is painted once into a texture.
Animating `transform` then only changes how that existing texture is positioned,
which the GPU does directly.

```css
.card {
  will-change: transform;
  transition: transform 200ms ease;
}

.card:hover {
  transform: translateY(-4px);
}
```

Tradeoff:

Every layer costs memory, and `will-change` on many elements can make performance
worse rather than better. Apply it to the few elements you actually animate, and
remove it when the animation ends.

Interview note:

`opacity` is compositor-friendly, but `visibility` and `background-color` still
require paint. "Animate transform and opacity" is the rule worth remembering.

## 15. When Do `DOMContentLoaded` And `load` Fire?

```js
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM ready");
});

window.addEventListener("load", () => {
  console.log("everything loaded");
});
```

Output:

```txt
DOM ready
everything loaded
```

`DOMContentLoaded` fires when the HTML has been parsed and all **deferred**
scripts have run. It does not wait for images, iframes, or stylesheets.

`load` fires once every subresource has finished, including images and fonts.

Important:

A blocking `<script>` placed after a `<link rel="stylesheet">` waits for that
stylesheet, which in turn delays `DOMContentLoaded`. This is how CSS ends up
delaying an event that supposedly ignores CSS.

When to use it:

- `DOMContentLoaded` for wiring up DOM behaviour
- `load` only when you genuinely need final image dimensions

## 16. How Does The Browser Decide When To Render A Frame?

Rendering is a step in the event loop, not something that happens after every
change. The browser batches style, layout, and paint into a single frame,
typically targeting the display refresh rate.

```txt
run a task
  -> drain microtasks
  -> rendering opportunity (rAF callbacks, style, layout, paint)
  -> next task
```

```js
element.style.width = "100px";
element.style.width = "200px";
element.style.width = "300px";
```

Only one layout happens, at the next rendering opportunity, using the final
value.

Why it matters:

Long synchronous JavaScript occupies the task and the browser never reaches the
rendering step, which is exactly what a frozen page is.

```js
button.addEventListener("click", () => {
  button.textContent = "Saving...";
  expensiveWork(); // the new text never paints until this finishes
});
```

Study path:

The queue mechanics behind this — tasks, microtasks, and their priority — are
covered in the JavaScript Event Loop & Runtime guide.

## 17. What Are Core Web Vitals?

Three field metrics for user-visible performance.

| Metric | Measures | Good |
| --- | --- | --- |
| LCP — Largest Contentful Paint | when the main content appears | ≤ 2.5s |
| CLS — Cumulative Layout Shift | how much content jumps around | ≤ 0.1 |
| INP — Interaction to Next Paint | responsiveness to input | ≤ 200ms |

Common causes and fixes:

- **LCP**: slow server response, render-blocking CSS or JS, unoptimised hero
  image. Fix with caching, critical CSS, `preload` on the hero image.
- **CLS**: images without dimensions, late-loading fonts, banners injected above
  content. Fix by reserving space with `width`/`height` or `aspect-ratio`.
- **INP**: long tasks blocking the main thread. Fix by breaking work up, yielding,
  or moving computation to a worker.

Interview note:

INP replaced First Input Delay as a Core Web Vital. FID measured only the delay
before handling the first input; INP measures the full interaction through to the
next paint, which matches what users actually feel.

## 18. How Would You Diagnose A Slow First Paint?

Work down the critical rendering path in order and stop at the first stage that
is slow.

Method:

1. **Network** — is Time To First Byte high? That is server or DNS/TLS cost, not
   rendering.
2. **Render-blocking resources** — how many stylesheets and blocking scripts are
   in the head?
3. **Parsing** — is the HTML itself very large?
4. **Layout and paint** — is a long task visible in the performance profile?

```txt
Symptom                      Likely cause              First fix
---------------------------  ------------------------  -----------------------
High TTFB, fast render       server or network         caching, CDN, preconnect
Fast TTFB, blank screen      render-blocking CSS/JS    critical CSS, defer
Content appears then jumps   missing image dimensions  set width/height
Painted but unresponsive     long JavaScript task      break up work, yield
```

Strong answer:

> I start with whether the delay is before or after the first byte. Before, it is
> a network or server problem. After, I look at render-blocking resources in the
> head, then at long tasks in the performance profile. Naming the stage first
> stops me from optimising the wrong thing.

## Sources Used

- <https://developer.mozilla.org/en-US/docs/Web/Performance/Critical_rendering_path>
- <https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types>
- <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Content-Type-Options>
- <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script>
- <https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/How_browsers_work>
- <https://developer.mozilla.org/en-US/docs/Web/API/Document/DOMContentLoaded_event>
- <https://web.dev/articles/vitals>
