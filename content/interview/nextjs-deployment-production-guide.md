# Next.js Deployment And Production Interview Guide

Deployment guidance covering the build output, standalone and static export,
Docker, build-time versus runtime environment variables, version skew and
`deploymentId`, multi-instance self-hosting, shared caches, reverse proxies and
streaming, graceful shutdown, and the production checklist. Written against
**Next.js 16**.

## 1. What Does `next build` Produce, And How Do You Read The Route Table?

```bash
next build
```

The route table tells you how each route is served:

| Symbol | Name | Behaviour |
| --- | --- | --- |
| `○` | Static | fully prerendered at build time |
| `◐` | Partial Prerender | static shell, dynamic content streams in |
| `●` | SSG | prerendered from `generateStaticParams` |
| `ƒ` | Dynamic | server-rendered per request |

```txt
Route (app)
┌ ○ /                      static
├ ◐ /products              shell static, content streams
├ ● /blog/[slug]           prerendered from generateStaticParams
└ ƒ /api/search            dynamic
```

Why it matters:

This is the honest answer to "is my page static or dynamic?". Reading it before
every deploy catches a route that silently became dynamic — usually because a
shared component started reading `cookies()`.

Important:

`◐` only appears with Cache Components, which makes Partial Prerendering the
default. On that model `ƒ` means the route has **nothing** to prerender.

## 2. What Is `output: "standalone"`?

Standalone output traces only the files actually needed and emits a self-contained
server, which is what you want for containers.

```ts
const nextConfig: NextConfig = {
  output: "standalone",
};
```

It produces `.next/standalone/server.js` plus a minimal `node_modules` — typically
a fraction of the size of copying the whole dependency tree.

```txt
.next/standalone/
├── server.js
├── node_modules/       only what is reachable
├── package.json
└── .next/
```

Important:

Standalone does **not** include `.next/static` or `public/`. Those must be copied
separately, which is the single most common containerisation mistake — the app
boots and every asset 404s.

## 3. How Do You Containerize A Next.js Application?

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

Points worth explaining in an interview:

- **multi-stage build** — the final image has no source, no dev dependencies, no
  build toolchain
- **`.next/static` and `public/` copied explicitly** — standalone omits them
- **non-root user** — standard container hardening
- **`HOSTNAME=0.0.0.0`** — without it the server binds to localhost inside the
  container and the port mapping appears broken

## 4. What Is `output: "export"`, And What Does It Give Up?

Static export produces plain HTML with no Node server.

```ts
const nextConfig: NextConfig = {
  output: "export",
};
```

What stops working:

- Server Functions and Route Handlers
- dynamic rendering, `cookies()`, `headers()`, `searchParams` on the server
- ISR and on-demand revalidation
- Proxy
- image optimization, unless `images.unoptimized` or a custom loader

```ts
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};
```

When to use it:

Documentation sites, marketing pages, anything genuinely static that must sit on a
CDN or object storage with no runtime.

Interview note:

A static export can still be interactive — it is a full client-side React app
after hydration. What it cannot do is anything **per request** on the server.

## 5. How Do Build-Time And Runtime Environment Variables Differ?

| Prefix | Available in | Resolved |
| --- | --- | --- |
| none | server only | at runtime, during dynamic rendering |
| `NEXT_PUBLIC_` | server **and** browser | **inlined at build time** |

```ts
// server only, read at runtime
const key = process.env.STRIPE_SECRET_KEY;

// inlined into the client bundle at build time
const url = process.env.NEXT_PUBLIC_API_URL;
```

The consequence that surprises people:

Changing a `NEXT_PUBLIC_` variable requires a **rebuild**, not a restart. Its value
is baked into the JavaScript.

Reading a server variable genuinely at runtime requires the component to render
dynamically:

```tsx
import { connection } from "next/server";

export default async function Component() {
  await connection(); // now this evaluates per request
  const value = process.env.MY_VALUE;
  return <span>{value}</span>;
}
```

Without `connection()` — or a Request-time API — the value is captured during
prerendering and frozen.

Important:

Never give a secret the `NEXT_PUBLIC_` prefix. It is published to every visitor,
and rotating it means rebuilding and redeploying.

## 6. How Do You Build One Image And Deploy It To Many Environments?

