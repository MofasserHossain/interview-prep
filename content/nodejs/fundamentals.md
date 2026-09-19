# Node.js Backend Interview Guide

Practical Node.js interview questions covering runtime fundamentals, setup,
modules, built-in APIs, async behavior, Redis, HTTP vs WebSocket,
microservices, middleware, Docker, RabbitMQ, secure backend design, code reuse,
and MVC architecture.

## 1. What Is Node.js?

Node.js is a runtime environment that lets JavaScript run outside the browser.
Instead of using JavaScript only for browser UI behavior, Node.js lets
developers build servers, APIs, command-line tools, background workers, scripts,
and real-time applications.

In a browser, JavaScript usually interacts with the DOM:

```js
document.querySelector("button").addEventListener("click", () => {
  console.log("clicked");
});
```

In Node.js, JavaScript can interact with the operating system and server
resources:

```js
const fs = require("node:fs");

fs.writeFileSync("log.txt", "User signed in");
```

Why it matters:

- teams can use JavaScript on both frontend and backend
- Node.js is strong for I/O-heavy applications
- it has a large package ecosystem through npm
- it is common for APIs, real-time systems, tooling, and server-side rendering

Tradeoff:

Node.js is not the best default for CPU-heavy work like video encoding,
cryptocurrency mining, or large scientific computations unless that work is
moved to worker threads, native services, or separate processing systems.

Strong answer:

> Node.js is a server-side JavaScript runtime. It gives JavaScript access to
> system and networking APIs, so we can build backend services, scripts, and
> tools outside the browser.

## 2. Why Is Node.js Called A Server-Side Runtime, And What Is V8?

Node.js is called a server-side runtime because it provides the environment
needed to execute JavaScript on a server. A runtime includes the JavaScript
engine plus APIs for files, networking, processes, streams, timers, and other
server-side capabilities.

V8 is the JavaScript engine originally built for Chrome. It parses, compiles,
and executes JavaScript. Node.js embeds V8 and adds server APIs around it.

Simple mental model:

```txt
Node.js =
  V8 JavaScript engine
  + libuv event loop and async I/O
  + built-in modules like fs, http, path, os, events
  + package/module system
```

Browser JavaScript can do browser things:

```txt
DOM, localStorage, fetch, browser events
```

Node.js JavaScript can do server things:

```txt
file system, HTTP servers, TCP sockets, processes, streams
```

Interview phrasing:

> V8 executes JavaScript. Node.js uses V8 and adds server-side APIs, which is
> why JavaScript can run as backend code instead of only inside a browser.

## 3. What Is The Difference Between A Framework And A Runtime Environment?

A runtime environment executes code. A framework gives structure and reusable
building blocks for building an application.

Node.js is a runtime environment:

```txt
Runs JavaScript
Provides built-in modules
Handles async I/O
Starts processes and servers
```

Express.js is a framework:

```txt
Defines routes
Adds middleware
Handles request and response helpers
Organizes API behavior
```

Example:

```js
// Node.js runtime feature
const http = require("node:http");

// Express framework feature
app.get("/users", (req, res) => {
  res.json([{ id: 1, name: "Asha" }]);
});
```

Why it matters:

If an interviewer asks this, they want to know whether you understand the
execution layer versus the application-structure layer. Node.js can run without
Express, but Express cannot run without Node.js or a compatible runtime.

Strong answer:

> A runtime is where code executes. A framework is a set of tools and
> conventions for building applications on top of a runtime.

## 4. What Is The Difference Between Node.js And Express.js?

Node.js is the runtime. Express.js is a web framework that runs on Node.js.

With only Node.js, you can create an HTTP server:

```js
const http = require("node:http");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ message: "hello" }));
});

server.listen(3000);
```

With Express, the same API is shorter and easier to organize:

```js
const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.json({ message: "hello" });
});

app.listen(3000);
```

Express adds:

- routing helpers
- middleware pipeline
- request and response utilities
- easier JSON handling
- cleaner API organization

Tradeoff:

The built-in `http` module gives lower-level control. Express improves
productivity for normal APIs, but it adds a dependency and its own conventions.

## 5. What Is The Difference Between Client And Server?

The client is the software that sends a request. The server is the software
that receives the request, processes it, and sends a response.

Typical web flow:

```txt
Browser client -> GET /api/products -> Node.js server
Browser client <- JSON response <- Node.js server
```

Client responsibilities often include:

- rendering UI
- collecting user input
- calling APIs
- storing temporary UI state
- handling browser-side interactions

Server responsibilities often include:

- authentication and authorization
- business rules
- database access
- background jobs
- secure integration with third-party services
- returning HTML, JSON, files, or streams

Example:

```txt
Client: "Show me my orders."
Server: verifies user -> queries database -> returns only that user's orders.
```

Interview note:

> The client asks for work or data. The server owns trusted processing,
> persistence, and security-sensitive decisions.

## 6. What Are The Seven Main Features Of Node.js?

Seven commonly discussed Node.js features are:

1. JavaScript outside the browser
2. V8-powered execution
3. event-driven architecture
4. non-blocking I/O
5. single-threaded event loop for JavaScript execution
6. built-in modules for server work
7. npm ecosystem for third-party packages

Example of event-driven, non-blocking style:

```js
const fs = require("node:fs");

fs.readFile("profile.json", "utf8", (error, data) => {
  if (error) throw error;
  console.log(JSON.parse(data).name);
});

console.log("file read started");
```

The log after `readFile` can run before the file content is available because
Node.js does not block the whole process while waiting for I/O.

Why these features matter:

- APIs can handle many simultaneous I/O-bound requests efficiently
- developers can reuse JavaScript knowledge across the stack
- npm speeds up development with mature libraries
- built-in modules cover many backend basics without extra dependencies

Study path:

This guide explains the event loop at a beginner level. For detailed priority
rules such as `process.nextTick`, promise microtasks, `setTimeout(0)`,
`setImmediate`, poll, check, and close callbacks, study the dedicated
[Node.js Event Loop & Async Runtime](/topics/nodejs-event-loop-runtime) guide.

## 7. What Is Single-Threaded Programming?

Single-threaded programming means one main thread executes the application code
step by step. In Node.js, JavaScript runs primarily on a single main thread,
while the event loop coordinates asynchronous work.

