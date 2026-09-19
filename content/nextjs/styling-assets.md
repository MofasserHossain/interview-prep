# Next.js Styling And Assets Interview Guide

Styling guidance covering CSS Modules, global CSS, Tailwind, Sass, CSS-in-JS,
CSS ordering and chunking, `next/image` optimization, `next/font`, static assets,
videos, and MDX. Written against **Next.js 16**.

## 1. What Styling Options Does Next.js Support?

| Approach | Ships runtime JS | Server Component friendly |
| --- | --- | --- |
| CSS Modules | no | yes |
| Global CSS | no | yes |
| Tailwind | no | yes |
| Sass | no | yes |
| CSS-in-JS (runtime) | **yes** | needs a client boundary |
| CSS-in-JS (zero-runtime) | no | yes |

```tsx
// CSS Modules - scoped automatically
import styles from "./card.module.css";

export function Card() {
  return <div className={styles.card}>...</div>;
}
```

```tsx
// Global CSS - imported once in the root layout
import "./globals.css";
```

The rule:

Anything resolved at build time keeps components on the server. Runtime CSS-in-JS
forces a `"use client"` boundary, which works against the App Router's default.

## 2. How Do CSS Modules Work?

A file named `*.module.css` gets class names hashed per file, so collisions are
impossible.

```css
/* card.module.css */
.card {
  padding: 16px;
  border: 1px solid #ddd;
}

.title {
  font-weight: 600;
}
```

```tsx
import styles from "./card.module.css";

export function Card({ title }: { title: string }) {
  return (
    <div className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
    </div>
  );
}
```

Output class name:

```txt
card_card__x7Kd2
```

Benefits:

- no naming conventions needed — scoping is automatic
- unused classes are visible to tooling, so dead CSS is findable
- zero runtime cost; it is plain CSS after the build

Important:

The `.module.css` suffix is what activates scoping. A plain `card.css` import is
**global** and will leak, which is the usual cause of "my styles are affecting
other components".

Composition avoids duplication:

```css
.base { padding: 8px; }
.primary { composes: base; background: #111; color: #fff; }
```

## 3. How Does Global CSS Work, And Where Should It Go?

```tsx
// app/layout.tsx
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Global CSS can be imported in any layout or page, but importing it in one place —
the root layout — keeps ordering predictable.

Use it for:

- resets and normalisation
- CSS custom properties and design tokens
- `@font-face` declarations
- base element styles

Important:

Anything global applies to every route, so it is loaded even by pages that do not
need it. Keep it small and put component styles in modules.

## 4. Why Does CSS Order Sometimes Change Unexpectedly?

**CSS order follows import order in your code.** Next.js chunks and merges
stylesheets during a production build, and the resulting cascade depends on the
order modules were imported.

```tsx
// page.tsx
import { BaseButton } from "./base-button"; // imports base-button.module.css
import styles from "./page.module.css";

export default function Page() {
  return <BaseButton className={styles.primary} />;
}
```

`base-button.module.css` is ordered **before** `page.module.css`, because the
component was imported first. If both define `.primary`, the page's version wins —
which is usually what you want, and is entirely a consequence of import order.

How to keep it predictable:

- contain CSS imports to a single entry file per area
- import global and Tailwind stylesheets at the **root**
- extract shared styles into shared components to avoid duplicate imports
- use a consistent `<name>.module.css` naming convention
- **turn off import-sorting linters** such as ESLint's `sort-imports` — reordering
  imports silently reorders your CSS

```ts
const nextConfig: NextConfig = {
  experimental: { cssChunking: "strict" },
};
```

Interview trap:

**CSS ordering can behave differently in development than in production.** A style
conflict that only appears after deploying is almost always this. Always verify
with `next build`.

## 5. What Changes Between Development And Production For CSS?

| | `next dev` | `next build` |
| --- | --- | --- |
| Updates | instant, via Fast Refresh | n/a |
| Output | separate files | concatenated, minified, code-split |
| Loaded per route | more than needed | the minimal set |
| Works without JS | **no** — Fast Refresh needs it | **yes** |
| Ordering | can differ | authoritative |

The practical consequences:

- a styling bug that only reproduces in production is usually an ordering issue
- testing with JavaScript disabled must be done against a production build
- bundle-size conclusions from development are meaningless

## 6. How Do You Use Tailwind?

```css
/* app/globals.css */
@import "tailwindcss";
```

```tsx
// app/layout.tsx
import "./globals.css";
```

Tailwind is compile-time — the generated CSS contains only the utilities you
actually used, and nothing ships at runtime, so it works in Server Components with
no boundary.

Conditional classes need care, because Tailwind scans source text for complete
class names:

```tsx
// Bad: the scanner cannot see this, so the class is never generated
<div className={`text-${color}-500`} />

