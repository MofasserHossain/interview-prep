# Node.js Event Loop & Async Runtime Interview Guide

Node.js-specific interview questions covering the event loop, non-blocking I/O,
callbacks, promises, microtasks, timers, events, CPU-heavy work, streams, and
runtime troubleshooting.

## 1. What Is The Node.js Event Loop?

The Node.js event loop is the runtime mechanism that lets Node.js run
JavaScript, schedule asynchronous callbacks, and continue handling other work
while I/O operations are waiting.

Simple flow:

```txt
JavaScript call stack
  -> starts async I/O
  -> event loop keeps process alive
  -> I/O completes
  -> callback or promise continuation runs later
```

Example:

```js
const fs = require("node:fs");

console.log("start");

fs.readFile("profile.json", "utf8", () => {
  console.log("file loaded");
});

console.log("end");
```

Possible output:

```txt
start
end
file loaded
```

Why it matters:

- Node.js can handle many I/O-bound requests efficiently
- slow file, network, or database operations do not have to block the process
- blocking JavaScript still blocks the event loop

Strong answer:

> The event loop coordinates asynchronous work in Node.js. JavaScript runs on
> the main thread, while I/O can complete later and schedule callbacks back onto
> the loop.

## 2. Why Can Node.js Handle Many Requests If JavaScript Is Single-Threaded?

Node.js runs normal JavaScript on one main thread, but many I/O operations are
handled by the operating system or libuv. The main thread does not wait
directly for each socket, file, or timer to finish.

Example server:

```js
const http = require("node:http");

http
  .createServer((req, res) => {
    res.end("ok");
  })
  .listen(3000);
```

Multiple clients can connect because the event loop receives request events and
runs the request handler when each event is ready.

Important clarification:

- JavaScript execution is single-threaded by default
- async I/O can be concurrent
- some Node.js internals use a thread pool
- CPU-heavy JavaScript can still block every request in that process

Interview phrasing:

> Node.js is single-threaded for JavaScript execution, but not single-tasked.
> It can keep many I/O operations in progress and resume the JavaScript handlers
> when results are ready.

## 3. What Are The Main Event Loop Phases?

The Node.js event loop runs work in phases. You do not need to memorize every
internal detail for most interviews, but you should understand the common
queues.

Common phases:

- timers: callbacks from `setTimeout` and `setInterval`
- pending callbacks: some system-level callbacks
- poll: retrieves new I/O events
- check: callbacks from `setImmediate`
- close callbacks: cleanup events like socket close

Microtasks are also important:

- promise callbacks run in the microtask queue
- `queueMicrotask` schedules microtask work
- `process.nextTick` runs before normal promise microtasks in Node.js

Example:

```js
setTimeout(() => console.log("timeout"), 0);
setImmediate(() => console.log("immediate"));
Promise.resolve().then(() => console.log("promise"));
process.nextTick(() => console.log("nextTick"));

console.log("sync");
```

Typical output:

```txt
sync
nextTick
promise
timeout
immediate
```

Tradeoff:

Do not overuse `process.nextTick`. Too much next-tick work can starve normal
I/O callbacks.

## 4. What Is Non-Blocking I/O In Node.js?

Non-blocking I/O means Node.js starts an operation and continues running other
JavaScript instead of waiting until the operation finishes.

Blocking file read:

```js
const fs = require("node:fs");

const data = fs.readFileSync("user.json", "utf8");
console.log(data);
```

Non-blocking file read:

```js
const fs = require("node:fs/promises");

async function loadUser() {
  const data = await fs.readFile("user.json", "utf8");
  return JSON.parse(data);
}
```

Why it matters:

- blocking code pauses the event loop
- non-blocking code lets other requests continue
- APIs, databases, queues, and caches are usually I/O-heavy

Strong answer:

> Non-blocking I/O is one of the main reasons Node.js works well for APIs. The
> process can keep serving other requests while a file, network, database, or
> cache operation is waiting.

## 5. What Is The Difference Between Callback, Promise, And async/await?

Callbacks, promises, and `async`/`await` are different ways to handle work that
finishes later.

Callback:

```js
fs.readFile("user.json", "utf8", (error, data) => {
  if (error) throw error;
  console.log(JSON.parse(data));
});
```

Promise:

```js
fs.promises
  .readFile("user.json", "utf8")
  .then((data) => JSON.parse(data))
  .then((user) => console.log(user));
```

