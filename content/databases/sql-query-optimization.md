# SQL Query Optimization Interview Guide

Query tuning guidance organised as a decision tool rather than a tip list. Every
optimization below follows the same shape: the symptom you observe, the plan
before, why the planner chose it, the fix, the plan after, when the fix applies,
and when it makes things worse. Examples target MySQL 8 with notes where
PostgreSQL differs.

The working schema:

```sql
users  (id, email, country, created_at)                    -- 800k rows
orders (id, user_id, status, total, created_at)            -- 12m rows
```

## 1. How Do You Approach A Slow Query?

Never start by adding indexes. Start by measuring, because the plan tells you which
of the four categories the problem is in.

Interview method:

1. **Reproduce** — get the exact query and realistic parameters
2. **Measure** — `EXPLAIN ANALYZE` to see the real plan and actual timings
3. **Find the worst node** — the one where estimated and actual rows diverge, or
   where time concentrates
4. **Classify** — is it retrieval, predicates and indexes, joins, or sorting?
5. **Change one thing** — apply a single fix
6. **Re-measure** — confirm with the plan, not with a stopwatch

```sql
EXPLAIN ANALYZE
SELECT o.id, o.total
FROM   orders o
WHERE  o.user_id = 42 AND o.status = 'paid';
```

The four categories, which the rest of this guide follows:

```txt
1. Refine data retrieval   reading columns and rows you do not need
2. Indexes and predicates  the planner cannot use an index that exists
3. Joins and subqueries    the wrong join strategy, or work repeated per row
4. Sorting and aggregation sorting or deduplicating more than necessary
```

Important:

Find the slow queries before tuning any of them. The slow query log and
`performance_schema` tell you what actually hurts, which is rarely the query
someone complained about.

```sql
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 0.5;
```

```sql
SELECT digest_text, count_star, avg_timer_wait / 1e9 AS avg_ms
FROM   performance_schema.events_statements_summary_by_digest
ORDER  BY avg_timer_wait DESC
LIMIT  10;
```

Strong answer:

> I never guess at indexes. I get the plan with `EXPLAIN ANALYZE`, find the node
> where actual rows blow past the estimate, and classify the problem as retrieval,
> predicates, joins, or sorting. Then I change one thing and re-read the plan.

## 2. How Do You Read A MySQL `EXPLAIN` Plan?

```sql
EXPLAIN
SELECT u.email, o.total
FROM   users u
JOIN   orders o ON o.user_id = u.id
WHERE  u.country = 'BD' AND o.status = 'paid';
```

Query plan:

```txt
+----+-------+--------+---------------+---------+---------+--------+-------------+
| id | table | type   | possible_keys | key     | key_len | rows   | Extra       |
+----+-------+--------+---------------+---------+---------+--------+-------------+
|  1 | u     | ALL    | NULL          | NULL    | NULL    | 800000 | Using where |
|  1 | o     | ref    | idx_user      | idx_user| 8       |     14 | Using where |
+----+-------+--------+---------------+---------+---------+--------+-------------+
```

The columns that matter:

| Column | Read it as |
| --- | --- |
| `type` | the access method — the single most important field |
| `key` | the index actually chosen; `NULL` means none |
| `rows` | estimated rows examined **per iteration** |
| `filtered` | percentage of those rows surviving the `WHERE` |
| `Extra` | `Using filesort` and `Using temporary` are the red flags |

Reading this plan: `users` is scanned in full — 800,000 rows, no index — and for
each surviving row the `orders` index is probed. The fix is an index on
`users.country`.

`EXPLAIN ANALYZE` adds what actually happened:

```txt
-> Nested loop inner join  (actual time=0.31..2840 rows=94021 loops=1)
    -> Table scan on u  (cost=81234 rows=800000)
                        (actual time=0.09..612 rows=800000 loops=1)
    -> Index lookup on o using idx_user  (actual time=0.002..0.02 rows=1 loops=800000)
```

Important:

`loops=800000` is the tell. An index lookup taking 0.02ms is fast, but running it
800,000 times is not. Multiply before concluding a node is cheap.

Interview note:

The biggest gap between `rows` (estimated) and `actual rows` points at stale
statistics. Run `ANALYZE TABLE orders;` before concluding the planner is wrong.

PostgreSQL differs:

`EXPLAIN (ANALYZE, BUFFERS)` prints a node tree read bottom-up, with `Seq Scan`,
`Index Scan`, `Hash Join`, and buffer hit counts. The reasoning is identical; only
the format changes.

## 3. What Do The `EXPLAIN` Access Types Mean?

The `type` column, from best to worst:

| `type` | Meaning | Verdict |
| --- | --- | --- |
| `const` | at most one row, via primary or unique key | ideal |
| `eq_ref` | one row per row of the previous table | ideal for joins |
| `ref` | several rows via a non-unique index | good |
| `range` | an index range: `>`, `BETWEEN`, `IN` | good |
| `index` | **full scan of the index** | suspicious |
| `ALL` | **full table scan** | usually the problem |

