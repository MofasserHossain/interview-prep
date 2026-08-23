# Backend Interview Guide

Backend interview guidance covering fundamentals, production engineering, scaling, security, and senior-level distributed-system topics.


## 1. What Is The Role Of Backend Development?

Backend development handles the server-side part of an application. It manages business logic, authentication, authorization, database operations, APIs, background jobs, and security.

Frontend asks for data. Backend validates the request, applies business rules, talks to databases or services, and returns a response.

Example:

```txt
Frontend: POST /api/orders
Backend:
  - checks user authentication
  - validates cart items
  - calculates total
  - creates order in database
  - triggers payment/email workflow
```

Strong answer:

> The backend is responsible for the trusted part of the system. It protects data, enforces business rules, integrates with storage and external services, and exposes APIs that clients can use safely.

## 2. What Happens During An HTTP Request/Response Cycle?

An HTTP request starts when a client sends a request to a server. The request includes method, URL, headers, and optionally a body. The server processes it and returns a response with status code, headers, and optionally a body.

Example:

```http
GET /api/users/42 HTTP/1.1
Authorization: Bearer token
```

Response:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{ "id": 42, "name": "Asha" }
```

Important details:

- `2xx` means success.
- `4xx` means client error.
- `5xx` means server error.
- HTTPS encrypts the traffic.

## 3. Explain Common HTTP Methods.

`GET` fetches data and should not modify server state.

`POST` creates a resource or triggers an operation.

`PUT` replaces a resource and is usually idempotent.

`PATCH` partially updates a resource.

`DELETE` removes a resource and is usually idempotent.

Example:

```txt
GET    /users       -> list users
POST   /users       -> create user
GET    /users/1     -> get one user
PATCH  /users/1     -> update part of user
DELETE /users/1     -> delete user
```

## 4. What Are Common HTTP Status Codes?

Use status codes to make API behavior predictable.

```txt
200 OK                  request succeeded
201 Created             resource created
202 Accepted            long-running job accepted
204 No Content          success with no body
400 Bad Request         invalid input
401 Unauthorized        not authenticated
403 Forbidden           authenticated but not allowed
404 Not Found           resource not found
409 Conflict            conflict, duplicate, version issue
422 Unprocessable       validation failed
429 Too Many Requests   rate limit exceeded
500 Server Error        unexpected backend error
```

Example:

```js
if (!user) {
  return res.status(404).json({ message: "User not found" });
}
```

## 5. What Is An API Endpoint?

An API endpoint is a specific URL exposed by the backend for a particular operation.

Example:

```txt
GET /api/v1/courses
POST /api/v1/auth/login
PATCH /api/v1/users/:id
```

Good endpoints are resource-oriented, predictable, versioned when necessary, and secured.

## 6. What Is A RESTful API?

A RESTful API exposes resources using URLs and standard HTTP methods. It should be stateless, cacheable where possible, and use a uniform interface.

Example:

```txt
Resource: Course

GET    /courses
POST   /courses
GET    /courses/:id
PATCH  /courses/:id
DELETE /courses/:id
```

Senior note:

REST is simple and widely understood, but for complex data-fetching needs GraphQL can reduce over-fetching. REST is often easier to cache and operate.

## 7. SQL vs NoSQL Databases

SQL databases are relational and schema-based. They are strong for structured data, joins, transactions, and consistency.

Examples: PostgreSQL, MySQL, SQL Server.

NoSQL databases use flexible models like document, key-value, column-family, or graph.

Examples: MongoDB, Redis, Cassandra, DynamoDB.

Use SQL when:

- data has relationships
- transactions are important
- reporting and joins matter

Use NoSQL when:

- schema changes often
- horizontal scaling is important
- access pattern is simple and high-volume

## 8. What Is Database Indexing?

An index is a data structure that helps the database find rows faster without scanning the whole table.

Example:

```sql
CREATE INDEX idx_users_email ON users(email);
```

Query:

```sql
SELECT * FROM users WHERE email = 'test@example.com';
```

Without an index, the database may scan every row. With an index, it can find matching rows faster.

Tradeoff:

- faster reads
- slower writes because indexes must be updated
- extra storage

## 9. How Do You Optimize A Slow Query?

Steps:

1. Reproduce the slow query.
2. Check query plan with `EXPLAIN`.
3. Add or adjust indexes.
4. Avoid unnecessary joins and selected columns.
5. Fix N+1 queries.
6. Add pagination.
7. Cache if the data is read often and changes slowly.

Bad:

```sql
SELECT * FROM orders;
```

Better:

```sql
SELECT id, total, status
FROM orders
WHERE user_id = ?
ORDER BY created_at DESC
LIMIT 20;
```

## 10. What Are ACID Transactions?

ACID describes reliable database transactions.

```txt
Atomicity    all operations succeed or all fail
Consistency database remains valid
Isolation    concurrent transactions do not corrupt each other
Durability   committed data survives failure
```

Example: money transfer.

```txt
Deduct $100 from account A
Add $100 to account B
```

Both operations must succeed together. If one fails, the whole transaction rolls back.

## 11. Authentication vs Authorization

Authentication verifies identity.

```txt
Who are you?
```

Authorization checks permissions.

```txt
Are you allowed to do this?
```

Example:

```js
app.delete("/admin/users/:id", authMiddleware, requireRole("ADMIN"), deleteUser);
```

The user must be logged in and must have the `ADMIN` role.

## 12. JWT vs Session-Based Authentication

Session auth stores session data on the server, often in Redis or a database. The client stores only a session ID in a cookie.

JWT stores signed claims in the token itself. The backend verifies the signature without looking up session state every time.

Session advantages:

- easy revocation
- server controls state
- good with secure HTTP-only cookies

JWT advantages:

- stateless verification
- useful for distributed systems
- works well for API/mobile clients

JWT caution:

If a JWT is stolen, it may remain valid until expiry unless you maintain a blacklist or token versioning.

## 13. What Is Middleware?

Middleware is a function that runs during the request-response lifecycle. It can log, validate, authenticate, transform, or handle errors.

Example:

```js
function authMiddleware(req, res, next) {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ message: "Missing token" });
  }

  next();
}
```

Common middleware:

- authentication
- request validation
- logging
- rate limiting
- error handling
- CORS

## 14. How Should Backend Error Handling Work?

Use centralized error handling so responses are consistent and sensitive data is not leaked.

Example:

```js
app.use((err, req, res, next) => {
  console.error(err);

  res.status(err.statusCode || 500).json({
    message: err.publicMessage || "Internal server error",
  });
});
```

Do not expose stack traces to users in production.

Good pattern:

- validate expected errors
- throw structured errors
- log internal details
- return safe public messages

## 15. How Do You Validate Input?

Never trust client input. Validate body, params, query, files, and headers where needed.

Example with Zod:

```js
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const result = schema.safeParse(req.body);