Example:

```js
console.log("first");
console.log("second");
console.log("third");
```

Output:

```txt
first
second
third
```

Node.js can still handle many operations concurrently because I/O work is
delegated to the operating system or libuv. When the work completes, callbacks
or promise continuations are scheduled back onto the event loop.

Important clarification:

- JavaScript execution is single-threaded by default
- some Node.js internals use a thread pool
- CPU-heavy JavaScript can still block the event loop
- worker threads can be used when CPU work needs parallel execution

Strong answer:

> Node.js runs JavaScript on one main thread, but it can manage many concurrent
> I/O operations through the event loop and async APIs.

## 8. What Is Synchronous Programming?

Synchronous programming means each operation finishes before the next one
starts. The control flow is simple, but slow operations block everything after
them.

Example:

```js
const fs = require("node:fs");

console.log("before");
const data = fs.readFileSync("user.json", "utf8");
console.log(JSON.parse(data).name);
console.log("after");
```

Output:

```txt
before
Asha
after
```

Why it matters:

Synchronous code is easy to understand for startup scripts, small CLI tools, and
one-time setup work. In a web server, synchronous file or database-like work can
block other requests from being handled.

Tradeoff:

Use synchronous APIs only when blocking is acceptable. In request handlers,
prefer async APIs so the event loop can keep serving other clients.

## 9. What Is Multi-Threaded Programming?

Multi-threaded programming means a program uses multiple threads that can run
work in parallel. Each thread can execute instructions independently, and the
operating system schedules those threads on CPU cores.

Example use cases:

- CPU-heavy image processing
- data compression
- encryption-heavy workloads
- large calculations
- background processing that should not block request handling

Node.js is not limited to only one thread for every kind of work. It has:

- one main JavaScript thread by default
- a libuv thread pool for some filesystem, DNS, and crypto work
- `worker_threads` for running JavaScript CPU work in parallel
- `cluster` or multiple processes for using more CPU cores

Tradeoff:

Multi-threaded code can improve CPU utilization, but shared state, race
conditions, locking, and debugging become more complex.

Interview note:

> Node.js is commonly described as single-threaded because normal JavaScript
> runs on the main thread, but Node can still use background threads and worker
> threads when needed.

## 10. What Is Asynchronous Programming?

Asynchronous programming allows a task to start now and finish later without
blocking the whole program while waiting.

Promise example:

```js
const fs = require("node:fs/promises");

async function loadUser() {
  const data = await fs.readFile("user.json", "utf8");
  return JSON.parse(data);
}

loadUser().then((user) => {
  console.log(user.name);
});

console.log("request started");
```

Possible output:

```txt
request started
Asha
```

Why it matters in Node.js:

- database queries take time
- HTTP calls take time
- file reads take time
- queue and cache operations take time
- a server must keep accepting other work while waiting

Strong answer:

> Asynchronous programming lets Node.js start I/O work, continue running other
> tasks, and resume the original logic when the result is ready.

## 11. Difference Between Synchronous And Asynchronous Programming

Synchronous code blocks the current flow until the operation finishes.
Asynchronous code starts the operation and continues, then handles the result
later through a callback, promise, or `async`/`await`.

Synchronous:

```js
const data = fs.readFileSync("user.json", "utf8");
console.log(data);
console.log("done");
```

Asynchronous:

```js
fs.readFile("user.json", "utf8", (error, data) => {
  if (error) throw error;
  console.log(data);
});

console.log("done");
```

Main differences:

- synchronous code is easier to follow line by line
- asynchronous code keeps the process responsive during waits
- synchronous slow work can block other requests
- asynchronous code needs structured error handling
- `async`/`await` makes asynchronous code easier to read

Interview phrasing:

> Synchronous means wait here until finished. Asynchronous means start the work,
> let the runtime handle other tasks, and continue when the result is ready.

## 12. What Are Events In Node.js?

Events are named signals that something happened. Node.js uses an event-driven
model where objects can emit events and listeners can respond to them.

Example with `EventEmitter`:

```js
const EventEmitter = require("node:events");

const orders = new EventEmitter();

orders.on("created", (orderId) => {
  console.log(`Order created: ${orderId}`);
});

orders.emit("created", "ord_123");
```

Output:

```txt
Order created: ord_123
```

Common event examples:

- a server receives a request
- a stream has data available
- a file read finishes
- a socket closes
- a custom domain action happens, such as `order.created`

Tradeoff:

Events are useful for decoupling, but too many implicit event flows can become
hard to trace. Important business workflows should still be observable and
tested.

## 13. What Are The Main Features And Advantages Of Node.js?

Main features:

- JavaScript runtime outside the browser
- event-driven architecture
- non-blocking I/O
- strong package ecosystem through npm
- built-in modules for server tasks
- good JSON support
- good fit for APIs, real-time apps, tooling, and microservices

Advantages:

- efficient for I/O-heavy workloads
- fast development with JavaScript across frontend and backend
- easy to build REST APIs and WebSocket services
- strong ecosystem for web development
- works well with JSON-based databases and APIs
- many hosting and deployment options support it

Example use case:

```txt
Chat app:
  many users connected
  frequent small messages
  WebSocket events
  database and cache I/O
```

Node.js is a strong fit because the workload is mostly asynchronous I/O rather
than long CPU-bound calculations.

## 14. What Are The Disadvantages Of Node.js, And When Should You Use It?

Node.js has tradeoffs like any platform.

Disadvantages:

- CPU-heavy JavaScript can block the event loop
- async code needs disciplined error handling
- npm dependency quality varies
- callback-heavy legacy code can be hard to maintain
- one process does not automatically use all CPU cores
- runtime errors can happen if types and validation are weak

Use Node.js for:

- REST and GraphQL APIs
- real-time apps
- chat and collaboration
- streaming and proxy-style services
- server-side rendering
- CLI tools and automation
- microservices with I/O-heavy workloads

Avoid Node.js as the only solution for:

- heavy CPU computation on the request thread
- low-level system programming
- workloads that require strict shared-memory parallelism
- teams with no JavaScript/TypeScript experience

Strong answer:

> I use Node.js when the app is I/O-heavy and benefits from JavaScript
> productivity. I avoid blocking CPU-heavy work on the main event loop, and I
> move that work to workers, queues, or specialized services.

## 15. How Do You Set Up A Node.js Project?

A minimal Node.js project starts with a folder, a package manifest, source
files, scripts, and dependencies.

Basic setup:

```bash
mkdir node-api
cd node-api
npm init -y
npm install express
```

Create `server.js`:

```js
const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.json({ message: "Node app is running" });
});

app.listen(3000, () => {
  console.log("Server listening on port 3000");
});
```

Add a script in `package.json`:

```json
{
  "scripts": {
    "start": "node server.js"
  }
}
```

Run it:

```bash
npm start
```

Expected output:

```txt
Server listening on port 3000
```

Good project basics:

- keep source code in a clear folder structure
- use environment variables for configuration
- add linting, formatting, tests, and type checking for real projects
- commit `package.json` and lock files
- do not commit `.env` or generated secrets

## 16. What Is npm, And What Is The Role Of node_modules?

npm is the default package manager commonly used with Node.js. It helps install,
update, remove, and run packages.

Install a package:

```bash
npm install express
```

This updates:

```txt
package.json       dependency declaration
package-lock.json  exact resolved dependency tree
node_modules/      installed package files
```

`node_modules` is the local folder where installed packages are stored. When
code imports a third-party package, Node.js can resolve it from `node_modules`.

Example:

```js
const express = require("express");
```

Why it matters:

- `package.json` says what the project needs
- the lock file makes installs reproducible
- `node_modules` contains the actual installed dependency code

Tradeoff:

Do not manually edit `node_modules`. It is generated by the package manager and
can be recreated with `npm install` or `npm ci`.

## 17. What Is The Role Of package.json In Node.js?

`package.json` is the project manifest. It describes the package or
application, its scripts, dependencies, metadata, and module behavior.

Example:

```json
{
  "name": "node-api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js"
  },
  "dependencies": {
    "express": "^5.1.0"
  }
}
```

Common fields:

- `name`: project or package name
- `version`: package version
- `scripts`: commands runnable with `npm run`
- `dependencies`: packages needed at runtime
- `devDependencies`: packages needed for development
- `type`: whether `.js` files use CommonJS or ES module syntax
- `main` or `exports`: package entry points

Why it matters:

Build tools, deployment systems, package managers, and other developers use
`package.json` to understand how to install and run the project.

## 18. What Are Modules In Node.js, And How Are They Different From Functions?

A module is a file or package that exposes reusable code. A function is a
reusable block of logic inside a module or another scope.

Module example:

```js
// math.js
function add(a, b) {
  return a + b;
}

module.exports = { add };
```

Using the module:

```js
const { add } = require("./math");

console.log(add(2, 3));
```

Output:

```txt
5
```

Difference:

- a function groups executable logic
- a module groups functions, classes, constants, and state into a file boundary
- modules control what is private and what is exported
- modules help organize larger applications

Interview phrasing:

> A function is a unit of behavior. A module is a file-level unit of
> organization and reuse.

## 19. What Are The Different Ways To Export A Node.js Module?

Node.js commonly uses two module systems: CommonJS and ES modules.

CommonJS named-style export:

```js
function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

module.exports = { add, subtract };
```

CommonJS single export:

```js
module.exports = function logger(message) {
  console.log(message);
};
```

ES module named exports:

```js
export function add(a, b) {
  return a + b;
}

export function subtract(a, b) {
  return a - b;
}
```

ES module default export:

```js
export default function logger(message) {
  console.log(message);
}
```

Tradeoff:

CommonJS is common in older Node.js code. ES modules are standard JavaScript and
are common in modern projects, especially when `"type": "module"` is set.

## 20. How Do You Import Single Or Multiple Functions From A Module?

The import syntax depends on whether the project uses CommonJS or ES modules.

CommonJS import:

```js
const { add, subtract } = require("./math");

console.log(add(4, 2));
console.log(subtract(4, 2));
```

CommonJS single default-like import:

```js
const logger = require("./logger");

logger("server started");
```

ES module named import:

```js
import { add, subtract } from "./math.js";

console.log(add(4, 2));
console.log(subtract(4, 2));
```

ES module default import:

```js
import logger from "./logger.js";

logger("server started");
```

Important details:

- local file imports usually start with `./` or `../`
- package imports use the package name, such as `express`
- ES module relative imports usually include the file extension in Node.js
- named imports must match exported names

## 21. CommonJS vs ES Modules In Node.js

CommonJS and ES modules are the two main module systems you will see in Node.js.
They solve the same high-level problem, but they use different syntax and have
different loading behavior.

When interviewers say "ES6 modules", they usually mean ES modules or ESM:
JavaScript's standard `import` and `export` module system.

CommonJS:

```js
const path = require("node:path");

function buildUploadPath(fileName) {
  return path.join(process.cwd(), "uploads", fileName);
}

module.exports = { buildUploadPath };
```

ES modules:

```js
import path from "node:path";

export function buildUploadPath(fileName) {
  return path.join(process.cwd(), "uploads", fileName);
}
```

Comparison:

| Area | CommonJS | ES Modules |
| --- | --- | --- |
| Import syntax | `require()` | `import` |
| Export syntax | `module.exports` and `exports` | `export` and `export default` |
| Typical file mode | `.cjs` or `.js` in CommonJS package | `.mjs` or `.js` in `"type": "module"` package |
| Loading | synchronous `require()` | static imports and async-capable module loading |
| Tooling | common in older Node.js apps | standard JavaScript and modern tooling |

Interview note:

> CommonJS is the older Node.js module system. ES modules are the JavaScript
> standard. In new Node.js projects I usually prefer ES modules, but I still
> understand CommonJS because many existing packages and codebases use it.

## 22. When Should You Use `require` And When Should You Use `import`?

Use `import` when the project is using ES modules or modern frontend/backend
tooling. Use `require()` when maintaining CommonJS code or when a tool expects
CommonJS configuration.

Use `import` for:

- new Node.js projects configured with `"type": "module"`
- frontend code and browser modules
- TypeScript projects that compile to ESM
- codebases that benefit from static analysis and tree-shaking
- shared libraries meant for modern JavaScript tooling