async/await:

```js
const data = await fs.promises.readFile("user.json", "utf8");
const user = JSON.parse(data);
```

Main differences:

- callbacks pass a function to run later
- promises represent a future value or failure
- `async`/`await` gives promises synchronous-looking control flow
- error handling is usually cleaner with `try/catch` around `await`

Interview note:

> In modern Node.js, I prefer promise-based APIs with async/await for most
> application code because the control flow and error handling are easier to
> read.

## 6. How Do Timers, setImmediate, And Microtasks Differ?

Timers, immediates, and microtasks schedule work at different points in the
runtime.

Common scheduling tools:

- `setTimeout(fn, delay)` runs after at least the delay has passed
- `setInterval(fn, delay)` runs repeatedly
- `setImmediate(fn)` runs in the check phase after polling
- `Promise.resolve().then(fn)` schedules a promise microtask
- `queueMicrotask(fn)` schedules a microtask explicitly
- `process.nextTick(fn)` schedules work before other microtasks in Node.js

Example:

```js
console.log("A");

setTimeout(() => console.log("B"), 0);
Promise.resolve().then(() => console.log("C"));

console.log("D");
```

Output:

```txt
A
D
C
B
```

Why:

Synchronous code runs first. Microtasks run after the current call stack. Timer
callbacks run later in the timers phase.

## 7. What Are Events And EventEmitter In Node.js?

Events are named signals that something happened. The `events` module provides
`EventEmitter`, which lets code subscribe to and emit events.

Example:

```js
const EventEmitter = require("node:events");

const bus = new EventEmitter();

bus.on("order.created", (orderId) => {
  console.log(`Order created: ${orderId}`);
});

bus.emit("order.created", "ord_123");
```

Output:

```txt
Order created: ord_123
```

Use events for:

- streams
- sockets
- custom domain notifications
- decoupled reactions to a completed action

Tradeoff:

Events can make code decoupled, but they can also hide control flow. For
important business processes, keep event contracts clear and test the listeners.

## 8. What Can Block The Event Loop?

Any long-running synchronous JavaScript can block the event loop.

Common blockers:

- large JSON parsing or serialization
- expensive loops
- synchronous file operations
- CPU-heavy encryption or compression on the main thread
- complex regular expressions with catastrophic backtracking
- image/video processing inside the request handler

Bad example:

```js
app.get("/report", (req, res) => {
  const report = buildHugeReportSynchronously();
  res.json(report);
});
```

Why it is bad:

While `buildHugeReportSynchronously` runs, the same Node.js process cannot
handle other JavaScript callbacks.

Better:

- stream the result
- move CPU work to a worker thread
- use a background queue
- precompute expensive data
- split work into smaller chunks

## 9. How Do You Handle CPU-Heavy Work In Node.js?

Do not run CPU-heavy work on the request path of the main event loop unless it
is very small.

Better options:

- use `worker_threads` for CPU-heavy JavaScript
- use a job queue and separate worker process
- use `cluster` or multiple app processes for CPU cores
- move specialized work to another service
- cache or precompute expensive results

Worker-thread shape:

```js
const { Worker } = require("node:worker_threads");

const worker = new Worker("./calculate-report.js", {
  workerData: { userId: "usr_1" },
});

worker.on("message", (result) => {
  console.log(result);
});
```

Tradeoff:

Workers add coordination overhead. Use them for real CPU pressure, not for
normal database or HTTP I/O.

## 10. What Are Streams In Node.js?

Streams process data in chunks instead of loading everything into memory at
once.

Example:

```js
const fs = require("node:fs");
const http = require("node:http");

http
  .createServer((req, res) => {
    fs.createReadStream("large-video.mp4").pipe(res);
  })
  .listen(3000);
```

Why streams matter:

- lower memory usage for large files
- data can start flowing before the whole file is loaded
- streams fit network, file, compression, and upload workflows
- backpressure helps avoid overwhelming slow consumers

Interview phrasing:

> Streams are useful when data is too large or continuous to handle as one
> complete value. They let Node.js process data incrementally.

## 11. How Do You Debug Event Loop Delay?

Event loop delay means the loop is busy and callbacks run later than expected.

Symptoms:

- requests become slow even when the database is fine
- timers fire late
- CPU is high in one Node.js process
- health checks occasionally time out

