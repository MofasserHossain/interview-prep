# Frontend Architecture And Micro Frontends Interview Guide

Frontend architecture guidance covering scalable React application structure,
design systems, state ownership, micro frontends, Module Federation, webpack,
Vite, shared dependencies, deployment, and production tradeoffs.

## 1. What is frontend architecture?

Frontend architecture is how a frontend application is organized so it remains
maintainable as features, teams, and product workflows grow.

It includes:

- routing
- component boundaries
- state ownership
- API/data-fetching boundaries
- design system
- build system
- testing strategy
- deployment strategy
- performance and observability

Strong answer:

> Good frontend architecture makes product changes easier without spreading
> business logic across unrelated components. It defines where code lives, who
> owns state, how APIs are consumed, and how teams ship safely.

## 2. How do you structure a large React frontend?

A feature-first structure usually scales well.

```txt
src/
  app/
    routes/
    providers/
    layout/
  features/
    work-orders/
      api/
      components/
      hooks/
      types.ts
    technicians/
      api/
      components/
  shared/
    ui/
    hooks/
    lib/
```

Rules:

| Rule | Reason |
| --- | --- |
| Feature code stays with the feature. | Easier ownership and deletion. |
| Shared UI stays generic. | Prevents business logic in common components. |
| API clients are typed. | Keeps frontend/backend contracts explicit. |
| State is scoped by ownership. | Reduces re-render and coupling problems. |
| Tests live near behavior. | Easier to maintain when features change. |

Interview trap:

> A big `shared/` folder can become a dumping ground. Shared code should be
> intentionally reusable, not just code used twice.

## 3. What are micro frontends?

Micro frontends split one product frontend into independently owned and
deployable frontend applications.

Example:

```txt
Shell app
  -> work orders remote
  -> billing remote
  -> technician profile remote
  -> reporting remote
```

Benefits:

| Benefit | Why it helps |
| --- | --- |
| Team autonomy | Teams can ship their area independently. |
| Independent deployment | One area can release without redeploying the full shell. |
| Smaller ownership boundary | Product domains become clearer. |
| Incremental migration | Old frontend can be replaced piece by piece. |

Costs:

- routing coordination
- auth/session sharing
- duplicated dependencies
- UX consistency
- version compatibility
- more build/deployment complexity
- harder end-to-end debugging

Strong answer:

> Micro frontends are an organizational and deployment pattern, not only a
> technical trick. I use them when team boundaries and independent releases
> justify the operational cost.

## 4. When should you avoid micro frontends?

Avoid them when a modular frontend is enough.

| Avoid when | Better option |
| --- | --- |
| Team is small | Modular monolith frontend. |
| Product boundaries are unclear | Feature-first structure. |
| Release independence is not needed | Single app deployment. |
| Shared UX must change rapidly | Strong design system inside one app. |
| Team lacks deployment maturity | Build CI/CD and observability first. |

Strong answer:

> I would not start with micro frontends by default. I would first build a
> modular React app. I would introduce micro frontends when independent teams,
> independent deployment, or migration pressure makes the complexity worthwhile.

## 5. What is Module Federation?

Module Federation lets separately built applications expose and consume modules
at runtime.

Core terms:

| Term | Meaning |
| --- | --- |
| Host or shell | The app that loads remote modules. |
| Remote or provider | The app that exposes modules. |
| `exposes` | Public modules a remote makes available. |
| `remotes` | Remote apps the host can load. |
| `shared` | Dependencies that can be reused between host and remotes. |
| `remoteEntry` or manifest | Runtime entry describing what the remote provides. |

Example flow:

```txt
Host renders route /billing
  -> loads billing remote entry
  -> requests exposed BillingApp module
  -> remote returns module factory
  -> React lazy/Suspense renders BillingApp
```

Strong answer:

> Module Federation is useful when independently deployed frontend builds need
> runtime composition while sharing critical dependencies like React.

## 6. How do you configure Module Federation with webpack?

Remote webpack config:

```js
const { ModuleFederationPlugin } = require("webpack").container;

module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: "billing",
      filename: "remoteEntry.js",
      exposes: {
        "./BillingApp": "./src/BillingApp",
      },
      shared: {
        react: { singleton: true, requiredVersion: "^19.0.0" },
        "react-dom": { singleton: true, requiredVersion: "^19.0.0" },
      },
    }),
  ],
};
```

Host webpack config:

```js
const { ModuleFederationPlugin } = require("webpack").container;

module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: "shell",
      remotes: {
        billing: "billing@https://cdn.example.com/billing/remoteEntry.js",
      },
      shared: {
        react: { singleton: true, requiredVersion: "^19.0.0" },
        "react-dom": { singleton: true, requiredVersion: "^19.0.0" },
      },
    }),
  ],
};
```

Host usage:

```tsx
const BillingApp = React.lazy(() => import("billing/BillingApp"));

export function BillingRoute() {
  return (
    <Suspense fallback={<PageLoader />}>
      <BillingApp />
    </Suspense>
  );
}
```

Interview note:

> `singleton: true` is important for React because multiple React instances can
> break hooks and shared runtime assumptions.

## 7. How do you configure Module Federation with Vite?

Modern Module Federation supports a Vite build plugin.

Example `module-federation.config.ts`:

```ts
import { createModuleFederationConfig } from "@module-federation/vite";

export default createModuleFederationConfig({
  name: "billing",
  manifest: true,
  exposes: {
    "./BillingApp": "./src/BillingApp",
  },
  shared: {
    react: {
      singleton: true,
    },
    "react-dom": {
      singleton: true,
    },
  },
});
```

Example `vite.config.ts`:

```ts
import { federation } from "@module-federation/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import mfConfig from "./module-federation.config";

export default defineConfig({
  server: {
    origin: "http://localhost:3001",
    port: 3001,
  },
  plugins: [react(), federation(mfConfig)],
});
```