Use `require()` for:

- older Node.js applications
- CommonJS config files such as some legacy build configs
- quick scripts in CommonJS packages
- packages that still document CommonJS usage first
- cases where synchronous conditional loading is useful

Example conditional CommonJS loading:

```js
if (process.env.DEBUG === "true") {
  const debug = require("debug")("api");
  debug("debug enabled");
}
```

ES module alternative:

```js
if (process.env.DEBUG === "true") {
  const { default: createDebug } = await import("debug");
  createDebug("api")("debug enabled");
}
```

Strong answer:

> I choose one module system per project and keep it consistent. For new
> projects I prefer ES modules. For older Node.js services, I work with
> CommonJS and migrate gradually only when tooling and dependencies support it.

## 23. How Do `.cjs`, `.mjs`, And `"type": "module"` Work?

Node.js needs to know whether a `.js` file should be treated as CommonJS or as
an ES module. It decides from file extensions and `package.json`.

Rules:

- `.cjs` is always CommonJS
- `.mjs` is always an ES module
- `.js` depends on the nearest `package.json`
- `"type": "module"` makes `.js` use ES module syntax
- `"type": "commonjs"` or no `type` makes `.js` use CommonJS by default

Example:

```json
{
  "type": "module"
}
```

With that package setting:

```js
// app.js
import express from "express";
```

Without that package setting, the same `.js` file would normally be CommonJS:

```js
// app.js
const express = require("express");
```

Practical guidance:

Use `.cjs` for a CommonJS file inside an ESM package. Use `.mjs` when you want a
file to be ESM regardless of the package default.

## 24. What Is The Difference Between `module.exports` And `exports`?

In CommonJS, `module.exports` is the actual value returned by `require()`.
`exports` is only a convenient reference to `module.exports` at the beginning of
the module.

This works:

```js
exports.add = function add(a, b) {
  return a + b;
};

exports.subtract = function subtract(a, b) {
  return a - b;
};
```

It is equivalent to:

```js
module.exports.add = function add(a, b) {
  return a + b;
};
```

This replaces the whole export object:

```js
module.exports = function logger(message) {
  console.log(message);
};
```

Common mistake:

```js
exports = function logger(message) {
  console.log(message);
};
```

That only reassigns the local `exports` variable. It does not replace
`module.exports`.

Interview note:

> Mutating `exports.name` is fine. Replacing the export must use
> `module.exports = value`.

## 25. Default Export vs Named Export

A named export exposes values by their exported names. A default export exposes
one main value from a module.

ES module named exports:

```js
export function createUser(input) {
  return { id: "usr_1", ...input };
}

export function deleteUser(id) {
  return { deleted: id };
}
```

Importing named exports:

```js
import { createUser, deleteUser } from "./user-service.js";
```

ES module default export:

```js
export default function logger(message) {
  console.log(message);
}
```

Importing the default export:

```js
import logger from "./logger.js";
```

When to use:

- use named exports for utility modules and services with several functions
- use default exports for one obvious primary class, function, or component
- prefer consistency inside a codebase
- avoid unclear default names in large shared modules

Strong answer:

> Named exports make module APIs explicit. Default exports are useful when the
> module has one primary thing, but named exports are usually easier to
> refactor and auto-import safely.

## 26. What Is Dynamic `import()` In Node.js?

Dynamic `import()` loads a module at runtime and returns a promise. It works in
ES modules and can also be used from CommonJS when a CommonJS file needs to load
an ES module.

Example:

```js
async function loadMarkdownParser() {
  const { marked } = await import("marked");
  return marked;
}
```

Use dynamic import for:

- optional dependencies
- large modules needed only in rare code paths
- environment-specific modules
- loading an ES module from CommonJS
- delaying work until after startup

Tradeoff:

Dynamic imports make control flow asynchronous. For normal required
dependencies, static `import` is easier to read and easier for tools to analyze.

## 27. How Does ES Module And CommonJS Interop Work?

Interop means using CommonJS and ES modules together. It is possible, but there
are rules and edge cases.

Common patterns:

- ES modules can usually import CommonJS packages
- CommonJS can load ES modules with dynamic `import()`
- default import from CommonJS often represents `module.exports`
- named imports from CommonJS are not always reliable
- `__filename` and `__dirname` do not exist automatically in ES modules

CommonJS package:

```js
// logger.cjs
module.exports = function logger(message) {
  console.log(message);
};
```

ES module importing it:

```js
import logger from "./logger.cjs";

logger("started");
```

CommonJS loading an ES module:

```js
async function main() {
  const math = await import("./math.mjs");
  console.log(math.add(2, 3));
}

main();
```

Interview note:

> Interop works, but I avoid mixing module systems casually. It is better to
> keep each package consistent and use interop only at boundaries.

## 28. How Does Node.js Resolve Modules?

Module resolution is how Node.js finds the file or package behind an import or
require call.

Common resolution categories:

- built-in modules, such as `node:fs`
- relative files, such as `./user-service.js`
- absolute paths
- packages installed in `node_modules`
- package entry points defined by `main` or `exports`

Examples:

```js
const fs = require("node:fs");
const express = require("express");
const userService = require("./user-service");
```

For packages, `package.json` can define entry points:

```json
{
  "main": "./dist/index.cjs",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    },
    "./logger": "./dist/logger.js"
  }
}
```

`main` is the older single entry point. `exports` is the modern package entry
map and can restrict which internal files consumers are allowed to import.

Tradeoff:

`exports` makes package APIs clearer, but it can break consumers that import
private internal files such as `some-package/lib/internal.js`.

## 29. What Is Module Caching In Node.js?

In CommonJS, Node.js caches a module after it is loaded the first time. Later
`require()` calls usually return the same exported object instead of executing
the file again.

Example:

```js
// counter.js
let count = 0;

count += 1;

module.exports = { count };
```

```js
const first = require("./counter");
const second = require("./counter");

console.log(first.count);
console.log(second.count);
console.log(first === second);
```

Output:

```txt
1
1
true
```

Why it matters:

- modules can behave like singletons
- repeated imports are faster after first load
- shared mutable module state can leak across callers
- tests may need to clear module cache carefully