```txt
const > eq_ref > ref > range > index > ALL
```

Interview trap:

`index` looks reassuring but means the entire index was scanned, not that an index
lookup happened. It is only acceptable when paired with `Using index` on a small
index that covers the query.

`Extra` values worth recognising:

| `Extra` | Meaning |
| --- | --- |
| `Using index` | covering index — the table was never touched. Good. |
| `Using where` | rows filtered after retrieval. Normal. |
| `Using index condition` | index condition pushdown. Good. |
| `Using filesort` | an explicit sort was required. Investigate. |
| `Using temporary` | an internal temp table was built. Investigate. |
| `Using join buffer` | no usable index on the join. Fix this. |

When to accept `ALL`:

On a small table. Scanning 500 rows sequentially is faster than an index lookup
plus a bookmark lookup, and the planner knows that. Chasing `ALL` on a lookup table
wastes an index.

## 4. Why Is `SELECT *` A Problem?

Symptom:

An endpoint is slow despite a perfectly good index on its `WHERE` clause.

```sql
SELECT * FROM orders WHERE user_id = 42 AND status = 'paid';
```

Plan before:

```txt
| table  | type | key             | rows | Extra       |
| orders | ref  | idx_user_status |   14 | Using where |
```

Why:

The index finds the 14 rows, but every column must be fetched from the clustered
index — a bookmark lookup per row. Wide columns such as `TEXT` or `JSON` are read
and sent over the network even when unused.

Fix:

```sql
SELECT id, total FROM orders WHERE user_id = 42 AND status = 'paid';

CREATE INDEX idx_user_status_total ON orders (user_id, status, total);
```

Plan after:

```txt
| table  | type | key                   | rows | Extra       |
| orders | ref  | idx_user_status_total |   14 | Using index |
```

`Using index` means the query was answered from the index alone.

When to use it:

Any hot query, especially one on a table with wide columns, and any query you want
a covering index to serve.

When not to use it:

`SELECT *` in ad-hoc exploration is fine. The cost is in repeated application
queries, not in a one-off at the console.

Edge cases:

`SELECT *` also makes code fragile: adding a column silently changes result shape,
and `SELECT *` with a `JOIN` produces duplicate column names.

## 5. How Do You Make Pagination Fast At Scale?

Symptom:

Page 1 is instant. Page 5,000 takes seconds.

```sql
SELECT id, title FROM posts ORDER BY created_at DESC LIMIT 20 OFFSET 100000;
```

Plan before:

```txt
| table | type  | key         | rows   | Extra |
| posts | index | idx_created | 100020 |       |
```

Why:

`OFFSET` does not skip rows cheaply. The database generates and discards all
100,000 rows, then returns the next 20. Cost grows linearly with page number.

Fix — keyset (cursor) pagination, remembering the last row instead of counting:

```sql
SELECT id, title, created_at
FROM   posts
WHERE  (created_at, id) < (?, ?)      -- last row of the previous page
ORDER  BY created_at DESC, id DESC
LIMIT  20;
```

Plan after:

```txt
| table | type  | key             | rows | Extra |
| posts | range | idx_created_id  |   20 |       |
```

Constant cost — page 5,000 is as fast as page 1.

```sql
CREATE INDEX idx_created_id ON posts (created_at DESC, id DESC);
```

The tie-breaker column is not optional: without `id`, rows sharing a `created_at`
are skipped or repeated across page boundaries.

When to use it:

Infinite scroll, feeds, timelines, exports, any API where deep pages are reachable.

When not to use it:

When users must jump to an arbitrary page number. Keyset pagination has no concept
of "page 37" — it only moves forward and backward from a known row.

Edge cases:

- **Total count** — keyset gives no total. Use an approximate count, or drop the
  total entirely, which is what large feeds do.
- **Non-unique sort column** — always append a unique tie-breaker.
- **Jumping** — offer "first page" and "last page" as sorts rather than as offsets.

Tradeoff:

Keyset pagination is strictly faster and slightly harder to build, and it changes
the API contract from a page number to an opaque cursor.

## 6. How Do You Reduce The Rows A Query Examines?

The cheapest work is work that never happens. Filter as early and as selectively as
possible.

```sql
-- Bad example: aggregates the whole table, then discards
SELECT user_id, SUM(total) AS revenue
FROM   orders
GROUP  BY user_id
HAVING user_id = 42;

-- Better: filters before grouping, using the index
SELECT user_id, SUM(total) AS revenue
FROM   orders
WHERE  user_id = 42
GROUP  BY user_id;
```

Push the most selective condition first, and make sure it can use an index. The
`filtered` column shows how much a predicate actually removes:

```txt
| table  | type  | key         | rows    | filtered | Extra       |
| orders | range | idx_created | 4000000 |    10.00 | Using where |
```

4,000,000 rows read, 10% kept. 3.6m rows were read for nothing — a sign the index
is on the wrong column, or that a second column belongs in it.

Use `LIMIT` whenever you do not need everything:

```sql
SELECT id FROM orders WHERE user_id = 42 ORDER BY created_at DESC LIMIT 10;
```

With an index on `(user_id, created_at)` this stops after 10 rows instead of sorting
every order for that user.

Edge cases:

`LIMIT` without `ORDER BY` returns an arbitrary subset that can change between runs.
It is only safe when you genuinely do not care which rows you get.

## 7. Which Columns Should You Index?

Index columns that appear in `WHERE`, `JOIN`, `ORDER BY`, and `GROUP BY` — weighted
by how selective they are.

**Selectivity** is the fraction of distinct values:

```sql
SELECT COUNT(DISTINCT status) / COUNT(*) AS status_selectivity,
       COUNT(DISTINCT email)  / COUNT(*) AS email_selectivity
FROM   users;
```

Output:

```txt
status_selectivity  email_selectivity
------------------  -----------------
            0.0000             1.0000
```

An index on `email` narrows to one row. An index on `status` alone, with four
values across 12m rows, narrows to 3m rows — so the planner will usually ignore it
and scan instead.

| Good index candidate | Poor index candidate |
| --- | --- |
| `email`, `user_id`, `order_id` | `status`, `is_active`, `gender` |
| high cardinality | fewer than ~10 distinct values |
| used in `WHERE` or `JOIN` | rarely queried |
| used for `ORDER BY` | frequently updated, rarely filtered |

When not to use it:

Low-cardinality columns **alone**. They are still valuable as the leading column of
a composite index when combined with a selective one, or as the second column after
a selective one.

Tradeoff:

Every index slows `INSERT`, `UPDATE`, and `DELETE`, and consumes memory that would
otherwise cache data pages. On write-heavy tables, an unused index is a pure loss.

Find unused indexes:

```sql
SELECT object_name, index_name, count_star
FROM   performance_schema.table_io_waits_summary_by_index_usage
WHERE  index_name IS NOT NULL
  AND  count_star = 0
  AND  object_schema = DATABASE();
```

## 8. How Do You Choose Composite Index Column Order?

Symptom:

An index exists on every column in the `WHERE` clause, and the planner still scans.

```sql
SELECT * FROM orders
WHERE  user_id = 42 AND status = 'paid' AND created_at > '2026-01-01';
```

With three separate single-column indexes, MySQL picks one and filters the rest.

Fix — one composite index in the right order:

```sql
CREATE INDEX idx_orders_lookup ON orders (user_id, status, created_at);
```

The rule:

```txt
1. equality predicates first     (user_id = ?, status = ?)
2. the range predicate next      (created_at > ?)
3. ORDER BY columns last
```

Why the order matters: a B-tree is sorted left to right, and a **range stops the
usefulness of everything after it**.

```sql
-- With (user_id, created_at, status) and a range on created_at,
-- `status` cannot be used for lookup at all.
CREATE INDEX idx_wrong ON orders (user_id, created_at, status);
```

The leftmost prefix rule decides which queries an index serves:

| Predicate | `(user_id, status, created_at)` |
| --- | --- |
| `user_id = ?` | yes |
| `user_id = ? AND status = ?` | yes |
| `user_id = ? AND status = ? AND created_at > ?` | yes, fully |
| `status = ?` | **no** |
| `status = ? AND created_at > ?` | **no** |

When to use it:

Whenever two or more columns are filtered together. One composite index usually
replaces several single-column indexes and costs less on write.

Edge cases:

MySQL's **index merge** can sometimes combine two single-column indexes, visible as
`index_merge` in `EXPLAIN`. It is better than a scan and worse than a composite
index; treat it as a hint that the composite is missing.

When the query also sorts, a range column placed **before** the sort column forces
a filesort, because the matching entries come out ordered by the range column.
Putting the sort column before the range — equality, sort, range, which is
MongoDB's ESR rule — lets the index return rows already in order and stop at the
`LIMIT`, at the cost of examining more index entries. When the range is very
selective, equality-then-range still wins; compare both plans.

## 9. What Makes A Predicate Sargable?

A predicate is sargable — Search ARGument ABLE — when the database can use an index
to satisfy it. The rule is simple: **the indexed column must appear bare on one side
of the comparison**.

```sql
-- Sargable: index usable
WHERE created_at >= '2026-01-01'
WHERE user_id = 42
WHERE email LIKE 'mof%'
WHERE total BETWEEN 100 AND 500

-- Not sargable: index unusable
WHERE YEAR(created_at) = 2026
WHERE user_id + 0 = 42
WHERE email LIKE '%@gmail.com'
WHERE CAST(user_id AS CHAR) = '42'
```

Why:

An index stores values of `created_at`, not values of `YEAR(created_at)`. To
evaluate the function the database must compute it for every row, which means
reading every row.

The rest of this section covers the four ways predicates become non-sargable:
functions, leading wildcards, type conversion, and `OR`.

Strong answer:

> Sargable means the optimizer can use an index for the predicate. In practice that
> means keeping the column bare on one side — no functions, no arithmetic, no
> implicit casts — and rewriting conditions into ranges the index can seek.

## 10. Why Does A Function On A Column Break The Index?

Symptom:

A date filter scans the whole table despite an index on the date column.

```sql
SELECT * FROM orders WHERE YEAR(created_at) = 2026;
```

Plan before:

```txt
| table  | type | key  | rows     | Extra       |
| orders | ALL  | NULL | 12000000 | Using where |
```

Why:

`key` is `NULL`. The index holds `created_at` values, not `YEAR(created_at)`, so
every row must be read and the function evaluated.

Fix — rewrite as a range on the bare column:

```sql
SELECT * FROM orders
WHERE  created_at >= '2026-01-01'
  AND  created_at <  '2027-01-01';
```

Plan after:

```txt
| table  | type  | key         | rows    | Extra       |
| orders | range | idx_created | 1240000 | Using where |
```

The same pattern applies throughout:

```sql
-- Bad                                  -- Good
WHERE DATE(created_at) = '2026-01-15'   WHERE created_at >= '2026-01-15'
                                          AND created_at <  '2026-01-16'

WHERE UPPER(email) = 'A@B.COM'          WHERE email = 'a@b.com'
                                          -- with a case-insensitive collation

WHERE total * 1.1 > 100                 WHERE total > 100 / 1.1
```

Important:

Use a half-open range — `>= start AND < next_start`. Using `BETWEEN` with
`'2026-12-31'` silently excludes everything after midnight on the last day.

When the function is genuinely needed:

Index the expression itself. MySQL 8 supports functional indexes:

```sql
CREATE INDEX idx_year ON orders ((YEAR(created_at)));
```

Or store a generated column and index that:

```sql
ALTER TABLE orders
  ADD COLUMN created_date DATE AS (DATE(created_at)) STORED,
  ADD INDEX idx_created_date (created_date);
```

PostgreSQL has had expression indexes for far longer:

```sql
CREATE INDEX idx_year ON orders (EXTRACT(YEAR FROM created_at));
```

Tradeoff:

A functional index costs storage and write time, and only serves queries using that
exact expression. A range rewrite costs nothing and is usually the better answer.

## 11. Why Does `LIKE '%text'` Not Use An Index?

Symptom:

A search box scans the table on every keystroke.

```sql
SELECT * FROM users WHERE email LIKE '%@gmail.com';
```

Why:

A B-tree is sorted by the **start** of the value. A leading wildcard gives no
starting point, so there is nothing to seek to.

```txt
index order:  alice@...  bob@...  carol@...  dave@...
              ^ a prefix search seeks here
              a suffix search must read everything
```

Fix depends on the requirement:

**Prefix search** — keep the wildcard at the end and the index works:

```sql
SELECT * FROM users WHERE email LIKE 'mof%';   -- type: range
```

**Suffix search** — store a reversed column and search its prefix:

```sql
ALTER TABLE users
  ADD COLUMN email_reversed VARCHAR(255) AS (REVERSE(email)) STORED,
  ADD INDEX idx_email_reversed (email_reversed);

SELECT * FROM users WHERE email_reversed LIKE REVERSE('@gmail.com');
```

**Word search** — use a full-text index, which is built for this:

```sql
ALTER TABLE posts ADD FULLTEXT INDEX ft_body (title, body);

SELECT * FROM posts
WHERE  MATCH(title, body) AGAINST ('database optimization' IN NATURAL LANGUAGE MODE);
```

When not to use it:

Full-text search in MySQL is workable but limited — no fuzzy matching, weak
ranking, no faceting. Once search is a product feature rather than a filter, a
dedicated engine such as Elasticsearch or OpenSearch is the right tool.

Edge cases:

`LIKE 'abc%'` is sargable, but only if the column's collation matches the
comparison. A case-insensitive search on a case-sensitive column forces a function
and loses the index.

## 12. How Does Implicit Type Conversion Kill An Index?

Symptom:

An indexed column is compared to an obviously correct value, and the index is
ignored anyway.

```sql
-- user_id is BIGINT, the parameter arrives as a string
SELECT * FROM orders WHERE user_id = '42';
```

This one usually still works — MySQL converts the literal to a number. The
dangerous direction is the reverse:

```sql
-- phone is VARCHAR, compared against a number
SELECT * FROM users WHERE phone = 8801700000000;
```

Plan before:

```txt
| table | type | key  | rows   | Extra       |
| users | ALL  | NULL | 800000 | Using where |
```

Why:

When a string column is compared to a number, MySQL converts **the column** to a
number for every row. That is a function on the column, so the index is unusable —
and the conversion also changes what matches, since `'0171'` and `171` compare
equal as numbers.

Fix — match the types:

```sql
SELECT * FROM users WHERE phone = '8801700000000';
```

Plan after:

```txt
| table | type  | key       | rows | Extra |
| users | const | idx_phone |    1 |       |
```

The same problem appears across a join when two columns have different types or
collations:

```sql
-- users.id BIGINT joined to legacy_orders.user_id VARCHAR
SELECT * FROM users u JOIN legacy_orders o ON o.user_id = u.id;
```

The fix is a schema change, not a query change: make the column types match.

Important:

Collation mismatches behave identically. Joining a `utf8mb4_general_ci` column to a
`utf8mb4_unicode_ci` column forces a conversion and disables the index, with no
warning beyond a missing `key` in the plan.

Edge cases:

This is a frequent ORM bug. A numeric id passed as a string, or a `CHAR` id column
in a legacy table, produces a query that is correct but unindexed. Check `key` in
the plan whenever a "simple" query is slow.

## 13. Why Is `OR` Slow, And How Do You Rewrite It?

Symptom:

Adding an `OR` to a fast query makes it scan.

```sql
SELECT * FROM users WHERE email = 'a@b.com' OR phone = '880170000';
```

Plan before:

```txt
| table | type | key  | rows   | Extra       |
| users | ALL  | NULL | 800000 | Using where |
```

Why:

A single index seek cannot satisfy two unrelated conditions. The planner must
either scan, or merge two index reads — and it often judges the scan cheaper.

Fix — `UNION ALL` of two separately indexed queries:

```sql
SELECT * FROM users WHERE email = 'a@b.com'
UNION
SELECT * FROM users WHERE phone = '880170000';
```

Plan after:

```txt
| table | type  | key       | rows | Extra |
| users | const | idx_email |    1 |       |
| users | const | idx_phone |    1 |       |
```

Each branch is a single-row lookup.

When to use it:

When the `OR` spans **different columns**, each with its own index, and each branch
is selective.

When not to use it:

When the `OR` is on the **same column** — that is already a range and needs no
rewrite:

```sql
-- Already sargable; leave it alone.
WHERE status IN ('paid', 'shipped')
WHERE id = 1 OR id = 2
```

Use `UNION ALL` instead of `UNION` when the branches cannot overlap — it skips the
deduplication sort. Here they can overlap (one user with both), so `UNION` is
correct.

Edge cases:

An `OR` mixing an indexed and an unindexed column is always a scan, because the
unindexed half requires reading every row regardless. Index both, or accept the
scan.

## 14. How Do You Optimize Joins?

Symptom:

A two-table join takes seconds, with `Using join buffer` in the plan.

```sql
SELECT u.email, o.total
FROM   users u
JOIN   orders o ON o.user_id = u.id
WHERE  u.country = 'BD';
```

Plan before:

```txt
| table | type | key  | rows     | Extra                              |
| u     | ALL  | NULL |   800000 | Using where                        |
| o     | ALL  | NULL | 12000000 | Using where; Using join buffer     |
```

Two full scans, and `Using join buffer` means no usable index on the join column —
a block nested-loop join.

Fix — index the join key and the filter:

```sql
CREATE INDEX idx_orders_user ON orders (user_id);
CREATE INDEX idx_users_country ON users (country);
```

Plan after:

```txt
| table | type | key               | rows | Extra       |
| u     | ref  | idx_users_country | 4200 | Using where |
| o     | ref  | idx_orders_user   |   14 | Using where |
```

The rules:

1. **Index every join key.** Foreign keys are indexed automatically in MySQL;
   join columns that are not foreign keys are not.
2. **Filter the driving table first.** The planner picks the table producing fewest
   rows as the outer loop; help it by making that filter selective and indexed.
3. **Join on the same type and collation** — see question 12.
4. **Join on indexed columns, not expressions.** `ON YEAR(a.d) = YEAR(b.d)` cannot
   use an index.

Important:

`rows` in a join plan is **per iteration**. The second line showing 14 rows means 14
per outer row — 4,200 × 14 ≈ 58,800 lookups. Multiply before judging.

Edge cases:

When the optimizer picks the wrong driving table, `ANALYZE TABLE` usually fixes it
by refreshing statistics. Optimizer hints such as `STRAIGHT_JOIN` or
`JOIN_ORDER()` are a last resort — they freeze a decision that should adapt as data
grows.

## 15. `EXISTS` vs `IN` vs `JOIN` For Performance

All three can express "users who have ordered". Their performance differs by shape.

```sql
-- EXISTS: stops at the first matching row
SELECT u.* FROM users u
WHERE  EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);

-- IN: materialises the subquery result
SELECT u.* FROM users u
WHERE  u.id IN (SELECT user_id FROM orders);

-- JOIN: needs DISTINCT, which forces a sort
SELECT DISTINCT u.* FROM users u
JOIN   orders o ON o.user_id = u.id;
```

| Form | Cost profile |
| --- | --- |
| `EXISTS` | short-circuits per outer row; best when the subquery is large |
| `IN` | good for a small, constant list; large subqueries may materialise |
| `JOIN` | best when you need columns from both; `DISTINCT` is the risk |

When to use it:

- existence only, large related table → `EXISTS`
- a literal list, `IN (1, 2, 3)` → `IN`
- you need the other table's columns → `JOIN`
- negation → **always** `NOT EXISTS`

