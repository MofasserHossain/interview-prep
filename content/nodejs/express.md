# Express Framework Interview Guide

Express interview guidance covering the middleware pipeline, routing, the Express 5
breaking changes, error handling, async errors, validation, auth, security headers,
file uploads, streaming, `trust proxy`, timeouts, graceful shutdown, testing, and
production structure.

## 1. What Is Express, And What Does It Add Over The Built-In http Module?

Express is a minimal HTTP framework for Node.js. It does not replace the `http`
module — it wraps it. `express()` returns a request handler function that you can
hand straight to `http.createServer`.

```js
// Raw Node: you route by hand.
import { createServer } from "node:http";

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/users") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify([{ id: 1 }]));
    return;
  }

  res.writeHead(404).end();
}).listen(3000);
```

```js
// Express: routing, parsing, and response helpers are provided.
import express from "express";

const app = express();

app.get("/users", (req, res) => {
  res.json([{ id: 1 }]);
});

app.listen(3000);
```

Problem it solves:

Raw Node gives you a URL string and a byte stream. Express gives you a matched
route, parsed params, a parsed body, content negotiation, and a composable
middleware chain — the plumbing every HTTP service rewrites otherwise.

Important:

`app` **is** a function with the signature `(req, res)`. That is why
`createServer(app)` works, why you can mount an Express app inside another Express
app, and why Socket.IO and HTTPS setups ask for the server rather than the app.

```js
import { createServer } from "node:http";

const server = createServer(app); // you need this for WebSockets or custom timeouts
server.listen(3000);
```

Strong answer:

"Express is an unopinionated routing and middleware layer over `node:http`. It gives
me a composable pipeline and request/response sugar, but it makes no decisions about
project structure, validation, or data access — which is both why it is everywhere
and why every large Express codebase eventually invents its own conventions."

## 2. What Is Middleware, And What Are The Four Kinds?

Middleware is a function that receives the request, the response, and `next`. It can
read or mutate either object, end the response, or pass control on.

```js
function middleware(req, res, next) {
  // 1. inspect or modify req/res
  // 2. end the response, OR
  // 3. call next() to continue, OR
  // 4. call next(error) to jump to error handling
}
```

Express recognises four kinds:

```viz
type: stack
title: Express middleware kinds
Application-level :: app.use(fn) — runs for every matching request
Router-level :: router.use(fn) — scoped to a mounted router
Error-handling :: (err, req, res, next) — four arguments, nothing else
Built-in / third-party :: express.json(), cors(), helmet()
```

Important:

An error handler is identified **only** by its arity. Four parameters means error
handler; three means normal middleware. There is no flag and no registration API.

```js
// This is an error handler.
app.use((err, req, res, next) => { /* ... */ });

// This is NOT — it will never see an error, and `next` here is actually `res`.
app.use((err, req, res) => { /* silently wrong */ });
```

Interview trap:

Omitting the unused `next` from a four-parameter error handler turns it into a
three-parameter normal middleware. The code looks tidier and stops working. Keep
`next` even when you do not call it, or mark it as intentionally unused.

## 3. How Does A Request Actually Flow Through An Express App?

Express holds an ordered stack of layers. For each request it walks the stack top to
bottom, and for each layer that matches the method and path, it invokes the handler
and waits for `next()`.

```js
const app = express();

app.use(express.json());                       // 1. every request
app.use("/api", authenticate);                 // 2. only /api/*
app.get("/api/users/:id", getUser);            // 3. only this route
app.use((req, res) => res.status(404).json({ error: "Not found" })); // 4. fallback
app.use((err, req, res, next) => { /* ... */ });                     // 5. errors
```

```viz
type: flow
title: Request through the stack
express.json() :: parses the body, calls next()
authenticate :: path-prefix match on /api, sets req.user
getUser :: route match, sends the response — chain stops here
404 handler :: skipped, because the response already ended
error handler :: only entered via next(err) or a thrown error
```

Mental model:

The stack is a list, not a tree. `next()` means "continue walking the list from
where I am". Nothing rewinds, and nothing runs in parallel.

Symptom:

A request hangs forever with no response and no error. That is almost always a
middleware that neither ended the response nor called `next()` — commonly an early
`return` inside a callback, or a forgotten `next()` on a success path.

## 4. Why Does Middleware Order Matter So Much?

Because registration order **is** execution order. A middleware registered after the
handler that ends the response never runs.

```js
// Broken: the body is parsed after the route already needed it.
app.post("/users", (req, res) => {
  res.json({ name: req.body.name }); // req.body is undefined
});

app.use(express.json());
```

```js
// Correct: parsers and cross-cutting concerns go first.
app.use(express.json());

app.post("/users", (req, res) => {
  res.json({ name: req.body.name });
});
```

The rule:

Register in widening-to-narrowing order — process-wide concerns (security headers,
logging, body parsing, CORS), then authentication, then routes, then the 404
fallback, then error handlers last.

Interview trap:

`app.use(express.static("public"))` placed **before** your API routes means a file
in `public/` can shadow an API path. A file named `public/users` will be served
instead of your `/users` route, and it will look like a routing bug.

## 5. How Does Routing Work, And When Should You Use express.Router?

`app.METHOD(path, ...handlers)` registers a route. `express.Router()` creates a
mountable mini-application with its own middleware stack.

```js
// routes/users.js
import { Router } from "express";

const router = Router();

router.use(requireAuth);                       // applies to every route below
router.get("/", listUsers);
router.get("/:id", getUser);
router.post("/", validateBody(createUserSchema), createUser);

export default router;
```

```js
// app.js
app.use("/api/users", usersRouter);            // router paths are relative to this
```

Benefits:

- The mount path lives in one place, so moving `/api/users` to `/api/v2/users` is a
  one-line change.
- Router-level middleware scopes auth or rate limiting to a resource without
  repeating it per route.
- Each route file is independently testable — you can mount one router in a test app.

Important:

Inside a mounted router, `req.url` is rewritten relative to the mount point, while
`req.originalUrl` keeps the full path. Log `originalUrl`; route on `url`.

```js
// Request: GET /api/users/42
router.get("/:id", (req, res) => {
  console.log(req.url);         // /42
  console.log(req.baseUrl);     // /api/users
  console.log(req.originalUrl); // /api/users/42
});
```

Edge cases:

A child router does not see the parent's route params unless you ask for them:

```js
const router = Router({ mergeParams: true }); // now req.params.orgId is visible
app.use("/orgs/:orgId/members", router);
```

## 6. Where Does Request Data Come From — params, query, body, headers?

Four sources, four different parsers, and they fail in different ways.

```js
// GET /api/users/42/posts?limit=10&tag=node
app.get("/api/users/:id/posts", (req, res) => {
  req.params.id;       // "42"     — always a string, from the path
  req.query.limit;     // "10"     — always a string (or array/object), from ?...
  req.body;            // parsed   — only if a body parser ran
  req.get("authorization"); // case-insensitive header lookup
  res.json({});
});
```

Interview trap:

`req.params.id` is a **string**, always. `"42" === 42` is false, and passing a
string id into a query that expects an integer is a classic source of silent
mismatches and full table scans.

```js
const id = Number(req.params.id);

if (!Number.isInteger(id) || id < 1) {
  return res.status(400).json({ error: "Invalid id" });
}
```

Important:

`req.query` values are attacker-controlled in both type and shape. With the legacy
extended parser, `?tag[$ne]=x` produces an **object**, not a string — which is how
NoSQL injection gets into Mongo queries. Validate types, never trust them.

Tradeoff:

Express 5 defaults the query parser to `"simple"` (Node's built-in `querystring`),
which yields flat values and removes that class of surprise. `"extended"` (the
`qs` library) supports nested objects and arrays, which some legacy clients send.
Choose deliberately:

```js
app.set("query parser", "extended"); // opt back in only if you need nesting
```

## 7. What Changed In Express 5, And Why Does It Break Existing Routes?

Express 5.0 shipped in September 2024 and became the default `npm install express`
version with 5.1 in 2025. It requires Node.js 18+. The two changes that break real
codebases are the path syntax and the removed response signatures.

Route paths now use `path-to-regexp` v8, which dropped inline regular expressions
and changed the wildcard and optional syntax:

```js
// Express 4                        // Express 5
app.get("/files/*", h);             app.get("/files/*splat", h);
app.get("/users/:id?", h);          app.get("/users{/:id}", h);
app.get("/user/:id(\\d+)", h);      // inline regex removed — validate in code
app.get("/(foo|bar)", h);           app.get(["/foo", "/bar"], h);
```

Removed or changed APIs:

```js
res.send(404);            // removed — use res.sendStatus(404)
res.json(obj, 201);       // removed — use res.status(201).json(obj)
res.sendfile(path);       // removed — use res.sendFile(path)
res.redirect("back");     // removed — use req.get("Referrer") explicitly
app.del("/x", h);         // removed — use app.delete("/x", h)
req.param("id");          // removed — use req.params.id
```

Other behaviour changes worth naming:

- Rejected promises from handlers now reach the error handler automatically.
- The default query parser changed from `extended` to `simple`.
- `express.urlencoded()` now defaults to `extended: false`.
- `res.status()` rejects codes outside the valid range instead of accepting them.

Symptom:

After upgrading, the app starts but every request to a wildcard route throws
`Missing parameter name` at boot. That is `path-to-regexp` v8 refusing a bare `*`.

Strong answer:

"The headline win is automatic async error forwarding. The migration cost is almost
entirely route strings — bare wildcards and `:param?` optionals have to be rewritten,
and inline regex validation has to move into middleware."

## 8. How Do next(), next('route'), And next(err) Differ?

Three different control-flow instructions that look almost identical.

```js
app.get("/users/:id",
  (req, res, next) => {
    if (req.params.id === "me") return next("route"); // skip to the NEXT route
    if (!isValid(req.params.id)) return next(new Error("bad id")); // jump to errors
    next();                                            // continue this chain
  },
  (req, res) => res.json({ id: req.params.id }),
);

app.get("/users/:id", (req, res) => res.json(currentUser(req)));
```

```viz
type: flow
title: What each call does
next() :: run the next handler in the current chain
next("route") :: abandon this route, try the next matching route
next(err) :: skip all normal middleware, go to the first error handler
next("router") :: exit the whole router, continue in the parent stack
```

Important:

`next("route")` only works inside `app.METHOD()` or `router.METHOD()` handler chains.
It does nothing useful from a plain `app.use()` middleware.

Interview trap:

`return next()` versus `next()`. Without the `return`, execution continues past the
call and often ends up sending a second response — producing the
`ERR_HTTP_HEADERS_SENT` crash that only appears on the error branch in production.

## 9. How Does Error Handling Work In Express?

An error handler has four parameters and is registered last. Express routes to it
when you call `next(err)`, or — for synchronous code — when a handler throws.

```js
// One handler, registered after all routes.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err); // let Node close the broken response

  const status = err.status ?? 500;

  req.log.error({ err, requestId: req.id }, "request failed");

  res.status(status).json({
    error: status === 500 ? "Internal server error" : err.message,
    requestId: req.id,
  });
});
```

Why it matters:

A single exit point means every failure is logged the same way, every response has
the same shape, and internal messages never leak. Scattered `try/catch` blocks that
each invent their own error body are how clients end up parsing four different error
formats from one API.

Use a typed error so handlers stay dumb:

```js
export class HttpError extends Error {
  constructor(status, message, options) {
    super(message, options);
    this.status = status;
    this.name = "HttpError";
  }
}

// In a service:
if (!user) throw new HttpError(404, "User not found");
```

Important:

`res.headersSent` matters because streaming responses can fail **after** the status
line is written. You cannot send a 500 at that point — the only correct move is to
destroy the response and log it.

Interview answer:

"Errors get normalised into an `HttpError` with a status, thrown from the service
layer, and rendered by exactly one error middleware that logs with a request id and
strips internal detail from 5xx responses."

## 10. How Do You Handle Async Errors — And What Did Express 5 Fix?

This is the single most common Express bug in interviews.

```js
// Express 4: this crashes the process, or hangs the request forever.
app.get("/users/:id", async (req, res) => {
  const user = await db.findUser(req.params.id); // rejects -> unhandled rejection
  res.json(user);
});
```

Express 4's router calls the handler and ignores its return value, so a rejected
promise is never converted to `next(err)`. The fix was a wrapper:

```js
// Express 4 fix: wrap every async handler.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

app.get("/users/:id", asyncHandler(async (req, res) => {
  res.json(await db.findUser(req.params.id));
}));
```

```js
// Express 5: the wrapper is no longer needed.
app.get("/users/:id", async (req, res) => {
  res.json(await db.findUser(req.params.id)); // rejection -> error handler
});
```

When not to use it:

Automatic forwarding only covers the promise the handler **returns**. A rejection
inside a callback, an event listener, or a floating promise is still invisible:

```js
app.get("/reports", (req, res) => {
  generateReport().then((r) => res.json(r)); // not returned — Express 5 cannot see it
});
```

Fix:

Return the promise, or `await` it, so Express has something to attach to. And keep
process-level safety nets regardless:

```js
process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "unhandled rejection");
  shutdown(1);
});
```

## 11. How Do You Handle 404s Correctly?

A 404 handler is a normal middleware with no path, registered after every route but
before the error handler.

```js
app.use("/api", apiRouter);

app.use((req, res, next) => {
  next(new HttpError(404, `Cannot ${req.method} ${req.originalUrl}`));
});

app.use(errorHandler);
```

Why:

Routing it through `next()` rather than responding directly means 404s get the same
logging, the same body shape, and the same request id as every other failure.

Interview trap:

Placing the 404 middleware before an async route registration — for example inside a
module that loads routes lazily — makes every route 404. Registration order is
evaluated at startup, not per request.

## 12. What Do The Built-In Body Parsers Do, And What Limits Should You Set?

Since 4.16, `body-parser` ships inside Express. Each parser only runs when the
request's `Content-Type` matches.

```js
app.use(express.json({ limit: "100kb" }));                       // application/json
app.use(express.urlencoded({ extended: false, limit: "100kb" })); // form posts
app.use(express.text({ type: "text/csv" }));
app.use(express.raw({ type: "application/octet-stream" }));
```

Important:

The default limit is `100kb`. Raising it to `50mb` "to be safe" means any client can
make your process allocate 50 MB of heap per concurrent request. Large payloads
belong in a stream or an object-store upload, not a JSON body.

Edge cases:

- A request with no matching `Content-Type` leaves `req.body` as `{}` in Express 5
  (it was `undefined` in older setups) — check the field, not the object.
- Webhook signature verification needs the **raw** bytes, so capture them before
  JSON parsing mutates nothing but consumes the stream:

```js
app.post("/webhooks/stripe",
  express.raw({ type: "application/json" }),
  (req, res) => {
    verifySignature(req.body, req.get("stripe-signature")); // req.body is a Buffer
    res.sendStatus(204);
  },
);
```

Interview trap:

Mounting `express.json()` globally **before** the webhook route destroys the raw
body and every signature check fails. Mount the raw parser on that route first, or
stash the raw buffer in the `verify` callback.

## 13. How Do You Serve Static Files Well?

`express.static` wraps `serve-static`. The defaults are fine for development and
wrong for production caching.

```js
app.use(
  "/assets",
  express.static("public", {
    maxAge: "1y",          // fingerprinted files can be cached forever
    immutable: true,
    etag: true,
    index: false,          // do not serve directory listings
    dotfiles: "ignore",
  }),
);
```

Tradeoff:

Serving static files from Node works, but Node is the most expensive process in the
stack to do it with. Nginx or a CDN serves the same bytes with `sendfile`, no event
loop involvement, and better compression control. Keep `express.static` for
development and small internal tools; put a proxy or CDN in front in production.

Important:

`maxAge: "1y"` is only safe for **content-hashed** filenames like `app.4f2b.js`.
Applying it to `index.html` pins users to a stale shell until their cache expires.

## 14. What Is trust proxy, And Why Does It Break Things Behind Nginx?

Behind a reverse proxy, the TCP connection Express sees comes from the proxy. So
`req.ip` is the proxy's IP, and `req.protocol` is `http` even when the client used
HTTPS.

```js
app.set("trust proxy", 1); // trust exactly one hop (your nginx / load balancer)
```

With it enabled, Express reads `X-Forwarded-For`, `X-Forwarded-Proto`, and
`X-Forwarded-Host` to populate `req.ip`, `req.protocol`, and `req.hostname`.

Symptom:

Rate limiting blocks every user at once, or nobody. Every request appears to come
from the same IP — the proxy's — so one shared counter throttles the whole site.

Symptom:

`secure: true` session cookies are never set. Express thinks the request is plain
HTTP, so it refuses to send a secure cookie, and login silently fails in production
but works locally.

Interview trap:

`app.set("trust proxy", true)` trusts the **entire** `X-Forwarded-For` chain,
including values a client injected. An attacker sends
`X-Forwarded-For: 1.2.3.4` and now owns whatever IP your rate limiter or audit log
records. Trust a hop count or a specific subnet, never a blanket `true`:

```js
app.set("trust proxy", "10.0.0.0/8"); // or the number of proxies you control
```

## 15. How Do You Validate Input In Express?

Validation belongs in middleware, before the handler, and it should produce a typed
value rather than just a boolean.

```js
import { z } from "zod";

const createUser = z.object({
  email: z.string().email(),
  age: z.number().int().min(13).max(120),
});

const validate = (schema, source = "body") => (req, res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    return next(new HttpError(400, "Validation failed", { cause: result.error }));
  }

  req[source] = result.data; // replace with the parsed, coerced, stripped value
  next();
};

app.post("/users", validate(createUser), (req, res) => {
  // req.body is now exactly the schema shape — no unknown keys
  res.status(201).json(createUserService(req.body));
});
```

Why this is good:

Reassigning `req.body` to the parsed result strips unknown properties. That single
line prevents mass-assignment: a client sending `{"email":"…","role":"admin"}`
cannot smuggle `role` into a spread like `{ ...req.body }`.

Important:

Query and path values arrive as strings, so schemas for them need coercion:

```js
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
```

Tradeoff:

Schema validation costs a few microseconds per request and one more dependency. It
replaces dozens of hand-written `if (!req.body.email)` checks that drift apart and
never quite agree on the error format.

## 16. How Do You Secure An Express App?

Security in Express is assembled, not given. The baseline every production app needs:

```js
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

app.disable("x-powered-by");                 // stop advertising the framework
app.use(helmet());                           // security headers incl. CSP, HSTS
app.use(cors({ origin: ["https://app.example.com"], credentials: true }));
app.use(rateLimit({ windowMs: 60_000, limit: 100 }));
app.use(express.json({ limit: "100kb" }));   // bounded body size
```

What each one actually does:

```viz
type: stack
title: The baseline, and the attack each blocks
helmet() :: CSP, HSTS, nosniff, frame-ansestry — XSS and clickjacking surface
cors(allowlist) :: stops other origins reading authenticated responses
rateLimit :: credential stuffing and brute force
json limit :: memory-exhaustion denial of service
disable x-powered-by :: removes a free version-fingerprint for scanners
```

Important:

`cors({ origin: true, credentials: true })` reflects **any** origin and allows
cookies with it. That is equivalent to having no cross-origin protection at all.
Always pass an explicit allowlist when `credentials` is on.

Interview trap:

CORS is enforced by the browser, not the server. It protects users of your API from
malicious sites; it does nothing against `curl`, a script, or a proxy. Authorisation
still has to be checked on every request.

Edge cases:

An in-memory rate limiter resets on deploy and counts per process. With four
workers, a limit of 100 is really 400. Use a shared Redis store once you run more
than one instance.

## 17. Sessions Or JWT — How Do You Implement Auth In Express?

Both are middleware that put a verified identity on `req` before the route runs.

```js
// Stateless: verify a signed token on each request.
function authenticate(req, res, next) {
  const [scheme, token] = (req.get("authorization") ?? "").split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(new HttpError(401, "Missing bearer token"));
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    next();
  } catch {
    next(new HttpError(401, "Invalid token"));
  }
}
```

```js
// Stateful: a session id in a cookie, state in Redis.
app.use(session({
  store: new RedisStore({ client: redis }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: true, sameSite: "lax", maxAge: 86_400_000 },
}));
```

Tradeoff:

| | Session | JWT |
| --- | --- | --- |
| Revocation | instant — delete the row | needs a denylist or short TTL |
| Scale | shared store required | verify anywhere, no lookup |
| Payload | opaque id | readable claims, size grows |
| Best for | browser apps, admin tools | service-to-service, mobile, multi-API |

Important:

Always pin `algorithms` when verifying. Omitting it historically allowed an
`alg: none` token to pass verification — the classic JWT bypass.

Interview answer:

"For a first-party web app I default to a session cookie with `HttpOnly`, `Secure`,
and `SameSite`, because revocation is instant and nothing sensitive lives in the
browser. I reach for JWTs when multiple services need to verify identity without a
shared session store, and then I keep the TTL short and pair it with a refresh token."

## 18. How Do You Add Request Logging And Correlation IDs?

Every log line for one request should carry the same id, so a production trace is one
grep away.

```js
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const store = new AsyncLocalStorage();

app.use((req, res, next) => {
  req.id = req.get("x-request-id") ?? randomUUID(); // reuse the proxy's id if present
  res.setHeader("x-request-id", req.id);
  store.run({ requestId: req.id }, next);           // survives every await below
});

export const currentRequestId = () => store.getStore()?.requestId;
```

Why it matters:

`AsyncLocalStorage` propagates context through `await`, timers, and callbacks without
threading a parameter through every function. A repository function three layers deep
can log the request id without knowing Express exists.

Important:

Accept an inbound `x-request-id` so the id is continuous across services. Generating
a fresh one at every hop breaks distributed tracing at the first boundary.

Tradeoff:

`AsyncLocalStorage` has measurable overhead on very hot paths. On a typical
I/O-bound API it is noise next to a single database round trip; on a 100k rps
in-memory service, measure before adopting.

## 19. How Do You Handle File Uploads?

`multipart/form-data` is not parsed by the built-in parsers. `multer` is the usual
choice.

```js
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    cb(null, ["image/png", "image/jpeg"].includes(file.mimetype));
  },
});

app.post("/avatar", requireAuth, upload.single("avatar"), async (req, res) => {
  const url = await uploadToS3(req.file.buffer, req.file.mimetype);
  res.json({ url });
});
```

Important:

`file.mimetype` is the **client's claim**, taken from the multipart headers. It is
trivially forged. For anything that will later be served or processed, verify the
actual magic bytes and re-encode images rather than trusting the label.

Tradeoff:

`memoryStorage` is simple but holds the whole file in heap — ten concurrent 5 MB
uploads is 50 MB. `diskStorage` moves it to the filesystem, which survives more
concurrency but needs cleanup on failure.

Interview answer:

"For production I prefer presigned direct-to-S3 uploads. The file never touches the
Node process, so upload bandwidth does not occupy a worker, and the API only handles
a small 'confirm' call afterwards."

## 20. How Do You Stream A Response Or Implement Server-Sent Events?

For large payloads, write as you produce instead of buffering.

```js
import { pipeline } from "node:stream/promises";

app.get("/export.csv", async (req, res) => {
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="export.csv"');

  await pipeline(db.streamRows(), toCsv(), res); // backpressure handled for you
});
```

Server-sent events for one-way live updates:

```js
app.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const timer = setInterval(() => {
    res.write(`data: ${JSON.stringify({ at: Date.now() })}\n\n`);
  }, 1000);

  req.on("close", () => clearInterval(timer)); // the client left — stop working
});
```

Important:

`req.on("close")` cleanup is mandatory. Without it every disconnected client leaves a
live interval and a retained response object, and memory climbs until restart.

Interview trap:

Nginx buffers proxied responses by default, so SSE appears to work locally and
delivers nothing in production until the buffer fills. Send
`X-Accel-Buffering: no`, or set `proxy_buffering off;` for that location.

Tradeoff:

SSE is one-directional, text-only, and rides plain HTTP — so it passes proxies and
reconnects automatically. WebSockets are bidirectional and binary-capable but need
their own upgrade handling and proxy configuration. If the client only listens, SSE
is less machinery.

## 21. How Do You Set Timeouts Correctly?

Node's HTTP server has no useful default request timeout, so a slow upstream can hold
a connection open indefinitely.

```js
const server = app.listen(3000);

server.requestTimeout = 30_000;     // whole request must complete in 30s
server.headersTimeout = 10_000;     // headers must arrive within 10s (Slowloris)
server.keepAliveTimeout = 65_000;   // must exceed the proxy's idle timeout
```

Important:

`keepAliveTimeout` must be **longer** than your load balancer's idle timeout.
If Node closes a pooled connection first, the proxy can send a request into a socket
that is already closing, and the client sees a sporadic, unreproducible 502.

Per-request deadlines belong on the outbound call, not the inbound one:

```js
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 3000);

try {
  const upstream = await fetch(url, { signal: controller.signal });
  res.json(await upstream.json());
} finally {
  clearTimeout(timer);
}
```

Why it matters:

Without an outbound timeout, one slow dependency consumes every worker. The service
stops responding to healthy routes too, and the whole app looks down because one
downstream is degraded.

## 22. How Do You Shut Down An Express Server Gracefully?

On deploy, the orchestrator sends `SIGTERM`. Exiting immediately kills in-flight
requests and returns 502s to real users.

```js
const server = app.listen(3000);
let shuttingDown = false;

app.get("/healthz", (req, res) => {
  res.status(shuttingDown ? 503 : 200).json({ ok: !shuttingDown });
});

process.on("SIGTERM", async () => {
  shuttingDown = true;                    // 1. fail readiness so traffic drains away
  server.close(async () => {              // 2. stop accepting, finish in-flight
    await db.end();                       // 3. close pools and brokers
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 15_000).unref(); // 4. hard cap
});
```

Priority order:

```viz
type: flow
title: Graceful shutdown sequence
Flip readiness to 503 :: the load balancer stops sending new requests
server.close() :: refuse new connections, let in-flight ones finish
Drain resources :: database pools, queue consumers, open streams
Forced exit timer :: never hang forever waiting on a stuck socket
```

Interview trap:

`server.close()` waits for **idle keep-alive connections** too, so without
`closeAllConnections()` or a forced-exit timer the process can hang until the
orchestrator SIGKILLs it — turning a graceful shutdown into a 30-second stall.

## 23. How Do You Scale An Express App Across CPU Cores?

Node runs your JavaScript on one thread, so a single process uses one core.

```js
import cluster from "node:cluster";
import { availableParallelism } from "node:os";

if (cluster.isPrimary) {
  for (let i = 0; i < availableParallelism(); i++) cluster.fork();
  cluster.on("exit", () => cluster.fork()); // replace dead workers
} else {
  app.listen(3000); // the OS load-balances accepts across workers
}
```

Tradeoff:

`cluster` is the zero-dependency option, but each worker has its own memory — so
in-memory caches, rate-limit counters, and sessions diverge immediately. In a
containerised deployment, running one process per container and scaling replicas is
usually simpler: the orchestrator already handles restarts, rollout, and placement.

When not to use it:

Clustering does not help a CPU-bound handler — it just gives you N slow cores instead
of one. Move that work to `worker_threads` or a queue.

Interview answer:

"Cluster inside the box, replicas outside it. Either way, the moment there is more
than one process, any state that matters has to move to Redis or the database."

## 24. What Are The Most Common Express Performance Mistakes?

```viz
type: queues
title: Ranked by how often they cause a real incident
Blocking the event loop :: sync crypto, JSON.parse of huge bodies, sync fs
No outbound timeouts :: one slow dependency exhausts every worker
N+1 queries in a loop :: 200 awaits inside a map over rows
Unbounded payloads :: no pagination, full objects where ids would do
Logging per request at debug :: serialisation and I/O on the hot path
```

The event-loop one, concretely:

```js
// Blocks every other request for the duration.
app.post("/login", (req, res) => {
  const hash = bcrypt.hashSync(req.body.password, 12); // ~250ms of pure CPU
  res.json({ hash });
});
```

```js
// Async variant yields to the loop between rounds.
app.post("/login", async (req, res) => {
  res.json({ hash: await bcrypt.hash(req.body.password, 12) });
});
```

How to find it:

```bash
node --prof app.js          # then: node --prof-process isolate-*.log
clinic doctor -- node app.js
```

Interview trap:

"Express is slow" is almost never true at application scale — the framework overhead
is tens of microseconds. The latency is in the database call, the serialisation, or
the blocked loop. Say that, then say how you would measure it.

## 25. How Do You Test An Express App?

`supertest` drives the app object directly — no port binding, no network.

```js
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp({ db: fakeDb }); // export a factory, not a listening server

test("rejects an invalid email", async () => {
  const res = await request(app)
    .post("/api/users")
    .send({ email: "nope", age: 30 })
    .expect(400);

  expect(res.body.error).toBe("Validation failed");
});

test("requires authentication", async () => {
  await request(app).get("/api/users").expect(401);
});
```

The rule:

Separate `app.js` (builds and returns the app) from `server.js` (calls `listen`).
Without that split, importing the app in a test starts a real server and leaves the
port bound after the suite ends.

Why this is good:

Route-level tests through `supertest` cover the middleware chain — auth, validation,
error shaping — which unit tests of the handler function alone silently skip. That
is where most Express bugs actually live.

## 26. How Should A Production Express Project Be Structured?

Express has no opinion, so pick one and hold it. Layer by responsibility, not by file
type:

```txt
src/
  app.js                 # builds the app: middleware + routers, no listen()
  server.js              # listen(), signals, graceful shutdown
  config/                # env parsing and validation, one source of truth
  middleware/            # auth, validate, requestId, errorHandler
  modules/
    users/
      users.routes.js    # HTTP only: parse, call service, send
      users.service.js   # business rules, no req/res anywhere
      users.repo.js      # SQL / ORM only
      users.schema.js    # zod schemas shared by routes and tests
  lib/                   # db client, logger, cache
```

The rule:

`req` and `res` never leave the routes layer. A service that takes `req` cannot be
called from a queue worker, a cron job, or a test without faking Express.

Important:

Validate environment variables at boot and fail fast:

```js
const env = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3000),
}).parse(process.env); // a missing secret crashes at startup, not at 2am
```

Interview answer:

"Routes translate HTTP to a call and back. Services own the business rules and know
nothing about HTTP. Repositories own the queries. That split is what lets the same
logic serve an HTTP route, a queue consumer, and a test with no duplication."

## 27. Express, Fastify, Koa, Or NestJS — How Do You Choose?

```viz
type: stack
title: What each one optimises for
Express :: ubiquity, middleware ecosystem, zero learning curve
Fastify :: throughput and schema-based serialisation, JSON Schema first
Koa :: minimal core, async/await-native middleware, bring everything else
NestJS :: structure, DI, and conventions for large teams — runs on Express or Fastify
```

Tradeoff:

Fastify's advantage is real but specific: compiled JSON Schema serialisation and a
faster router. On an endpoint dominated by a 20 ms database query, that difference is
invisible. On a high-throughput gateway returning cached JSON, it is significant.

When to use it:

- Small service, existing team knowledge, lots of middleware needed → Express.
- Throughput-sensitive, JSON-heavy, greenfield → Fastify.
- Large team, many modules, wants DI and enforced structure → NestJS.
- You want to assemble everything yourself from a tiny core → Koa.

Interview answer:

"Express for reach and hiring, Fastify when serialisation throughput is the
bottleneck, NestJS when the team is big enough that consistency matters more than
flexibility. Since NestJS runs on an Express adapter by default, that last choice is
about structure rather than performance."

## Sources Used

- <https://expressjs.com/en/guide/writing-middleware.html>
- <https://expressjs.com/en/guide/error-handling.html>
- <https://expressjs.com/en/guide/migrating-5.html>
- <https://expressjs.com/en/guide/behind-proxies.html>
- <https://expressjs.com/en/advanced/best-practice-security.html>
- <https://expressjs.com/en/advanced/best-practice-performance.html>
- <https://github.com/pillarjs/path-to-regexp>
- <https://nodejs.org/api/http.html#serverrequesttimeout>
- <https://nodejs.org/api/async_context.html>
