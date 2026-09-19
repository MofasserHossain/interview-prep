# Node.js Streams And Buffers Interview Guide

Node.js interview guidance covering buffers and binary data, the four stream
types, flowing and paused modes, backpressure, `pipeline`, transform streams,
async iteration, worker threads, cluster, signals, graceful shutdown, and memory
behaviour.

## 1. What Is A Buffer?

A `Buffer` is a fixed-length sequence of bytes, used for binary data that does not
fit JavaScript's string or number types — file contents, network packets, images,
compressed data.

```js
const fromString = Buffer.from("Hi", "utf8");
const allocated = Buffer.alloc(4);        // zero-filled
const fast = Buffer.allocUnsafe(4);       // faster, contains old memory

console.log(fromString);
console.log(fromString.length);
console.log(fromString.toString("hex"));
console.log(allocated);
```

Output:

```txt
<Buffer 48 69>
2
4869
<Buffer 00 00 00 00>
```

`Buffer` is a subclass of `Uint8Array`, so typed-array methods work on it.

Important:

`Buffer.allocUnsafe` does not zero the memory it hands you. It is faster, but the
buffer can contain fragments of previously freed data, so never send it anywhere
without fully overwriting it first.

Interview trap:

`length` is **bytes**, not characters. Multi-byte characters make the two differ:

```js
console.log("héllo".length);
console.log(Buffer.from("héllo").length);
```

Output:

```txt
5
6
```

This is why slicing a buffer at an arbitrary offset can split a character in half —
and why `StringDecoder` exists, to hold partial characters across chunk boundaries.

## 2. What Are Streams And Why Use Them?

A stream processes data in chunks as it arrives, instead of loading everything into
memory first.

```js
// Bad example: the whole file enters memory at once.
import { readFile } from "node:fs/promises";

const data = await readFile("./2gb-export.csv");
response.end(data);
```

```js
// Better: constant memory, whatever the file size.
import { createReadStream } from "node:fs";

createReadStream("./2gb-export.csv").pipe(response);
```

| | Buffered | Streamed |
| --- | --- | --- |
| Memory | grows with file size | roughly one chunk |
| First byte out | after the whole read | almost immediately |
| 2GB file, 1GB RAM | crashes | works |

Why it matters:

Memory is the hard limit. Ten concurrent requests for a 500MB file is 5GB buffered,
and the process dies. Streamed, it is ten chunks at a time.

Benefits:

- constant memory regardless of payload size
- work starts before the input finishes arriving
- composable through `pipe`, so stages chain together

## 3. What Are The Four Stream Types?

| Type | Direction | Example |
| --- | --- | --- |
| Readable | source | `fs.createReadStream`, HTTP request |
| Writable | sink | `fs.createWriteStream`, HTTP response |
| Duplex | both, independent | TCP socket, WebSocket |
| Transform | both, output derived from input | `zlib.createGzip`, a CSV parser |

```js
import { createReadStream, createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

await pipeline(
  createReadStream("input.txt"),   // Readable
  createGzip(),                    // Transform
  createWriteStream("output.gz"),  // Writable
);
```

A Transform is a Duplex whose output is a function of its input. A plain Duplex —
a socket — has two unrelated channels.

## 4. Flowing vs Paused Mode

A readable stream starts **paused**. It switches to **flowing** when you attach a
`data` listener, call `resume()`, or `pipe()` it.

```js
// Paused: you pull.
readable.on("readable", () => {
  let chunk;
  while ((chunk = readable.read()) !== null) {
    console.log(chunk.length);
  }
});
```

```js
// Flowing: data is pushed at you.
readable.on("data", (chunk) => {
  console.log(chunk.length);
});
```

Interview trap:

Attaching a `data` listener starts the flow immediately. If you attach it and then
`await` something before writing the data anywhere, chunks arrive while you are not
ready and are lost:

```js
// Bad example: data starts flowing before the destination exists.
readable.on("data", async (chunk) => {
  await slowWrite(chunk); // chunks keep arriving during the await
});
```

`data` handlers cannot apply backpressure — the stream does not wait for your
promise. Use `pipeline` or `for await` instead.

The rule:

Do not use `data` listeners for anything asynchronous. They ignore backpressure by
design.

## 5. Writable Streams And What `write()` Returns

`write()` returns a boolean: `false` means the internal buffer has passed its
`highWaterMark` and you should stop until `drain` fires.

```js
function writeMany(writable, items) {
  for (const item of items) {
    if (!writable.write(item)) {
      return new Promise((resolve) => writable.once("drain", resolve))
        .then(() => writeMany(writable, items.slice(items.indexOf(item) + 1)));
    }
  }

  writable.end();
}
```