The problem: `NEXT_PUBLIC_` values are baked in at build time, so a single image
cannot serve staging and production with different public config.

Options, in order of preference:

**1. Read on the server and pass down.** Keep the variable server-only and hand it
to Client Components as a prop.

```tsx
export default async function Layout({ children }) {
  await connection();
  return <ConfigProvider apiUrl={process.env.API_URL}>{children}</ConfigProvider>;
}
```

**2. Serve config from an endpoint.** A Route Handler returns runtime values the
client fetches once.

**3. Build per environment.** Simple and honest, at the cost of one image per
environment.

Tradeoff:

Option 1 forces dynamic rendering on the layout that reads it. Scope it to the
smallest component and wrap it in `<Suspense>` so the rest still prerenders.

## 7. What Is Version Skew, And How Does `deploymentId` Fix It?

During a rolling deploy, a browser holding an old page can talk to a server running
a new build. That mismatch causes:

- **missing assets** — the client requests JS or CSS that no longer exists
- **Server Function mismatches** — the client invokes an action ID the new server
  does not recognise
- **navigation failures** — prefetched data from the old deployment is incompatible

```ts
const nextConfig: NextConfig = {
  deploymentId: process.env.DEPLOYMENT_VERSION,
};
```

With a deployment ID configured:

- static assets carry `?dpl=<deploymentId>`
- client navigation requests send an `x-deployment-id` header
- the server compares the client's ID with its own

On a mismatch, Next.js triggers a **hard navigation** — a full reload — instead of
a broken client-side transition.

Important:

A hard navigation loses component state. `useState` is gone; URL state and
`localStorage` survive. Designing important state to live in the URL makes this
recovery invisible.

Interview note:

This is the concrete answer to "what breaks during a rolling deploy?" — a question
that separates people who have operated a Next.js app from people who have only
built one.

## 8. What Does Multi-Instance Self-Hosting Require?

Three things, each with a distinct failure mode.

**1. A shared Server Functions encryption key.**

Next.js encrypts Server Function closure variables, generating a unique key per
build. Across instances, an action encrypted by one cannot be decrypted by another.

```bash
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<base64 key> next build
```

The key must be base64-encoded with a valid AES length — 16, 24, or 32 bytes.
Next.js generates 32-byte keys by default.

Symptom without it: `Failed to find Server Action` errors, intermittently,
depending on which replica answers.

**2. A deployment identifier**, for version skew protection during rolling deploys.

**3. A shared cache.** By default Next.js uses an **in-memory** cache that is not
shared across instances, so users see different content depending on which replica
serves them.

```ts
const nextConfig: NextConfig = {
  cacheHandlers: {
    default: require.resolve("./cache-handler.js"),
  },
};
```

With Cache Components, `use cache: remote` plus a custom handler backed by external
storage gives consistent caching across instances.

## 9. How Does Caching Work When Self-Hosting?

Next.js caches automatically:

- immutable assets under `/_next/static` get long-lived cache headers
- prerendered pages and cached data live in the incremental cache

```ts
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};
```

The hard parts when self-hosting:

| Problem | Fix |
| --- | --- |
| Cache not shared across instances | custom cache handler in external storage |
| Cache lost on container restart | persist it outside the container |
| ISR regenerating on every replica | shared cache so one regeneration serves all |
| Stale content after a deploy | tie the cache key to the deployment ID |

Important:

`/_next/static` is safe to cache forever because filenames are content-hashed.
`public/` is **not** fingerprinted, so anything there needs a shorter max-age or
manual cache busting.

## 10. How Do You Configure A Reverse Proxy Correctly?

Two things matter: forwarded headers, and buffering.

```nginx
location / {
  proxy_pass http://nextjs:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";

  proxy_buffering off;   # required for streaming
}
```

`X-Forwarded-Host` matters because the Server Actions CSRF check compares `Origin`
against `Host` — or `X-Forwarded-Host` when present. Without it, every action is
rejected behind the proxy.

Alternatively, allow the proxy origin explicitly:

```ts
const nextConfig: NextConfig = {
  serverActions: { allowedOrigins: ["my-proxy.com", "*.my-proxy.com"] },
};
```

## 11. Why Does Streaming Break Behind A Proxy?

