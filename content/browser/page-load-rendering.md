# Browser Page Load And Rendering Interview Guide

Browser interview guidance covering navigation, DNS and TLS, HTTP responses,
how content types are decided, HTML parsing, CSSOM, the render tree, layout,
paint, compositing, script loading order, parser-, render-, and script-blocking
resources, web fonts, and Core Web Vitals.

The blocking timelines were measured in headless Chrome 153 against a local
server that delays each file by the stated amount. Times count from the HTML
request and are rounded. Absolute times will differ on your machine; the order
of events is the part to learn.

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

Rendering needs the complete CSSOM but only the part of the DOM parsed so far.
That is why CSS is described as render-blocking and HTML is not: the browser
paints whatever DOM it has, but never with half the styles.

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
download. CSS does, however, block the scripts that follow it — every kind
except `async` — because a script may read computed styles.

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
| `async` | only while it runs | as soon as it downloads | **no** |
| `defer` | no | after parsing, before `DOMContentLoaded` | yes, document order |
| `type="module"` | no | deferred by default | yes, document order |

`async` and `defer` only apply to scripts with a `src`. An inline classic script
ignores both.

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
3. three.js     async, as soon as it downloads (here, or after two.js)
4. two.js       defer, after parsing completes
```

Measured with `one.js` taking 1 s: when `three.js` arrived quickly it ran third;
when it took 2 s it ran last, after `DOMContentLoaded`. It can never run before
the scripts above it, because the parser has not created its element yet.

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

## 11. What Is The Difference Between Parser-Blocking, Render-Blocking, And Script-Blocking?

"Blocking" means three different things, and each resource blocks a different
one. Interview answers often blur them.

| Kind | What waits | What keeps going | Typical cause |
| --- | --- | --- | --- |
| Parser-blocking | building the DOM past this tag | downloads, via the preload scanner | a classic `<script>` |
| Render-blocking | the first paint | parsing and downloads | a stylesheet in `<head>` |
| Script-blocking | running the next script | parsing, until it reaches a script | a stylesheet still downloading |

Stylesheets, fonts, and images:

| Resource | Blocks parsing | Blocks the first paint |
| --- | --- | --- |
| `<link rel="stylesheet">` in `<head>` | no | yes |
| stylesheet whose `media` does not match | no | no, but it still downloads |
| stylesheet loaded through `@import` | no | yes, after an extra round trip |
| `<link rel="stylesheet">` inside `<body>` | yes, in Chrome | only for content below it |
| stylesheet added by JavaScript | no | no, unless marked `blocking="render"` |
| web font | no | hides the text that uses it |
| `<img>` | no | no — it delays `load` only |

Scripts:

| Script | Blocks parsing | Waits for pending CSS | `DOMContentLoaded` waits for it |
| --- | --- | --- | --- |
| classic `<script src>` | yes, download and run | yes | yes |
| inline `<script>` | yes, while it runs | yes | yes |
| `<script async>` | only while it runs | no | no |
| `<script defer>` | no | yes | yes |
| `<script type="module">` | no | yes | yes |
| script added by JavaScript | no | no | no — it delays `load` only |

Important:

A classic script in `<head>` also blocks the first paint, but only because no
`<body>` exists yet to paint. The same script at the end of `<body>` lets
everything above it paint first.

Strong answer:

> CSS is render-blocking but not parser-blocking. A classic script is
> parser-blocking. A pending stylesheet is script-blocking — which is how CSS
> ends up stalling the parser whenever a normal script follows it.

## 12. Walk Through A Page Load Where CSS And JavaScript Both Block

Take the classic worst case: a stylesheet and a normal script in `<head>`.

```html
<!doctype html>
<html>
  <head>
    <!-- main.css takes 1 s, analytics.js takes 2 s -->
    <link rel="stylesheet" href="/main.css" />
    <script src="/analytics.js"></script>
  </head>
  <body>
    <h1>Hello</h1>
    <img src="/hero.png" width="200" height="100" />
  </body>