// Good: full class names appear in the source
<div className={color === "red" ? "text-red-500" : "text-blue-500"} />
```

When not to use it:

For genuinely complex, one-off layouts, a CSS Module is more readable than a long
utility string. Mixing both is normal — utilities for the common case, modules
where they stop helping.

## 7. How Do You Use Sass?

```bash
npm install --save-dev sass
```

```scss
/* app/globals.scss */
@use "./variables" as *;

body {
  background: $background;
}
```

```ts
const nextConfig: NextConfig = {
  sassOptions: {
    additionalData: `@use "@/styles/variables" as *;`,
  },
};
```

Both `.scss` and `.module.scss` work, so Sass composes with CSS Modules.

Interview note:

Next.js 16 uses the **modern Sass API**. `@import` is deprecated in Sass itself in
favour of `@use` and `@forward`; code using `@import` will warn and eventually
break.

Tradeoff:

Sass adds a build step and a dependency for features CSS now largely has natively —
nesting, custom properties, and `color-mix()`. It is worth it for large existing
codebases, less so for new ones.

## 8. How Do You Use Runtime CSS-in-JS?

Runtime libraries generate styles during render, so they need a Client Component
and a style registry that injects collected styles into the streamed HTML.

```tsx
"use client";

import { useServerInsertedHTML } from "next/navigation";
import { ServerStyleSheet, StyleSheetManager } from "styled-components";

export function StyleRegistry({ children }: { children: React.ReactNode }) {
  const [sheet] = useState(() => new ServerStyleSheet());

  useServerInsertedHTML(() => sheet.getStyleElement());

  return <StyleSheetManager sheet={sheet.instance}>{children}</StyleSheetManager>;
}
```

`useServerInsertedHTML` is the hook Next.js provides for this.

Tradeoff:

The registry sits high in the tree, so a large part of the app becomes client code.
Without it, styles are missing from the server HTML and you get a flash of unstyled
content on first paint.

When not to use it:

New projects. Zero-runtime options — CSS Modules, Tailwind, or a compile-time
CSS-in-JS library — give the same authoring experience without the boundary.

## 9. How Does `next/image` Optimize Images?

```tsx
import Image from "next/image";
import hero from "./hero.png";