Because proxies buffer responses by default, holding the whole body before
forwarding it. That defeats streaming entirely — the user waits for the slowest
component instead of seeing the shell.

Disable buffering. With nginx, `proxy_buffering off`, or emit the header from the
app:

```ts
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*{/}?",
        headers: [{ key: "X-Accel-Buffering", value: "no" }],
      },
    ];
  },
};
```

Symptom:

Suspense fallbacks never appear, `loading.tsx` seems to do nothing, and the page
arrives all at once after a long pause — while working perfectly in local
development where there is no proxy.

Interview note:

This is a good "it works locally but not in production" story, because the cause is
entirely outside the application code.

## 12. What About Image Optimization When Self-Hosting?

The optimizer works when self-hosting, but it needs `sharp` and it costs CPU and
memory on your own servers.

Options:

```ts
// 1. Default optimizer - install sharp for better performance
const nextConfig: NextConfig = {
  images: { minimumCacheTTL: 60 },
};

// 2. Delegate to a CDN or image service
const nextConfig: NextConfig = {
  images: { loader: "custom", loaderFile: "./image-loader.ts" },
};

// 3. Turn it off
const nextConfig: NextConfig = {
  images: { unoptimized: true },
};
```

Important:

The optimizer is a **public endpoint**. `remotePatterns` and `localPatterns` exist
so it cannot be used as an open proxy to resize arbitrary images from arbitrary
hosts.

Tradeoff:

Self-hosted optimization keeps everything on your infrastructure at the cost of CPU
per unique image-and-size combination. A CDN loader moves that cost and the cache
off your servers.

## 13. How Do You Do A Graceful Shutdown?

Set `NEXT_MANUAL_SIG_HANDLE` and register your own handlers.

```json
{
  "scripts": {
    "start": "NEXT_MANUAL_SIG_HANDLE=true next start"
  }
}
```

The variable must be set **in the script**, not in a `.env` file.

```ts
process.on("SIGTERM", async () => {
  await pool.end();
  await broker.close();
  process.exit(0);
});
```

Important:

Manual signal handling is **not available in `next dev`** — it only applies to a
production server.

Why it matters:

`SIGTERM` is what Kubernetes and Docker send on stop. Without handling it, in-flight
requests are dropped and connections are not returned to their pools cleanly.

## 14. What Is The Build Cache, And How Do You Use It In CI?

Next.js caches compiler artifacts between builds. Persisting `.next/cache` in CI
dramatically shortens build times.

```yaml
# GitHub Actions
- uses: actions/cache@v4
  with:
    path: |
      ~/.npm
      ${{ github.workspace }}/.next/cache
    key: ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-${{ hashFiles('**/*.ts', '**/*.tsx') }}
    restore-keys: |
      ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-
```

Turbopack adds filesystem caching:

```ts
const nextConfig: NextConfig = {
  experimental: { turbopackFileSystemCache: true },
};
```

Important:

In Docker, `.next/cache` is lost between builds unless you mount it. A BuildKit
cache mount preserves it:

```dockerfile
RUN --mount=type=cache,target=/app/.next/cache npm run build
```

## 15. What Are `basePath` And `assetPrefix` For?

```ts
const nextConfig: NextConfig = {
  basePath: "/docs",       // the app is served under /docs
  assetPrefix: "https://cdn.example.com",
};
```

`basePath` mounts the whole application under a sub-path — needed when several apps
share a domain, as in a multi-zone setup.

`assetPrefix` serves `/_next/static` from a CDN while HTML comes from your server.

Important:

With `basePath`, `<Link href="/about">` automatically resolves to `/docs/about`.
Raw `<a href>` and `fetch` calls do **not** — those need the prefix added manually,
which is the usual source of broken links after adopting it.

## 16. How Does `after()` Behave In Production?

`after()` runs work once the response is sent.

```ts
import { after } from "next/server";

after(async () => {
  await logAnalytics(event);
});
```

On a long-running Node server it simply runs after the response. On **serverless**,
the function may be frozen once the response is sent, so the work may not complete.

The rule:

`after()` is best-effort. Anything that must not be lost — a payment webhook, an
audit record — belongs in a durable queue, not in `after()`.

## 17. What Is On The Production Checklist?

Before shipping:

**Rendering** — read the `next build` route table; is anything `ƒ` that should be
static?

**Bundles** — run the analyzer at least once; check `optimizePackageImports` for
barrel packages.

**Images and fonts** — `next/image` with `priority` on the LCP image only;
`next/font` for every font.

**Caching** — a stated strategy per route, and a shared cache handler if running
more than one instance.

**Security** — `server-only` on modules touching secrets; auth checks in the data
layer; no secrets behind `NEXT_PUBLIC_`.

**Metadata** — `metadataBase` set; Open Graph images absolute.

**Errors** — boundaries at meaningful segments; `onRequestError` wired to your
monitoring.

**Environment** — `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` and `deploymentId` for
multi-instance.

**Proxy** — forwarded headers set; buffering disabled for streaming.

**Vitals** — reported from the field, not measured locally.

## 18. How Do You Debug A Production-Only Problem?

Method:

1. **Reproduce against a production build locally** — `next build && next start`.
   Development differs in prefetching, error redaction, CSS ordering, and
   minification.
2. **Compare the route table** between the working and broken builds.
3. **Check environment variables** — especially anything `NEXT_PUBLIC_`, which is
   baked in at build time.
4. **Check the proxy** — buffering, forwarded headers, timeouts.
5. **Check instance count** — intermittent failures across replicas point at the
   encryption key or an unshared cache.

| Symptom | Likely cause |
| --- | --- |
| "Failed to find Server Action", intermittent | missing shared encryption key |
| Assets 404 after deploy | version skew, no `deploymentId` |
| Streaming does not stream | proxy buffering |
| CSRF failures on actions | missing `X-Forwarded-Host` or `allowedOrigins` |
| Stale content on some requests | unshared in-memory cache |
| Every asset 404s in Docker | `.next/static` and `public/` not copied |
| Port mapping appears broken | `HOSTNAME` not set to `0.0.0.0` |

## 19. How Do You Roll Back Safely?

**Keep the previous build artifact.** Rebuilding from an older commit is not
equivalent — dependency resolution can differ.

**Set `deploymentId` per release** so version skew is detected during the rollback
as well as during the deploy.

**Treat database migrations separately.** Code rolls back; a dropped column does
not. Use expand-and-contract so every intermediate state works with both versions.

**Watch for cached content from the newer build.** If the cache is shared and keyed
without the deployment ID, a rollback can keep serving the newer render.

Interview note:

The hardest part of rolling back a Next.js app is rarely the app — it is the cache
and the database. Keying the cache by deployment ID and never making a
backward-incompatible migration in one step is what makes rollback boring.

## 20. What Are The Common Deployment Gotchas?

**Forgetting `.next/static` and `public/`** in a standalone Docker image.

**`HOSTNAME` not set to `0.0.0.0`** — the container binds to localhost.

**Changing a `NEXT_PUBLIC_` variable without rebuilding** — the old value is
inlined.

**No shared encryption key** across instances — intermittent Server Action
failures.

**No `deploymentId`** — rolling deploys break in-flight clients.

**In-memory cache with several replicas** — inconsistent content.

**Proxy buffering left on** — streaming silently stops working.

**Missing `X-Forwarded-Host`** — Server Action CSRF rejections.

**Relying on `after()` for critical work** — serverless may freeze first.

**`basePath` without updating raw `<a>` and `fetch` calls** — broken links.

**Secrets in `public/`** — the whole directory is served.

Strong answer:

> The three things I set for any self-hosted, multi-instance deployment are a
> shared `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, a `deploymentId` for version skew,
> and a cache handler backed by external storage — because the default is an
> in-memory cache per instance. After that the usual production surprises are proxy
> buffering breaking streaming and `NEXT_PUBLIC_` variables being baked in at build
> time rather than read at runtime.

## Sources Used

- <https://nextjs.org/docs/app/getting-started/deploying>
- <https://nextjs.org/docs/app/guides/self-hosting>
- <https://nextjs.org/docs/app/guides/production-checklist>
- <https://nextjs.org/docs/app/guides/static-exports>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/output>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/deploymentId>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandlers>
- <https://nextjs.org/docs/app/guides/environment-variables>
- <https://nextjs.org/docs/app/guides/ci-build-caching>
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath>
