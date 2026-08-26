# JavaScript Modules, Import And Export Interview Guide

JavaScript module interview guidance covering ES modules, CommonJS comparison,
named and default exports, static and dynamic imports, live bindings, module
scope, and practical usage decisions.

## 1. What Is A JavaScript Module?

A JavaScript module is a file that can explicitly export values and import
values from other files. Modules help split code into focused units instead of
putting every function, class, and constant into one global script.

Example:

```js
// math.js
export function add(a, b) {
  return a + b;
}

// app.js
import { add } from "./math.js";

console.log(add(2, 3));
```

Output:

```txt
5
```

Why modules matter:

- each module has its own scope
- imports and exports make dependencies explicit
- bundlers and runtimes can analyze static imports
- large apps become easier to organize and test

Interview note:

> A module is a file boundary. It keeps private implementation details inside
> the file and exposes only the values that other files should use.

## 2. What Is The Difference Between CommonJS And ES Modules?

CommonJS is the older Node.js module system. ES modules are the standard
JavaScript module system used by browsers, modern Node.js projects, and most
frontend tooling.

In interviews, people may say "ES6 modules", "ES modules", or "ESM". They are
usually talking about the `import` and `export` module system standardized in
JavaScript.

CommonJS:

```js
const { readFile } = require("node:fs/promises");

module.exports = {
  loadConfig,
};
```

ES modules:

```js
import { readFile } from "node:fs/promises";

export async function loadConfig() {
  const text = await readFile("config.json", "utf8");
  return JSON.parse(text);
}
```

Main differences:

| Area | CommonJS | ES Modules |
| --- | --- | --- |
| Import syntax | `require()` | `import` |
| Export syntax | `module.exports` or `exports.name` | `export` and `export default` |
| Loading style | generally synchronous | designed for static async-capable loading |
| Static analysis | harder | easier for tools and bundlers |
| Browser support | not native in browsers | native in modern browsers |
| Node.js support | long-standing default in older code | modern standard, enabled by `.mjs` or `"type": "module"` |

Interview phrasing:

> CommonJS is Node's older runtime module system. ES modules are the JavaScript
> standard. In modern apps I prefer ES modules unless I am maintaining older
> CommonJS code or using a package/tool that still expects CommonJS.

## 3. What Is The Difference Between `require` And `import`?

`require()` loads a CommonJS module. `import` loads an ES module.

`require()` example:

```js
const express = require("express");
const { add } = require("./math");
```

`import` example:

```js
import express from "express";
import { add } from "./math.js";
```

Practical differences:

- `require()` can be called conditionally inside normal code
- static `import` must be at the top level of a module
- `require()` returns the exported value from `module.exports`
- `import` reads named/default exports from an ES module
- `import` supports static analysis and tree-shaking better in frontend builds

Conditional CommonJS:

```js
if (process.env.DEBUG === "true") {
  const debug = require("debug")("api");
  debug("debug logging enabled");
}
```

ES module alternative:

```js
if (process.env.DEBUG === "true") {
  const { default: createDebug } = await import("debug");
  createDebug("api")("debug logging enabled");
}
```

Tradeoff:

Use static `import` for normal dependencies. Use dynamic `import()` when a
dependency should be loaded only for a specific path or environment.

## 4. What Are Named Exports And Default Exports?

A named export exposes a value by name. A default export exposes one main value
from a module.

Named exports:

```js
// math.js
export function add(a, b) {
  return a + b;
}

export function subtract(a, b) {
  return a - b;
}

// app.js
import { add, subtract } from "./math.js";
```

Default export:

```js
// logger.js
export default function logger(message) {
  console.log(message);
}

// app.js
import logger from "./logger.js";
```

When to use each:

- use named exports when a module exposes several utilities
- use default export when a module has one obvious main thing
- use named exports for easier refactoring and clearer auto-imports
- avoid mixing too many default and named exports in one file

Interview note:

> Named exports make the API explicit. Default exports are fine for a single
> main component, class, or function, but named exports are often clearer for
> utility modules.

## 5. What Is Dynamic `import()`?

Dynamic `import()` loads a module at runtime and returns a promise. It is useful
when a dependency is optional, expensive, environment-specific, or needed only
after a user action.

Example:

```js
async function exportReport(data) {
  const { stringify } = await import("csv-stringify/sync");
  return stringify(data, { header: true });
}
```

Why it matters:

- browser apps can split code into smaller chunks
- Node.js apps can lazily load optional packages
- CommonJS code can use dynamic `import()` to load ES modules
- startup time can improve when rare dependencies are delayed

Tradeoff:

Dynamic imports make loading asynchronous. The caller must handle the promise
and any loading failure.

## 6. What Are Module Scope And Live Bindings?

Modules have their own scope. A variable declared inside a module is not global
unless the code explicitly puts it on a global object.

Module scope:

```js
// counter.js
let count = 0;

export function increment() {
  count += 1;
  return count;
}
```

`count` is private to `counter.js`. Other files can call `increment()`, but
they cannot directly read or write `count`.

ES module imports are live bindings. If the exporting module updates an exported
binding, importers observe the updated value.

Example:

```js
// state.js
export let status = "idle";

export function setStatus(nextStatus) {
  status = nextStatus;
}

// app.js
import { status, setStatus } from "./state.js";

console.log(status);
setStatus("ready");
console.log(status);
```

Output:

```txt
idle
ready
```

Interview note:

> ES module imports are not copied values in the simple sense. They are live
> bindings to exported declarations.

## 7. How Do Browser Modules Differ From Old Script Tags?

Classic scripts share the global scope by default. ES modules have module scope
and can import dependencies explicitly.

Classic script:

```html
<script src="/utils.js"></script>
<script src="/app.js"></script>
```

`app.js` depends on `utils.js` being loaded first, often through globals.

Module script:

```html
<script type="module" src="/app.js"></script>
```

```js
// app.js
import { formatPrice } from "./utils.js";
```

Useful differences:

- module scripts are strict mode by default
- dependencies are explicit
- top-level variables do not become global properties
- browsers can load the dependency graph
- module scripts are deferred by default

Tradeoff:

Module-based code is easier to maintain, but browser module imports need valid
URLs and proper server behavior. For larger apps, a bundler or framework often
handles this.

## 8. When Should You Use Modules?

Use modules when code needs clear ownership, reuse, and dependency boundaries.

Good uses:

- shared utility functions
- API clients
- React components
- validation schemas
- service classes
- constants and configuration helpers
- feature-specific business logic

Avoid creating modules that are too tiny or abstract before there is a real
boundary. A module should make code easier to find and test.

Practical folder example:

```txt
src/
  users/
    user.controller.js
    user.service.js
    user.repository.js
  shared/
    logger.js
    errors.js
```

Strong answer:

> I use modules to make dependencies explicit and keep implementation details
> private. Good modules have a clear purpose, a small public API, and names that
> explain the boundary.

## 9. What Are Common Import And Export Mistakes?

Common mistakes include mixing module systems accidentally, importing the wrong
export shape, and depending on side effects.

Named/default mismatch:

```js
// math.js
export function add(a, b) {
  return a + b;
}

// Wrong:
import add from "./math.js";

// Right:
import { add } from "./math.js";
```

Common pitfalls:

- forgetting `.js` on relative ES module imports in Node.js
- using `require()` inside an ES module without setup
- expecting named imports from every CommonJS package
- creating circular dependencies between modules
- exporting mutable shared state without clear ownership
- relying on import order side effects

Interview note:

> When debugging module issues, I check the module system first, then the export
> shape, then the import path, then whether circular dependencies or side
> effects are involved.

## 10. CommonJS vs ES Modules: What Should You Say In An Interview?

A strong answer should separate history, syntax, runtime behavior, and practical
choice.

Good answer:

> CommonJS uses `require()` and `module.exports`; ES modules use `import` and
> `export`. CommonJS is older and still common in Node.js projects. ES modules
> are the JavaScript standard and are better for static analysis, browser
> support, and modern tooling. In new projects I usually choose ES modules, but
> I can maintain CommonJS and understand interop when older packages or tools
> require it.

What to mention next:

- named vs default exports
- static import vs dynamic `import()`
- `.cjs`, `.mjs`, and `"type": "module"` in Node.js
- package entry points such as `main` and `exports`
- CommonJS caching through `require.cache`
- interop limits between ES modules and CommonJS

The main interview trap is saying one is simply "frontend" and the other is
"backend." ES modules are standard JavaScript and work in both browsers and
Node.js. CommonJS is primarily a Node.js ecosystem module system.

## Sources Used

- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/export>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import>
- <https://nodejs.org/api/modules.html>
- <https://nodejs.org/api/esm.html>