<Image src={hero} alt="Hero" placeholder="blur" priority />
<Image src="https://cdn.example.com/p.jpg" alt="Product" width={400} height={300} />
```

| Concern | How it is handled |
| --- | --- |
| Layout shift | requires `width`/`height`, or infers them from a static import |
| Oversized downloads | generates `srcset`, picks per device |
| Modern formats | serves WebP or AVIF when accepted |
| Offscreen images | lazy-loads by default |
| Perceived speed | `placeholder="blur"` |

A static import is the best case — dimensions and `blurDataURL` come free.

Remote images need an allowlist:

```ts
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.example.com", pathname: "/**" },
    ],
  },
};
```

Important:

`priority` disables lazy loading and raises fetch priority. Set it on the **LCP
image only** — marking everything `priority` removes the benefit.

Interview trap:

`sizes` is what makes `srcset` useful. Without it, the browser assumes the image is
viewport-width and downloads a needlessly large file:

```tsx
<Image src={img} alt="" fill sizes="(max-width: 768px) 100vw, 33vw" />
```

## 10. What Changed For `next/image` In Next.js 16?

Local image sources with **query strings** now require explicit configuration, to
prevent enumeration attacks:

```tsx
<Image src="/assets/photo?v=1" alt="Photo" width={100} height={100} />
```

```ts
const nextConfig: NextConfig = {
  images: {
    localPatterns: [{ pathname: "/assets/**", search: "?v=1" }],
  },
};
```

Without the `localPatterns` entry, that image is rejected.

The general pattern across Next.js 16 is that image sources must be **declared** —
`remotePatterns` for external hosts, `localPatterns` for local paths with query
strings. Both exist because the image optimizer is a public endpoint that would
otherwise work as an open proxy.

## 11. When Should You Not Use `next/image`?

- **SVGs** — they are already scalable; optimization does nothing and the
  optimizer treats them cautiously for security reasons
- **Very small icons** — the optimizer round trip costs more than the image
- **`output: "export"`** — there is no server to optimize, so you need
  `unoptimized: true` or a custom loader
- **Images you must control precisely**, such as a canvas source

```tsx
<Image src="/logo.svg" alt="Logo" width={120} height={32} unoptimized />
```

Interview note:

The `fill` prop is for when you do not know the dimensions — the image fills its
nearest positioned ancestor. That ancestor **must** have `position: relative` and a
defined size, or the image collapses.

## 12. How Does `next/font` Work?

`next/font` self-hosts fonts at build time and generates a metrics-matched
fallback.

```tsx
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
```

```css
body {
  font-family: var(--font-inter), system-ui, sans-serif;
}
```

Benefits:

- **no external request** — the font is downloaded at build time and served from
  your origin, so no extra DNS, TLS, or third-party exposure
- **no layout shift** — Next.js computes fallback metrics so the substituted font
  occupies the same space
- only the requested subsets are downloaded

Local fonts:

```tsx
import localFont from "next/font/local";

const body = localFont({
  src: [
    { path: "./Body-Regular.woff2", weight: "400", style: "normal" },
    { path: "./Body-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-body",
});
```

Important:

Call the loader at **module scope**, never inside a component. It runs at build
time, and calling it per render defeats the mechanism.

Interview note:

This targets Cumulative Layout Shift directly. The classic flash of unstyled text
happens because the fallback has different metrics than the web font; matching
those metrics removes the shift.

## 13. How Do You Serve Static Assets?

Files in `public/` are served from the root:

```txt
public/
├── robots.txt        ->  /robots.txt
├── logo.svg          ->  /logo.svg
└── downloads/cv.pdf  ->  /downloads/cv.pdf
```

```tsx
<img src="/logo.svg" alt="Logo" />
<a href="/downloads/cv.pdf">Download</a>
```

When to use `public/` versus importing:

| | `public/` | import |
| --- | --- | --- |
| URL | stable, predictable | hashed |
| Cache busting | manual | automatic |
| Dimensions known | no | yes, for images |
| Good for | `robots.txt`, favicons, downloads | images and fonts used in components |

Important:

Files in `public/` are **not fingerprinted**, so a browser can cache an old version
indefinitely. Anything that changes should be imported instead, so the build gives
it a content hash.

Never put anything secret in `public/` — the entire directory is publicly
reachable.

## 14. How Do You Handle Video?

For a self-hosted file, plain HTML is correct:

```tsx
<video controls preload="metadata" poster="/poster.jpg" width={640}>
  <source src="/demo.mp4" type="video/mp4" />
  <track kind="captions" src="/captions.vtt" srcLang="en" label="English" default />
</video>
```

There is no `next/video` optimizer, so for anything substantial use a dedicated
host and embed the player — usually lazily:

```tsx
const VideoPlayer = dynamic(() => import("./video-player"), {
  loading: () => <VideoSkeleton />,
});
```

Important:

`preload="metadata"` fetches only enough to show duration and the first frame.
`preload="auto"` starts downloading the whole file, which is a significant cost if
most visitors never press play.

Serving large video from `public/` means your own bandwidth and no adaptive
bitrate — fine for a short loop, wrong for real content.

## 15. How Do You Use MDX?

```bash
npm install @next/mdx @mdx-js/loader @mdx-js/react
```

```ts
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "md", "mdx"],
};

export default createMDX()(nextConfig);
```

```tsx
// mdx-components.tsx at the project root
import type { MDXComponents } from "mdx/types";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children }) => <h1 className="heading">{children}</h1>,
    code: ({ children }) => <code className="inline-code">{children}</code>,
    ...components,
  };
}
```

`mdx-components.tsx` is a required file convention when using MDX — it maps
Markdown elements to your components.

Use cases:

Documentation, blogs, and changelogs where content should live in Markdown but
occasionally embed a real component.

Tradeoff:

MDX compiles at build time, so content changes require a rebuild. For
frequently-edited content, a CMS with runtime Markdown parsing fits better.

## 16. How Do You Reduce CSS Payload?

**Scope aggressively.** CSS Modules and Tailwind both let the build drop what is
unused; global CSS cannot be.

**Control chunking:**

```ts
const nextConfig: NextConfig = {
  experimental: {
    cssChunking: "strict", // predictable order, more files
  },
};
```

**Inline critical CSS** to remove a render-blocking request:

```ts
const nextConfig: NextConfig = {
  experimental: { inlineCss: true },
};
```

With `inlineCss`, everywhere Next.js would emit a `<link>` it emits a `<style>`
instead.

Tradeoff:

Inlining removes a round trip from the critical path but makes the CSS
uncacheable — every HTML response carries it again. It suits small stylesheets and
landing pages, not a large shared design system.

## 17. How Do You Theme An Application?

CSS custom properties are the cleanest mechanism, because they cascade and can be
changed at runtime.

```css
:root {
  --background: #fff;
  --foreground: #111;
}

[data-theme="dark"] {
  --background: #111;
  --foreground: #fff;
}

body {
  background: var(--background);
  color: var(--foreground);
}
```

```tsx
"use client";

export function ThemeToggle() {
  return (
    <button
      onClick={() => {
        const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        localStorage.setItem("theme", next);
      }}
    >
      Toggle
    </button>
  );
}
```

Important:

The server cannot read `localStorage`, so the first paint uses the default theme
and then corrects — a visible flash. Fix it with an inline script in the root
layout that sets `data-theme` **before the browser paints**:

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `(function(){try{var t=localStorage.getItem("theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`,
  }}
/>
```

See the Server & Client Components guide for why `useEffect` does not solve this.

## 18. What Are The Common Styling And Asset Gotchas?

**A plain `.css` import instead of `.module.css`** — it is global and leaks.

**Import-sorting linters** — reordering imports silently reorders your CSS.

**Checking CSS order in development** — production chunking can differ; verify with
`next build`.

**Dynamic Tailwind class names** — the scanner only sees complete strings.

**`priority` on many images** — it only helps the LCP element.

**Missing `sizes` with `fill`** — the browser downloads a viewport-width image.

**`next/font` called inside a component** — it must run at module scope.

**Mutable files in `public/`** — they are not fingerprinted, so caches go stale.

**`preload="auto"` on video** — downloads the whole file for every visitor.

**Runtime CSS-in-JS without a registry** — flash of unstyled content on first
paint.

**`fill` without a positioned, sized parent** — the image collapses.

Strong answer:

> I default to CSS Modules or Tailwind because both resolve at build time and keep
> components on the server. The subtle one is CSS ordering: production chunking
> follows import order, so an auto-sorting linter can change the cascade without
> touching a stylesheet — and it often only shows up after a deploy, which is why I
> check styling against `next build` rather than `next dev`.

## Sources Used

- <https://nextjs.org/docs/app/getting-started/css>
- <https://nextjs.org/docs/app/getting-started/images>
- <https://nextjs.org/docs/app/getting-started/fonts>
- <https://nextjs.org/docs/app/api-reference/components/image>
- <https://nextjs.org/docs/app/api-reference/components/font>
- <https://nextjs.org/docs/app/guides/sass>
- <https://nextjs.org/docs/app/guides/css-in-js>
- <https://nextjs.org/docs/app/guides/mdx>
- <https://nextjs.org/docs/app/guides/videos>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/cssChunking>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/inlineCss>