if (!result.success) {
  return res.status(422).json({ message: "Invalid input" });
}
```

Validation prevents bugs, bad data, injection attacks, and unexpected runtime errors.

## 16. How Do You Prevent SQL Injection?

SQL injection happens when user input is inserted into SQL as raw text.

Bad:

```js
const sql = `SELECT * FROM users WHERE email = '${email}'`;
```

Better:

```js
const sql = "SELECT * FROM users WHERE email = ?";
db.query(sql, [email]);
```

Also use:

- ORM or query builder
- input validation
- least-privilege DB user
- no raw string concatenation

## 17. What Is Rate Limiting?

Rate limiting restricts how many requests a client can make in a time window. It protects against brute force, scraping, accidental loops, and denial-of-service pressure.

Example:

```txt
Allow 100 requests per IP per minute.
If exceeded, return 429 Too Many Requests.
```

Common algorithms:

- fixed window
- sliding window
- token bucket
- leaky bucket

Use Redis for distributed rate limiting across multiple servers.

## 18. What Is Caching?

Caching stores frequently used data in a faster layer to reduce latency and database load.

Example:

```js
const cached = await redis.get(`user:${id}`);
if (cached) return JSON.parse(cached);

const user = await db.users.findById(id);
await redis.set(`user:${id}`, JSON.stringify(user), "EX", 300);
return user;
```

Cache challenges:

- stale data
- invalidation
- memory size
- cache stampede

Common strategies:

- cache-aside
- write-through
- write-back
- TTL-based expiration

## 19. What Is Load Balancing?

Load balancing distributes traffic across multiple servers.

```txt
Client
  -> Load Balancer
      -> App Server 1
      -> App Server 2
      -> App Server 3
```

Algorithms:

- round robin
- least connections
- weighted round robin
- IP hash

Senior note:

Load balancers should perform health checks and stop sending traffic to unhealthy instances.

## 20. Vertical Scaling vs Horizontal Scaling

Vertical scaling means increasing one server's resources.

```txt
4GB RAM -> 32GB RAM
2 CPU -> 16 CPU
```

Horizontal scaling means adding more servers.

```txt
1 app server -> 5 app servers
```

Horizontal scaling is usually better for high availability, but the app must be stateless or use shared state like Redis/database.

## 21. What Does Stateless Backend Mean?

A stateless backend does not store request-specific user state in local memory. Every request contains enough information to be processed.

Bad:

```js
const sessions = {};
```

This breaks when multiple servers are used.

Better:

```txt
Store sessions in Redis, database, or use signed tokens.
```

Stateless services are easier to scale horizontally.

## 22. What Are Message Queues?

A message queue stores work to be processed asynchronously by workers.

Example:

```txt
API receives order
  -> saves order
  -> publishes "send email" job
  -> returns response