Node exposes the cache through `require.cache`:

```js
delete require.cache[require.resolve("./counter")];
```

Tradeoff:

Do not use module cache as a hidden application database. It is useful for
loading efficiency and process-local singletons, but it is not shared across
multiple processes, containers, or servers.

## 30. What Is The Module Wrapper Function?

In CommonJS, Node.js wraps each module in a function before executing it. That
wrapper provides module-specific variables such as `exports`, `require`,
`module`, `__filename`, and `__dirname`.

Conceptual wrapper:

```js
(function (exports, require, module, __filename, __dirname) {
  // Your module code runs here.
});
```

Example:

```js
console.log(__filename);
console.log(__dirname);
```

Why it matters:

- variables declared in one module do not automatically become global
- each file gets its own module scope
- `require` and `module.exports` are available without global imports
- Node.js can control how CommonJS modules load and export values

Interview phrasing:

> The module wrapper is why CommonJS files have private scope and access to
> `require`, `module`, `exports`, `__filename`, and `__dirname`.

## 31. What Are The Types Of Modules In Node.js?

Node.js modules can be described in a few practical ways.

By source:

- built-in modules, such as `node:fs`, `node:path`, `node:http`
- local modules, such as `./services/user-service.js`
- third-party modules installed from npm, such as `express`

By module system:

- CommonJS modules using `require` and `module.exports`
- ES modules using `import` and `export`

By file type:

- JavaScript modules
- JSON modules
- native add-ons compiled from lower-level languages

Example:

```js
const path = require("node:path"); // built-in module
const express = require("express"); // third-party module
const { createUser } = require("./user-service"); // local module
```

Strong answer:

> In interviews, I usually classify Node modules as built-in, local, and
> third-party. Then I mention CommonJS and ES modules as the two main syntax
> systems.

## 32. What Are The Top Five Frequently Used Built-In Modules In Node.js?

Five commonly used built-in modules are:

- `node:fs` for file system operations
- `node:path` for safe path construction and parsing
- `node:http` for creating HTTP servers and clients
- `node:events` for event-driven behavior
- `node:os` for operating system information

Example:

```js
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const EventEmitter = require("node:events");
const os = require("node:os");
```

Why built-in modules matter:

- they are available without installing packages
- they expose core server-side capabilities
- many third-party frameworks are built on top of them
- they help explain what Node.js adds beyond the JavaScript language

Other common built-ins include `node:crypto`, `node:stream`, `node:url`,
`node:process`, and `node:child_process`.

## 33. What Is The Role Of The fs Module?

The `fs` module provides file system APIs. It can read, write, append, delete,
rename, and inspect files and directories.

Promise-based example:

```js
const fs = require("node:fs/promises");

async function saveProfile(profile) {
  await fs.writeFile("profile.json", JSON.stringify(profile, null, 2));
  const saved = await fs.readFile("profile.json", "utf8");

  return JSON.parse(saved);
}
```

Common `fs` functions:

- `readFile`
- `writeFile`
- `appendFile`
- `unlink`
- `rename`
- `mkdir`
- `readdir`
- `stat`
- `watch`

Tradeoff:

Prefer promise-based or callback-based async APIs in servers. Synchronous file
APIs are fine for startup configuration or scripts, but they can block request
handling when used inside hot paths.

## 34. What Is The Role Of The path Module?

The `path` module helps build, parse, normalize, and inspect file paths in a
cross-platform way.

Example:

```js
const path = require("node:path");

const uploadPath = path.join(__dirname, "uploads", "avatar.png");

console.log(path.extname(uploadPath));
console.log(path.basename(uploadPath));
```

Output:

```txt
.png
avatar.png
```

Common `path` functions:

- `join`
- `resolve`
- `basename`
- `dirname`
- `extname`
- `parse`
- `format`
- `normalize`
- `relative`

Why it matters:

String concatenation can create broken paths across operating systems. `path`
handles separators and normalization more safely.

## 35. What Is The Role Of The os Module?

The `os` module provides information about the operating system where the Node.js
process is running.

Example:

```js
const os = require("node:os");

console.log(os.platform());
console.log(os.arch());
console.log(os.cpus().length);
console.log(os.freemem());
```

Common `os` functions:

- `platform`
- `arch`
- `cpus`
- `totalmem`
- `freemem`
- `homedir`
- `tmpdir`
- `hostname`
- `uptime`

Use cases:

- logging runtime diagnostics
- choosing temporary directories
- reporting system health
- deciding default worker counts

Tradeoff:

Do not build business logic that depends too heavily on one local machine's
state. Production systems often run inside containers where CPU and memory views
may need careful interpretation.

## 36. What Is The Role Of The events Module, And How Do You Handle Events?

The `events` module provides the `EventEmitter` class. It lets code register
listeners for named events and emit those events later.

Example:

```js
const EventEmitter = require("node:events");

class PaymentEvents extends EventEmitter {}

const payments = new PaymentEvents();

payments.on("paid", (paymentId, amount) => {
  console.log(`Payment ${paymentId} completed for ${amount}`);
});

payments.emit("paid", "pay_123", 500);
```

Common methods:

- `on` to register a listener
- `once` to register a listener that runs only one time
- `emit` to trigger an event
- `off` or `removeListener` to remove a listener
- `listenerCount` to inspect listeners

Important rule:

Handle the `error` event when using event emitters that can fail. An unhandled
`error` event can crash the process.

## 37. What Are Event Arguments?

Event arguments are values passed from the emitter to the event listener when an
event is emitted.

Example:

```js
const EventEmitter = require("node:events");

const users = new EventEmitter();

users.on("registered", (userId, email, source) => {
  console.log(userId, email, source);
});

users.emit("registered", "usr_1", "asha@example.com", "landing-page");
```

Output:

```txt
usr_1 asha@example.com landing-page
```

Why it matters:

Arguments carry the context needed by listeners. A listener should receive
enough information to act, but not so much that the event becomes a hidden
function call with unclear contracts.

Good practice:

For larger events, pass one object instead of many positional arguments:

```js
users.emit("registered", {
  id: "usr_1",
  email: "asha@example.com",
  source: "landing-page",
});
```

## 38. What Is The Difference Between A Function And An Event?

