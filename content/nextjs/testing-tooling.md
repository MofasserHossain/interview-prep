# Next.js Testing And Tooling Interview Guide

Tooling guidance covering test strategy and why async Server Components cannot be
unit tested, Jest, Vitest, Playwright and Cypress setup, Turbopack, TypeScript and
typed routes, linting after the removal of `next lint`, bundle analysis, package
bundling config, the React Compiler, codemods, and upgrading to Next.js 16.

## 1. What Is The Right Test Strategy For An App Router Application?

The framework pushes you towards end-to-end tests more than a traditional React
app, for one concrete reason.

| Layer | Tool | What it covers |
| --- | --- | --- |
| Unit | Jest or Vitest | pure functions, synchronous components, DAL logic |
| Integration | Jest or Vitest | a component with mocked data dependencies |
| End-to-end | Playwright or Cypress | real routes, **async Server Components**, forms |

```viz
type: flow
title: Where each kind of test earns its place
Pure functions and DAL :: unit tests - fast, no rendering
Synchronous components :: unit tests with Testing Library
Async Server Components :: E2E only - Jest and Vitest cannot render them
Server Functions and forms :: E2E, because they are real POST requests
Full user flows :: E2E against a production build
```

Strong answer:

> The split shifts towards end-to-end, because async Server Components are not
> supported by Jest or Vitest. I unit test the data access layer and any
> synchronous component, then cover the async rendering paths and Server Functions
> with Playwright against a production build.

## 2. Why Can't You Unit Test An Async Server Component?

Because `async` Server Components are new to the React ecosystem and neither Jest
nor Vitest supports rendering them.

```tsx
// This cannot be rendered by Jest or Vitest
export default async function PostsPage() {
  const posts = await db.post.findMany();
  return <PostList posts={posts} />;
}
```

You can still unit test:

- **synchronous** Server Components
- Client Components
- the functions the async component calls

```tsx
// Extract the rendering into something testable
export function PostList({ posts }: { posts: Post[] }) {
  return <ul>{posts.map((p) => <li key={p.id}>{p.title}</li>)}</ul>;
}
```

```tsx
// post-list.test.tsx
import { render, screen } from "@testing-library/react";

it("renders every post", () => {
  render(<PostList posts={[{ id: "1", title: "Hello" }]} />);
  expect(screen.getByText("Hello")).toBeInTheDocument();
});
```

The rule:

Keep async Server Components thin — fetch, then delegate to a presentational
component. The fetching is covered by an end-to-end test; the rendering is covered
by a fast unit test.

## 3. How Do You Set Up Vitest?

```bash
npm install --save-dev vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom
```

```ts
// vitest.config.mts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

```ts
// vitest.setup.ts
import "@testing-library/jest-dom/vitest";
```

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

Why Vitest over Jest for a new project:

It shares Vite's transform pipeline, so ESM and TypeScript work with much less
configuration, and watch-mode runs are noticeably faster.

## 4. How Do You Set Up Jest?

```bash
npm install --save-dev jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom
```

```ts
// jest.config.ts
import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
};

export default createJestConfig(config);
```

`next/jest` is the important part — it configures the transform, handles CSS and
image imports, loads `.env` files, and ignores `.next`. Without it you spend a long
time on transform configuration.

Important:

Mock the modules a component depends on, not the framework:

```ts
vi.mock("@/lib/dal", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: "1", name: "Test" }),
}));
```

Mocking `next/navigation` wholesale tends to hide real integration problems. Prefer
covering navigation in an end-to-end test.

## 5. How Do You Set Up Playwright?

```bash
npm init playwright@latest
```

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: "http://localhost:3000" },
});
```

```ts
// e2e/posts.spec.ts
import { expect, test } from "@playwright/test";

test("creates a post", async ({ page }) => {
  await page.goto("/posts/new");
  await page.getByLabel("Title").fill("Hello world");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByRole("heading", { name: "Hello world" })).toBeVisible();
});
```

Important:

Note `npm run build && npm run start` rather than `next dev`. Testing against a
production build matters because development differs in prefetching, error
redaction, CSS ordering, and prerendering — all of which change behaviour.

Playwright is the right tool for Server Functions too, because they are real POST
requests that only exist in a running application.

## 6. How Do You Test Authenticated Flows?

Log in once and reuse the storage state, rather than repeating the login in every
test.

```ts
// e2e/auth.setup.ts
import { test as setup } from "@playwright/test";

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.TEST_EMAIL!);
  await page.getByLabel("Password").fill(process.env.TEST_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard");

  await page.context().storageState({ path: "e2e/.auth/user.json" });
});
```