Important:

`NOT IN` against a nullable column returns **zero rows** if any value is `NULL`.
That is a correctness bug, not a performance one, and no optimizer will save you:

```sql
-- Returns nothing if any orders.user_id IS NULL
SELECT * FROM users WHERE id NOT IN (SELECT user_id FROM orders);

-- Correct and index-friendly
SELECT * FROM users u
WHERE  NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);
```

Interview note:

MySQL 8 and PostgreSQL both rewrite `IN` and `EXISTS` into semi-joins in most cases,
so the historical "EXISTS is always faster" advice is outdated. Measure; but keep
`NOT EXISTS` as the habit for negation.

## 16. How Do You Fix The N+1 Query Problem?

Symptom:

An endpoint issues hundreds of fast queries. Each is 0.4ms; the endpoint takes 900ms.

```js
// Bad example: 1 query for the list, then 1 per user.
const users = await db.query("SELECT id, name FROM users LIMIT 100");

for (const user of users) {
  user.orders = await db.query("SELECT * FROM orders WHERE user_id = ?", [user.id]);
}
```

```txt
1 + 100 = 101 round trips
```

Why:

The queries are individually indexed and fast. The cost is latency multiplied by
count — and it does not show up in the slow query log, because no single query is
slow.

Fix 1 — one query with `IN`:

```js
const users = await db.query("SELECT id, name FROM users LIMIT 100");
const ids = users.map((user) => user.id);

const orders = await db.query(
  `SELECT * FROM orders WHERE user_id IN (${ids.map(() => "?").join(",")})`,
  ids,
);

const byUser = Map.groupBy(orders, (order) => order.user_id);
users.forEach((user) => {
  user.orders = byUser.get(user.id) ?? [];
});
```

```txt
1 + 1 = 2 round trips
```

Fix 2 — a single join, when you want one flat result:

```sql
SELECT u.id, u.name, o.id AS order_id, o.total
FROM   users u
LEFT   JOIN orders o ON o.user_id = u.id
WHERE  u.id IN (?, ?, ?);
```

When to use which:

- **Two queries with `IN`** when the parent has many children — a join would repeat
  every parent column per child row
- **One join** when the child count is small, or you need a flat result anyway

Edge cases:

- A huge `IN` list has its own cost. Chunk it — 500 to 1,000 ids per query.
- ORMs cause this silently through lazy loading. Use eager loading explicitly:
  `include` in Prisma, `relations` in TypeORM, `with()` in Eloquent.
- The same pattern appears in GraphQL resolvers; batching with DataLoader is the
  standard fix.

Strong answer:

> N+1 is a latency problem, not a query problem. Each query is fast and indexed, so
> nothing looks wrong in the slow log — you only see it by counting queries per
> request. I fix it by batching the children into one `IN` query and grouping in
> application code.

## 17. Are CTEs Optimized The Same As Subqueries?

It depends on the engine, and this catches people out.

```sql
WITH recent AS (
  SELECT * FROM orders WHERE created_at > '2026-01-01'
)
SELECT * FROM recent WHERE user_id = 42;
```

**MySQL 8** may materialise the CTE into a temporary table or merge it into the
outer query. When it materialises, the `user_id = 42` predicate is **not** pushed
inside, so the CTE builds every recent order first.

**PostgreSQL before version 12** always materialised CTEs — they were an optimizer
fence. From version 12 it inlines them when they are referenced once and have no
side effects, and `MATERIALIZED` / `NOT MATERIALIZED` let you force either:

```sql
WITH recent AS NOT MATERIALIZED (
  SELECT * FROM orders WHERE created_at > '2026-01-01'
)
SELECT * FROM recent WHERE user_id = 42;
```

Fix when a CTE is materialising badly — push the predicate inside:

```sql
WITH recent AS (
  SELECT * FROM orders
  WHERE  created_at > '2026-01-01'
    AND  user_id = 42          -- pushed in
)
SELECT * FROM recent;
```

When to use it:

CTEs are a readability win and the right default for multi-step logic. Reach for the
rewrite only when the plan shows the CTE materialising a large intermediate result.

Tradeoff:

Materialisation is not always bad. A CTE referenced three times is computed once
when materialised, which beats three inlined evaluations.

Edge cases:

Recursive CTEs always materialise, by definition. Bound them with a depth guard —
see the SQL Fundamentals guide.

## 18. Why Is `ORDER BY` Slow, And What Is Filesort?

Symptom:

`Using filesort` in the plan, and the query slows as the table grows.

```sql
SELECT * FROM orders WHERE user_id = 42 ORDER BY created_at DESC LIMIT 20;
```

Plan before:

```txt
| table  | type | key      | rows | Extra                       |
| orders | ref  | idx_user |  480 | Using where; Using filesort |
```

Why:

The index on `user_id` finds 480 rows in arbitrary order, so all 480 must be sorted
before the top 20 can be returned. Despite the name, filesort often happens in
memory — it means "an explicit sort was required", not necessarily "on disk".