A function is called directly to perform work. An event is emitted to announce
that something happened, and one or more listeners may react.

Function call:

```js
sendEmail("asha@example.com");
```

Event flow:

```js
users.emit("registered", { email: "asha@example.com" });
```

Main differences:

- a function call is direct
- an event is indirect
- a function usually has one known implementation
- an event can have zero, one, or many listeners
- function control flow is easier to trace
- events help decouple producers from consumers

Example:

```txt
User service emits "registered"
  -> Email listener sends welcome email
  -> Analytics listener tracks signup
  -> CRM listener syncs contact
```

Tradeoff:

Events are useful when multiple parts of the system should react independently.
For critical sequential business rules, direct function calls or explicit
workflow orchestration can be easier to reason about.

## 39. What Is The Role Of The http Module In Node.js?

The `http` module provides low-level APIs for creating HTTP servers and making
HTTP requests. Frameworks like Express build on top of Node's HTTP primitives.

Basic server:

```js
const http = require("node:http");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Hello from Node.js");
});

server.listen(3000);
```

Use cases:

- understanding how Node.js handles HTTP
- creating small servers without a framework
- building framework internals
- handling lower-level request and response behavior

Tradeoff:

For production APIs, most teams use a framework such as Express, Fastify, or
NestJS because routing, middleware, validation, and error handling are easier to
organize.

## 40. What Is The Role Of createServer() In The http Module?

`createServer()` creates an HTTP server instance. It accepts a request listener
function that runs whenever the server receives a request.

Example:

```js
const http = require("node:http");

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ message: "Not found" }));
});

server.listen(3000, () => {
  console.log("Server listening on port 3000");
});
```

Request flow:

```txt
Client request
  -> server created by createServer()
  -> request listener receives req and res
  -> handler writes status, headers, and body
```

Important details:

- `req` contains request data such as method, URL, headers, and body stream
- `res` is used to write status, headers, and response body
- `server.listen()` starts accepting connections
- Express-style frameworks hide much of this low-level handling

## 41. Difference Between Callback And Promise

A callback is a function passed into another function and called later when work
finishes. A promise is an object that represents a future success or failure.

Callbacks are the older Node.js style:

```js
const fs = require("node:fs");

fs.readFile("user.json", "utf8", (error, data) => {
  if (error) {
    console.error("failed", error.message);
    return;
  }

  console.log(JSON.parse(data).name);
});
```

Promises make the async result composable:

```js
const fs = require("node:fs/promises");

fs.readFile("user.json", "utf8")
  .then((data) => JSON.parse(data))
  .then((user) => console.log(user.name))
  .catch((error) => console.error("failed", error.message));
```

Expected output:

```txt
Asha
```

Main differences:

- callbacks pass success or error into a function
- promises return a value that can be chained
- promises centralize error handling with `.catch()`
- promises work naturally with `async` and `await`
- promises are easier to combine with `Promise.all`, `Promise.race`, and queues

Strong answer:

> A callback is a function called after an async task finishes. A promise is a
> first-class object for an async result. In modern Node.js I prefer promises
> and async/await because they compose better and make error handling cleaner.

## 42. What Issues Can Callback-Based Code Create?

Callbacks are not bad by themselves. The issue starts when many dependent async
steps are nested inside each other.

Bad callback nesting:

```js
getUser(userId, (userError, user) => {
  if (userError) return handleError(userError);

  getOrders(user.id, (ordersError, orders) => {
    if (ordersError) return handleError(ordersError);

    chargeCard(user.cardId, orders.total, (paymentError, payment) => {
      if (paymentError) return handleError(paymentError);

      sendReceipt(user.email, payment.id, (emailError) => {
        if (emailError) return handleError(emailError);

        console.log("order completed");
      });
    });
  });
});
```

Problems:

- callback hell makes code hard to read
- repeated error checks create noise
- returning from the wrong callback can cause bugs
- sequential and parallel work are harder to express
- tests need more manual setup

Better with `async` and `await`:

```js
async function completeOrder(userId) {
  const user = await getUser(userId);
  const orders = await getOrders(user.id);
  const payment = await chargeCard(user.cardId, orders.total);

  await sendReceipt(user.email, payment.id);

  return "order completed";
}
```

Expected output:

```txt
order completed
```

Interview note:

> The real issue is not callbacks themselves. The issue is deeply nested control
> flow, scattered error handling, and poor composability. Promises and
> async/await reduce those problems.

## 43. Is Async/Await Synchronous Or Asynchronous?

`async` and `await` are asynchronous, but they make the code look synchronous.
`await` pauses only the current async function. It does not block the Node.js
event loop.

Example:

```js
async function loadUser() {
  console.log("2. before await");

  const user = await Promise.resolve({ name: "Asha" });

  console.log("4. user:", user.name);
}

console.log("1. start");
loadUser();
console.log("3. after call");
```

Output:

```txt
1. start
2. before await
3. after call
4. user: Asha
```

Why this happens:

- the function starts synchronously
- when it reaches `await`, it yields control
- the caller continues running
- the async function resumes later when the promise settles

Common trap:

```js
items.forEach(async (item) => {
  await saveItem(item);
});

console.log("done");
```

`done` prints before all saves finish because `forEach` does not wait for async
callbacks.

Better:

```js
for (const item of items) {
  await saveItem(item);
}
```

Or for parallel work:

```js
await Promise.all(items.map((item) => saveItem(item)));
```

Strong answer:

> Async/await is asynchronous. It gives synchronous-looking control flow, but it
> does not block the process. Only that async function pauses at `await`.

## 44. How Do You Handle Errors In Node.js?

Node.js error handling depends on the async style being used. Callback-based
APIs usually use the error-first callback pattern. Promise-based APIs use
`.catch()` or `try/catch` with `await`.

Error-first callback:

```js
const fs = require("node:fs");

fs.readFile("user.json", "utf8", (error, data) => {
  if (error) {
    console.error("read failed", error.message);
    return;
  }

  console.log(JSON.parse(data));
});
```

The first callback argument is reserved for an error. If it is `null` or
`undefined`, the operation succeeded.

Promise `.catch()`:

```js
const fs = require("node:fs/promises");

fs.readFile("user.json", "utf8")
  .then((data) => JSON.parse(data))
  .catch((error) => {
    console.error("read failed", error.message);
  });
```