Ignoring the return value is the classic memory bug:

```js
// Bad example: unbounded memory growth.
for (let i = 0; i < 10_000_000; i += 1) {
  writable.write(`row ${i}\n`); // return value ignored
}
```

Why:

`write()` never blocks. When the destination is slower than the loop, everything
queues in memory until the process runs out.

Fix — let `pipeline` manage it:

```js
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

await pipeline(
  Readable.from(function* () {
    for (let i = 0; i < 10_000_000; i += 1) {
      yield `row ${i}\n`;
    }
  }()),
  writable,
);
```

## 6. What Is Backpressure?

Backpressure is the signal a slow consumer sends to a fast producer telling it to
slow down.

```txt
without backpressure
  fast source ──────────> slow sink
              queue grows in memory until the process dies

with backpressure
  fast source <──pause──  slow sink
              source waits until the sink drains
```

A concrete case: reading from a local disk at 500MB/s and writing to a network
socket at 10MB/s. Without backpressure, 490MB per second accumulates in memory.

```viz
type: flow
title: How pipeline applies backpressure
source.read() :: chunk arrives from the fast producer
dest.write(chunk) :: returns false when the buffer passes highWaterMark
source.pause() :: pipeline stops pulling
dest emits "drain" :: the buffer has emptied
source.resume() :: pulling continues
```

`pipe` and `pipeline` implement this automatically — they pause the source when
`write()` returns `false` and resume on `drain`.

Interview note:

This is the single best argument for `pipeline` over manual `data` handlers.
Hand-written stream plumbing almost always drops backpressure, and the symptom is a
process that works in testing and dies under production load.

Strong answer:

> Backpressure is the consumer telling the producer to wait. `pipeline` handles it
> for me by pausing the readable when the writable's buffer is full. Manual `data`
> listeners ignore it entirely, which is how streaming code ends up buffering
> everything in memory anyway.

## 7. `pipe` vs `pipeline`

`pipeline` is the correct default. `pipe` does not clean up on failure.

```js
// Bad example: if gzip errors, the read stream is never destroyed.
createReadStream("in.txt")
  .pipe(createGzip())
  .pipe(createWriteStream("out.gz"));
```

An error in the middle stage leaves the source open — a file descriptor leak that
accumulates until the process hits its limit.

```js
// Better: errors propagate and every stream is destroyed.
import { pipeline } from "node:stream/promises";

try {
  await pipeline(
    createReadStream("in.txt"),
    createGzip(),
    createWriteStream("out.gz"),
  );
} catch (error) {
  console.error("pipeline failed:", error.message);
}
```

| | `pipe` | `pipeline` |
| --- | --- | --- |
| Backpressure | yes | yes |
| Error propagation | **no** | yes |
| Cleanup on failure | **no** | yes, destroys all streams |
| Promise form | no | `stream/promises` |

The rule:

Use `pipeline` unless you have a specific reason not to. `pipe` is fine only for a
single hop you fully control and where you handle `error` on every stream yourself.

## 8. What Are Transform Streams?

A Transform stream reads input, changes it, and pushes output.

```js
import { Transform } from "node:stream";

const upperCase = new Transform({
  transform(chunk, encoding, callback) {
    callback(null, chunk.toString().toUpperCase());
  },
});

await pipeline(
  createReadStream("in.txt"),
  upperCase,
  createWriteStream("out.txt"),
);
```

`objectMode` lets a stream carry JavaScript values instead of bytes:

```js
const toRecord = new Transform({
  objectMode: true,

  transform(line, encoding, callback) {
    const [id, name] = String(line).split(",");
    callback(null, { id: Number(id), name });
  },
});
```

Error handling inside a transform:

```js
const parseJson = new Transform({
  objectMode: true,

  transform(chunk, encoding, callback) {
    try {
      callback(null, JSON.parse(chunk));
    } catch (error) {
      callback(error); // propagates through pipeline
    }
  },
});
```

Important:

Always call `callback` exactly once. Forgetting it stalls the pipeline silently —
no error, no output, just a process that never finishes.

## 9. How Do You Iterate A Stream With `for await`?

Async iteration is usually the most readable option, and it respects backpressure
because the loop body must finish before the next chunk is pulled.

```js
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const lines = createInterface({
  input: createReadStream("large.log"),
  crlfDelay: Infinity,
});

let errors = 0;

for await (const line of lines) {
  if (line.includes("ERROR")) {
    errors += 1;
    await recordError(line); // the stream waits for this
  }
}

console.log(errors);
```

Why it matters:

Compare with a `data` listener, which would fire `recordError` for every line
concurrently and never wait. Here the stream is naturally paused while the `await`
runs.

Tradeoff:

Async iteration processes strictly one chunk at a time. When the per-chunk work is
I/O-bound and independent, that is slower than a bounded-concurrency approach —
but it is correct by default, which is usually the better trade.

Important:

Breaking out of a `for await` loop destroys the stream automatically, so files and
sockets are closed.

## 10. How Do You Handle Stream Errors?

Every stream is an `EventEmitter`, and an unhandled `error` event crashes the
process.

```js
// Bad example: one unhandled error takes down the server.
readable.pipe(writable);
```

```js
// Better: pipeline centralises it.
try {
  await pipeline(readable, transform, writable);
} catch (error) {
  if (error.code === "ENOENT") {
    response.statusCode = 404;
  } else {
    response.statusCode = 500;
  }
  response.end();
}
```

Common stream errors:

| Code | Meaning |
| --- | --- |
| `ENOENT` | the source file does not exist |
| `EACCES` | permission denied |
| `EPIPE` | the destination closed early — client disconnected |
| `ERR_STREAM_PREMATURE_CLOSE` | a stream ended before finishing |

`EPIPE` is normal when a user cancels a download. Handle it as an expected
condition rather than logging it as a server fault.

Interview note:

`pipeline` destroys every stream in the chain on failure. That is the behaviour
that stops file descriptor leaks, and the reason it exists.

## 11. How Do You Stream A File Over HTTP?

```js
import { createReadStream, statSync } from "node:fs";
import { pipeline } from "node:stream/promises";

async function download(request, response, filePath) {
  const { size } = statSync(filePath);

  response.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": size,
    "Content-Disposition": 'attachment; filename="export.csv"',
  });

  try {
    await pipeline(createReadStream(filePath), response);
  } catch (error) {
    if (error.code !== "EPIPE" && !response.headersSent) {
      response.statusCode = 500;
      response.end();
    }
  }
}
```

The reverse — accepting an upload without buffering it:

```js
await pipeline(request, createWriteStream("./uploads/incoming.bin"));
```

Important:

An HTTP request **is** a readable stream and the response **is** a writable stream.
Recognising this removes most of the need for upload libraries when the requirement
is simple.

Edge cases:

- Set `Content-Length` when you know it, so the client can show progress.
- Without it, Node uses chunked transfer encoding, which is fine but gives no
  progress bar.
- Validate the path before opening it — user-controlled paths are a directory
  traversal risk.

## 12. How Do You Process A Large CSV?

Combine a line reader with bounded batching so neither memory nor the database is
overwhelmed.

```js
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

async function importCsv(filePath, batchSize = 1000) {
  const lines = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });

  let batch = [];
  let imported = 0;
  let isHeader = true;

  for await (const line of lines) {
    if (isHeader) {
      isHeader = false;
      continue;
    }

    const [id, email] = line.split(",");
    batch.push([Number(id), email]);

    if (batch.length >= batchSize) {
      await insertBatch(batch);
      imported += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    await insertBatch(batch);
    imported += batch.length;
  }

  return imported;
}
```

Why this shape:

- the file is never fully in memory
- the database receives batched inserts rather than one round trip per row
- the `await` inside the loop applies backpressure to the file read
- the trailing flush handles the final partial batch

Tradeoff:

Larger batches mean fewer round trips and more memory per batch, and a failure loses
more work. A few hundred to a few thousand rows is the usual sweet spot.

## 13. Worker Threads vs Child Processes vs Cluster

| | Worker threads | Child processes | Cluster |
| --- | --- | --- | --- |
| Isolation | same process, own V8 isolate | separate process | separate processes |
| Memory | can share via `SharedArrayBuffer` | no sharing, IPC only | no sharing |
| Startup | ~ms | ~tens of ms | ~tens of ms |
| Use for | CPU-bound work | running other programs | scaling HTTP across cores |

CPU-bound work blocks the event loop, and a worker thread is the fix:

```js
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

if (isMainThread) {
  const worker = new Worker(new URL(import.meta.url), {
    workerData: { size: 1e9 },
  });

  worker.on("message", (result) => console.log("result:", result));
  worker.on("error", (error) => console.error(error));
} else {
  let total = 0;
  for (let i = 0; i < workerData.size; i += 1) {
    total += i;
  }
  parentPort.postMessage(total);
}
```

Cluster scales an HTTP server across CPU cores:

```js
import cluster from "node:cluster";
import { availableParallelism } from "node:os";

if (cluster.isPrimary) {
  for (let i = 0; i < availableParallelism(); i += 1) {
    cluster.fork();
  }

  cluster.on("exit", () => cluster.fork()); // restart on crash
} else {
  startServer();
}
```

