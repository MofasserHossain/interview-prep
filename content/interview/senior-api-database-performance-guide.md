# Senior API And Database Performance Interview Guide

Senior backend preparation for REST API design, service contracts, validation,
idempotency, SQL modeling, indexing, query plans, transactions, and production
troubleshooting.

## 1. How do you design a production REST API?

Start from resources and user workflows.

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
> auth, errors, retries, pagination, and compatibility are what make the API
> reliable in production.

## 2. What should a good API error response look like?

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
| `requestId` | Connects user issue to logs/traces. |
| `fields` | Supports form-level error display. |

## 3. Offset pagination vs cursor pagination: when do you use each?

Offset pagination is simple:

```txt
GET /api/v1/work-orders?page=3&limit=20
```

But large or frequently changing datasets can become slow or inconsistent.

Cursor pagination:

```txt
GET /api/v1/work-orders?limit=20&after=eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTI0In0
```

Example SQL idea:

```sql
SELECT id, title, created_at
FROM work_orders
WHERE created_at < ?
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

Comparison:

| Type | Best for | Tradeoff |
| --- | --- | --- |
| Offset | Small admin tables, simple UI pages. | Slow for deep pages and changing data. |
| Cursor | Feeds, logs, orders, large lists. | More implementation complexity. |

Strong answer:

> For large SaaS lists, I prefer cursor pagination because it scales better and
> avoids skipping/duplicating records while data changes.

## 4. What is idempotency and why does it matter?

Idempotency means repeating the same request has the same effect as doing it
once.

This matters for:

- payment requests
- order creation
- assignment creation
- retries after timeout
- mobile clients with unstable networks

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

## 5. How do you secure a backend API?

Use layered security.

| Layer | Practice |
| --- | --- |
| Transport | HTTPS everywhere. |
| Authentication | Verify token/session and expiry. |
| Authorization | Check user permission for the specific resource. |
| Input validation | Reject unexpected body, params, query, files. |
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

## 6. How do you model relational data for a SaaS marketplace?

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

## 7. How do you use indexes and EXPLAIN to optimize a query?

Start with the actual slow query.

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

## 8. What is the N+1 query problem?

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

Strong answer:

> N+1 is often invisible in small local datasets. I watch query count in logs
> and use joins, eager loading, or batching when a list endpoint expands related
> data.

## 9. How do transactions and locking protect correctness?

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

## 10. How do you troubleshoot high API latency?

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
| Database | slow query log, query plan, locks, connection pool. |
| Cache | hit ratio, key size, TTL, Redis latency. |
| Network | external API latency, DNS, load balancer. |
| App code | expensive loops, serialization, N+1, synchronous blocking. |
| Infra | CPU, memory, throttling, pod restarts. |

Strong answer:

> I separate where the time is spent before changing code. A slow endpoint can
> be database, cache, network, serialization, queue pressure, or infrastructure.

## Sources Used

- <https://www.postgresql.org/docs/current/using-explain.html>
- <https://www.postgresql.org/docs/current/indexes.html>
- <https://dev.mysql.com/doc/refman/8.1/en/using-explain.html>
- <https://dev.mysql.com/doc/refman/8.1/en/select-optimization.html>