Debugging tools and techniques:

- check CPU usage and memory
- profile the process with Node.js inspector
- measure event loop delay with `perf_hooks`
- log slow request handlers
- inspect large synchronous loops or JSON work
- review expensive regex and synchronous filesystem calls

Example:

```js
const { monitorEventLoopDelay } = require("node:perf_hooks");

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

setInterval(() => {
  console.log(Math.round(histogram.mean / 1e6), "ms average delay");
  histogram.reset();
}, 5000);
```

Strong answer:

> I treat event loop delay as a production performance signal. If it rises, I
> look for blocking JavaScript, CPU-heavy handlers, huge JSON work, or sync APIs
> running in hot paths.

## 12. When Should You Use Node.js For Runtime-Heavy Work?

Node.js is strongest when the runtime-heavy part is I/O orchestration rather
than raw CPU computation.

Good fits:

- API gateways
- REST and GraphQL APIs
- WebSocket servers
- file upload and streaming services
- CLI tools
- background workers that mostly call external systems

Needs caution:

- CPU-heavy report generation
- video or image processing
- huge in-memory data transformations
- encryption-heavy work on the request thread

Strong answer:

> I use Node.js when the workload is mostly I/O and event-driven coordination.
> For CPU-heavy work, I move the expensive part to worker threads, a queue, or a
> specialized service so the event loop stays responsive.

## 13. What Is The Node.js Priority Order?

For most Node.js interview questions, use this practical order:

1. run the current synchronous JavaScript
2. drain `process.nextTick` callbacks
3. drain promise microtasks and `queueMicrotask`
4. continue through event loop phases
5. after each phase callback, drain microtasks again

Common event loop phase order:

| Phase or queue | Examples | Priority idea |
| --- | --- | --- |
| Call stack | current script, current function | first |
| next tick queue | `process.nextTick` | before normal promise microtasks |
| Promise microtasks | `.then`, `.catch`, `.finally`, `queueMicrotask` | before libuv phases continue |
| Timers | `setTimeout`, `setInterval` | timer callbacks whose threshold has passed |
| Poll | I/O callbacks, incoming connections, file/network readiness | main I/O phase |
| Check | `setImmediate` | after poll |
| Close callbacks | socket close cleanup | cleanup phase |

Example:

```js
setTimeout(() => console.log("timeout"), 0);
setImmediate(() => console.log("immediate"));
Promise.resolve().then(() => console.log("promise"));
queueMicrotask(() => console.log("microtask"));
process.nextTick(() => console.log("nextTick"));

console.log("sync");
```

Typical CommonJS output:

```txt
sync
nextTick
promise
microtask
timeout
immediate
```

Important caveat:

The relative order of top-level `setTimeout(..., 0)` and `setImmediate()` is
not a portable guarantee. It can vary with environment and event loop state.
Inside an I/O callback, `setImmediate()` usually runs before a timer scheduled
from that same I/O callback.

## 14. How Do process.nextTick, Promises, And queueMicrotask Differ?

Node.js has a special next-tick queue in addition to the normal microtask queue.

`process.nextTick`:

- Node-specific
- runs after the current operation completes
- runs before promise microtasks in normal CommonJS execution
- can starve I/O if recursively scheduled

Promise microtasks and `queueMicrotask`:

- standard JavaScript microtask behavior
- run before the event loop continues to timers, poll, or check
- better default for portable userland deferral

Example:

```js
Promise.resolve().then(() => console.log("promise 1"));

process.nextTick(() => {
  console.log("nextTick 1");
  process.nextTick(() => console.log("nextTick 2"));
});

Promise.resolve().then(() => console.log("promise 2"));
```

Typical output:

```txt
nextTick 1
nextTick 2
promise 1
promise 2
```

Tradeoff:

Use `process.nextTick` only when you need Node-specific ordering. For normal
"run after this stack clears" behavior, `queueMicrotask` or a promise is often
easier to reason about.

## 15. How Do setTimeout(0) And setImmediate Differ In Node.js?

`setTimeout(fn, 0)` schedules a timer callback after a minimum delay. It does
not mean "run immediately."

`setImmediate(fn)` schedules a callback for the check phase, which runs after
the poll phase.

Top-level example:

```js
setTimeout(() => console.log("timeout"), 0);
setImmediate(() => console.log("immediate"));
```