`async` and `await` with `try/catch`:

```js
async function loadUser() {
  try {
    const data = await fs.readFile("user.json", "utf8");
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`Could not load user: ${error.message}`);
  }
}
```

Express-style route handling:

```js
app.get("/users/:id", async (req, res, next) => {
  try {
    const user = await userService.findById(req.params.id);
    res.json(user);
  } catch (error) {
    next(error);
  }
});
```

Process-level events:

```js
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ error }, "Uncaught exception");
  process.exit(1);
});
```

Important rules:

- handle expected operational errors close to the request or job
- use central middleware for HTTP error responses
- never expose stack traces or secrets to clients
- unhandled promise rejections should be treated as serious bugs
- after `uncaughtException`, prefer graceful shutdown and process restart
- use monitoring so production errors are visible

Interview note:

> For callbacks I check the first `error` argument. For promises I use
> `.catch()` or `try/catch` with `await`. At the process level,
> `unhandledRejection` and `uncaughtException` are last-resort safety nets, not
> normal business error handling.

## 45. Why Do We Use Redis?

Redis is an in-memory data store commonly used in backend systems for fast
reads, caching, sessions, rate limiting, queues, pub/sub, and temporary data.

Example cache-aside flow:

```js
async function getUserProfile(userId) {
  const cacheKey = `user:${userId}:profile`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  const profile = await db.user.findUnique({ where: { id: userId } });
  await redis.set(cacheKey, JSON.stringify(profile), "EX", 300);

  return profile;
}
```

Flow:

```txt
First request:
  Redis miss -> database query -> save to Redis -> return data

Next request:
  Redis hit -> return data quickly
```

Use Redis for:

- frequently read data
- session storage across multiple app servers
- distributed rate limiting
- short-lived tokens or OTPs
- job queues with tools like BullMQ
- pub/sub fan-out for WebSocket servers

Tradeoffs:

- cached data can become stale
- invalidation needs discipline
- memory is limited
- Redis should not replace the primary database for relational business data

Strong answer:

> We use Redis when we need very fast access to temporary or frequently used
> data. In a Node.js backend I commonly use it for caching, sessions,
> distributed rate limiting, queue state, and pub/sub.

## 46. Difference Between HTTP And WebSocket

HTTP is request-response. The client sends a request and the server returns a
response. WebSocket creates a persistent bidirectional connection so both client
and server can send messages at any time.

HTTP example:

```txt
Client -> GET /notifications
Server -> [{ "text": "New message" }]
```

The client must ask again to get new data.

WebSocket example:

```txt
Client -> connect once
Server -> push "new message"
Server -> push "typing"
Client -> send "read receipt"
```

Express HTTP route:

```js
app.get("/api/notifications", async (req, res) => {
  const notifications = await listNotifications(req.user.id);
  res.json(notifications);
});
```

Socket-style event:

```js
io.on("connection", (socket) => {
  socket.on("join-room", (roomId) => {
    socket.join(roomId);
  });
});

io.to(roomId).emit("message-created", message);
```

Use HTTP for:

- CRUD APIs
- authentication
- normal request-response workflows
- cacheable resources

Use WebSocket for:

- chat
- live dashboards
- multiplayer interactions
- collaboration
- live notifications

Tradeoffs:

- WebSocket needs connection state
- scaling WebSocket usually needs Redis pub/sub or another broker
- HTTP is simpler to cache, debug, and operate

## 47. What Is Microservice And Why Do We Need It?

A microservice is a small, independently deployable service focused on one
business capability. Instead of one application containing everything, the
system is split into services such as users, orders, payments, notifications,
and inventory.

Example:

```txt
Client
  -> API Gateway
      -> User Service
      -> Order Service
      -> Payment Service
      -> Notification Service
```

Why teams use microservices:

- independent deployments
- independent scaling
- clearer team ownership
- fault isolation
- different services can use different storage or technology when justified

Example:

```txt
Order traffic is high.
Scale Order Service to 10 instances.
Keep User Service at 2 instances.
```

But microservices are not always better:

- network calls can fail
- debugging is harder
- data consistency becomes distributed
- observability is required
- deployment and infrastructure complexity increase

Strong answer:

> Microservices are useful when business domains and team boundaries are clear.
> I would not start every product with microservices. I usually prefer a modular
> monolith first, then extract services when scaling, ownership, or deployment
> independence becomes a real problem.

## 48. What Is Middleware?

Middleware is code that runs between the incoming request and the final route
handler. It can inspect, modify, allow, reject, or log the request.

Express example:

```js
function requireAuth(req, res, next) {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ message: "Missing token" });
  }

  req.user = verifyToken(token);
  next();
}

app.get("/api/profile", requireAuth, (req, res) => {
  res.json({ userId: req.user.id });
});
```

Request flow:

```txt
Request
  -> logging middleware
  -> auth middleware
  -> validation middleware
  -> controller
  -> response
```

Common middleware:

- authentication
- authorization
- input validation
- rate limiting
- CORS
- request logging
- error handling

Important rule:

```js
next();
```

Call `next()` when the request should continue. Return a response when the
middleware should stop the request.

Strong answer:

> Middleware is reusable request pipeline logic. I keep cross-cutting concerns
> like auth, validation, logging, and error handling in middleware so
> controllers stay focused on business logic.

## 49. How Do You Work With Docker In A Node.js Backend?

Docker packages the Node.js app, dependencies, runtime, and startup command into
an image so the app runs consistently on any machine or server.

Example Dockerfile:

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
```

Build and run:

```bash
docker build -t node-api .
docker run --rm -p 3000:3000 --env-file .env node-api
```

Expected result:

```txt
Server listening on port 3000
```

Good practices:

- use `.dockerignore`
- do not copy `.env` into the image
- keep secrets in environment variables or a secret manager
- run production installs with `npm ci --omit=dev`
- use small base images when appropriate
- add health checks in orchestration
- use multi-stage builds for TypeScript or build-heavy apps

Interview phrasing:

> I use Docker to make the runtime predictable across local, CI, staging, and
> production. For Node.js I keep the image small, install dependencies
> reproducibly, avoid baking secrets into the image, and pass configuration
> through the environment.

## 50. How Do You Work With RabbitMQ?

RabbitMQ is a message broker. A Node.js API can publish a message to RabbitMQ,
and a worker can consume it later. This helps with background work, retries, and
decoupling services.

Use cases:

- send emails after signup
- process images or videos
- generate reports
- sync data between services
- retry failed third-party calls

Producer:

```js
import amqp from "amqplib";