</html>
```

Walkthrough:

```txt
0 s  parser reads <link>: requests main.css, keeps going
0 s  parser reads <script>: requests analytics.js, STOPS
     DOM so far: html > head      CSSOM: pending
0 s  preload scanner reads ahead, requests hero.png
1 s  main.css arrives: CSSOM ready
     DOM still has no <body>: nothing visible to render
2 s  analytics.js arrives and runs (document.body is null)
2 s  parser resumes: <body>, <h1>, <img>, DOMContentLoaded
2 s  render tree: html > body > h1, img
     (head, link, and script are left out)
2 s  layout and paint: heading and image in one frame
```

Measured:

```txt
request    20 ms  /main.css
request    20 ms  /analytics.js
request    20 ms  /hero.png       preload scanner
2023 ms  analytics.js ran, document.body = null
2023 ms  DOMContentLoaded
2036 ms  first contentful paint: heading and image
```

```viz
type: flow
title: What the render tree waits for
DOM :: stops at the script in head, so no body exists yet
CSSOM :: ready at 1 s, with nothing to style
> Script :: 2 s download, then it runs while the parser waits
Render tree :: built at 2 s from the complete DOM and CSSOM
Paint :: heading and image appear in the same frame
```

Swap the delays — stylesheet 2 s, script 1 s — and nothing changes on screen.
The script finishes downloading at 1 s but cannot run until the stylesheet
arrives, because it might read styles. Measured: it ran at 2013 ms.

The same page with the script moved or marked, same delays:

| Version | First paint | `DOMContentLoaded` | Script runs |
| --- | --- | --- | --- |
| `<script>` in `<head>` | 2.0 s | 2.0 s | 2.0 s |
| `<script>` at the end of `<body>` | 1.0 s | 2.0 s | 2.0 s |
| `<script defer>` in `<head>` | 1.0 s | 2.0 s | 2.0 s |
| `<script async>` in `<head>` | 1.0 s | 5 ms | 2.0 s |

Why it matters:

- the stylesheet sets the floor: no version paints before `main.css` arrives
- `defer` and end-of-body fix the first paint but not `DOMContentLoaded`, which
  still waits for the script
- `async` fixes both, at the cost of order: the script runs whenever it lands

Strong answer:

> With a stylesheet and a blocking script in the head, the parser stops at the
> script, so the DOM has no body until the script has downloaded and run — and
> the script cannot run until the stylesheet has arrived. The render tree has
> nothing visible to build, so the screen stays blank for the slower of the
> two. With `defer`, parsing finishes at once and the first paint happens as
> soon as the CSS is ready.

## 13. Why Does A Stylesheet Delay The Script After It?

A stylesheet that is still downloading is **script-blocking**: the browser will
not run a script placed after it until the stylesheet arrives, because the
script might read styles with `getComputedStyle()` or `offsetWidth` and must see
final values. When that script is a normal one, the parser is waiting for the
script, so the stylesheet ends up blocking parsing as well.

```html
<head>
  <!-- slow.css takes 2 s -->
  <link rel="stylesheet" href="/slow.css" />
  <script>
    console.log("inline script ran"); // no download
  </script>
</head>
<body>
  <h1>Title</h1>
