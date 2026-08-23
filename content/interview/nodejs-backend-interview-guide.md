# Node.js Backend Interview Guide

Practical Node.js backend interview questions covering async behavior, Redis,
HTTP vs WebSocket, microservices, middleware, Docker, RabbitMQ, secure backend
design, code reuse, and MVC architecture.

## 1. Difference Between Callback And Promise

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

## 2. What Issues Can Callback-Based Code Create?

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

## 3. Is Async/Await Synchronous Or Asynchronous?

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

## 4. Why Do We Use Redis?

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

## 5. Difference Between HTTP And WebSocket

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

## 6. What Is Microservice And Why Do We Need It?

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

## 7. What Is Middleware?

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

## 8. How Do You Work With Docker In A Node.js Backend?

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

## 9. How Do You Work With RabbitMQ?

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

## 10. What Is Your Approach To Create A Secure Backend Application?

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

## 11. How Do You Improve Code Reusability In A Backend?

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

## 12. What Is MVC Architecture?

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

- <https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick>
- <https://expressjs.com/en/guide/using-middleware/>
- <https://redis.io/docs/latest/develop/>
- <https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API>
- <https://docs.docker.com/guides/nodejs/>
- <https://www.rabbitmq.com/tutorials/tutorial-two-javascript>
- <https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html>