const connection = await amqp.connect(process.env.RABBITMQ_URL);
const channel = await connection.createChannel();
const queue = "send-email";

await channel.assertQueue(queue, { durable: true });

channel.sendToQueue(
  queue,
  Buffer.from(JSON.stringify({ to: "user@example.com", template: "welcome" })),
  { persistent: true },
);
```

Consumer:

```js
import amqp from "amqplib";

const connection = await amqp.connect(process.env.RABBITMQ_URL);
const channel = await connection.createChannel();
const queue = "send-email";

await channel.assertQueue(queue, { durable: true });

channel.consume(queue, async (message) => {
  if (!message) return;

  const job = JSON.parse(message.content.toString());
  await sendEmail(job);

  channel.ack(message);
});
```

Flow:

```txt
API request returns quickly
  -> RabbitMQ stores job
  -> worker consumes job
  -> worker sends email
  -> worker acknowledges message
```

Important concepts:

- acknowledgements prevent losing messages
- durable queues and persistent messages help survive broker restarts
- dead-letter queues store failed jobs
- idempotent consumers avoid duplicate side effects
- prefetch controls worker load

RabbitMQ vs Kafka:

- RabbitMQ is often used for work queues and routing jobs
- Kafka is often used for event streaming and replayable event logs

## 51. What Is Your Approach To Create A Secure Backend Application?

Secure backend design starts at the request boundary and continues through code,
data, infrastructure, and monitoring.

Practical checklist:

- validate every input: body, params, query, headers, files
- authenticate users with secure sessions or tokens
- authorize every protected action
- hash passwords with bcrypt, scrypt, or Argon2
- use HTTPS in production
- use secure, HTTP-only cookies when using cookies
- protect against SQL injection with parameterized queries or ORM APIs
- apply rate limiting to login, OTP, password reset, and public APIs
- avoid leaking stack traces or secrets in responses
- store secrets outside source code
- configure CORS intentionally
- log security-relevant events
- keep dependencies updated and audit them

Example validation middleware:

```js
function validateCreateUser(req, res, next) {
  const { email, password } = req.body;

  if (!email || !password || password.length < 12) {
    return res.status(422).json({ message: "Invalid input" });
  }

  next();
}
```

Example safe SQL:

```js
await db.query("SELECT * FROM users WHERE email = ?", [email]);
```

Bad SQL:

```js
await db.query(`SELECT * FROM users WHERE email = '${email}'`);
```

Strong answer:

> I secure a backend in layers: input validation, authentication,
> authorization, safe database access, rate limiting, secure secrets,
> dependency hygiene, logging, and safe error responses. I do not rely on only
> one control.

## 52. How Do You Improve Code Reusability In A Backend?

Code reusability means shared logic is extracted into clear modules without
making everything too generic.

Good reusable layers:

```txt
routes       HTTP mapping
controllers  request/response handling
services     business logic
repositories database access
utils        small pure helpers
middleware   request pipeline logic
```

Example:

```js
export async function createUser(input) {
  const normalizedEmail = normalizeEmail(input.email);

  if (await userRepository.existsByEmail(normalizedEmail)) {
    throw new ConflictError("Email already exists");
  }

  return userRepository.create({
    email: normalizedEmail,
    passwordHash: await hashPassword(input.password),
  });
}
```

The service can be reused by:

```txt
POST /users controller
admin user creation workflow
test setup helper
CLI import script
```

Good practices:

- keep business logic out of route handlers
- create small services with clear inputs and outputs
- reuse middleware for cross-cutting concerns
- avoid copy-pasting validation schemas
- keep utilities pure when possible
- avoid over-abstracting before duplication is real

Tradeoff:

Too much abstraction can make code harder to understand. Reuse should remove
real duplication or protect important business rules.

## 53. What Is MVC Architecture?

MVC stands for Model, View, Controller. In backend APIs, the "view" is often the
JSON response instead of an HTML page.

Responsibilities:

```txt
Model:
  database schema, entities, persistence rules

Controller:
  receives request, calls service/model, returns response

View:
  response format, such as JSON or rendered HTML
```

Express-style MVC structure:

```txt
src/
  models/user.model.js
  controllers/user.controller.js
  services/user.service.js
  routes/user.routes.js
```

Controller:

```js
export async function createUserController(req, res, next) {
  try {
    const user = await userService.createUser(req.body);
    res.status(201).json({ id: user.id, email: user.email });
  } catch (error) {
    next(error);
  }
}
```

Route:

```js
router.post("/users", validateCreateUser, createUserController);
```

Flow:

```txt
Request
  -> Route
  -> Controller
  -> Service
  -> Model/Repository
  -> JSON response
```

Strong answer:

> MVC separates responsibilities. The controller handles HTTP, the model handles
> data, and the view represents the output. In Node.js APIs I usually combine
> MVC with a service layer so controllers stay thin and business logic remains
> reusable and testable.

## Sources Used

- <https://nodejs.org/en/learn/getting-started/introduction-to-nodejs>
- <https://nodejs.org/api/modules.html>
- <https://nodejs.org/api/esm.html>
- <https://nodejs.org/api/packages.html>
- <https://nodejs.org/api/process.html>
- <https://nodejs.org/api/errors.html>
- <https://nodejs.org/api/fs.html>
- <https://nodejs.org/api/path.html>
- <https://nodejs.org/api/os.html>
- <https://nodejs.org/api/events.html>
- <https://nodejs.org/api/http.html>
- <https://docs.npmjs.com/about-npm>
- <https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick>
- <https://expressjs.com/en/guide/using-middleware/>
- <https://redis.io/docs/latest/develop/>
- <https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API>
- <https://docs.docker.com/guides/nodejs/>
- <https://www.rabbitmq.com/tutorials/tutorial-two-javascript>
- <https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html>