</body>
```

Measured:

| `<head>` contents | Inline script runs | `DOMContentLoaded` | First paint |
| --- | --- | --- | --- |
| the stylesheet only | — | 8 ms | 2.0 s |
| stylesheet, then inline script | 2.0 s | 2.0 s | 2.0 s |
| inline script, then stylesheet | 9 ms | 9 ms | 2.0 s |

The inline script needs no download, yet it waits two seconds, and the parser
waits with it.

Which scripts wait? Each script below logs the colour of `<html>`, which
`slow.css` sets to red:

```html
<!-- slow.css takes 1.5 s; a.js and d.js are instant -->
<link rel="stylesheet" href="/slow.css" />
<script async src="/a.js"></script>
<script defer src="/d.js"></script>
```

Output:

```txt
17 ms    async a.js ran, html color = rgb(0, 0, 0)
1517 ms  defer d.js ran, html color = rgb(255, 0, 0)
1517 ms  DOMContentLoaded
```

- classic and inline scripts wait, and hold the parser while they wait
- `defer` and module scripts wait at the end of parsing, so `DOMContentLoaded`
  moves with them
- `async` scripts and scripts added by JavaScript do not wait, and can read
  styles before the stylesheet applies

Fix:

Put inline scripts that never read styles, such as analytics snippets and
feature flags, above the stylesheet links, and keep `<head>` stylesheets small.

Tradeoff:

A script moved above the CSS runs before any styles exist. That is fine for
analytics and wrong for code that measures layout.

Interview trap:

"CSS does not block parsing" is true on its own, and false the moment a normal
script follows the stylesheet.

## 14. What Can A Script See Mid-Parse, And What Can Already Paint?

When a normal script runs, the DOM holds only what the parser has read so far.
The render tree is built from that same partial DOM, so content above the script
can be on screen before the rest of the HTML is parsed.

```html
<head>
  <script>
    console.log(document.body); // <body> not parsed yet
    console.log(document.querySelector("h1"));
  </script>
</head>
<body>
  <h1>Title</h1>
  <script>
    console.log(document.querySelector("h1").textContent);
    console.log(document.querySelector("p"));
  </script>
  <p>Later</p>
</body>
```

Output:

```txt
null
null
Title
null
```

The render tree grows with the DOM. Here the parser stops halfway down the body:

```html
<head>
  <!-- main.css takes 1 s, analytics.js takes 2 s -->
  <link rel="stylesheet" href="/main.css" />
</head>
<body>
  <h1>Hello</h1>
  <script src="/analytics.js"></script>
  <p>After the script</p>
</body>
```

Measured:

```txt
1036 ms  <h1> painted (parser still waiting for the script)
2013 ms  analytics.js ran: querySelector("p") is null
2014 ms  DOMContentLoaded
2020 ms  <p> painted
```

The two trees at each point:

```txt
at 1 s: parser waiting for analytics.js

DOM                        render tree
html                       html
├── head                   └── body
│   └── link                   └── h1           painted
└── body
    ├── h1
    └── script

at 2 s: script ran, parsing finished

DOM                        render tree
html                       html
├── head                   └── body
│   └── link                   ├── h1
└── body                       └── p            painted
    ├── h1
    ├── script
    └── p
```

Why it matters:

This is why scripts at the end of `<body>` worked: everything above them is
already in the DOM and can paint while they download. It is also why a script
in `<head>` that touches `document.body` throws.

Fix:

Run DOM code after parsing: `defer`, `type="module"`, or a `DOMContentLoaded`
listener.

Interview trap:

`defer` only works on scripts with a `src`. On an inline script it is silently
ignored, while an inline module script is deferred:

```html
<!-- defer is ignored here: runs immediately -->
<script defer>
  console.log(document.querySelector("p"));
</script>
<!-- inline module: deferred, runs after parsing -->
<script type="module">
  console.log(document.querySelector("p").textContent);
</script>
<p>Hi</p>
```

Output:

```txt
null
Hi
```

## 15. How Do You Stop CSS From Blocking The First Paint?

Only stylesheets that apply right now need to block the first paint. Everything
else can come off the critical path.

**Give conditional stylesheets a `media` attribute.** A stylesheet whose media
query does not match still downloads, at low priority, but does not block
rendering. On a phone, `desktop.css` below does not hold up the first paint.

```html
<link rel="stylesheet" href="/print.css" media="print" />
<link
  rel="stylesheet"
  href="/desktop.css"
  media="(min-width: 1024px)"