Possible output:

```txt
timeout
immediate
```

Or:

```txt
immediate
timeout
```

Why it is not guaranteed:

At top level, their order depends on timing and event loop state.

Inside I/O:

```js
const fs = require("node:fs");

fs.readFile(__filename, () => {
  setTimeout(() => console.log("timeout"), 0);
  setImmediate(() => console.log("immediate"));
});
```

Typical output:

```txt
immediate
timeout
```

Why:

The code runs inside the poll phase. `setImmediate` is queued for the check
phase, which comes before the next timers phase.

Node 20+ note:

Starting with libuv 1.45.0, used by Node.js 20 and later, timer handling changed
so timers run after the poll phase in each event loop iteration. This can affect
some edge cases involving timers and `setImmediate`.

## 16. What Happens In The Poll Phase?

The poll phase is where Node.js retrieves new I/O events and runs many I/O
callbacks.

Examples:

- filesystem read callbacks
- socket data callbacks
- incoming HTTP connection readiness
- completed network I/O

Poll behavior:

- if callbacks are ready, Node.js runs them
- if no callbacks are ready, Node.js may wait for I/O
- if timers are ready, Node.js eventually moves on so timers can run
- if `setImmediate` callbacks exist, Node.js moves to the check phase

Mental model:

```txt
poll phase:
  process ready I/O callbacks
  wait for I/O when appropriate
  move to check for setImmediate
  move toward timers when timer thresholds are ready
```

Why it matters:

Most useful Node.js server work is I/O-driven. Understanding poll helps explain
why `setImmediate` scheduled inside I/O often runs before `setTimeout(0)`.

## 17. What Is The libuv Thread Pool?

libuv is the library Node.js uses for the event loop and many asynchronous I/O
features. Some operations use a thread pool because the operating system cannot
make every operation fully non-blocking in the same way.

Common thread-pool users:

- some filesystem operations
- DNS lookup APIs such as `dns.lookup`
- crypto operations such as `pbkdf2`
- compression through zlib

Example:

```js
const crypto = require("node:crypto");

crypto.pbkdf2("secret", "salt", 100_000, 64, "sha512", () => {
  console.log("crypto done");
});

console.log("scheduled");
```

Output:

```txt
scheduled
crypto done
```

Important:

The callback still runs on the main JavaScript thread when the work completes.
The thread pool helps perform the expensive native work without blocking the
event loop while it is in progress.

Tradeoff:

The thread pool is limited. If many expensive crypto or filesystem tasks are
queued, they can delay each other.

## 18. How Do You Solve A Node.js Event Loop Output Question?

Use this checklist:

1. run synchronous JavaScript
2. drain `process.nextTick`
3. drain promise microtasks and `queueMicrotask`
4. run the next event loop phase callback
5. drain next ticks and microtasks created by that callback
6. continue through timers, poll, check, and close callbacks

Question:

```js
const fs = require("node:fs");

console.log("1");

setTimeout(() => console.log("2"), 0);
setImmediate(() => console.log("3"));

Promise.resolve().then(() => {
  console.log("4");
  process.nextTick(() => console.log("5"));
});

process.nextTick(() => console.log("6"));

fs.readFile(__filename, () => {
  console.log("7");
  setTimeout(() => console.log("8"), 0);
  setImmediate(() => console.log("9"));
  Promise.resolve().then(() => console.log("10"));
});

console.log("11");
```

Typical output shape:

```txt
1
11
6
4
5
2 and 3 in environment-dependent top-level order
7
10
9
8
```

Key reasoning:

- `1` and `11` are synchronous
- `6` is `process.nextTick`
- `4` is a promise microtask
- `5` is a next tick scheduled from a promise continuation
- top-level timer and immediate order should not be treated as guaranteed
- inside the I/O callback, `10` runs before leaving that callback turn
- `9` usually runs in check before `8` runs in a later timers phase

Strong answer:

> In Node.js, I separate JavaScript microtasks from libuv phases. I handle
> synchronous code first, then next ticks, then promise microtasks, then phase
> callbacks like timers, poll, and check.

## Sources Used

- <https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick>
- <https://nodejs.org/api/events.html>
- <https://nodejs.org/api/worker_threads.html>
- <https://nodejs.org/api/stream.html>
- <https://nodejs.org/api/perf_hooks.html>