Worker later sends email
```

Tools:

- RabbitMQ
- Kafka
- Amazon SQS
- BullMQ with Redis

Use queues for:

- emails
- video processing
- reports
- notifications
- retries
- long-running tasks

## 23. How Do You Handle Long-Running Requests?

Do not keep an HTTP request open for a long task.

Better approach:

1. Accept the request.
2. Create a job.
3. Return `202 Accepted`.
4. Process in background.
5. Notify the client or allow polling.

Example:

```json
{
  "jobId": "job_123",
  "status": "queued"
}
```

The frontend can poll:

```txt
GET /jobs/job_123
```

## 24. What Are Webhooks?

Webhooks are server-to-server HTTP callbacks triggered by events.

Example:

```txt
Stripe payment succeeded
  -> Stripe POSTs to /webhooks/stripe
  -> backend verifies signature
  -> backend marks order as paid
```

Rules:

- verify signatures
- make processing idempotent
- respond quickly with `2xx`
- process heavy work through a queue
- handle retries

Idempotency example:

```js
if (await alreadyProcessed(event.id)) {
  return res.status(200).send("ok");
}
```

## 25. What Are WebSockets?

WebSockets provide a persistent two-way connection between client and server.

Use cases:

- chat
- live notifications
- collaborative editing
- stock tickers
- dashboards

HTTP request/response is client-initiated. WebSocket allows the server to push messages any time after connection.

Tradeoffs:

- harder to scale than normal HTTP
- requires connection management
- often needs pub/sub behind multiple servers

## 26. How Do You Design A Notification System?

A basic scalable notification system uses asynchronous processing.

```txt
User action
  -> API creates notification event
  -> Queue
  -> Workers
      -> email
      -> SMS
      -> push notification
      -> in-app notification table
```

Important concerns:

- retries
- user preferences
- unsubscribe rules
- deduplication
- rate limits
- provider failures

## 27. How Do Database Migrations Work In Production?

Database migrations change schema over time. In production, migrations should be safe and backward-compatible.

Bad deployment:

```txt
Remove column -> old app still reads it -> production breaks
```

Safer rollout:

```txt
1. Add new nullable column.
2. Deploy app that writes both old and new fields.
3. Backfill data.
4. Deploy app that reads new field.
5. Remove old field later.
```

This is called expand-and-contract migration.

## 28. How Do You Deploy Backend Services?

Good deployment flow:

```txt
Git push
  -> CI runs lint/tests
  -> build artifact or Docker image
  -> deploy to staging
  -> run smoke tests
  -> deploy to production
  -> monitor
```

Use:

- environment variables
- secret manager
- rollback strategy
- health checks
- logs and metrics
- staging environment

## 29. What Is Containerization?

Containerization packages an application with its runtime and dependencies so it runs consistently across environments.

Example Dockerfile:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["node", "server.js"]
```

Benefits:

- consistent environments
- easier deployment
- isolation
- works well with Kubernetes or ECS

## 30. How Do You Ensure Fault Tolerance?

Fault tolerance means the system continues working when parts fail.

Use:

- redundancy
- retries with exponential backoff
- circuit breakers
- load balancing
- health checks
- database replication
- queues
- backups
- graceful degradation
- monitoring and alerting

Example:

If email provider fails, store the email job in a queue and retry later instead of failing the user signup.

---


## 31. Monolith vs Microservices

A monolith keeps the application in one deployable unit. It is easier to develop, test, and debug early.

Microservices split the system into independent services by business capability.

Benefits:

- independent scaling
- independent deployment
- team ownership

Drawbacks:

- network failures
- distributed tracing needed
- harder data consistency
- more DevOps complexity

Strong answer:

> I would not start with microservices unless the team and domain boundaries justify it. A modular monolith is often better first. Extract services when scaling, team ownership, or deployment independence becomes a real need.

## 32. CAP Theorem

CAP says a distributed data system cannot fully guarantee all three during a network partition:

```txt
C = Consistency
A = Availability
P = Partition tolerance
```

In real distributed systems, partitions can happen, so systems usually choose between stronger consistency or higher availability during failure.

Example:

- banking may prefer consistency
- social feed may accept eventual consistency

## 33. Eventual Consistency

Eventual consistency means data may temporarily differ across nodes, but it will become consistent later.

Example:

After a user updates their profile photo, one region may show the old photo for a short time while replication completes.

Use it when availability and latency matter more than immediate consistency.

## 34. Correlation IDs

A correlation ID is a unique ID attached to a request and passed across services.

Example:

```txt
X-Request-ID: req_abc123
```

Every service logs it so engineers can trace one user request across distributed systems.

## 35. Optimistic vs Pessimistic Locking

Optimistic locking assumes conflicts are rare. It checks a version before saving.

Example:

```sql
UPDATE products
SET stock = 9, version = version + 1
WHERE id = 1 AND version = 3;
```

If no row updates, another transaction changed it.

Pessimistic locking locks data early.

```sql
SELECT * FROM products WHERE id = 1 FOR UPDATE;
```

Use optimistic locking for high-read, low-conflict systems. Use pessimistic locking when conflicts are common or correctness is critical.

---

