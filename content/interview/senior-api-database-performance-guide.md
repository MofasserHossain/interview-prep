# API Optimization & Database Performance Interview Guide

Backend preparation for practical API optimization, REST API contracts, query
performance, caching, pagination, payload design, relational modeling,
transactions, and production latency troubleshooting.

## 1. How Do You Design A Production REST API?

Start from resources, user workflows, and the contract clients need.

Example for a SaaS marketplace:

```txt
GET    /api/v1/work-orders
POST   /api/v1/work-orders
GET    /api/v1/work-orders/:id
PATCH  /api/v1/work-orders/:id
POST   /api/v1/work-orders/:id/assignments
POST   /api/v1/work-orders/:id/cancel
```

Good API design includes:

| Concern | Practice |
| --- | --- |
| Resource names | Use nouns and stable URLs. |
| Status codes | Use `201`, `400`, `401`, `403`, `404`, `409`, `422`, `429` consistently. |
| Validation | Validate body, params, query, headers, and files. |
| Auth | Authenticate identity and authorize per resource. |
| Pagination | Avoid unbounded list responses. |
| Errors | Return predictable error shapes. |
| Compatibility | Avoid breaking clients without versioning or migration. |

Strong answer:

> I design REST APIs as contracts. The happy path matters, but validation,
> authorization, errors, retries, pagination, and compatibility are what make
> the API reliable in production.

## 2. What Should A Good API Error Response Look Like?

A consistent error shape helps frontend, mobile, logging, and support teams.

```json
{
  "error": {
    "code": "WORK_ORDER_NOT_FOUND",
    "message": "Work order was not found.",
    "requestId": "req_01J9H5S2Q8",
    "details": {
      "workOrderId": "wo_123"
    }
  }
}
```

Validation error:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request body is invalid.",
    "fields": {
      "email": "Email is required.",
      "startDate": "Start date must be in the future."
    }
  }
}
```

Benefits:

| Benefit | Why it matters |
| --- | --- |
| `code` | Frontend can handle specific cases safely. |
| `message` | Human-readable summary. |
| `requestId` | Connects user issues to logs and traces. |
| `fields` | Supports form-level error display. |

## 3. How Do You Optimize API Performance?

API performance means reducing latency, backend work, database load, payload
size, and avoidable network round trips while keeping correctness.

Good optimization checklist:

1. Measure first with logs, traces, metrics, and slow-query data
2. Reduce unnecessary database work
3. Select only needed fields
4. Avoid N+1 queries
5. Add pagination to list endpoints
6. Cache frequently read data with clear freshness rules
7. Move long-running work to background jobs
8. Compress large responses when appropriate
9. Add rate limits to expensive endpoints
10. Monitor p95 and p99 latency, not only average latency

Example:

```txt
Slow API:
  GET /api/orders
  -> loads every order
  -> selects every column
  -> queries user for each order
  -> returns huge JSON

Optimized API:
  GET /api/orders?limit=20&after=cursor
  -> filters by current user
  -> selects only list fields
  -> joins needed user data once
  -> returns compact paginated response
```

Strong answer:

> I optimize APIs by measuring the bottleneck first. Then I reduce database
> work, avoid over-fetching, paginate lists, cache stable reads, and move slow
> side effects out of the request path.

## 4. Why Should APIs Select Only Needed Data And Reduce Payload Size?

Selecting only needed data reduces database work, memory usage, serialization
cost, network payload size, and frontend parsing time.

Bad API behavior:

```sql
SELECT * FROM users WHERE id = ?;
```

If the page only needs name and avatar, this may send unnecessary fields such as
preferences, internal flags, timestamps, or large text columns.

Better:

```sql
SELECT id, name, avatar_url
FROM users
WHERE id = ?;
```

Response shape:

```json
{
  "id": "usr_123",
  "name": "Asha",
  "avatarUrl": "https://cdn.example.com/avatar.png"
}
```

Ways to reduce payloads:

1. Select only needed fields
2. Paginate list endpoints
3. Avoid embedding large nested objects by default
4. Compress large responses with gzip or Brotli
5. Use CDN-hosted media URLs instead of embedding binary data
6. Return summaries in list endpoints and details in detail endpoints
7. Avoid repeated metadata in every item when one top-level field is enough

Tradeoff:

Too many tiny endpoints can create extra round trips. Good API design balances
payload size with practical client workflows.

## 5. Offset Pagination vs Cursor Pagination

Pagination limits how much data an API returns at once.

Offset pagination:

```txt
GET /api/orders?page=5&limit=20
```

SQL:

```sql
SELECT id, total, created_at
FROM orders
ORDER BY created_at DESC
LIMIT 20 OFFSET 80;
```

Cursor pagination:

```txt
GET /api/orders?limit=20&after=2026-08-25T10:30:00Z_ord_123
```

SQL:

```sql
SELECT id, total, created_at
FROM orders
WHERE (created_at, id) < (?, ?)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

