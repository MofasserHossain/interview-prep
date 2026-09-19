# Next.js Metadata And SEO Interview Guide

Metadata guidance covering the `metadata` object and `generateMetadata`, title
templates, metadata merging and `metadataBase`, Open Graph images with
`ImageResponse`, viewport, sitemaps and `generateSitemaps`, `robots.txt`, web
manifests, app icons, JSON-LD, and internationalized metadata. Written against
**Next.js 16**.

## 1. How Does The Metadata API Work?

Two forms: a static object, and an async function for data-driven metadata.

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Interview Prep",
  description: "Interview preparation guides",
};
```

```tsx
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  return {
    title: post.title,
    description: post.excerpt,
  };
}
```

Next.js turns these into `<head>` tags, deduplicates them, and includes them in
the **initial HTML** — which is what search engines and link unfurlers need.

Important:

You cannot export both `metadata` and `generateMetadata` from the same file. Use
the static object when the values are known, the function when they depend on
data.

## 2. Why Is `generateMetadata` Server Component Only?

Because metadata must be resolved **before the page component renders**, so it can
be part of the initial HTML response. A Client Component has not run at that
point.

```tsx
// Bad example: "use client" and metadata cannot coexist
"use client";

export const metadata = { title: "My Page" }; // ignored
```

Fix — keep the page a Server Component and move interactivity into a child:

```tsx
// app/page.tsx - Server Component
import type { Metadata } from "next";
import { InteractiveComponent } from "./interactive-component";

export const metadata: Metadata = {
  title: "My Page",
};

export default function Page() {
  return <InteractiveComponent />;
}
```

Interview note:

This is a frequent real-world mistake: someone adds `"use client"` to a page for
one piece of state, and the page silently loses its metadata. Nothing errors — the
export is simply ignored.

## 3. How Do Title Templates Work?

A template in a parent layout applies to every child that sets a plain string
title.

```tsx
// app/layout.tsx
export const metadata: Metadata = {
  title: {
    default: "Interview Prep",
    template: "%s | Interview Prep",
  },
};
```

```tsx
// app/sql/page.tsx
export const metadata: Metadata = {
  title: "SQL Fundamentals",
};
```

Renders:

```txt
SQL Fundamentals | Interview Prep
```

| Key | Meaning |
| --- | --- |
| `default` | used when a child sets no title |
| `template` | `%s` is replaced by the child's title |
| `absolute` | a child opts **out** of the template |

```tsx
export const metadata: Metadata = {
  title: { absolute: "Standalone Title" }, // no suffix applied
};
```

Important:

`template` applies only to **children**, never to the segment that declares it.
That is why `default` exists — without it, the layout itself has no title.

## 4. How Does Metadata Merge Across Nested Layouts?

Metadata is evaluated from the root down, and each level **shallow-merges** over
its parent.

```viz
type: flow
title: Metadata resolution order
app/layout.tsx :: root defaults - metadataBase, title template, site name
app/blog/layout.tsx :: section overrides - section title, OG type
app/blog/[slug]/page.tsx :: page specifics - title, description, OG image
Final head :: shallow merge, deepest value wins per top-level key
```

The merge is **shallow**, which is the trap:

```tsx
// app/layout.tsx
export const metadata: Metadata = {
  openGraph: { siteName: "Interview Prep", images: ["/default-og.png"] },
};
```

```tsx
// app/blog/[slug]/page.tsx
export const metadata: Metadata = {
  openGraph: { title: "My Post" }, // siteName and images are LOST
};
```

The whole `openGraph` object is replaced, not merged field by field. Restate what
you need:

```tsx
export const metadata: Metadata = {
  openGraph: {
    siteName: "Interview Prep",
    images: ["/default-og.png"],
    title: "My Post",
  },
};
```

Interview note:

This catches people with `openGraph` and `twitter` in particular, because those
are objects rather than scalars — the missing image only shows up when someone
shares the link.

## 5. What Is `metadataBase`, And Why Do You Need It?

`metadataBase` sets a base URL prefix so URL-based metadata fields can use
**relative paths** instead of absolute ones.

```tsx
// app/layout.tsx
export const metadata: Metadata = {
  metadataBase: new URL("https://acme.com"),
  alternates: {
    canonical: "/",
    languages: { "en-US": "/en-US", "bn-BD": "/bn-BD" },
  },
  openGraph: {
    images: "/og-image.png", // -> https://acme.com/og-image.png
  },
};
```

It applies to the **current route segment and below**.

Why it matters:

Open Graph and Twitter image URLs must be **absolute** — a crawler fetching
`/og-image.png` with no origin cannot resolve it. Without `metadataBase`, Next.js
warns and falls back to a best guess, which is usually `localhost` in development
and often wrong in preview deployments.

```txt
metadataBase property in metadata export is not set for resolving
social open graph or twitter images, using "http://localhost:3000".
```

The fix is to set it once in the root layout, driven by an environment variable:

```tsx
metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
```

## 6. How Do You Avoid Fetching Twice For Metadata And The Page?

`generateMetadata` and the page component often need the same data. Wrap the fetch
in React's `cache()` so it runs once per render pass.

```ts
import { cache } from "react";

