# React Compiler Interview Guide

React Compiler interview guidance covering automatic memoization, Rules of
React, lint feedback, manual memoization tradeoffs, Next.js setup, and gradual
adoption.

React Compiler is not a hook and it was not introduced as a React 19 hook. It
is a build-time optimizer that works best with modern React and reached its
first stable release after React 19.

## Course Topic Map

- What React Compiler optimizes
- How automatic memoization changes component code
- Why purity and Rules of React matter
- What manual memoization still does
- Next.js configuration
- Annotation mode with `"use memo"` and `"use no memo"`
- React 17/18 compatibility and React 19 runtime support
- Incremental rollout and verification

## 1. What Is React Compiler?

React Compiler is a build-time optimizer that automatically memoizes React
components and hooks when the code follows the Rules of React.

It can reduce the need for manual:

- `React.memo`
- `useMemo`
- `useCallback`

Before:

```tsx
const visibleItems = useMemo(() => filterItems(items, tab), [items, tab]);

const handleSelect = useCallback((id: string) => {
  onSelect(id);
}, [onSelect]);
```

With compiler-friendly code:

```tsx
const visibleItems = filterItems(items, tab);

function handleSelect(id: string) {
  onSelect(id);
}
```

Strong interview answer:

> React Compiler changes the default memoization story. I write clear, pure
> React code and let the compiler skip unnecessary work where it can. I still
> use manual memoization when exact identity matters.

## 2. Why Does Automatic Memoization Matter?

Manual memoization is easy to overuse and easy to get wrong.

Common problems:

- dependency arrays are incorrect
- memoization hides design issues
- code becomes noisy
- components still re-render because props are unstable
- teams add `useCallback` without measuring

React Compiler can analyze component code and cache values or JSX internally
without forcing developers to wrap every calculation manually.

Why it matters:

The code can stay closer to the normal data flow while still avoiding many
unnecessary render-time recalculations.

Tradeoff:

The compiler does not fix bad state design, huge DOM trees, slow network calls,
or expensive work outside React rendering.

## 3. Does React Compiler Replace `useMemo`, `useCallback`, And `memo`?

No. It makes those APIs less necessary by default, but they remain useful.

Manual memoization can still help when:

- a value is used as an effect dependency
- a library boundary requires stable identity
- expensive work is outside compiled code
- a component is not compiled yet
- profiling proves a specific memoization boundary helps

What changes:

In compiler-enabled code, prefer clear code first. Add manual memoization when
there is a concrete identity or performance reason.

Interview trap:

Do not say "`useMemo` is dead." Existing codebases, library APIs, and uncompiled
code still need manual memoization knowledge.

## 4. What Code Can React Compiler Optimize?

React Compiler works best with pure React code.

Good patterns:

- components behave like pure functions of props, state, and context
- state is updated through React setters
- props and state are not mutated
- hooks follow stable call order
- render does not perform side effects
- refs are not read or written during render except for safe initialization

Bad pattern:

```tsx
function ProductList({ products }: { products: Product[] }) {
  products.sort((a, b) => a.name.localeCompare(b.name));

  return products.map((product) => <ProductRow key={product.id} product={product} />);
}
```

Better:

```tsx
function ProductList({ products }: { products: Product[] }) {
  const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name));

  return sortedProducts.map((product) => (
    <ProductRow key={product.id} product={product} />
  ));
}
```

Why it matters:

Mutation during render is already a bug risk. The compiler makes those issues
more visible because it relies on React's purity model.

## 5. How Do Lint Rules Help With React Compiler?

React Compiler is paired with React lint rules that detect patterns the
compiler cannot safely optimize.

Useful lint categories:

- Rules of Hooks violations
- mutating props or state
- setting state during render
- impure render logic
- unsupported syntax or patterns
- unnecessary manual memoization in compiled code

Why it matters:

The lint output is not just about optimization. It often points to correctness
problems that could already cause bugs.

Tradeoff:

The compiler can skip unsafe components and still compile the rest of the app.
That makes incremental adoption possible.

## 6. How Do You Enable React Compiler In Next.js?