Host idea:

```ts
export default createModuleFederationConfig({
  name: "shell",
  remotes: {
    billing: {
      type: "module",
      name: "billing",
      entry: "https://cdn.example.com/billing/remoteEntry.js",
    },
  },
  shared: {
    react: { singleton: true },
    "react-dom": { singleton: true },
  },
});
```

Strong answer:

> With Vite, Module Federation is plugin-driven. The same concepts remain:
> expose modules from remotes, register remotes in the host, and define shared
> dependencies to avoid duplicate critical runtime libraries.

## 8. webpack Module Federation vs Vite Module Federation: what changes?

The architecture concepts are similar, but tooling behavior differs.

| Area | webpack | Vite |
| --- | --- | --- |
| Native history | Module Federation started in webpack 5. | Uses a federation plugin. |
| Dev server | webpack dev server and bundle pipeline. | Vite dev server and ESM-first workflow. |
| Config | `ModuleFederationPlugin` in webpack config. | `@module-federation/vite` plugin and config file. |
| Builds | Bundled output. | Vite/Rollup production output. |
| Interview focus | Know `exposes`, `remotes`, `shared`, `singleton`. | Same concepts, plus plugin support and ESM remote entries. |

Strong answer:

> I would explain Module Federation by concepts first. webpack and Vite are
> implementation details. The important parts are runtime loading, shared
> dependencies, independent deployment, fallback, and version compatibility.

## 9. How should routing work with micro frontends?

Common routing models:

| Model | How it works | Tradeoff |
| --- | --- | --- |
| Shell-owned routing | Shell maps top-level paths to remotes. | Centralized and predictable. |
| Remote-owned child routes | Remote controls routes under its base path. | Good autonomy, requires basename coordination. |
| Route manifest | Remotes publish route metadata. | Flexible but more runtime complexity. |

Example:

```txt
/work-orders/* -> work-orders remote
/billing/*     -> billing remote
/reports/*     -> reports remote
```

Guideline:

> The shell should own global navigation, auth boundaries, layout, and
> top-level route decisions. Remotes can own their internal feature routes.

## 10. How do authentication and state work across micro frontends?

Avoid each remote inventing its own auth model.

Common approach:

```txt
Shell owns:
  - login/session refresh
  - user identity
  - tenant/company context
  - global navigation

Remote owns:
  - feature-specific state
  - feature API calls
  - local UI interactions
```

State sharing options:

| Option | Use when |
| --- | --- |
| Props from shell | Small amount of stable context. |
| Shared auth package | Common token/session helpers. |
| Browser storage | Use carefully for low-sensitivity coordination. |
| Events | Loose communication between independently deployed parts. |
| Backend/API | Source of truth for business state. |

Strong answer:

> I avoid sharing a giant frontend store across remotes. Shared global state
> recreates monolith coupling. I prefer shell-owned app context and remote-owned
> feature state.

## 11. What production problems do micro frontends create?

Prepare to discuss failures, not only setup.

| Problem | Mitigation |
| --- | --- |
| Remote unavailable | Error boundary, fallback UI, retry, graceful degradation. |
| Version mismatch | Contract testing, dependency policy, canary rollout. |
| Duplicate React | Shared singleton config and dependency alignment. |
| CSS collision | Scoped styles, CSS modules, design tokens. |
| Slow remote load | CDN caching, preload/prefetch, route-level lazy loading. |
| Debugging across apps | Correlation IDs, release metadata, source maps. |
| Broken deployment | Independent rollback and compatibility checks. |

Example fallback:

```tsx
function RemoteErrorFallback() {
  return (
    <section role="alert">
      <h2>Billing is temporarily unavailable</h2>
      <p>Please try again in a few minutes.</p>
    </section>
  );
}
```

Strong answer:

> A production micro-frontend setup needs remote fallbacks, version strategy,
> observability, and rollback. Loading remote code is the easy part.

## 12. What is a design system in a micro-frontend setup?

A design system is shared UI language: components, tokens, accessibility rules,
interaction patterns, and documentation.

In micro frontends, it prevents each remote from looking and behaving
differently.

Good design system shape:

```txt
@company/ui
  Button
  Input
  Modal
  Table
  Toast
  tokens
  icons
```

Rules:

- keep product-specific logic out of shared UI
- version shared UI intentionally
- test accessibility in shared primitives
- keep tokens consistent
- document usage patterns

Strong answer:

> A design system is more important in micro frontends because teams deploy
> separately. Without a shared UI contract, the product can become visually and
> behaviorally fragmented.

## 13. How do you explain micro frontend tradeoffs in an interview?

Use a balanced answer.

```txt
I would start with a modular frontend. If multiple teams need independent
ownership and deployments, I would consider micro frontends. I would define
clear domain boundaries, shell-owned routing/auth, remote-owned feature state,
a shared design system, and production safeguards like fallbacks, monitoring,
contract tests, and rollback.
```

Do not say:

```txt
Micro frontends always improve performance.
```

Say:

```txt
Micro frontends can improve team delivery, but performance depends on bundle
size, shared dependencies, caching, and runtime loading strategy.
```

Strong answer:

> Micro frontends solve team and deployment scaling problems. They do not
> automatically solve code quality, performance, or architecture. Those still
> require boundaries, testing, shared standards, and production discipline.

## Sources Used

- <https://webpack.js.org/concepts/module-federation/>
- <https://webpack.js.org/plugins/module-federation-plugin/>
- <https://module-federation.io/>
- <https://module-federation.io/configure/>
- <https://module-federation.io/configure/shared>
- <https://module-federation.io/integrations/build-tool/vite.html>
- <https://module-federation.io/guide/runtime/>