Fix — put the sort column in the index, after the equality column:

```sql
CREATE INDEX idx_user_created ON orders (user_id, created_at);
```

Plan after:

```txt
| table  | type | key              | rows | Extra       |
| orders | ref  | idx_user_created |   20 | Using where |
```

No `Using filesort`, and `rows` drops to 20 — the index is already in the required
order, so the database stops after 20 rows.

Rules for sort-friendly indexes:

1. Equality columns first, then the `ORDER BY` column
2. The sort direction must be consistent, or the index must declare it
3. Mixed directions need an index that matches:

```sql
-- ORDER BY user_id ASC, created_at DESC
CREATE INDEX idx_mixed ON orders (user_id ASC, created_at DESC);
```

Descending indexes are real in MySQL 8; in 5.7 the keyword parsed but was ignored.

Edge cases:

- `ORDER BY RAND()` sorts the entire table every time and cannot be indexed. For a
  random row, pick a random id range instead.
- Sorting a `TEXT` or `BLOB` column forces the slower on-disk sort algorithm.
- `ORDER BY` across two different tables in a join cannot use one index; the
  database must sort the joined result.

## 19. When Is `DISTINCT` A Symptom Rather Than A Fix?

Symptom:

A query returns duplicate rows, and `DISTINCT` was added to clean them up.

```sql
SELECT DISTINCT u.id, u.name
FROM   users u
JOIN   orders o ON o.user_id = u.id
WHERE  o.status = 'paid';
```

Plan before:

```txt
| table | type | key      | rows   | Extra                        |
| u     | ALL  | NULL     | 800000 | Using temporary; Using filesort |
| o     | ref  | idx_user |     14 | Using where                  |
```

Why:

The duplicates come from the join — one row per matching order. `DISTINCT` forces a
temporary table and a sort over the whole result to remove them.

Fix — express the actual intent, which is existence:

```sql
SELECT u.id, u.name
FROM   users u
WHERE  EXISTS (
         SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.status = 'paid'
       );
```

Plan after:

```txt
| table | type | key             | rows   | Extra       |
| u     | ALL  | NULL            | 800000 | Using where |
| o     | ref  | idx_user_status |      1 | Using index |
```

No temporary table, no sort, and the subquery stops at the first match.

Important:

`DISTINCT` hides duplication for `COUNT`, but it does not fix `SUM` or `AVG` — those
are silently wrong when a join multiplies rows. See question 4 of the SQL
Fundamentals guide.

When `DISTINCT` is legitimate:

When the source data genuinely contains duplicates you want collapsed — distinct
countries, distinct tags. Then it is the correct operator, not a patch.

Edge cases:

`SELECT DISTINCT` with `ORDER BY` on a column not in the select list is invalid in
strict mode, because the sort order would be ambiguous after deduplication.

## 20. How Do You Make `COUNT(*)` Fast On A Huge Table?

Symptom:

A dashboard counter takes 4 seconds.

```sql
SELECT COUNT(*) FROM orders;
```

Why:

InnoDB does not store a row count. It must scan an index to count — usually the
smallest one — which on 12m rows means reading 12m index entries. MyISAM did store
a count, which is why this used to be instant.

Fix depends on how exact the number must be.

**Approximate is fine** — use the optimizer's estimate:

```sql
SELECT table_rows
FROM   information_schema.tables
WHERE  table_schema = DATABASE() AND table_name = 'orders';
```

Instant, and typically within a few percent.

**Exact and frequently read** — maintain a counter:

```sql
CREATE TABLE table_counts (
  table_name VARCHAR(64) PRIMARY KEY,
  row_count  BIGINT NOT NULL DEFAULT 0
);

-- in the same transaction as the insert
UPDATE table_counts SET row_count = row_count + 1 WHERE table_name = 'orders';
```

**Filtered counts** — index the filter and cover the count:

```sql
CREATE INDEX idx_status ON orders (status);
SELECT COUNT(*) FROM orders WHERE status = 'paid';   -- Using index
```

**Pagination totals** — cap the count rather than computing it exactly:

```sql
SELECT COUNT(*) FROM (
  SELECT 1 FROM orders WHERE user_id = 42 LIMIT 1000
) t;
```

This answers "1,000+" without counting further, which is what most UIs actually
need.

Tradeoff:

A maintained counter is exact and fast to read, but becomes a write hotspot — every
insert updates the same row. Under heavy concurrency, shard the counter across
several rows and sum them.

## 21. What Do Common Slow-Query Scenarios Look Like?

A scenario bank for the cases that do not fit a single rule.

**Scenario: the index exists but is not used**

```txt
Symptom    EXPLAIN shows key = NULL despite a matching index
Causes     non-sargable predicate; type or collation mismatch; low selectivity;
           stale statistics; the table is small enough to scan
First check  is the column bare in the predicate? do the types match?
Fix        ANALYZE TABLE; rewrite the predicate; verify with EXPLAIN
```

