# CSS Fundamentals And Layout Interview Guide

CSS interview guidance covering the cascade, specificity, inheritance, the box
model, positioning, stacking contexts, flexbox, grid, units, responsive queries,
custom properties, and the rendering cost of style choices.

## 1. How Does The Cascade Decide Which Rule Wins?

When several rules target the same element, the browser resolves them in a fixed
order and stops at the first step that produces a winner.

```txt
1. origin and importance  (author !important beats author normal)
2. cascade layers         (@layer order)
3. specificity            (id > class > element)
4. source order           (last one wins)
```

```css
p { color: blue; }
p { color: red; }
```

The paragraph is red — same specificity, so source order decides.

Why it matters:

Most "my CSS is not applying" bugs are a cascade question, not a syntax question.
Checking the steps in order tells you whether to raise specificity, reorder, or
move the rule into a layer.

Interview note:

`!important` is a step above normal declarations, not a specificity boost. That is
why one `!important` can only be beaten by another `!important` with higher
specificity.

## 2. How Is Specificity Calculated?

Specificity is a three-part count, compared left to right.

```txt
(A, B, C)

A = ids
B = classes, attributes, pseudo-classes
C = elements, pseudo-elements
```

| Selector | Specificity |
| --- | --- |
| `p` | (0, 0, 1) |
| `.card` | (0, 1, 0) |
| `p.card` | (0, 1, 1) |
| `#main` | (1, 0, 0) |
| `#main .card p` | (1, 1, 1) |
| `*` | (0, 0, 0) |

A single id beats any number of classes, because the comparison is
column-by-column rather than a total.

```css
#main p { color: red; }          /* (1, 0, 0) wins */
.a.b.c.d.e.f p { color: blue; }  /* (0, 6, 1) loses */
```

Important:

Inline `style` attributes sit above all of these, and `!important` above that.

Two modern selectors change the arithmetic:

```css
:where(.a, .b) p { color: red; }  /* :where() contributes 0 */
:is(.a, #b) p    { color: blue; } /* :is() takes its strongest argument */
```

When to use it:

`:where()` is the practical tool for base and reset styles, because it lets any
later rule override without a specificity fight.

## 3. Which Properties Inherit?

Text-related properties inherit from parent to child. Box-related properties do
not.

| Inherits | Does not inherit |
| --- | --- |
| `color`, `font-family`, `font-size` | `margin`, `padding`, `border` |
| `line-height`, `letter-spacing` | `width`, `height`, `display` |
| `text-align`, `visibility`, `cursor` | `background`, `position`, `overflow` |

```css
body { color: #333; }
```

Every descendant gets `#333` unless it sets its own `color`.

You can force either behaviour:

```css
.child {
  border: inherit;  /* opt in to inheritance */
  color: initial;   /* reset to the property default */
  margin: unset;    /* inherit if inheritable, else initial */
}
```

Interview note:

`visibility` inherits, which is why `visibility: hidden` on a parent hides
children — but a child can set `visibility: visible` and reappear.
`display: none` cannot be undone by a child, because the element never enters the
render tree at all.

## 4. Explain The CSS Box Model

Every element is rendered as a set of nested boxes.

```txt
┌─────────────── margin ───────────────┐
│  ┌──────────── border ────────────┐  │
│  │  ┌───────── padding ────────┐  │  │
│  │  │  ┌────── content ─────┐  │  │  │
│  │  │  └────────────────────┘  │  │  │
│  │  └──────────────────────────┘  │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

- **content** — the text or child boxes
- **padding** — space inside the border, takes the background
- **border** — the edge itself
- **margin** — space outside, transparent, can collapse

```css
.box {
  width: 200px;
  padding: 20px;
  border: 5px solid;
}
```

With the default `content-box`, the rendered width is
`200 + 20 + 20 + 5 + 5 = 250px`.

## 5. What Does `box-sizing: border-box` Change?

It makes `width` and `height` describe the border box rather than the content
box.

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}
```

```css
.box {
  box-sizing: border-box;
  width: 200px;
  padding: 20px;
  border: 5px solid;
}
```

The rendered width is now exactly `200px`, with padding and border absorbed
inward. The content area shrinks to `150px`.

Why it matters:

It makes layout arithmetic predictable. `width: 50%` genuinely means half the
container, whatever padding you add later.