When not to use it:

Worker threads do not speed up I/O-bound work — the event loop already handles that
concurrently. They help only when JavaScript itself is the bottleneck.

Interview note:

In containerised deployments, running one Node process per container and scaling
containers is usually preferred over `cluster`. The orchestrator then handles
restarts, health checks, and rollout, rather than your primary process.

## 14. How Do You Shut Down A Node Server Gracefully?

An abrupt exit drops in-flight requests. Graceful shutdown stops accepting new work
and lets existing work finish.

```js
import http from "node:http";

const server = http.createServer(handler);
server.listen(3000);

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`${signal} received, shutting down`);

  // stop accepting new connections
  server.close(async () => {
    try {
      await pool.end();      // drain the database pool
      await broker.close();  // close the message broker
      process.exit(0);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });

  // do not hang forever
  setTimeout(() => {
    console.error("forced shutdown");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM")); // orchestrator stop
process.on("SIGINT", () => shutdown("SIGINT"));   // Ctrl+C
```

| Signal | Sent by |
| --- | --- |
| `SIGTERM` | Kubernetes, Docker, systemd on stop |
| `SIGINT` | Ctrl+C in a terminal |
| `SIGKILL` | forced; **cannot** be handled |

Important:

`server.close()` stops new connections but waits for open ones. Without the forced
timeout, a long-lived connection such as a WebSocket or SSE stream keeps the process
alive indefinitely.

Interview note:

In Kubernetes, `SIGTERM` arrives and the pod is removed from the load balancer at
roughly the same moment, not in a guaranteed order. A short delay before calling
`server.close()` avoids rejecting requests already in flight.

## 15. How Do You Handle Uncaught Errors?

```js
process.on("uncaughtException", (error) => {
  console.error("uncaught:", error);
  process.exit(1); // exit — the process is in an unknown state
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandled rejection:", reason);
  process.exit(1);
});
```

Important:

These are for **logging before exiting**, not for recovery. After an uncaught
exception the process may hold half-updated state, leaked handles, or a broken
connection pool. Log it, exit, and let the supervisor restart a clean process.

```js
// Bad example: swallowing the error and continuing.
process.on("uncaughtException", (error) => {
  console.error(error); // and then keep running, in an unknown state
});
```

Interview note:

Since Node 15, an unhandled promise rejection terminates the process by default.
Older advice about it "only warning" is out of date.

## 16. How Does Node Manage Memory, And Where Do Leaks Come From?

V8 splits the heap into a young generation, collected frequently and cheaply, and an
old generation, collected rarely and expensively. Objects surviving several young
collections are promoted.

```js
const used = process.memoryUsage();

console.log({
  rss: `${Math.round(used.rss / 1024 / 1024)} MB`,        // total process
  heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)} MB`,
  heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)} MB`,
  external: `${Math.round(used.external / 1024 / 1024)} MB`, // buffers
});
```

Common leak sources:

- **Unbounded caches** — a `Map` that only ever grows. Use an LRU with a size cap.
- **Listeners never removed** — especially on long-lived emitters. The
  `MaxListenersExceededWarning` is the early signal.
- **Timers never cleared** — `setInterval` holding a closure over a large object.
- **Closures over large objects** — capture the field you need, not the whole object.
- **Global arrays used as buffers** — an error log array that is never drained.

```js
// Bad example: grows forever.
const cache = new Map();

function get(key) {
  if (!cache.has(key)) {
    cache.set(key, expensive(key));
  }
  return cache.get(key);
}
```

Fix — bound it:

```js
const cache = new Map();
const MAX = 1000;

function get(key) {
  if (cache.has(key)) {
    const value = cache.get(key);
    cache.delete(key);
    cache.set(key, value); // move to most-recent
    return value;
  }

  const value = expensive(key);
  cache.set(key, value);

  if (cache.size > MAX) {
    cache.delete(cache.keys().next().value); // evict oldest
  }

  return value;
}
```

Interview note:

Diagnose with two heap snapshots taken under steady load and compare retained size.
A constructor whose instance count only grows between snapshots is the leak. Buffers
show under `external`, not `heapUsed`, so a buffer leak looks like flat heap usage
with rising RSS.

## Sources Used

- <https://nodejs.org/api/stream.html>
- <https://nodejs.org/api/buffer.html>
- <https://nodejs.org/api/worker_threads.html>
- <https://nodejs.org/api/cluster.html>
- <https://nodejs.org/api/process.html>
- <https://nodejs.org/en/learn/modules/backpressuring-in-streams>