**Scenario: fast in development, slow in production**

```txt
Symptom    identical query, wildly different timing
Cause      data volume and distribution differ; dev has 1k rows, prod has 12m
           the planner correctly chose a scan in dev and needs an index in prod
First check  row counts and EXPLAIN on production-like data
Fix        test against a realistic dataset; never tune against a small copy
```

**Scenario: skewed data**

```txt
Symptom    the query is fast for most values and slow for one
Cause      one value dominates: 90% of orders belong to one tenant
           the index is useless for that value and ideal for the rest
First check  SELECT col, COUNT(*) ... GROUP BY col ORDER BY 2 DESC LIMIT 5
Fix        composite index including a selective second column; or a separate
           access path for the outlier
```

**Scenario: it got slow overnight with no deploy**

```txt
Symptom    stable query degrades suddenly
Causes     table crossed a size threshold and the plan flipped; statistics went
           stale; an index was dropped; the buffer pool no longer fits the
           working set
First check  compare EXPLAIN now against the known-good plan
Fix        ANALYZE TABLE; check innodb_buffer_pool_size against data size
```

**Scenario: multi-tenant queries**

```txt
Symptom    every query filters tenant_id and all are moderately slow
Cause      tenant_id is not the leading column of the indexes
First check  do composite indexes start with tenant_id?
Fix        lead every composite index with tenant_id, since it is in every query
```

**Scenario: soft deletes**

```txt
Symptom    queries slow as deleted rows accumulate
Cause      WHERE deleted_at IS NULL is not in the indexes, so dead rows are
           still read
First check  is deleted_at part of the composite indexes?
Fix        include it, or use a partial index (PostgreSQL):
           CREATE INDEX ... ON orders (user_id) WHERE deleted_at IS NULL;
           MySQL has no partial indexes; archive old rows instead
```

**Scenario: a huge `IN` list**

```txt
Symptom    a query with 50,000 ids in IN() is slow or fails to parse
Cause      parsing and planning cost grows with list size
First check  how many parameters?
Fix        chunk into batches of 500-1000, or load the ids into a temporary
           table and join against it
```

**Decision table**

| Symptom | Likely cause | First check | Fix |
| --- | --- | --- | --- |
| `type: ALL` on a big table | no usable index | `key` is `NULL` | index the predicate |
| `Using filesort` | sort not served by index | `ORDER BY` columns | add them to the index |
| `Using temporary` | `GROUP BY`/`DISTINCT` | is `DISTINCT` needed? | rewrite as `EXISTS` |
| `Using join buffer` | join key unindexed | the `ON` columns | index the join key |
| high `rows`, low `filtered` | index too broad | predicate selectivity | composite index |
| many fast queries | N+1 | queries per request | batch with `IN` |
| slow only at high offset | deep pagination | the `OFFSET` value | keyset pagination |

## 22. What Optimization Mistakes Should You Avoid?

**Optimizing without measuring.** The query people complain about is often not the
one consuming the time. Start from the slow log or `performance_schema`.

**Indexing every column.** Each index slows every write and consumes buffer pool
memory that would otherwise cache data. Unused indexes are pure cost:

```sql
SELECT object_name, index_name
FROM   performance_schema.table_io_waits_summary_by_index_usage
WHERE  index_name IS NOT NULL AND count_star = 0
  AND  object_schema = DATABASE();
```

**Adding a single-column index per `WHERE` column.** One correctly ordered
composite index usually serves the query better and costs less.

**Trusting `rows` as a total.** It is per iteration in a join. Multiply down the
plan.

**Denormalizing first.** Try the index, the rewrite, and the cache before changing
the schema. Denormalization adds a correctness burden forever.

**Using query hints to force a plan.** `STRAIGHT_JOIN` and `FORCE INDEX` freeze a
decision that was right for today's data distribution and will be wrong later.
Treat them as temporary.

**Caching a slow query instead of fixing it.** The cache hides the problem until a
cold start, a deploy, or a cache eviction exposes it all at once.

**Forgetting write cost.** A read optimization that doubles insert time is a bad
trade on a write-heavy table. Ask what the read/write ratio actually is.

Interview answer:

> I measure first, change one thing, and re-read the plan. Most wins come from
> making a predicate sargable or getting the composite index order right — not from
> adding more indexes. I also check what the change costs on writes, because an
> index is a permanent tax on every insert and update.

## Sources Used

- <https://dev.mysql.com/doc/refman/8.0/en/explain-output.html>
- <https://dev.mysql.com/doc/refman/8.0/en/explain.html>
- <https://dev.mysql.com/doc/refman/8.0/en/optimization-indexes.html>
- <https://dev.mysql.com/doc/refman/8.0/en/order-by-optimization.html>
- <https://dev.mysql.com/doc/refman/8.0/en/group-by-optimization.html>
- <https://dev.mysql.com/doc/refman/8.0/en/create-index.html>
- <https://www.postgresql.org/docs/current/using-explain.html>
- <https://use-the-index-luke.com/>