Tradeoff:

There is effectively no downside, which is why the universal reset above is near
universal practice. The one thing to remember is that margins are still outside
the box and still add to the space consumed.

## 6. What Are The Main `display` Values?

`display` controls both how a box behaves in its parent and how it lays out its
children.

| Value | Behaviour |
| --- | --- |
| `block` | full width available, stacks vertically, respects all box properties |
| `inline` | flows with text, ignores `width`/`height` and vertical margins |
| `inline-block` | flows with text but respects `width`, `height`, and margins |
| `flex` | one-dimensional layout for children |
| `grid` | two-dimensional layout for children |
| `none` | removed from the render tree entirely |

```css
span { width: 200px; }              /* ignored: inline */
span { display: inline-block; width: 200px; }  /* applied */
```

Interview note:

An inline element ignoring `width` and `height` is one of the most common CSS
surprises. Horizontal padding and margin do apply to inline elements; vertical
ones apply visually but do not affect line height.

## 7. How Does `position` Work?

| Value | Positioned relative to | In normal flow |
| --- | --- | --- |
| `static` | nothing, the default | yes |
| `relative` | its own normal position | yes, keeps its space |
| `absolute` | nearest positioned ancestor | no, removed from flow |
| `fixed` | the viewport | no |
| `sticky` | scroll position, within its parent | yes |

```css
.parent { position: relative; }

.child {
  position: absolute;
  top: 0;
  right: 0;
}
```

The `position: relative` on the parent is what makes it the reference box. Without
it, the child positions against the nearest positioned ancestor, often the
viewport.

Sticky needs both a threshold and room to move:

```css
.header {
  position: sticky;
  top: 0;
}
```

Interview trap:

`position: sticky` silently does nothing if any ancestor has
`overflow: hidden`, `auto`, or `scroll`, or if the parent is not taller than the
sticky element. This is the most common sticky bug.

Important:

`fixed` positions against the viewport **unless** an ancestor has a `transform`,
`filter`, or `will-change`. Those create a containing block and the fixed element
anchors to it instead.

## 8. What Is A Stacking Context, And Why Does `z-index` Sometimes Not Work?

A stacking context is a self-contained layer group. Children are stacked among
themselves, and the whole group is then placed as a single unit in its parent.

A new stacking context is created by:

- the root element
- `position` other than `static` with a `z-index` other than `auto`
- `opacity` less than `1`
- `transform`, `filter`, `perspective`, `will-change`
- `isolation: isolate`
- `position: fixed` or `sticky`

```css
.parent-a { position: relative; z-index: 1; }
.parent-b { position: relative; z-index: 2; }

.child-of-a { position: relative; z-index: 9999; }
```

`.child-of-a` still renders **below** `.parent-b`. Its `z-index: 9999` only ranks
it inside `.parent-a`, and `.parent-a` as a whole sits below `.parent-b`.

Why it matters:

This is why raising `z-index` sometimes changes nothing. The fix is to compare
the ancestors that create the stacking contexts, not the elements themselves.

Interview trap:

`opacity: 0.99` creates a stacking context. A change that looks purely visual can
silently reorder your layers.

Strong answer:

> `z-index` only sorts siblings within the same stacking context. When it appears
> broken, I walk up the tree to find which ancestor created a context, because
> that ancestor's stacking position is what actually decides the result.

## 9. How Does Flexbox Distribute Space?

Flexbox lays out children along one axis and distributes leftover space.

```css
.row {
  display: flex;
  justify-content: space-between; /* main axis */
  align-items: center;            /* cross axis */
  gap: 16px;
}
```

The `flex` shorthand controls how each item grows and shrinks:

```css
.item {
  flex: 1 1 200px;
  /*    │ │  └── flex-basis:  starting size */
  /*    │ └───── flex-shrink: may shrink below basis */
  /*    └─────── flex-grow:   shares leftover space */
}
```

Common shorthands:

| Shorthand | Meaning |
| --- | --- |
| `flex: 1` | `1 1 0%` — equal columns regardless of content |
| `flex: auto` | `1 1 auto` — grows, sized by content |
| `flex: none` | `0 0 auto` — fixed, never grows or shrinks |

Interview trap:

A flex item will not shrink below its content size by default, which is what
causes long text to overflow a flex container. The fix:

```css
.item {
  min-width: 0; /* allows shrinking below intrinsic width */
}
```

## 10. When Do You Use Grid Instead Of Flexbox?

Use flexbox for one dimension, grid for two.

```css
/* Flexbox: a row of items sharing space */
.toolbar {
  display: flex;
  gap: 8px;
}

/* Grid: rows and columns aligned together */
.layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-template-rows: auto 1fr auto;
  gap: 16px;
}
```

A responsive card grid with no media query at all:

```css
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}
```

When to use it:

- **Flexbox** — toolbars, button rows, anything content-sized in a line
- **Grid** — page layouts, card grids, anything where columns must line up across
  rows

Interview note:

They are complements, not competitors. A typical page is grid at the top level
with flex inside individual cells.

## 11. What Is The Difference Between `px`, `rem`, `em`, `%`, `vh`, And `ch`?

| Unit | Relative to | Typical use |
| --- | --- | --- |
| `px` | nothing, absolute | borders, fine detail |
| `rem` | root font size | spacing and type scale |
| `em` | the element's own font size | padding that scales with its text |
| `%` | the parent, per property | fluid widths |
| `vw` / `vh` | viewport width / height | full-screen sections |
| `ch` | width of the `0` glyph | text measure, line length |

```css
html { font-size: 16px; }

.card {
  padding: 1rem;      /* 16px, stable everywhere */
  font-size: 1.25rem; /* 20px */
}

.badge {
  font-size: 0.75em;  /* 0.75 x its parent's size, compounds when nested */
  padding: 0.5em;     /* scales with the badge's own font size */
}
```

Interview trap:

`em` compounds. Nested elements each multiplying by `0.75em` shrink fast, which is
why `rem` is the safer default for a type scale and `em` is reserved for padding
that should track its own text.

Important:

On mobile, `100vh` includes the area behind the browser's collapsing toolbar, so
full-height sections overflow. Use `100dvh` for the dynamic viewport height.

## 12. How Do Media Queries And Container Queries Differ?

A media query asks about the **viewport**. A container query asks about the
**parent element**.

```css
/* viewport-based */
@media (min-width: 768px) {
  .card { display: grid; }
}
```

```css
/* container-based */
.sidebar {
  container-type: inline-size;
}

@container (min-width: 400px) {
  .card { display: grid; }
}
```

Why it matters:

A card in a narrow sidebar and the same card in a wide main column have the same
viewport but need different layouts. Media queries cannot tell them apart;
container queries can.

When to use it:

- **Media queries** for page-level layout and for things genuinely tied to the
  device, such as `prefers-reduced-motion`
- **Container queries** for reusable components that must adapt to wherever they
  are placed

Tradeoff:

`container-type: inline-size` makes the container's inline size independent of its
contents, so a container can no longer be sized by its children in that axis.

## 13. Pseudo-Class vs Pseudo-Element

A pseudo-class selects an element in a particular **state**. A pseudo-element
styles a **part** of an element that has no markup.

```css
/* pseudo-classes: one colon */
a:hover { color: red; }
li:nth-child(odd) { background: #eee; }
input:disabled { opacity: 0.5; }
.form:has(input:invalid) { border-color: red; }

/* pseudo-elements: two colons */
p::first-line { font-weight: bold; }
.icon::before { content: "→"; }
::selection { background: yellow; }
```

Important:

A pseudo-element needs the `content` property to render at all, even if empty:

```css
.icon::before {
  content: ""; /* without this, nothing appears */
  display: block;
  width: 8px;
  height: 8px;
}
```

Interview note:

The single-colon forms `:before` and `:after` still work for backward
compatibility, but two colons is the correct modern syntax and signals which kind
you mean.

## 14. How Do CSS Custom Properties Work?

Custom properties are real CSS values that participate in the cascade and
inherit, unlike preprocessor variables which are compiled away.

```css
:root {
  --space: 16px;
  --brand: #2563eb;
}

.card {
  padding: var(--space);
  border-color: var(--brand);
}
```

Because they inherit, you can rescope them:

```css
.card { --space: 16px; padding: var(--space); }
.card.compact { --space: 8px; } /* children pick this up automatically */
```

They can be read and written from JavaScript, which preprocessor variables cannot:

```js
document.documentElement.style.setProperty("--brand", "#dc2626");
```

Fallbacks are the second argument:

```css
color: var(--accent, #333);
```

When to use it:

Theming, especially dark mode, and any value that must change at runtime. A
preprocessor variable is fixed at build time; a custom property can change per
element, per media query, or per user action.

## 15. What Are Cascade Layers?

`@layer` lets you set the priority of whole groups of CSS explicitly, above
specificity.

```css
@layer reset, base, components, utilities;

@layer components {
  #sidebar .button { background: blue; } /* (1, 1, 0) */
}

@layer utilities {
  .bg-red { background: red; } /* (0, 1, 0) */
}
```

The utility wins, despite far lower specificity, because its layer is declared
later.

Why it matters:

It removes the specificity arms race. Third-party CSS can go in an early layer and
be overridden by your own styles without `!important` or artificially long
selectors.

Important:

Any unlayered CSS has **higher** priority than all layered CSS. Mixing layered and
unlayered styles is the usual source of confusion when adopting `@layer`.

## 16. What Does `:has()` Enable?

`:has()` selects an element based on its descendants or following siblings — the
long-requested parent selector.

```css
/* a card that contains an image gets a different layout */
.card:has(img) {
  grid-template-columns: 120px 1fr;
}

/* a label following a checked input */
.field:has(input:checked) {
  font-weight: bold;
}

/* a form with any invalid input */
form:has(:invalid) .submit {
  opacity: 0.5;
}
```

Why it matters:

Many patterns that previously needed JavaScript to toggle a class are now pure
CSS, which means they stay correct without re-rendering.

Interview note:

`:has()` takes its specificity from its strongest argument, like `:is()`. It is
not a zero-specificity selector.

## 17. What Causes Margin Collapsing?

Adjacent vertical margins merge into one, taking the larger value rather than the
sum.

```css
.a { margin-bottom: 20px; }
.b { margin-top: 30px; }
```

The gap between them is `30px`, not `50px`.

Three cases where it happens:

1. **Adjacent siblings** — as above
2. **Parent and first/last child** — the child's margin escapes the parent
3. **Empty blocks** — top and bottom margins collapse together

```css
/* the child's margin pushes the PARENT down */
.parent { background: #eee; }
.child { margin-top: 40px; }
```

Fix — give the parent something between the margins:

```css
.parent {
  padding-top: 1px;       /* or */
  border-top: 1px solid;  /* or */
  display: flow-root;     /* cleanest: creates a block formatting context */
}
```

Important:

Margins never collapse inside flex or grid containers, or on floated, absolutely
positioned, or `overflow`-clipped elements. Using `gap` in flex or grid avoids the
problem entirely.

## 18. Which CSS Choices Are Expensive To Render?

Cost comes from which rendering stage a change forces, not from the size of the
stylesheet.

| Cheap | Expensive |
| --- | --- |
| `transform`, `opacity` | `width`, `height`, `top`, `margin` |
| changing a leaf element | changing a high-level container |
| `gap` in flex or grid | many nested `position: absolute` |
| a solid `background-color` | large `box-shadow`, `filter: blur()` |

```css
/* Bad example: animating layout properties every frame */
.panel {
  transition: width 200ms, left 200ms;
}

/* Better: compositor-only */
.panel {
  transition: transform 200ms, opacity 200ms;
}
```

Other practical costs:

- `filter: blur()` over a large area is paint-heavy on low-end devices
- `will-change` creates a layer and consumes memory, so apply it narrowly and
  remove it when the animation ends
- deeply nested selectors cost little at match time but a great deal in
  maintainability

Strong answer:

> I think about which stage a property change triggers. `transform` and `opacity`
> only composite, so they are safe to animate. Anything that changes geometry
> forces layout on a whole subtree, which is what drops frames.

Study path:

The layout, paint, and composite stages themselves are covered in the Browser
Page Load & Rendering guide.

## Sources Used

- <https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascade/Cascade>
- <https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascade/Specificity>
- <https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_box_model/Introduction_to_the_CSS_box_model>
- <https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Stacking_context>
- <https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout>
- <https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout>
- <https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries>
- <https://developer.mozilla.org/en-US/docs/Web/CSS/@layer>
- <https://developer.mozilla.org/en-US/docs/Web/CSS/:has>