export const getPost = cache(async (slug: string) => {
  return db.post.findUnique({ where: { slug } });
});
```

```tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);      // first call - hits the database
  return { title: post.title };
}

export default async function Page({ params }) {
  const { slug } = await params;
  const post = await getPost(slug);      // deduplicated - no second query
  return <article>{post.title}</article>;
}
```

Important:

Without `cache()` this is a genuine N+1 at the page level — every page render runs
the same query twice. It is invisible in development and doubles database load in
production.

## 7. What Are The Open Graph Image File Conventions?

Drop a file with a reserved name into a route segment and Next.js generates the
tags.

| File | Produces |
| --- | --- |
| `opengraph-image.(jpg|png|gif)` | `og:image` |
| `opengraph-image.alt.txt` | `og:image:alt` |
| `twitter-image.(jpg|png|gif)` | `twitter:image` |
| `twitter-image.alt.txt` | `twitter:image:alt` |

```txt
app/
├── opengraph-image.png        site-wide default
├── opengraph-image.alt.txt    "Interview Prep"
└── blog/
    └── opengraph-image.png    overrides for /blog/*
```

```txt
<meta property="og:image" content="https://acme.com/opengraph-image.png" />
<meta property="og:image:alt" content="Interview Prep" />
```

Important:

Size limits are enforced at build time — `twitter-image` must not exceed **5MB**
and `opengraph-image` must not exceed **8MB**. Exceeding either **fails the
build**.

## 8. How Do You Generate Open Graph Images With Code?

`ImageResponse` from `next/og` renders JSX to a PNG at request or build time.

```tsx
// app/blog/[slug]/opengraph-image.tsx
import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Blog post";

export default async function Image({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 64,
          background: "#111",
          color: "#fff",
          fontSize: 64,
        }}
      >
        <div>{post.title}</div>
        <div style={{ fontSize: 28, opacity: 0.7 }}>interview-prep.dev</div>
      </div>
    ),
    size,
  );
}
```

Constraints worth knowing:

- only **flexbox** and a subset of CSS are supported — no grid, no floats
- every element needs an explicit `display`; there is no block layout
- custom fonts must be loaded and passed explicitly
- 1200×630 is the conventional size

Benefits:

Per-post social images without a design step, generated from real data and always
in sync with the content.

Tradeoff:

Generating at request time costs CPU per share. For a stable set of pages, let the
route prerender so the image is produced once at build.

## 9. What Is `generateViewport`?

Viewport settings moved out of `metadata` into their own export.

```tsx
import type { Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff" },
    { media: "(prefers-color-scheme: dark)", color: "#111" },
  ],
};
```

Or dynamically:

```tsx
export async function generateViewport({ params }): Promise<Viewport> {
  const theme = await getTheme(params.tenant);
  return { themeColor: theme.color };
}
```

Interview note:

`themeColor`, `colorScheme`, and `viewport` were part of the `metadata` export in
earlier versions and are now their own export. Code from older tutorials puts them
in the wrong place, where they are ignored with a warning.

Important:

Avoid `maximumScale: 1` or `userScalable: false`. Blocking zoom is an
accessibility failure for anyone who needs to magnify text.

## 10. How Do You Build A Sitemap?

`app/sitemap.ts` returns a typed array.

```ts
import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPosts();

  const postEntries = posts.map((post) => ({
    url: `https://acme.com/blog/${post.slug}`,
    lastModified: post.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [
    {
      url: "https://acme.com",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    ...postEntries,
  ];
}
```

This is served at `/sitemap.xml`.

Important:

URLs in a sitemap must be **absolute**. `metadataBase` does not apply here — the
sitemap is a standalone document, not a meta tag.

## 11. What Is `generateSitemaps`, And When Do You Need It?

A sitemap is capped at 50,000 URLs. `generateSitemaps` splits a large site across
several files.

```ts
import type { MetadataRoute } from "next";

export async function generateSitemaps() {
  const count = await getProductPageCount();
  return Array.from({ length: count }, (_, id) => ({ id }));
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  const start = id * 50_000;
  const products = await getProducts({ skip: start, take: 50_000 });

  return products.map((product) => ({
    url: `https://acme.com/product/${product.id}`,
    lastModified: product.updatedAt,
  }));
}
```

Each generates `/sitemap/[id].xml`.

When to use it:

Only for genuinely large catalogues. Below 50,000 URLs a single `sitemap.ts` is
simpler and easier to debug.

## 12. How Do `robots.txt` And The Manifest Work?

Both have file conventions with typed returns.

```ts
// app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin/", "/api/"] },
      { userAgent: "BadBot", disallow: "/" },
    ],
    sitemap: "https://acme.com/sitemap.xml",
  };
}
```

```ts
// app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Interview Prep",
    short_name: "Prep",
    start_url: "/",
    display: "standalone",
    background_color: "#fff",
    theme_color: "#111",
    icons: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
  };
}
```

Per-page indexing is controlled through metadata:

```tsx
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
    googleBot: { index: false, "max-image-preview": "large" },
  },
};
```

Interview trap:

`robots.txt` controls **crawling**, not indexing. A page linked from elsewhere can
still appear in results even when disallowed. To keep a page out of the index, use
`robots: { index: false }` — which requires the crawler to be allowed to fetch it
and see the tag.

## 13. What Are App Icons?

File conventions in `app/`, no metadata needed:

| File | Produces |
| --- | --- |
| `favicon.ico` | the classic favicon |
| `icon.(png|svg)` | `<link rel="icon">` |
| `apple-icon.png` | `<link rel="apple-touch-icon">` |

Generated dynamically, the same way as OG images:

```tsx
// app/icon.tsx
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#111", color: "#fff", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
      P
    </div>,
    size,
  );
}
```

Important:

`favicon.ico` must sit at the **root of `app/`**. Icons in nested segments apply to
those segments only.

## 14. What Is JSON-LD, And How Do You Add It?

JSON-LD is structured data that lets search engines render rich results — star
ratings, prices, breadcrumbs, FAQs.

```tsx
export default async function ProductPage({ params }) {
  const { slug } = await params;
  const product = await getProduct(slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.image,
    offers: {
      "@type": "Offer",
      price: product.price,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductDetails product={product} />
    </>
  );
}
```

Important:

`JSON.stringify` on untrusted content can break out of the script tag if the data
contains `</script>`. Escape it:

```ts
const safe = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
```

Interview note:

Structured data must **match what the page actually shows**. Marking up a price
that differs from the visible price is a manual-action risk with search engines,
not just a lint warning.

## 15. How Do You Handle Internationalized Metadata?

Use `alternates.languages` so crawlers know about each translation.

```tsx
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const t = await getTranslations(lang);

  return {
    title: t("home.title"),
    description: t("home.description"),
    alternates: {
      canonical: `/${lang}`,
      languages: {
        "en-US": "/en",
        "bn-BD": "/bn",
        "x-default": "/en",
      },
    },
    openGraph: {
      locale: lang,
      alternateLocale: ["en_US", "bn_BD"],
    },
  };
}
```

`x-default` tells crawlers which version to show when no language matches.

Important:

Every language version should list **all** the alternates, including itself.
Asymmetric `hreflang` annotations are ignored by search engines.

## 16. How Do Canonical URLs Work?

A canonical tells search engines which URL is authoritative when the same content
is reachable several ways.

```tsx
export const metadata: Metadata = {
  alternates: {
    canonical: "/blog/my-post",
  },
};
```

Combined with `metadataBase`, the relative path resolves to the full URL.

When you need it:

- filter and sort query strings producing many URLs for one page
- both `/blog/post` and `/blog/post/` resolving
- content syndicated to another domain
- pagination, where page 2 should not compete with page 1

```tsx
// a paginated list, each page canonical to itself
export async function generateMetadata({ searchParams }): Promise<Metadata> {
  const { page } = await searchParams;
  return {
    alternates: { canonical: page ? `/blog?page=${page}` : "/blog" },
  };
}
```

## 17. How Do You Verify Metadata Is Correct?

Method:

1. **Run a production build** — `next build && next start`. Development output can
   differ, especially around `metadataBase`.
2. **View source**, not DevTools Elements. Crawlers read the initial HTML; the
   Elements panel shows the post-hydration DOM.
3. **Check for the `metadataBase` warning** in the build log.
4. **Confirm absolute URLs** on every `og:image` and `twitter:image`.
5. **Test the unfurl** with a link preview debugger for each platform.
6. **Fetch `/sitemap.xml` and `/robots.txt`** and confirm they render.

```bash
curl -s https://acme.com/blog/my-post | grep -o '<meta[^>]*og:[^>]*>'
```

Interview note:

Most social platforms cache unfurls aggressively. After fixing an image you often
need to force a re-scrape through the platform's debugger; the page itself being
correct is not enough.

## 18. What Are The Common Metadata Gotchas?

**`"use client"` on a page with metadata** — the export is silently ignored.

**Shallow merge of `openGraph`** — a child object replaces the parent's entirely,
so images and site name disappear.

**Missing `metadataBase`** — relative OG images resolve against `localhost`.

**Fetching twice** for `generateMetadata` and the page — wrap it in `cache()`.

**`themeColor` inside `metadata`** — it belongs in the `viewport` export now.

**Relative URLs in `sitemap.ts`** — sitemaps need absolute URLs; `metadataBase`
does not apply.

**Expecting `robots.txt` to deindex** — it blocks crawling, not indexing.

**Oversized OG images** — over 8MB (or 5MB for Twitter) fails the build.

**Checking metadata in DevTools Elements** — inspect view-source instead.

**Both `metadata` and `generateMetadata` in one file** — not allowed.

Strong answer:

> Metadata resolves on the server before the page renders, which is why it is
> Server Component only and why adding `"use client"` silently drops it. The two
> things I always check are `metadataBase`, because Open Graph images must be
> absolute, and whether `generateMetadata` and the page share a cached fetch —
> otherwise every page queries twice.

## Sources Used

- <https://nextjs.org/docs/app/getting-started/metadata-and-og-images>
- <https://nextjs.org/docs/app/api-reference/functions/generate-metadata>
- <https://nextjs.org/docs/app/api-reference/functions/generate-viewport>
- <https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image>
- <https://nextjs.org/docs/app/api-reference/functions/image-response>
- <https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap>
- <https://nextjs.org/docs/app/api-reference/functions/generate-sitemaps>
- <https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots>
- <https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest>
- <https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons>
- <https://nextjs.org/docs/app/guides/json-ld>