Comparison:

| Type | Best for | Tradeoff |
| --- | --- | --- |
| Offset | Small tables, admin screens, jumping to page numbers. | Slow for deep pages and unstable when rows change. |
| Cursor | Feeds, activity logs, orders, infinite scroll, large datasets. | More complex cursors and sorting rules. |

Strong answer:

> I use offset pagination for simple small lists. For large or frequently
> changing lists, I prefer cursor pagination because it avoids deep-offset scans
> and reduces duplicate or missing rows while data changes.

## 6. How Should You Use Caching For API Performance?

Use caching when data is read often, expensive to compute, and can tolerate a
clear freshness policy.

Cache layers:

- Browser cache for static assets and public GET responses
- CDN cache for public or edge-cacheable content
- Application cache for computed results
- Redis or Memcached for shared server-side cache
- Database cache or materialized views for expensive reads

Cache-aside flow:

```txt
Request
  -> check cache
  -> cache hit: return data
  -> cache miss: query database
  -> save result with TTL
  -> return data
```

Important cache decisions:

| Decision | Why it matters |
| --- | --- |
| Cache key | Prevents mixing users, tenants, filters, or permissions. |
| TTL | Controls freshness and memory pressure. |
| Invalidation | Removes stale data when writes happen. |
| Stampede protection | Prevents many requests rebuilding the same cache. |

Interview note:

> Cache only after understanding correctness. A fast stale or unauthorized
> response is worse than a slow correct response.

## 7. How Do You Improve Query Performance With Indexes And EXPLAIN?

Query performance starts with understanding how the database executes the query.
Do not guess blindly.

Steps:

1. Identify the slow endpoint and exact query
2. Run `EXPLAIN` or `EXPLAIN ANALYZE`
3. Check whether indexes are used
4. Filter early with selective `WHERE` clauses
5. Avoid unnecessary joins
6. Avoid `SELECT *`
7. Paginate large result sets
8. Watch for N+1 query patterns

Example:

```sql
EXPLAIN
SELECT id, title, status, created_at
FROM work_orders
WHERE company_id = 42
  AND status = 'open'
ORDER BY created_at DESC
LIMIT 20;
```

Possible index:

```sql
CREATE INDEX idx_work_orders_company_status_created
ON work_orders (company_id, status, created_at DESC);
```

Why this helps:

| Query part | Index support |
| --- | --- |
| `company_id = 42` | First equality filter. |
| `status = 'open'` | Second equality filter. |
| `ORDER BY created_at DESC` | Uses index order after filtering. |
| `LIMIT 20` | Can stop early. |

Tradeoff:

> Indexes improve reads, but each index adds write cost and storage overhead.
> Add indexes for real access patterns, not every column.

## 8. How Do You Avoid N+1 Query Problems?

N+1 happens when code loads one list and then performs one extra query per row.

Bad:

```ts
const orders = await db.order.findMany();

for (const order of orders) {
  order.customer = await db.customer.findById(order.customerId);
}
```

If there are 100 orders, this becomes 101 queries.

Better:

```ts
const orders = await db.order.findMany({
  include: {
    customer: true,
  },
});
```

Or batch manually:

```ts
const orders = await db.order.findMany();
const customerIds = [...new Set(orders.map((order) => order.customerId))];
const customers = await db.customer.findMany({ where: { id: { in: customerIds } } });
```

Other fixes:

- Use joins or eager loading intentionally
- Batch lookups by IDs
- Use DataLoader-style batching in GraphQL
- Denormalize read-heavy fields carefully
- Add monitoring for query counts on list endpoints

Tradeoff:

Avoiding N+1 does not mean joining everything. Load only relationships needed
by that endpoint.

## 9. What Is Idempotency And Why Does It Matter?

Idempotency means repeating the same request has the same effect as doing it
once.

This matters for:

- Payment requests
- Order creation
- Assignment creation
- Retries after timeout
- Mobile clients with unstable networks

Example:

```http
POST /api/v1/payments
Idempotency-Key: pay_01J9H5
Content-Type: application/json

{ "invoiceId": "inv_123", "amount": 5000 }
```

Backend behavior:

```txt
1. Check idempotency key.
2. If key already completed, return original response.
3. If key is new, process request.
4. Store result for that key.
```

Strong answer:

> Idempotency protects users from duplicate side effects when clients retry
> after a timeout or network failure.