In modern Next.js, enable React Compiler with `reactCompiler`.

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
};

export default nextConfig;
```

The standard setup uses the compiler plugin:

```bash
npm install -D babel-plugin-react-compiler
```

Why it matters:

Next.js can apply the compiler only to relevant files, such as files containing
JSX or React hooks, instead of running it over every JavaScript file.

Tradeoff:

Build and development compilation can be slower. Measure the cost in your app
before rolling it out everywhere.

## 7. What Are `"use memo"` And `"use no memo"`?

React Compiler supports directives that control compilation at a component or
hook level.

Annotation mode in Next.js:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: {
    compilationMode: "annotation",
  },
};

export default nextConfig;
```

Opt in:

```tsx
function ProductList({ products }: { products: Product[] }) {
  "use memo";

  const visibleProducts = products.filter((product) => product.inStock);
  return <List items={visibleProducts} />;
}
```

Opt out:

```tsx
function LegacyWidget() {
  "use no memo";

  return <ThirdPartyWidget />;
}
```

Why it matters:

Directives let a team adopt the compiler gradually instead of changing the
whole app at once.

## 8. Does React Compiler Require React 19?

React Compiler works best with React 19 because React 19 includes the runtime
APIs the compiler expects.

For React 17 and React 18 apps, the compiler can be used with compatibility
configuration and the `react-compiler-runtime` package.

Interview-safe answer:

> React Compiler is not a React 19 hook. It is a separate build-time compiler.
> React 19 is the best target because it has the runtime support built in, but
> older React versions can use a runtime compatibility package.

Tradeoff:

If a mature app is still on React 17 or 18, upgrading React and the framework
may be a more important first step than enabling the compiler immediately.

## 9. How Would You Adopt React Compiler In A Real App?

Use an incremental rollout.

Practical checklist:

1. Upgrade React, framework, and lint tooling.
2. Enable the latest React hooks and compiler lint rules.
3. Fix Rules of React violations.
4. Start with one route, one package, or annotation mode.
5. Profile key interactions before and after.
6. Keep existing memoization until behavior is verified.
7. Remove manual memoization only when the compiler and tests cover the case.
8. Watch build times and developer feedback.

Why it matters:

The compiler can change performance behavior. Rollout should be measured, not
treated as a blind cleanup.

## 10. How Do You Verify React Compiler Helped?

Use the same performance discipline as any optimization.

Verification steps:

1. Pick an interaction with unnecessary rendering.
2. Record a baseline with React Profiler.
3. Enable compiler coverage for that area.
4. Re-run the same interaction.
5. Compare commit count, render cost, and user-visible responsiveness.
6. Check build time and developer workflow impact.

Do not rely only on:

- "the code has fewer `useMemo` calls"
- synthetic examples
- one fast local machine
- assumptions about all components being compiled

Strong interview answer:

> I would verify React Compiler the same way I verify manual memoization:
> profile before and after, confirm user-visible improvement, and keep an eye
> on build-time cost.

## Quick Revision Checklist

Before a React Compiler interview, be ready to explain:

- React Compiler is build-time automatic memoization
- it is not a hook
- it does not replace good state design
- it reduces the need for `memo`, `useMemo`, and `useCallback`
- manual memoization still matters at identity-sensitive boundaries
- compiler-friendly code must follow the Rules of React
- lint feedback often reveals real bugs
- Next.js uses `reactCompiler`
- annotation mode supports gradual rollout
- React 19 has built-in runtime support; React 17/18 need compatibility setup

## Sources Used

- [React Compiler](https://react.dev/learn/react-compiler)
- [React Compiler v1.0](https://react.dev/blog/2025/10/07/react-compiler-1)
- [React Compiler installation](https://react.dev/learn/react-compiler/installation)
- [React Compiler incremental adoption](https://react.dev/learn/react-compiler/incremental-adoption)
- [React Compiler target option](https://react.dev/reference/react-compiler/target)
- [React Compiler directives](https://react.dev/reference/react-compiler/directives)
- [Rules of React](https://react.dev/reference/rules)
- [Next.js reactCompiler config](https://nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler)