```ts
export default defineConfig({
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "authenticated",
      dependencies: ["setup"],
      use: { storageState: "e2e/.auth/user.json" },
    },
  ],
});
```

Interview note:

Worth testing explicitly: that a protected Server Function **rejects an
unauthenticated POST**. UI-level tests confirm the button is hidden; they do not
confirm the endpoint is protected, and that is the thing that actually matters.

## 7. What Is Turbopack, And What Changed In Next.js 16?

Turbopack is the Rust-based bundler, and in Next.js 16 it is the **default for both
`next dev` and `next build`**.

```ts
const nextConfig: NextConfig = {
  experimental: {
    turbopackFileSystemCache: true, // persist artifacts between runs
  },
  turbopack: {
    rules: {
      "*.svg": { loaders: ["@svgr/webpack"], as: "*.js" },
    },
  },
};
```

Related options: `turbopackFileSystemCache`, `turbopackMemoryEviction`,
`turbopackChunking`.

Important:

A project with a custom `webpack` config must port it. Webpack-specific loaders do
not transfer automatically, and a `webpack` key in `next.config.ts` is ignored when
Turbopack runs.

Next.js 16 also allows `dev` and `build` to run **concurrently**, which previously
conflicted over the `.next` directory.

## 8. How Do You Configure TypeScript And Typed Routes?

```ts
const nextConfig: NextConfig = {
  typedRoutes: true, // stable in Next.js 16, no longer experimental
  typescript: {
    ignoreBuildErrors: false, // keep this false
  },
};
```

```tsx
<Link href="/blog/hello">Post</Link>   // ok
<Link href="/blogg/hello">Post</Link>  // type error
```

Route prop helpers remove hand-written page prop types:

```tsx
export default async function Page({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params; // typed as string
}

export default function Layout({ children }: LayoutProps<"/">) {
  return <>{children}</>;
}
```

Important:

`typescript.ignoreBuildErrors: true` makes the build pass with type errors. It is
occasionally necessary during a migration and should never be a permanent setting —
it disables the main safety net the language provides.

## 9. What Happened To `next lint`?

**The `next lint` command has been removed in Next.js 16**, and `next build` no
longer runs linting.

```bash
npx @next/codemod@canary next-lint-to-eslint-cli .
```

Run ESLint or Biome directly:

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```

`@next/eslint-plugin-next` now defaults to **ESLint Flat Config**, aligning with
ESLint v10 which drops legacy config support.

```js
// eslint.config.mjs
import next from "@next/eslint-plugin-next";

export default [
  {
    plugins: { "@next/next": next },
    rules: { ...next.configs.recommended.rules },
  },
];
```

Interview note:

Because `next build` no longer lints, linting must be a separate CI step. A team
upgrading to 16 silently loses lint enforcement in CI if nobody notices.

## 10. How Do You Analyze And Reduce Bundle Size?

```bash
npm install --save-dev @next/bundle-analyzer
ANALYZE=true npm run build
```

```ts
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