## 10. How Do You Secure A Backend API?

Use layered security.

| Layer | Practice |
| --- | --- |
| Transport | HTTPS everywhere. |
| Authentication | Verify token/session and expiry. |
| Authorization | Check user permission for the specific resource. |
| Input validation | Reject unexpected body, params, query, headers, and files. |
| SQL safety | Parameterized queries or safe ORM usage. |
| Rate limiting | Protect login, search, and expensive endpoints. |
| Secrets | Keep secrets in secret manager or environment, never in code. |
| Audit | Log sensitive business actions. |

Example authorization check:

```ts
async function getWorkOrderForUser(userId: string, workOrderId: string) {
  const workOrder = await db.workOrder.findFirst({
    where: {
      id: workOrderId,
      OR: [{ ownerId: userId }, { assignedTechnicianId: userId }],
    },
  });

  if (!workOrder) {
    throw new ForbiddenError("You cannot access this work order.");
  }

  return workOrder;
}
```

Interview note:

> Authentication answers who the user is. Authorization answers whether that
> user can perform this specific action on this specific resource.

## 11. How Do You Model Relational Data For A SaaS Marketplace?

Example tables:

```txt
companies
users
technicians
work_orders
assignments
invoices
payments
messages
audit_logs
```

Important modeling choices:

| Concern | Practice |
| --- | --- |
| Tenant isolation | Include `company_id` or tenant boundary in tenant-owned tables. |
| Ownership | Define who owns each record. |
| Status | Use explicit status fields and transitions. |
| Audit | Store who changed important business data and when. |
| Money | Use integer minor units, not floating point. |
| Soft delete | Use carefully; it affects indexes and queries. |

Example:

```sql
CREATE TABLE work_orders (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```

Strong answer:

> I model the database around business invariants: ownership, tenant boundary,
> status transitions, audit requirements, and query access patterns.

## 12. How Do Transactions And Locking Protect Correctness?

Transactions group changes so they succeed or fail together.

Example:

```sql
BEGIN;

UPDATE work_orders
SET status = 'assigned'
WHERE id = 123
  AND status = 'open';

INSERT INTO assignments (work_order_id, technician_id)
VALUES (123, 456);

COMMIT;
```

Concurrency issue:

```txt
Two technicians accept the same work order at the same time.
```

Fix options:

| Option | Use when |
| --- | --- |
| Conditional update | Simple state transition protection. |
| Unique constraint | Prevent duplicate rows. |
| Row lock | Need to read-modify-write safely. |
| Optimistic version | Good for user-edited records. |

Strong answer:

> Correctness should not rely only on application checks. The database should
> enforce critical invariants with constraints, transactions, and locking where
> needed.

## 13. Which API Optimizations Should You Avoid Doing Too Early?

Optimization should be guided by real bottlenecks.

Avoid premature optimization:

- Caching every endpoint without invalidation rules
- Adding indexes without checking query plans
- Denormalizing data before access patterns are clear
- Replacing simple pagination with complex cursor logic for tiny tables
- Adding queues when the request is already fast enough
- Compressing small responses where CPU cost may outweigh benefit

Good order:

1. Measure
2. Identify the slowest user-facing path
3. Fix obvious inefficient queries or payloads
4. Add indexes and pagination
5. Cache stable reads
6. Move slow side effects to background jobs
7. Monitor after the change

Strong answer:

> I optimize based on evidence. First I measure latency and query behavior,
> then I make the simplest change that reduces real user-facing cost without
> making correctness harder.

## 14. How Do You Troubleshoot High API Latency?

Use a layered investigation.

```txt
Client timing
  -> CDN/load balancer timing
  -> API route timing
  -> database query timing
  -> cache hit/miss
  -> external service calls
  -> queue/job backlog
```

Checklist:

| Area | What to inspect |
| --- | --- |
| API | p95/p99 latency, error rate, route breakdown. |
| Database | Slow query log, query plan, locks, connection pool. |
| Cache | Hit ratio, key size, TTL, Redis latency. |
| Network | External API latency, DNS, load balancer. |
| App code | Expensive loops, serialization, N+1, synchronous blocking. |
| Infra | CPU, memory, throttling, pod restarts. |

Strong answer:

> I separate where the time is spent before changing code. A slow endpoint can
> be database, cache, network, serialization, queue pressure, or infrastructure.

## Sources Used

- <https://www.postgresql.org/docs/current/using-explain.html>
- <https://www.postgresql.org/docs/current/indexes.html>
- <https://dev.mysql.com/doc/refman/8.1/en/using-explain.html>
- <https://dev.mysql.com/doc/refman/8.1/en/select-optimization.html>