/>
```

Measured with two non-matching stylesheets that each took 3 s: first paint at
48 ms. Both files were still requested at 8 ms, and `load` waited until 3.0 s.

**Inline the critical CSS and load the rest without blocking.**

```html
<head>
  <style>
    /* only what the first screen needs */
    header { height: 64px; background: #111; }
  </style>
  <link
    rel="stylesheet"
    href="/rest.css"
    media="print"
    onload="this.media='all'"
  />
  <noscript>
    <link rel="stylesheet" href="/rest.css" />
  </noscript>
</head>
```

`media="print"` makes the file non-blocking, and `onload` switches it on once it
has arrived. Measured with `rest.css` taking 1.5 s: first paint at 45 ms, and its
rules applied at 1.5 s.

**Avoid `@import` in CSS.** The imported file is discovered only after the
importing file has downloaded, so the two requests run one after the other.

```css
/* a.css */
@import url("/b.css");
```

Measured with each file taking 0.5 s:

| Setup | `b.css` requested | First paint |
| --- | --- | --- |
| `a.css` imports `b.css` | 510 ms | 1.04 s |
| two `<link>` tags | 6 ms | 0.52 s |

**Know what a stylesheet in `<body>` does.** In Chrome, a
`<link rel="stylesheet">` in the middle of `<body>` pauses the parser at that
point. Measured with a 2 s stylesheet: content above it painted at 44 ms, while
content below it and `DOMContentLoaded` both waited 2.0 s. It spreads the
blocking out rather than removing it.

Tradeoff:

Critical CSS paints sooner but paints twice: once with the inline rules, again
when the rest arrives. If the inline CSS misses something on the first screen,
users see it restyle or shift. The `onload` attribute is also an inline event
handler, which a strict Content Security Policy blocks.

Strong answer:

> Only stylesheets that apply right now block rendering. I inline what the first
> screen needs, load the rest with the `media="print"` swap, put media-specific
> CSS behind a `media` attribute, and avoid `@import` because it serializes the
> requests.

## 16. Do Web Fonts Block Rendering?

They do not block the first paint of the page, but they can hide the text that
uses them.

A web font is discovered late. The browser requests it only once the CSSOM and
the DOM show that visible text actually uses it, so the chain is HTML, then CSS,
then the font.

```css
@font-face {
  font-family: "Brand";
  src: url("/fonts/brand.woff2") format("woff2");
  font-display: swap;
}

h1 {
  font-family: "Brand", sans-serif;
}
```

`font-display` decides what that text does while the font downloads. Measured
with a font that took 5 s:

| Value | Text first appears | When the font arrives at 5 s |
| --- | --- | --- |
| `block` | at 3.0 s, invisible until then | swapped in |
| `swap` | at 47 ms, in the fallback font | swapped in |
| `fallback` | at ~0.1 s, in the fallback font | ignored: its 3 s swap window had closed |
| `optional` | at 48 ms, in the fallback font | ignored for this page view |
| `auto` (default) | at ~1.9 s, invisible until then | swapped in |

`auto` leaves the choice to the browser. Chrome stopped hiding the text about
1.9 s into the page load, whether the font request started at 0 s or at 1 s.
Other browsers are free to choose differently.

Late discovery, measured with `fonts.css` taking 1 s and the font 0.5 s:

```txt
no preload:    font requested at 1029 ms (after fonts.css)
with preload:  font requested at    7 ms
```

Fix:

Preload the one or two fonts the first screen needs.

```html
<link
  rel="preload"
  href="/fonts/brand.woff2"
  as="font"
  type="font/woff2"
  crossorigin
/>
```

Important:

`crossorigin` is required even for a same-origin font. Fonts are always fetched
in CORS mode, and a preload without the attribute does not match the real
request. Measured without it, the font downloaded twice: at 10 ms and again at
1030 ms.

Why it matters:

Invisible text delays Largest Contentful Paint when the largest element is text,
and a late swap shifts layout when the fallback font has different metrics. A
metric-matched fallback (`size-adjust`, `ascent-override`) removes most of that
shift; the Next.js Styling & Assets guide shows how `next/font` automates it.

Strong answer:

> Fonts don't block the first paint, but text set in a web font can stay
> invisible while it loads — up to three seconds with `block`. The browser
> discovers fonts late, after the CSS and DOM show they are used, so I preload
> the critical ones and set `font-display` explicitly: `swap` when the brand
> font matters, `optional` when layout stability matters more.

## 17. What Does `blocking="render"` Do?

It marks a script, stylesheet, or `<style>` element as render-blocking without
making it parser-blocking. The page keeps parsing, but nothing paints until that
resource has finished.

```html
<head>
  <script async blocking="render" src="/theme.js"></script>
</head>
```

Measured with `theme.js` taking 1.5 s:

| Tag in `<head>` | `DOMContentLoaded` | First paint |
| --- | --- | --- |
| `<script async src>` | 4 ms | 45 ms |
| `<script async blocking="render" src>` | 13 ms | 1.53 s |
| `<script blocking="render" src>` | 1.51 s | 1.53 s |

When to use it:

For code that must run before the first frame without stalling the parser, such
as applying a saved theme or an experiment that changes layout. It prevents a
flash of the wrong version.

Important:

On a plain `<script src>` the attribute adds nothing: that script already stops
the parser and, in `<head>`, the first paint. It matters with `async`, `defer`,
or `type="module"`, and on stylesheets added by JavaScript, which are otherwise
not render-blocking: measured, an injected stylesheet let the page paint at
84 ms, and the same stylesheet with `blocking="render"` held the paint until
1.55 s. It also only works while `<body>` has not been parsed — the same script
tag inside `<body>` did not delay the first paint (82 ms).

Tradeoff:

Every render-blocking resource delays the first paint for every visitor. At the
time of writing, Chromium (105+) and Safari (18.2+) support the attribute, and
Firefox ignores it and paints earlier, so the page must tolerate a flash there.

Interview trap:

A common explanation shows `<script src="theme.js" blocking="render">` and says
the parser keeps reading. It does not: without `async` or `defer` that script is
parser-blocking, and `DOMContentLoaded` waited the full 1.51 s in the
measurement above.

## 18. Walk Through The Entire Flow Of A Page Load, And The Better Way To Build It

Each earlier question covers one piece. This one runs the whole flow on one
realistic page — a stylesheet that imports another, two scripts, a web font, and
a hero image — built the common way, then the better way, with the same server
delays both times.

```viz
type: flow
title: The entire flow, first byte to a usable page
HTML arrives :: the parser builds the DOM incrementally as bytes stream in
> Stylesheet found :: downloads; blocks the first paint and scripts after it
> Classic script found :: the parser stops until it downloads and runs
Preload scanner :: fetches later scripts, styles, and images meanwhile
CSSOM ready :: every render-blocking stylesheet, imports included, is parsed
Render tree :: the DOM parsed so far plus the CSSOM, minus display none
Layout, paint, composite :: first paint of whatever the DOM holds so far
Web fonts :: requested only now; their text can stay hidden until they land
Parsing ends :: defer and module scripts run, then DOMContentLoaded
Images land :: one without a reserved size shifts the layout
load :: every subresource has finished
After load :: each DOM or style change reruns style, layout, and paint
```

The steps overlap in practice. The two timelines below show the real order.

The page, built the common way:

```html
<!doctype html>
<html>
  <head>
    <!-- styles.css 1 s; it @imports reset.css, 0.5 s -->
    <link rel="stylesheet" href="/styles.css" />
    <!-- vendor.js 1.5 s, app.js 0.5 s -->
    <script src="/vendor.js"></script>
    <script src="/app.js"></script>
  </head>
  <body>
    <!-- the heading uses a web font: 0.3 s -->
    <h1>Product</h1>
    <!-- hero.png 2.5 s, 800x400, no width or height -->
    <img src="/hero.png" />
    <p>Several paragraphs of description…</p>
  </body>
</html>
```

```viz
type: timeline
title: The common way, measured in Chrome
end: 3
styles.css :: 0.01-1.01 :: download
reset.css :: 1.02-1.52 :: download :: @import
vendor.js :: 0.01-1.51 :: download
app.js :: 0.01-0.51 :: download
app.js :: 0.51-1.52 :: wait :: waits for vendor.js
brand font :: 1.54-1.84 :: download
hero.png :: 0.01-2.51 :: download
Main thread :: 0-0.01 :: parse
Main thread :: 0.01-1.52 :: blocked :: parser stopped at vendor.js
Main thread :: 1.52-1.53 :: run
Screen :: 0-1.55 :: blank
Screen :: 1.55-1.85 :: partial
Screen :: 1.85-3 :: painted
@ 1.52 :: DOMContentLoaded
@ 1.55 :: First paint, heading text hidden
@ 1.85 :: Heading text appears
@ 2.52 :: Hero lands: layout shift 0.146, then load
```

Walkthrough:

1. **0 s** — the parser requests `styles.css`, reaches `vendor.js`, and stops.
   The preload scanner requests `app.js` and `hero.png` at the same moment.
2. **0.5 s** — `app.js` has arrived but cannot run: it must follow `vendor.js`,
   and the CSSOM is not ready.
3. **1.0 s** — `styles.css` arrives. Only now does the browser see
   `@import url("/reset.css")` and request it, so the CSSOM is still incomplete.
4. **1.5 s** — `vendor.js`, then `reset.css`, arrive. The CSSOM is complete, so
   `vendor.js` runs, then `app.js`, and the parser finishes the body:
   `DOMContentLoaded` at 1.52 s.
5. **1.54 s** — the render tree shows the heading uses the brand font, and only
   then is the font requested.
6. **1.55 s** — first paint. The paragraphs show; the heading takes up space,
   but its text is invisible while the font loads.
7. **1.85 s** — the font arrives and the heading text appears.
8. **2.52 s** — the hero image arrives with no reserved size and pushes the text
   down 400px (layout shift 0.146). Then `load` fires.

The better way — same files, same delays:

```html
<!doctype html>
<html>
  <head>
    <style>
      /* critical CSS: only what the first screen needs */
      body { margin: 0; }
      @font-face {
        font-family: Brand;
        src: url("/brand.woff2") format("woff2");
        font-display: swap;
      }
      h1 { margin: 16px; font-family: Brand, sans-serif; }
    </style>
    <link
      rel="stylesheet"
      href="/rest.css"
      media="print"
      onload="this.media='all'"
    />
    <noscript>
      <link rel="stylesheet" href="/rest.css" />
    </noscript>
    <script defer src="/vendor.js"></script>
    <script defer src="/app.js"></script>
  </head>
  <body>
    <h1>Product</h1>
    <img src="/hero.png" width="800" height="400" />
    <p>Several paragraphs of description…</p>
  </body>
</html>
```

```viz
type: timeline
title: The better way, measured in Chrome
end: 3
rest.css :: 0.01-1.01 :: download :: not render-blocking
vendor.js :: 0.01-1.51 :: download
app.js :: 0.01-0.51 :: download
app.js :: 0.51-1.51 :: wait :: defer keeps the order
brand font :: 0.02-0.32 :: download
hero.png :: 0.01-2.51 :: download
Main thread :: 0-0.01 :: parse
Main thread :: 1.51-1.52 :: run
Screen :: 0-0.05 :: blank
Screen :: 0.05-3 :: painted
@ 0.05 :: First paint, heading in the fallback font
@ 0.32 :: Brand font swapped in
@ 1.01 :: rest.css applied
@ 1.51 :: DOMContentLoaded
@ 2.51 :: Hero fills its reserved box, then load
```

Walkthrough:

1. **0 s** — the parser reads the whole document in about 10 ms. Nothing stops
   it: the inline `<style>` needs no request, `rest.css` does not match
   `media="print"`, and both scripts are deferred.
2. **15 ms** — the inline `@font-face` is already known, so the font is
   requested almost at once.
3. **0.05 s** — first paint: the heading in the fallback font, the text, and an
   empty 800×400 box for the image.
4. **0.32 s** — the brand font arrives and swaps in.
5. **1.0 s** — `rest.css` arrives, and its `onload` switches it on.
6. **1.51 s** — `vendor.js` arrives; the deferred scripts run in order, then
   `DOMContentLoaded`.
7. **2.51 s** — the image fills the box already reserved for it. Nothing moves,
   and `load` fires.

Measured:

| Milestone | Common way | Better way |
| --- | --- | --- |
| First paint | 1.55 s | 0.05 s |
| Heading text visible | 1.85 s | 0.05 s, in the fallback font |
| Brand font requested | 1.54 s | 15 ms |
| `DOMContentLoaded` | 1.52 s | 1.51 s |
| `load` | 2.52 s | 2.51 s |
| Layout shift (CLS) | 0.146 | 0 |

Each change removes one blocking step from the flow:

| Change | What it takes off the critical path |
| --- | --- |
| critical CSS inlined in `<style>` | the stylesheet requests before the first paint |
| the rest loaded with `media="print"` | render-blocking for everything else |
| no `@import` | the second, serial stylesheet request |
| `defer` on both scripts | the parser stop; the scripts still run in order |
| `@font-face` inline, with `swap` | the late font request and the hidden text |
| `width` and `height` on the image | the layout shift |

Why it matters:

`DOMContentLoaded` and `load` barely moved, because the same bytes still arrive
at the same times. What changed is what the user sees while they arrive: the
first paint went from 1.55 s to 0.05 s. Knowing the flow is what tells you which
step each fix removes.

Interview note:

Adding a font preload made this page slightly worse. The inline `@font-face`
already had the font requested at 15 ms, so the preload got it less than 20 ms
sooner, while the first paint came later in Chrome: about 0.15 s instead of
0.08 s across three paired runs. Preload what the parser finds late, such as a
font declared in an external stylesheet, not what it finds anyway.

Strong answer:

> The parser builds the DOM until a classic script stops it, and stylesheets
> block the first paint and any script after them. Once the CSSOM is complete,
> the browser builds the render tree from whatever DOM exists, lays it out, and
> paints. Fonts are requested only then, images shift the layout if nothing
> reserved their space, deferred scripts run just before `DOMContentLoaded`,
> and `load` waits for everything. To make a page fast I take work off that
> path: inline the critical CSS, load the rest without blocking, avoid
> `@import`, defer scripts, declare fonts early with `swap`, and give images
> dimensions.

## 19. What Do `preload`, `preconnect`, And `dns-prefetch` Do?

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

## 20. What Is The Difference Between Reflow, Repaint, And Composite?

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

## 21. What Is Layout Thrashing And How Do You Fix It?

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

## 22. Why Do `transform` And `opacity` Animate More Cheaply?

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

## 23. When Do `DOMContentLoaded` And `load` Fire?

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
delaying an event that supposedly ignores CSS. `defer` and module scripts wait
for pending stylesheets too, and `DOMContentLoaded` waits for them, so the event
moves either way. Only `async` scripts skip the wait.

When to use it:

- `DOMContentLoaded` for wiring up DOM behaviour
- `load` only when you genuinely need final image dimensions

## 24. How Does The Browser Decide When To Render A Frame?

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

## 25. What Are Core Web Vitals?

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

## 26. How Would You Diagnose A Slow First Paint?

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
- <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@font-face/font-display>
- <https://html.spec.whatwg.org/multipage/parsing.html#the-end>
- <https://html.spec.whatwg.org/multipage/dom.html#render-blocking-mechanism>
- <https://html.spec.whatwg.org/multipage/urls-and-fetching.html#blocking-attributes>
- <https://web.dev/articles/critical-rendering-path/render-blocking-css>
- <https://web.dev/articles/critical-rendering-path/adding-interactivity-with-javascript>
- <https://web.dev/articles/vitals>