export default withBundleAnalyzer(nextConfig);
```

The highest-leverage fixes, in order:

**1. Move work to Server Components.** A Markdown parser or syntax highlighter used
only for rendering never needs to ship.

**2. Optimize barrel imports:**

```ts
const nextConfig: NextConfig = {
  optimizePackageImports: ["lucide-react", "date-fns", "lodash-es"],
};
```

This rewrites `import { X } from "pkg"` into a direct module import, so only `X` is
bundled. Several popular packages are optimized by default.

**3. Lazy-load heavy, optional components** with `next/dynamic`.

**4. Check for duplicate dependencies** — two versions of the same library is a
common and invisible cost.

## 11. What Are `serverExternalPackages` And `transpilePackages`?

Two opposite problems.

```ts
const nextConfig: NextConfig = {
  // do NOT bundle these - leave them as Node requires
  serverExternalPackages: ["sharp", "pino", "@aws-sdk/client-s3"],

  // DO transpile these - they ship untranspiled or ESM-only code
  transpilePackages: ["@acme/ui", "some-esm-only-package"],
};
```

`serverExternalPackages` is for packages with native bindings or dynamic requires
that break when bundled. The symptom is a module that works in development and
fails at runtime in production with a missing-binary or cannot-find-module error.

`transpilePackages` is for local monorepo packages and dependencies that publish
modern syntax the default pipeline does not process.

Interview note:

These two are frequently confused because both are "package handling". One says
*leave it alone*, the other says *process it more*.

## 12. What Is The React Compiler, And Should You Enable It?

The React Compiler automatically optimizes component rendering, reducing the need
for manual `useMemo` and `useCallback`.

```bash
npm install --save-dev babel-plugin-react-compiler
```

```ts
const nextConfig: NextConfig = {
  reactCompiler: true,
};
```

How Next.js keeps it fast:

The compiler runs through a **Babel plugin**, which would normally be slow. Next.js
adds a custom SWC optimization that analyses the project and applies the compiler
**only to relevant files** — those containing JSX or React hooks — rather than
everything.

Tradeoff:

Builds are slightly slower than the default Rust-only pipeline, but the impact is
small and localised. In return, a large amount of manual memoization becomes
unnecessary.

When to enable it:

On a codebase with heavy manual memoization, or one with re-render performance
problems. Verify with the profiler rather than assuming, and note that it requires
code to follow the Rules of React — components that mutate props or state during
render will not be optimized.

## 13. How Do You Use Codemods For Upgrades?

```bash
npx @next/codemod@canary upgrade latest
```

The codemods that matter for Next.js 16:

| Codemod | What it does |
| --- | --- |
| `middleware-to-proxy` | renames `middleware.ts` to `proxy.ts` |
| `next-async-request-api` | awaits `params`, `searchParams`, `cookies()`, `headers()` |
| `next-lint-to-eslint-cli` | migrates off the removed `next lint` |
| `remove-experimental-ppr` | drops `experimental_ppr`, now removed |
| `remove-unstable-prefix` | renames APIs that lost their `unstable_` prefix |
| `metadata-to-viewport-export` | moves `themeColor` and friends to `viewport` |
| `cache-components-instant-false` | opts every route out of Cache Components validation |
| `remove-partial-prefetch` | drops per-route `prefetch = 'partial'` |

```bash
npx @next/codemod@canary next-async-request-api ./app
npx @next/codemod@canary middleware-to-proxy .
```

The `cache-components-instant-false` codemod is the interesting one: it adds
`export const instant = false` to every page and layout, so you can enable
`cacheComponents` and then remove the opt-outs **route by route** instead of
migrating everything at once. It skips Client Components and files that already
declare `instant`.

Important:

Codemods are mechanical. Run them on a clean working tree, review the diff, and run
the test suite — they handle the common shape and miss the unusual one.

## 14. What Are The Breaking Changes In Next.js 16?

| Change | Action |
| --- | --- |
| Middleware renamed **Proxy** | rename to `proxy.ts`; codemod available |
| `params` / `searchParams` are Promises | await them; codemod available |
| Turbopack is the default bundler | port any custom webpack config |
| `next lint` removed | run ESLint or Biome directly |
| ESLint Flat Config by default | migrate `.eslintrc` |
| `experimental.ppr` removed | PPR comes from `cacheComponents` |
| AMP support removed | remove `next/amp` and `amp` config |
| `runtime = 'edge'` deprecated | migrate to Node.js |
| Local images with query strings | add `images.localPatterns` |
| `error.tsx` receives `retry` | rename from `reset` |

Also worth knowing:

- unhandled promise rejections terminate the process (since Node 15 behaviour)
- `dev` and `build` can now run concurrently
- Cache Components requires the Node.js runtime

Interview note:

The rename from Middleware to Proxy and the async `params` change are the two that
show up in almost every codebase. Knowing both signals current experience.

## 15. How Do You Debug A Next.js Application?

**Server-side** — attach a debugger to the Node process:

```bash
NODE_OPTIONS='--inspect' next dev
```

Then connect from Chrome DevTools or your editor and set breakpoints in Server
Components, Server Functions, and Route Handlers.

**Client-side** — ordinary browser DevTools.

Useful signals, and where to find each:

| Question | Where to look |
| --- | --- |
| Is this route static or dynamic? | the `next build` route table |
| Is this fetch cached? | `logging.fetches` output in development |
| Server or Client Component? | React DevTools component badges |
| What crossed the boundary? | the RSC payload in the network tab |
| Why is this slow? | an OpenTelemetry trace, then the profiler |
| What is in the bundle? | `@next/bundle-analyzer` |

```ts
const nextConfig: NextConfig = {
  logging: { fetches: { fullUrl: true, hmrRefreshes: true } },
};
```

## 16. How Do You Set Up CI For A Next.js Project?

```yaml
name: CI
on: [push, pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run lint          # next build no longer lints
      - run: npx tsc --noEmit
      - run: npm run test:run

      - uses: actions/cache@v4
        with:
          path: ${{ github.workspace }}/.next/cache
          key: nextjs-${{ hashFiles('**/package-lock.json') }}-${{ hashFiles('**/*.ts', '**/*.tsx') }}
          restore-keys: nextjs-${{ hashFiles('**/package-lock.json') }}-

      - run: npm run build
      - run: npx playwright install --with-deps
      - run: npx playwright test
```

Two things worth calling out:

- **lint explicitly**, because `next build` no longer does it
- **cache `.next/cache`**, which substantially shortens build times

## 17. How Do You Keep Local Development Fast?

```ts
const nextConfig: NextConfig = {
  experimental: {
    turbopackFileSystemCache: true,
    turbopackMemoryEviction: true,
  },
};
```

Practical measures:

- keep `"use client"` boundaries small — a large client subtree recompiles more
- avoid barrel files in your own code; they defeat granular invalidation
- use `optimizePackageImports` for large dependencies
- restart the dev server after changing `next.config.ts`, which is not hot-reloaded

Interview note:

A slow `next dev` is usually caused by the application's own module graph — a
barrel file re-exporting hundreds of modules from one entry point — rather than by
the bundler.

## 18. How Do You Approach An Upgrade To Next.js 16?

Method:

1. **Read the upgrade guide** for the version you are on, not the newest one.
2. **Run the automated upgrade** — `npx @next/codemod@canary upgrade latest`.
3. **Run the targeted codemods** for anything the upgrade did not cover.
4. **Fix type errors**, which is largely the async `params` change.
5. **Rename Middleware to Proxy.**
6. **Port the webpack config** to Turbopack, or remove it.
7. **Re-add linting to CI**, since `next build` no longer runs it.
8. **Run `next build`** and compare the route table against the previous release —
   a route that changed symbol is the signal to investigate.
9. **Adopt Cache Components incrementally**, using
   `cache-components-instant-false` to opt out globally and then remove opt-outs
   route by route.

Strong answer:

> I upgrade in two phases. First the mechanical changes with codemods — async
> request APIs, Middleware to Proxy, the lint CLI — until the build is green. Only
> then do I adopt Cache Components, and I do it route by route using the
> `instant = false` codemod to opt everything out first, because that turns one
> large risky migration into a series of small reversible ones.

## 19. What Are The Common Tooling Gotchas?

**Trying to unit test an async Server Component** — not supported; use end-to-end.

**Testing against `next dev`** — prefetching, error redaction, and CSS ordering all
differ from production.

**Expecting `next build` to lint** — it no longer does; add an explicit CI step.

**Keeping a webpack config** after Turbopack became the default — it is ignored.

**`typescript.ignoreBuildErrors: true`** left on permanently.

**Confusing `serverExternalPackages` with `transpilePackages`** — opposite fixes.

**Running codemods on a dirty tree** — the diff becomes unreviewable.

**Not caching `.next/cache` in CI** — builds are far slower than necessary.

**Editing `next.config.ts` without restarting** — it is not hot-reloaded.

**Mocking `next/navigation` heavily in unit tests** — it hides real integration
failures that an end-to-end test would catch.

## 20. How Would You Summarise The Tooling Story In An Interview?

Strong answer:

> Next.js 16 moved several things: Turbopack is the default bundler for dev and
> build, `next lint` is gone in favour of running ESLint or Biome directly, and
> `typedRoutes` is stable. For testing, the important constraint is that async
> Server Components cannot be rendered by Jest or Vitest, so I keep those
> components thin — fetch and delegate — unit test the presentational half and the
> data access layer, and cover the async paths and Server Functions with Playwright
> against a production build. For upgrades I lean on the codemods, especially
> `next-async-request-api` and `middleware-to-proxy`, and adopt Cache Components
> route by route rather than all at once.

## Sources Used

- <https://nextjs.org/docs/app/guides/testing>
- <https://nextjs.org/docs/app/guides/testing/vitest>
- <https://nextjs.org/docs/app/guides/testing/jest>
- <https://nextjs.org/docs/app/guides/testing/playwright>
- <https://nextjs.org/docs/app/api-reference/turbopack>
- <https://nextjs.org/docs/app/api-reference/config/typescript>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/typedRoutes>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports>
- <https://nextjs.org/docs/app/guides/package-bundling>
- <https://nextjs.org/docs/app/guides/upgrading/codemods>
- <https://nextjs.org/docs/app/guides/upgrading/version-16>
- <https://nextjs.org/docs/app/guides/ci-build-caching>
