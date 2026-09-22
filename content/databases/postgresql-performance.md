# PostgreSQL Internals & Performance Interview Guide

How PostgreSQL behaves under load: MVCC and row versions, `VACUUM` and bloat,
transaction ID wraparound, HOT updates, reading `EXPLAIN ANALYZE`, scan and join
methods, planner statistics, index types, partial, expression, and covering
indexes, why an index is not used, locking and the lock queue, zero-downtime
migrations, connection pooling, memory settings, WAL and checkpoints,
replication, partitioning, backups, and finding slow queries.

Every example ran on PostgreSQL 17. Plans use `COSTS OFF`, `TIMING OFF`, and
`SUMMARY OFF` where possible so they come out the same on every run; outputs
marked "numbers vary" show costs, timings, or transaction ids that will differ
on your machine. Multi-session behaviour is shown as transcripts captured from
concurrent `psql` sessions.

## Practice Dataset

Most questions use these two tables — 5,000 customers and 200,000 orders. Note
that `orders.customer_id` has a foreign key but **no index**, exactly as
PostgreSQL leaves it by default:

```sql
CREATE TABLE customers (
  id      int PRIMARY KEY,
  email   text NOT NULL,
  country text NOT NULL,
  city    text NOT NULL
);
INSERT INTO customers
SELECT g,
       'user' || g || '@example.com',
       (ARRAY['BD', 'US', 'IN', 'DE'])[g % 4 + 1],
       (ARRAY['Dhaka', 'New York', 'Mumbai', 'Berlin'])[g % 4 + 1]
FROM generate_series(1, 5000) AS g;

CREATE TABLE orders (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id int NOT NULL REFERENCES customers,
  status      text NOT NULL,
  total       numeric(10, 2) NOT NULL,
  created_at  timestamptz NOT NULL
);
INSERT INTO orders (customer_id, status, total, created_at)
SELECT (g * 7919) % 5000 + 1,
       (ARRAY['paid', 'paid', 'paid',
              'shipped', 'pending', 'cancelled'])[g % 6 + 1],
       (g * 37) % 500,
       timestamptz '2026-01-01' + g * interval '1 minute'
FROM generate_series(1, 200000) AS g;

VACUUM ANALYZE customers, orders;
```

## 1. How Does MVCC Work In PostgreSQL?

**Multi-version concurrency control**: an `UPDATE` never overwrites a row in
place. It writes a **new row version** (a tuple) and marks the old one as
superseded. Readers see whichever version their snapshot allows, so readers never
block writers and writers never block readers.

Each tuple carries `xmin`, the transaction that created it, and `xmax`, the one
that deleted or replaced it. `pageinspect` shows both versions sitting in the
table after one update:

```sql
CREATE EXTENSION IF NOT EXISTS pageinspect;
CREATE TABLE accounts (id int PRIMARY KEY, balance int);
INSERT INTO accounts VALUES (1, 100);
UPDATE accounts SET balance = 90 WHERE id = 1;
SELECT lp,
       t_xmin AS created_by,
       t_xmax AS replaced_by,
       t_ctid AS newest_version_at
FROM heap_page_items(get_raw_page('accounts', 0));
```

Output (numbers vary by run):

```txt
 lp | created_by | replaced_by | newest_version_at
----+------------+-------------+-------------------
  1 |       1494 |        1495 | (0,2)
  2 |       1495 |           0 | (0,2)
```

Line pointer 1 is the old version: it records which transaction replaced it and
points to the new version at `(0,2)`. Line 2 is live — `replaced_by` is 0. Only
one row is visible to queries, but two tuples occupy the page:

```sql
CREATE EXTENSION IF NOT EXISTS pgstattuple;
SELECT tuple_count, dead_tuple_count FROM pgstattuple('accounts');
```

Output:

```txt
 tuple_count | dead_tuple_count
-------------+------------------
           1 |                1
```

Why it matters:

- **Updates are inserts plus a delete** — every `UPDATE` leaves a dead tuple
  behind, so update-heavy tables need cleanup.
- **Every index entry points at a tuple**, so an update that moves the row can
  add entries to every index on the table — unless it is a HOT update
  (question 4).
- **Long transactions are expensive**: while any snapshot might still need an old
  version, nothing can remove it.

Interview note:

MySQL's InnoDB updates in place and keeps old versions in a separate undo log;
PostgreSQL keeps them in the table. That single design choice explains VACUUM,
bloat, HOT updates, and why "idle in transaction" sessions are dangerous.

## 2. What Does `VACUUM` Do, And Why Does Autovacuum Matter?

`VACUUM` finds dead tuples no snapshot can see any more and marks their space
**reusable**. It also updates the visibility map (question 6) and freezes old
tuples (question 3). Autovacuum schedules it automatically.

The demo table has autovacuum disabled so the numbers stay put — never do that in
production:

```sql
CREATE EXTENSION IF NOT EXISTS pgstattuple;
CREATE TABLE events (id int PRIMARY KEY, status text, payload text)
  WITH (autovacuum_enabled = false);
INSERT INTO events
SELECT g, 'new', repeat('x', 100) FROM generate_series(1, 100000) AS g;
UPDATE events SET status = 'processed';
SELECT pg_size_pretty(table_len) AS size, tuple_count, dead_tuple_count
FROM pgstattuple('events');
```

Output:

```txt
 size  | tuple_count | dead_tuple_count
-------+-------------+------------------
 28 MB |      100000 |           100000
```

One update of every row doubled the table: 100,000 live tuples and 100,000 dead
ones.

```sql
VACUUM events;
SELECT pg_size_pretty(table_len) AS size, tuple_count, dead_tuple_count,
       round(free_percent) AS free_pct
FROM pgstattuple('events');
```

Output:

```txt
 size  | tuple_count | dead_tuple_count | free_pct
-------+-------------+------------------+----------
 28 MB |      100000 |                0 |       49
```

`VACUUM` removed the dead tuples but **did not shrink the file**: the space is now
free inside the table, ready for future inserts and updates. Returning it to the
operating system needs a rewrite:

```sql
VACUUM FULL events;
SELECT pg_size_pretty(table_len) AS size, tuple_count, dead_tuple_count,
       round(free_percent) AS free_pct
FROM pgstattuple('events');
```

Output:

```txt
 size  | tuple_count | dead_tuple_count | free_pct
-------+-------------+------------------+----------
 14 MB |      100000 |                0 |        0
```

| | `VACUUM` | `VACUUM FULL` |
| --- | --- | --- |
| Reclaims dead tuples | yes | yes |
| Shrinks the file | only trailing empty pages | yes — rewrites the table |
| Lock | none that blocks reads or writes | `ACCESS EXCLUSIVE` — blocks everything |
| Use | routinely, via autovacuum | rarely; prefer `pg_repack` online |

What stops VACUUM — captured from two sessions. Session A holds a
`REPEATABLE READ` snapshot while session B updates 10,000 rows and vacuums:

```txt
B: tuples: 0 removed, 20000 remain, 10000 are dead but not yet removable
   -- A commits --
B: tuples: 10000 removed, 10000 remain, 0 are dead but not yet removable
```

While A's snapshot existed, it might still need the old versions, so VACUUM
could remove nothing. The same happens with a session left **idle in
transaction**, a forgotten replication slot, or a standby with
`hot_standby_feedback` running a long query.

When autovacuum runs:

```txt
dead tuples > autovacuum_vacuum_threshold (50)
            + autovacuum_vacuum_scale_factor (0.2) × rows in the table
```

On a 100-million-row table that is 20 million dead tuples before cleanup starts.
Tune big, hot tables individually:

```sql
ALTER TABLE orders SET (
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_vacuum_cost_limit = 2000
);
```

Interview trap:

Bloat is rarely "autovacuum is broken". It is usually autovacuum being
**prevented** — by long transactions, idle-in-transaction sessions, or abandoned
replication slots — or being too **slow** for a hot table because of its default
cost limits. Check `pg_stat_activity` for old `xact_start` values before tuning
anything.

## 3. What Is Transaction ID Wraparound?

Transaction ids (`xid`) are 32-bit counters, so PostgreSQL compares them in a
circle of about 4 billion: roughly 2 billion are "the past" and 2 billion "the
future". A tuple created long enough ago would suddenly appear to be in the
future — invisible.

**Freezing** prevents that: VACUUM marks tuples old enough to be visible to
everyone as frozen, so their `xmin` no longer matters. Autovacuum forces an
aggressive, anti-wraparound vacuum on any table whose oldest unfrozen xid is
older than `autovacuum_freeze_max_age` (200 million by default) — even on tables
with autovacuum disabled.

Monitor it:

```sql
SELECT datname, age(datfrozenxid) AS xid_age
FROM pg_database
ORDER BY xid_age DESC;
SELECT relname, age(relfrozenxid) AS xid_age
FROM pg_class
WHERE relkind = 'r'
ORDER BY xid_age DESC
LIMIT 5;
```

Important:

If freezing falls too far behind — typically because something blocks VACUUM
for days — PostgreSQL first warns, and eventually **refuses to assign new
transaction ids** to protect data, which means refusing writes until a manual
VACUUM completes. It is one of the few PostgreSQL problems that takes a
production database down, and it is entirely preventable by alerting on
`age(datfrozenxid)`, well before 1 billion.

## 4. What Is A HOT Update, And What Does `fillfactor` Do?

A **heap-only tuple** (HOT) update writes the new version on the **same page** and
adds **no index entries**: the index keeps pointing at the old tuple, which
redirects to the new one. It applies when:

1. no indexed column changed, and
2. the page has room for the new version.

```sql
CREATE TABLE items (id int PRIMARY KEY, sku text, views int NOT NULL DEFAULT 0)
  WITH (fillfactor = 90);
CREATE INDEX ON items (sku);
INSERT INTO items (id, sku)
SELECT g, 'SKU-' || g FROM generate_series(1, 1000) AS g;
BEGIN;
UPDATE items SET views = views + 1 WHERE id % 50 = 0;
SELECT n_tup_upd, n_tup_hot_upd
FROM pg_stat_xact_user_tables
WHERE relname = 'items';
COMMIT;
```

Output:

```txt
 n_tup_upd | n_tup_hot_upd
-----------+---------------
        20 |            20
```

All 20 updates were HOT — `views` is not indexed. Change an indexed column and
none are:

```sql
BEGIN;
UPDATE items SET sku = sku || '-v2' WHERE id % 50 = 0;
SELECT n_tup_upd, n_tup_hot_upd
FROM pg_stat_xact_user_tables
WHERE relname = 'items';
COMMIT;
```

Output:

```txt
 n_tup_upd | n_tup_hot_upd
-----------+---------------
        20 |             0
```

`fillfactor = 90` leaves 10% of each page empty at insert time — room for HOT
updates. The default for tables is 100.

Why it matters:

- An index you add "just in case" on a frequently updated column disables HOT
  for those updates, and every update then writes to **every** index.
- A lower `fillfactor` on update-heavy tables trades a slightly larger table for
  far fewer index writes and less bloat.
- `pg_stat_user_tables.n_tup_hot_upd / n_tup_upd` shows the HOT ratio per table.

## 5. How Do You Read `EXPLAIN ANALYZE`?

`EXPLAIN` shows the plan and its **estimates**; `EXPLAIN ANALYZE` also **runs**
the query and reports what actually happened. `BUFFERS` adds pages read.

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE customer_id = 42;
```

Output (numbers vary by run):

```txt
                                              QUERY PLAN
------------------------------------------------------------------------------------------------------
 Seq Scan on orders  (cost=0.00..4075.00 rows=40 width=30) (actual time=0.181..6.935 rows=40 loops=1)
   Filter: (customer_id = 42)
   Rows Removed by Filter: 199960
   Buffers: shared hit=1575
 Planning:
   Buffers: shared hit=72
 Planning Time: 0.179 ms
 Execution Time: 6.957 ms
```

Reading it, bottom-up and inside-out:

| Part | Meaning |
| --- | --- |
| `cost=0.00..4075.00` | planner's estimate: startup cost .. total cost, in arbitrary units |
| `rows=40` (first parentheses) | **estimated** rows |
| `actual time=...` | real milliseconds: first row .. last row, **per loop** |
| `rows=40` (second parentheses) | **actual** rows, per loop |
| `loops=1` | how many times this node ran — multiply time and rows by it |
| `Rows Removed by Filter` | rows read and thrown away — the waste |
| `Buffers: shared hit=... read=...` | 8KB pages found in cache / read from disk |

Here: a sequential scan read every page to return 40 rows and discard 199,960.
After indexing the foreign key column:

```sql
CREATE INDEX orders_customer_id_idx ON orders (customer_id);
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE customer_id = 42;
```

Output (numbers vary by run):

```txt
                                                           QUERY PLAN
---------------------------------------------------------------------------------------------------------------------------------
 Bitmap Heap Scan on orders  (cost=4.60..145.98 rows=40 width=30) (actual time=0.014..0.062 rows=40 loops=1)
   Recheck Cond: (customer_id = 42)
   Heap Blocks: exact=40
   Buffers: shared hit=40 read=2
   ->  Bitmap Index Scan on orders_customer_id_idx  (cost=0.00..4.59 rows=40 width=0) (actual time=0.009..0.009 rows=40 loops=1)
         Index Cond: (customer_id = 42)
         Buffers: shared read=2
 Planning:
   Buffers: shared hit=59 read=1
 Planning Time: 0.316 ms
 Execution Time: 0.086 ms
```

The rules for diagnosis:

1. Find the node where most **time** goes — times are inclusive of children.
2. Compare estimated and actual rows. A 10x or larger gap means the planner is
   working from wrong statistics, and every decision above that node is suspect.
3. Look for large `Rows Removed by Filter`, sorts or hashes spilling to disk
   (question 7), and nested loops with a large `loops` count.

Important:

`EXPLAIN ANALYZE` **executes** the statement. Wrap an `UPDATE` or `DELETE` in a
transaction and roll it back:

```sql
BEGIN;
EXPLAIN ANALYZE DELETE FROM orders WHERE status = 'cancelled';
ROLLBACK;
```

## 6. What Are The Scan Types, And What Is An Index-Only Scan?

| Node | Reads | Chosen when |
| --- | --- | --- |
| `Seq Scan` | every page in order | a large share of rows match, or no index fits |
| `Index Scan` | index, then each matching heap tuple | few rows match |
| `Bitmap Index Scan` + `Bitmap Heap Scan` | index first, then heap pages in physical order | a moderate number of rows, or combining indexes with `BitmapAnd`/`BitmapOr` |
| `Index Only Scan` | the index alone, when the visibility map allows | every needed column is in the index |

```sql
EXPLAIN (COSTS OFF) SELECT * FROM orders WHERE id = 42;
```

Output:

```txt
               QUERY PLAN
----------------------------------------
 Index Scan using orders_pkey on orders
   Index Cond: (id = 42)
```

```sql
EXPLAIN (COSTS OFF) SELECT * FROM orders WHERE total > 10;
```

Output:

```txt
            QUERY PLAN
-----------------------------------
 Seq Scan on orders
   Filter: (total > '10'::numeric)
```

About 98% of orders have `total > 10`, so reading the whole table in order is
cheaper than 195,000 index lookups. A sequential scan is often the **right**
plan.

An **index-only scan** still has to check that each tuple is visible to the
snapshot. PostgreSQL skips the heap only for pages the **visibility map** marks
all-visible — and VACUUM is what sets those bits:

```sql
CREATE TABLE ledger (id int PRIMARY KEY, account int, amount int)
  WITH (autovacuum_enabled = false);
INSERT INTO ledger SELECT g, g % 100, g FROM generate_series(1, 50000) AS g;
CREATE INDEX ledger_account_amount ON ledger (account, amount);
ANALYZE ledger;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT account, amount FROM ledger WHERE account = 7;
```

Output:

```txt
                                 QUERY PLAN
----------------------------------------------------------------------------
 Bitmap Heap Scan on ledger (actual rows=500 loops=1)
   Recheck Cond: (account = 7)
   Heap Blocks: exact=270
   ->  Bitmap Index Scan on ledger_account_amount (actual rows=500 loops=1)
         Index Cond: (account = 7)
```

No index-only scan at all. Nothing is marked all-visible yet, so the planner knows
it would have to visit the heap for every row, and a bitmap scan over 270 heap
pages is cheaper. After VACUUM sets the visibility map:

```sql
VACUUM ledger;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT account, amount FROM ledger WHERE account = 7;
```

Output:

```txt
                                   QUERY PLAN
---------------------------------------------------------------------------------
 Index Only Scan using ledger_account_amount on ledger (actual rows=500 loops=1)
   Index Cond: (account = 7)
   Heap Fetches: 0
```

`Heap Fetches: 0` — answered from the index alone. Now update a scattering of
rows; every page they touch loses its all-visible bit:

```sql
UPDATE ledger SET amount = amount WHERE id % 1000 = 0;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT account, amount FROM ledger WHERE account = 7;
```

Output:

```txt
                                   QUERY PLAN
---------------------------------------------------------------------------------
 Index Only Scan using ledger_account_amount on ledger (actual rows=500 loops=1)
   Index Cond: (account = 7)
   Heap Fetches: 91
```

Interview trap:

On a table with constant updates, pages rarely stay all-visible, so index-only
scans quietly degrade toward ordinary index scans until the next VACUUM.
`Heap Fetches` in `EXPLAIN ANALYZE` is the number to check.

## 7. How Do Join Algorithms And `work_mem` Affect A Plan?

| Join | How | Good when |
| --- | --- | --- |
| Nested Loop | for each outer row, look up matching inner rows | the outer side is small and the inner side is indexed |
| Hash Join | build a hash table from the smaller side, probe with the other | large, unsorted, equality joins |
| Merge Join | walk two inputs sorted on the join key | both sides already sorted, often by indexes |

```sql
SET max_parallel_workers_per_gather = 0;   -- a serial plan, easier to read
EXPLAIN (COSTS OFF)
SELECT c.country, count(*)
FROM orders o
JOIN customers c ON c.id = o.customer_id
GROUP BY c.country;
```

Output:

```txt
                QUERY PLAN
-------------------------------------------
 HashAggregate
   Group Key: c.country
   ->  Hash Join
         Hash Cond: (o.customer_id = c.id)
         ->  Seq Scan on orders o
         ->  Hash
               ->  Seq Scan on customers c
```

Joining everything: hash the 5,000 customers, stream the 200,000 orders through
the hash.

```sql
CREATE INDEX orders_customer_id_idx ON orders (customer_id);
EXPLAIN (COSTS OFF)
SELECT o.id, o.total
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE c.email = 'user42@example.com';
```

Output:

```txt
                       QUERY PLAN
---------------------------------------------------------
 Nested Loop
   ->  Seq Scan on customers c
         Filter: (email = 'user42@example.com'::text)
   ->  Bitmap Heap Scan on orders o
         Recheck Cond: (c.id = customer_id)
         ->  Bitmap Index Scan on orders_customer_id_idx
               Index Cond: (customer_id = c.id)
```

One customer: find it (a sequential scan, since `email` has no index), then probe
the orders index for that customer's rows — a nested loop.

**`work_mem`** is the memory each sort or hash node may use before spilling to
temporary files:

```sql
SET work_mem = '256kB';
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT id FROM orders ORDER BY total, id;
```

Output:

```txt
                      QUERY PLAN
-------------------------------------------------------
 Sort (actual rows=200000 loops=1)
   Sort Key: total, id
   Sort Method: external merge  Disk: 4552kB
   ->  Seq Scan on orders (actual rows=200000 loops=1)
```

```sql
SET work_mem = '64MB';
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT id FROM orders ORDER BY total, id;
```

Output:

```txt
                      QUERY PLAN
-------------------------------------------------------
 Sort (actual rows=200000 loops=1)
   Sort Key: total, id
   Sort Method: quicksort  Memory: 12395kB
   ->  Seq Scan on orders (actual rows=200000 loops=1)
```

`external merge` means the sort went to disk; `quicksort` means it fit in memory.

Important:

`work_mem` is per **operation**, not per query or per connection. A plan with
five sorts and hashes, running in 3 parallel workers, across 100 connections, can
use 5 × 3 × 100 × `work_mem`. Raise it for a session running a big report
(`SET work_mem = '256MB'`), not globally.

## 8. How Does The Planner Estimate Rows, And What Are Extended Statistics?

`ANALYZE` samples each table and stores per-column statistics in `pg_stats`:

```sql
SELECT attname, n_distinct, most_common_vals, most_common_freqs
FROM pg_stats
WHERE tablename = 'customers' AND attname IN ('country', 'city')
ORDER BY attname;
```

Output:

```txt
 attname | n_distinct |         most_common_vals         |   most_common_freqs
---------+------------+----------------------------------+-----------------------
 city    |          4 | {Berlin,Dhaka,Mumbai,"New York"} | {0.25,0.25,0.25,0.25}
 country |          4 | {BD,DE,IN,US}                    | {0.25,0.25,0.25,0.25}
```

The planner treats columns as **independent**. Here they are not — the city
determines the country — so a filter on both is underestimated by 4x:

```sql
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT * FROM customers WHERE country = 'BD' AND city = 'Dhaka';
```

Output:

```txt
                                       QUERY PLAN
-----------------------------------------------------------------------------------------
 Seq Scan on customers  (cost=0.00..117.00 rows=312 width=34) (actual rows=1250 loops=1)
   Filter: ((country = 'BD'::text) AND (city = 'Dhaka'::text))
   Rows Removed by Filter: 3750
```

Estimated 312 (0.25 × 0.25 × 5,000); actual 1,250. **Extended statistics** teach
the planner the dependency:

```sql
CREATE STATISTICS customers_country_city (dependencies)
  ON country, city FROM customers;
ANALYZE customers;
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT * FROM customers WHERE country = 'BD' AND city = 'Dhaka';
```

Output:

```txt
                                        QUERY PLAN
------------------------------------------------------------------------------------------
 Seq Scan on customers  (cost=0.00..117.00 rows=1250 width=34) (actual rows=1250 loops=1)
   Filter: ((country = 'BD'::text) AND (city = 'Dhaka'::text))
   Rows Removed by Filter: 3750
```

Why it matters:

Row estimates drive **every** choice above them: join order, join method, whether
to use an index. A 4x error on 5,000 rows is harmless; the same error feeding a
nested loop over millions of rows is a query that never finishes.

Fixes for bad estimates, in order:

1. `ANALYZE` — statistics are stale after a bulk load, and autovacuum's analyze
   may not have run yet
2. more detail for a skewed column: `ALTER TABLE t ALTER COLUMN c SET STATISTICS 1000`
3. `CREATE STATISTICS` for correlated columns (`dependencies`, `ndistinct`, `mcv`)
4. rewrite the query so the planner can see through it — for example, avoid
   wrapping filtered columns in functions

## 9. Which Index Types Does PostgreSQL Have?

| Type | Good for | Example |
| --- | --- | --- |
| **B-tree** (default) | equality, ranges, sorting, prefix `LIKE` | `CREATE INDEX ON orders (created_at)` |
| **Hash** | equality only | rarely better than B-tree |
| **GIN** | "contains" — `jsonb`, arrays, full-text, trigrams | `USING gin (data jsonb_path_ops)` |
| **GiST** | overlap and nearest-neighbour — ranges, geometry, exclusion constraints | `USING gist (during)` |
| **SP-GiST** | space-partitioned data — points, IP ranges | `USING spgist (location)` |
| **BRIN** | huge, naturally ordered tables | `USING brin (created_at)` |

**BRIN** stores only a min and max per block range, so on an append-only table
where the column correlates with physical order it is tiny:

```sql
CREATE TABLE readings (
  id       bigint GENERATED ALWAYS AS IDENTITY,
  taken_at timestamptz NOT NULL,
  value    float8
);
INSERT INTO readings (taken_at, value)
SELECT timestamptz '2026-01-01' + g * interval '1 second', g % 100
FROM generate_series(1, 1000000) AS g;
CREATE INDEX readings_btree ON readings (taken_at);
CREATE INDEX readings_brin  ON readings USING brin (taken_at);
SELECT indexrelname AS index,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes WHERE relname = 'readings' ORDER BY indexrelname;
```

Output:

```txt
     index      | size
----------------+-------
 readings_brin  | 24 kB
 readings_btree | 21 MB
```

Tradeoff:

A BRIN index narrows a query to candidate block ranges and then scans them, so it
is lossy and slower per query than a B-tree — but here almost a thousand times
smaller, and nearly free to maintain. It is useless when the column is not correlated with
insert order, such as `updated_at` on a table updated at random.

## 10. When Do You Use Partial, Expression, And Covering Indexes?

**Expression index** — the query must use the same expression:

```sql
CREATE INDEX customers_email_lower ON customers (lower(email));
EXPLAIN (COSTS OFF)
SELECT id FROM customers WHERE lower(email) = 'user42@example.com';
```

Output:

```txt
                           QUERY PLAN
-----------------------------------------------------------------
 Bitmap Heap Scan on customers
   Recheck Cond: (lower(email) = 'user42@example.com'::text)
   ->  Bitmap Index Scan on customers_email_lower
         Index Cond: (lower(email) = 'user42@example.com'::text)
```

**Partial index** — only the rows a hot query needs. A queue of pending orders is
a small slice of a large table:

```sql
CREATE INDEX orders_pending_created ON orders (created_at)
  WHERE status = 'pending';
EXPLAIN (COSTS OFF)
SELECT id FROM orders WHERE status = 'pending' AND created_at > '2026-04-01';
```

Output:

```txt
                                   QUERY PLAN
---------------------------------------------------------------------------------
 Index Scan using orders_pending_created on orders
   Index Cond: (created_at > '2026-04-01 00:00:00+00'::timestamp with time zone)
```

There is no `status` filter left in the plan — the index contains only pending
orders. The query must imply the index predicate; with `status = 'paid'` this
index is unusable.

**Covering index** — `INCLUDE` stores extra columns in the index leaves so the
query never touches the table:

```sql
CREATE INDEX orders_customer_incl ON orders (customer_id) INCLUDE (total);
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT sum(total) FROM orders WHERE customer_id = 42;
```

Output:

```txt
                                     QUERY PLAN
-------------------------------------------------------------------------------------
 Aggregate (actual rows=1 loops=1)
   ->  Index Only Scan using orders_customer_incl on orders (actual rows=40 loops=1)
         Index Cond: (customer_id = 42)
         Heap Fetches: 0
```

`INCLUDE` columns are not part of the search key, so they do not affect ordering
or uniqueness, and they can have types a B-tree could not otherwise index.

## 11. How Do Multicolumn Indexes Work In PostgreSQL?

A B-tree on `(a, b)` is sorted by `a`, then by `b`. It serves conditions on `a`,
and on `a` plus `b` — the leftmost prefix — exactly as in MySQL.

```sql
CREATE INDEX orders_status_created ON orders (status, created_at);
EXPLAIN (COSTS OFF)
SELECT id FROM orders WHERE status = 'pending' AND created_at >= '2026-04-01';
```

Output:

```txt
                                                       QUERY PLAN
-------------------------------------------------------------------------------------------------------------------------
 Bitmap Heap Scan on orders
   Recheck Cond: ((status = 'pending'::text) AND (created_at >= '2026-04-01 00:00:00+00'::timestamp with time zone))
   ->  Bitmap Index Scan on orders_status_created
         Index Cond: ((status = 'pending'::text) AND (created_at >= '2026-04-01 00:00:00+00'::timestamp with time zone))
```

Without the leading column, PostgreSQL 17 cannot seek into this index:

```sql
EXPLAIN (COSTS OFF) SELECT id FROM orders WHERE created_at >= '2026-05-01';
```

Output:

```txt
                                  QUERY PLAN
------------------------------------------------------------------------------
 Seq Scan on orders
   Filter: (created_at >= '2026-05-01 00:00:00+00'::timestamp with time zone)
```

Interview note:

PostgreSQL 18 adds **skip scan** for B-trees: with a low-cardinality leading
column such as `status`, the index can be probed once per distinct value, so
`WHERE created_at >= ...` becomes usable. On 17 and earlier, design the index
order around the queries — equality columns first, then the range or sort column.

## 12. Why Isn't PostgreSQL Using My Index?

A checklist, with the two most surprising causes shown.

**A type mismatch.** Comparing a `bigint` column with a `numeric` value —
`42.0`, which some drivers send for JavaScript numbers — casts the **column**, and
the index is unusable:

```sql
EXPLAIN (COSTS OFF) SELECT * FROM orders WHERE id = 42.0;
```

Output:

```txt
               QUERY PLAN
----------------------------------------
 Gather
   Workers Planned: 1
   ->  Parallel Seq Scan on orders
         Filter: ((id)::numeric = 42.0)
```

**`LIKE 'prefix%'` under a non-C collation.** Most databases are created with a
locale such as `en_US.UTF-8`, where a plain B-tree cannot serve `LIKE`:

```sql
CREATE TABLE products (id int PRIMARY KEY, name text COLLATE "en-x-icu");
INSERT INTO products
SELECT g, 'product-' || g FROM generate_series(1, 10000) AS g;
CREATE INDEX products_name ON products (name);
ANALYZE products;
EXPLAIN (COSTS OFF) SELECT id FROM products WHERE name LIKE 'product-42%';
```

Output:

```txt
               QUERY PLAN
-----------------------------------------
 Seq Scan on products
   Filter: (name ~~ 'product-42%'::text)
```

A `text_pattern_ops` index compares byte by byte and serves prefix patterns:

```sql
CREATE INDEX products_name_pattern ON products (name text_pattern_ops);
EXPLAIN (COSTS OFF) SELECT id FROM products WHERE name LIKE 'product-42%';
```

Output:

```txt
                                       QUERY PLAN
----------------------------------------------------------------------------------------
 Bitmap Heap Scan on products
   Filter: (name ~~ 'product-42%'::text)
   ->  Bitmap Index Scan on products_name_pattern
         Index Cond: ((name ~>=~ 'product-42'::text) AND (name ~<~ 'product-43'::text))
```

The full checklist:

| Cause | Fix |
| --- | --- |
| Most rows match | nothing — the sequential scan is correct |
| Function or cast on the column | expression index, or rewrite (`created_at >= ... AND < ...`) |
| Type mismatch between column and value | send the column's type |
| `LIKE` under a non-C collation | `text_pattern_ops` |
| Leading wildcard `LIKE '%x%'` | a `pg_trgm` GIN index |
| Not the leftmost prefix of a multicolumn index | reorder, or add an index |
| Stale statistics after a bulk load | `ANALYZE` |
| `OR` across different columns | separate indexes combined with `BitmapOr`, or `UNION` |
| Tiny table | nothing — a few pages are cheaper to scan |
| `random_page_cost = 4` on SSD storage | set it to about `1.1` so index access is costed realistically |

## 13. How Does Locking Work, And What Is The Lock Queue Problem?

Row-level locks come from writes and `SELECT ... FOR UPDATE`; they block only
other writers of the same rows. **Table-level** locks come from every statement:

| Statement | Table lock | Conflicts with |
| --- | --- | --- |
| `SELECT` | `ACCESS SHARE` | only `ACCESS EXCLUSIVE` |
| `INSERT`, `UPDATE`, `DELETE` | `ROW EXCLUSIVE` | `SHARE` and stronger |
| `CREATE INDEX CONCURRENTLY`, `VACUUM` | `SHARE UPDATE EXCLUSIVE` | schema changes, another `VACUUM` |
| `CREATE INDEX` | `SHARE` | writes |
| Most `ALTER TABLE`, `DROP`, `VACUUM FULL` | `ACCESS EXCLUSIVE` | **everything**, including `SELECT` |

The dangerous part is the **queue**. Captured from three sessions: A runs a slow
read, B tries a quick `ALTER TABLE`, C is a normal `SELECT` from the application:

```txt
  pid  | blocked_by | waiting_on |                query
-------+------------+------------+-------------------------------------
 76192 | {}         | Timeout    | SELECT pg_sleep(4);
 76198 | {76192}    | Lock       | ALTER TABLE t ADD COLUMN note text;
 76250 | {76198}    | Lock       | SELECT 'C read', count(*) FROM t;
```

B waits for A's `ACCESS SHARE` lock. C does not conflict with A — but it queues
**behind B**, because B's `ACCESS EXCLUSIVE` request is first in line. A simple
`SELECT` waited 3.6 seconds; in production, every request to the table queues
the same way, the connection pool fills, and the application goes down — caused
by an `ALTER TABLE` that needs only milliseconds once it has its lock.

The fix is a lock timeout, so the migration gives up instead of queueing:

```txt
B: SET lock_timeout = '1s';
B: ALTER TABLE t ADD COLUMN note text;
B: ERROR:  canceling statement due to lock timeout      -- after 1 second
C: SELECT finished                                     -- immediately afterwards
```

Retry the migration in a loop until it catches a quiet moment.

Diagnosing live blocking:

```sql
SELECT pid, pg_blocking_pids(pid) AS blocked_by, wait_event_type, state,
       now() - xact_start AS xact_age, left(query, 60) AS query
FROM pg_stat_activity
WHERE state <> 'idle'
ORDER BY xact_start;
```

## 14. How Do You Run Schema Migrations Without Downtime?

Which changes **rewrite the table** — holding `ACCESS EXCLUSIVE` for the whole
rewrite — can be seen from the table's file node, which changes on a rewrite:

```sql
CREATE TABLE big (id int PRIMARY KEY, name varchar(50));
INSERT INTO big SELECT g, 'name ' || g FROM generate_series(1, 100000) AS g;
CREATE TEMP TABLE steps (n serial, step text, node oid);
INSERT INTO steps (step, node) VALUES ('start', pg_relation_filenode('big'));
ALTER TABLE big ADD COLUMN status text NOT NULL DEFAULT 'active';
INSERT INTO steps (step, node) VALUES (
  'ADD COLUMN ... DEFAULT ''active''', pg_relation_filenode('big'));
ALTER TABLE big ALTER COLUMN name TYPE varchar(100);
INSERT INTO steps (step, node) VALUES (
  'varchar(50) -> varchar(100)', pg_relation_filenode('big'));
ALTER TABLE big ALTER COLUMN id TYPE bigint;
INSERT INTO steps (step, node) VALUES (
  'int -> bigint', pg_relation_filenode('big'));
ALTER TABLE big ADD COLUMN created_at timestamptz DEFAULT clock_timestamp();
INSERT INTO steps (step, node) VALUES (
  'ADD COLUMN ... DEFAULT clock_timestamp()', pg_relation_filenode('big'));
SELECT step, rewrote_table
FROM (
  SELECT n, step, node <> lag(node) OVER (ORDER BY n) AS rewrote_table
  FROM steps
) s
WHERE n > 1
ORDER BY n;
```

Output:

```txt
                   step                   | rewrote_table
------------------------------------------+---------------
 ADD COLUMN ... DEFAULT 'active'          | f
 varchar(50) -> varchar(100)              | f
 int -> bigint                            | t
 ADD COLUMN ... DEFAULT clock_timestamp() | t
```

- A column with a **constant** default is instant since PostgreSQL 11 — the
  default is stored once in the catalog, not written into every row.
- A **volatile** default (`clock_timestamp()`, `gen_random_uuid()`) must be
  computed per row, so it rewrites.
- Widening a `varchar` is free; `int` to `bigint` rewrites the table and every
  index. Choose `bigint` for ids on day one.

`CREATE INDEX CONCURRENTLY` builds an index without blocking writes, but it
cannot run inside a transaction — which trips up migration tools that wrap every
migration in one:

```sql
BEGIN;
CREATE INDEX CONCURRENTLY big_name_idx ON big (name);
ROLLBACK;
```

Output:

```txt
ERROR:  CREATE INDEX CONCURRENTLY cannot run inside a transaction block
```

If a concurrent build fails, it leaves an **invalid** index behind; drop it and
retry.

The rules:

- Set `lock_timeout` (a few seconds) on every migration, and retry
- `CREATE INDEX CONCURRENTLY` / `DROP INDEX CONCURRENTLY`, outside a transaction
- New constraints as `NOT VALID`, then `VALIDATE CONSTRAINT` separately
- `SET NOT NULL` on a big table: add `CHECK (col IS NOT NULL) NOT VALID`,
  validate it, then `SET NOT NULL` — PostgreSQL 12+ uses the valid check and
  skips the full scan
- Renames and type changes through expand and contract: add, backfill in batches,
  switch reads, drop later

## 15. Why Do You Need A Connection Pooler Like PgBouncer?

Each PostgreSQL connection is an operating-system **process** with its own memory.
`max_connections` defaults to 100, and raising it into the thousands costs memory
and CPU even when the connections are idle.

```txt
40 app instances x pool of 20 = 800 connections      -> too many for one server
40 app instances -> PgBouncer -> 50 server connections
```

| PgBouncer mode | A server connection is held for | Breaks |
| --- | --- | --- |
| Session | the client's whole session | nothing — but pools little |
| **Transaction** | one transaction | session state: `SET`, session advisory locks, `LISTEN`, temp tables, `WITH HOLD` cursors |
| Statement | one statement | multi-statement transactions |

Transaction mode is the usual choice. Keep per-request settings inside the
transaction with `SET LOCAL`, and use a recent PgBouncer (1.21+) or your driver's
settings for prepared statements.

Important:

Pool size is a throughput setting, not a capacity one. A database with 16 cores
does its best work with a few dozen **active** queries; more connections only add
contention. Also set `idle_in_transaction_session_timeout`, so a crashed client
cannot hold locks and block VACUUM indefinitely.

## 16. Which Memory And Planner Settings Matter Most?

Defaults on a fresh PostgreSQL 17 — tiny, and meant to be tuned:

| Setting | Default | Typical starting point |
| --- | --- | --- |
| `shared_buffers` | 128MB | ~25% of RAM |
| `effective_cache_size` | 4GB | ~50–75% of RAM — a planner hint, allocates nothing |
| `work_mem` | 4MB | 16–64MB; per sort or hash node |
| `maintenance_work_mem` | 64MB | 512MB–2GB, for `VACUUM` and `CREATE INDEX` |
| `random_page_cost` | 4 | ~1.1 on SSDs |
| `max_connections` | 100 | low hundreds at most — pool instead |
| `max_wal_size` | 1GB | larger on write-heavy systems, to space out checkpoints |
| `statement_timeout` | 0 (off) | a few seconds for web requests, per role |
| `lock_timeout` | 0 (off) | a few seconds for migrations |
| `idle_in_transaction_session_timeout` | 0 (off) | a minute or so |

```sql
ALTER ROLE web_app SET statement_timeout = '5s';
ALTER ROLE reporting SET work_mem = '256MB';
```

Interview note:

`shared_buffers` is not "all the RAM". PostgreSQL reads through the operating
system's file cache, so the rest of memory still caches data — a second layer that
`effective_cache_size` tells the planner about.

## 17. What Are WAL And Checkpoints?

The **write-ahead log** records every change before the data files are updated.
A commit is durable once its WAL record is flushed to disk; the data pages can be
written later.

```viz
type: flow
title: A committed UPDATE
Change the page in shared_buffers :: the data page is now dirty, in memory only
Write the WAL record :: to the WAL buffers
COMMIT flushes the WAL to disk :: fsync — now the change survives a crash
Checkpoint writes dirty pages :: data files catch up; older WAL can be recycled
Crash recovery :: replays WAL from the last checkpoint
```

Settings and tradeoffs:

- **Checkpoints** (every `checkpoint_timeout`, 5 minutes by default, or when
  `max_wal_size` fills) write every dirty page. `checkpoint_completion_target`
  (0.9) spreads that I/O across the interval instead of bursting it.
- **`synchronous_commit = off`** returns before the WAL flush. A crash can lose
  the last fraction of a second of commits — but never corrupts data. Reasonable
  per transaction for logs or metrics; never for payments.
- **`full_page_writes`** writes a whole page to WAL the first time it changes
  after a checkpoint, protecting against torn pages. It is why WAL volume jumps
  right after each checkpoint.

WAL is also what **replication**, **point-in-time recovery**, and **logical
decoding** are built on.

## 18. How Does PostgreSQL Replication Work?

| | Streaming (physical) | Logical |
| --- | --- | --- |
| Copies | WAL — the whole cluster, byte for byte | row changes, per table |
| Replica is | a read-only hot standby | a normal, writable database |
| Versions | same major version | can differ — used for major upgrades |
| Replicates DDL and sequences | yes | no |
| Uses | high availability, read scaling | upgrades, migrations, change data capture |

Streaming replication is asynchronous by default: a replica lags, and failover
can lose the last commits. `synchronous_standby_names` with `synchronous_commit =
on` waits for a standby to confirm, trading latency for zero data loss.

Watch lag on the primary:

```sql
SELECT client_addr, state, write_lag, flush_lag, replay_lag
FROM pg_stat_replication;
```

Interview trap:

**Replication slots** guarantee the primary keeps WAL until a consumer has
received it. A replica or CDC connector that disappears leaves its slot behind,
and WAL accumulates until the disk fills and the primary stops. Monitor
`pg_replication_slots` and set `max_slot_wal_keep_size` (default -1: unlimited).

Interview note:

Queries on a hot standby can be cancelled with "canceling statement due to
conflict with recovery", because replay needs to remove rows the query still
sees. `hot_standby_feedback = on` prevents that by holding back VACUUM on the
**primary** — which moves the cost to bloat there. Long analytical queries belong
on a replica configured for them, or a separate system.

## 19. When And How Do You Partition A Table?

Declarative partitioning splits one logical table into child tables by a key.
Queries that filter on the key touch only the relevant partitions:

```sql
CREATE TABLE events (id bigint, created_at timestamptz NOT NULL, payload text)
  PARTITION BY RANGE (created_at);
CREATE TABLE events_2026_01 PARTITION OF events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE events_2026_02 PARTITION OF events
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE events_2026_03 PARTITION OF events
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
INSERT INTO events
SELECT g, timestamptz '2026-01-01' + g * interval '1 minute', 'x'
FROM generate_series(0, 120000) AS g;
EXPLAIN (COSTS OFF)
SELECT count(*) FROM events
WHERE created_at >= '2026-02-10' AND created_at < '2026-02-20';
```

Output:

```txt
                                                                         QUERY PLAN
------------------------------------------------------------------------------------------------------------------------------------------------------------
 Aggregate
   ->  Seq Scan on events_2026_02 events
         Filter: ((created_at >= '2026-02-10 00:00:00+00'::timestamp with time zone) AND (created_at < '2026-02-20 00:00:00+00'::timestamp with time zone))
```

Only `events_2026_02` was scanned — **partition pruning**. Without a filter on the
key, every partition is read.

Retention becomes a metadata operation instead of a huge `DELETE`:

```sql
ALTER TABLE events DETACH PARTITION events_2026_01;
DROP TABLE events_2026_01;
```

Interview trap:

A primary key or unique constraint must **include the partition key**, because
each partition enforces uniqueness only within itself:

```sql
ALTER TABLE events ADD PRIMARY KEY (id);
```

Output:

```txt
ERROR:  unique constraint on partitioned table must include all partitioning columns
DETAIL:  PRIMARY KEY constraint on table "events" lacks column "created_at" which is part of the partition key.
```

`PRIMARY KEY (id, created_at)` works — but no longer guarantees `id` alone is
unique across the table.

When to use it:

- time-series or log data with retention — drop old months instantly
- very large tables where most queries target a recent slice
- bulk loads into a new partition, then attach it

When not to use it:

As a first performance fix. Partitioning a table whose queries do not filter on
the key makes them slower, and thousands of partitions slow planning. Tens of
millions of rows with good indexes are usually fine unpartitioned.

## 20. How Do You Back Up PostgreSQL And Restore To A Point In Time?

| Method | What it is | Point-in-time? | Suited to |
| --- | --- | --- | --- |
| `pg_dump` / `pg_restore` | logical export of one database | no | small databases, migrations, copying data between environments |
| `pg_basebackup` + WAL archiving | physical copy plus every WAL segment since | **yes** | self-managed production |
| Incremental backups (17+) | `pg_basebackup --incremental`, merged by `pg_combinebackup` | yes, with WAL | large clusters with limited change per day |
| Managed snapshots | RDS, Cloud SQL, and similar | yes, within the retention window | managed services |

**Point-in-time recovery** restores a base backup, then replays archived WAL up to
a target — `recovery_target_time = '2026-03-10 14:29:00+00'`, just before someone
ran the bad `DELETE`.

Important:

- `pg_dump` is consistent but **not** incremental, and restoring a large dump —
  loading data, rebuilding every index — can take hours. It is not a disaster
  recovery plan for a big database.
- A replica is not a backup: the bad `DELETE` replicates in milliseconds.
- Test restores on a schedule, and time them. The restore time is your real RTO.

## 21. How Do You Find The Slow Queries?

**`pg_stat_statements`** aggregates every query shape — constants replaced by
parameters — with call counts and timings. It needs
`shared_preload_libraries = 'pg_stat_statements'` and a restart, then:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT pg_stat_statements_reset();
SELECT count(*) FROM orders WHERE customer_id = 42;
SELECT count(*) FROM orders WHERE customer_id = 43;
SELECT count(*) FROM orders WHERE customer_id = 44;
```

```sql
SELECT calls, rows, query
FROM pg_stat_statements
WHERE query LIKE '%FROM orders WHERE customer_id%'
ORDER BY calls DESC;
```

Output:

```txt
 calls | rows |                       query
-------+------+----------------------------------------------------
     3 |    3 | SELECT count(*) FROM orders WHERE customer_id = $1
```

Three statements with different ids became one entry, with `$1` in place of the
value. In production, sort by `total_exec_time` — a 5ms query called a million
times a day matters more than a 2-second report run once.

```sql
SELECT calls,
       round(total_exec_time) AS total_ms,
       round(mean_exec_time, 2) AS mean_ms,
       left(query, 60) AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

The rest of the toolkit:

| Tool | Answers |
| --- | --- |
| `log_min_duration_statement = '500ms'` | which individual executions were slow, with their parameters |
| `auto_explain` | the plan of each slow execution, logged automatically |
| `pg_stat_activity` | what is running **now**, waiting on what, for how long |
| `pg_stat_user_tables` | `seq_scan` versus `idx_scan`, dead tuples, last vacuum |
| `pg_stat_user_indexes` | indexes with `idx_scan = 0` — candidates to drop |
| `pg_locks`, `pg_blocking_pids()` | who blocks whom |

## 22. What Are The Common PostgreSQL Performance Problems?

**Unindexed foreign keys.** PostgreSQL indexes the referenced primary key but
**not** the referencing column. Deleting a parent must then scan the child table
to check for rows — hidden inside a trigger:

```sql
CREATE TABLE parents (id int PRIMARY KEY);
CREATE TABLE children (
  id        int PRIMARY KEY,
  parent_id int REFERENCES parents ON DELETE CASCADE
);
INSERT INTO parents SELECT g FROM generate_series(1, 1000) AS g;
INSERT INTO children
SELECT g, g % 1000 + 1 FROM generate_series(1, 200000) AS g;
ANALYZE parents, children;
BEGIN;
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY OFF) DELETE FROM parents WHERE id = 1;
ROLLBACK;
```

Output (numbers vary by run):

```txt
                                        QUERY PLAN
------------------------------------------------------------------------------------------
 Delete on parents (actual time=0.011..0.012 rows=0 loops=1)
   ->  Index Scan using parents_pkey on parents (actual time=0.005..0.005 rows=1 loops=1)
         Index Cond: (id = 1)
 Trigger for constraint children_parent_id_fkey: time=7.336 calls=1
```

The plan for the `DELETE` itself is instant; the time is in the foreign-key
trigger, which scanned all 200,000 children. With an index on `parent_id`:

```sql
CREATE INDEX children_parent_id_idx ON children (parent_id);
BEGIN;
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY OFF) DELETE FROM parents WHERE id = 1;
ROLLBACK;
```

Output (numbers vary by run):

```txt
                                        QUERY PLAN
------------------------------------------------------------------------------------------
 Delete on parents (actual time=0.036..0.037 rows=0 loops=1)
   ->  Index Scan using parents_pkey on parents (actual time=0.010..0.010 rows=1 loops=1)
         Index Cond: (id = 1)
 Trigger for constraint children_parent_id_fkey: time=0.732 calls=1
```

The trigger time fell by roughly ten times, and the gap grows with the child
table: on 200 million children, every deleted parent without the index is a full
scan of the child table.

**`COUNT(*)` on a huge table.** MVCC means an exact count must check visibility
row by row. When "about 200,000" is good enough, read the planner's estimate:

```sql
SELECT reltuples::bigint AS estimated_rows
FROM pg_class
WHERE relname = 'orders';
```

Output:

```txt
 estimated_rows
----------------
         200000
```

The rest of the usual suspects:

| Problem | Sign | Fix |
| --- | --- | --- |
| `OFFSET` pagination | slow deep pages | keyset pagination on an indexed sort key |
| N+1 queries from an ORM | thousands of tiny identical queries in `pg_stat_statements` | eager loading, `IN` lists, joins |
| Stale statistics after a bulk load | estimates far from actual | `ANALYZE` after large loads |
| Bloat | table far larger than its live data | find what blocks VACUUM; tune autovacuum; `pg_repack` |
| Idle in transaction | old `xact_start` in `pg_stat_activity` | fix the code path; `idle_in_transaction_session_timeout` |
| Too many connections | memory pressure, contention | a pooler |
| `jsonb` filters without an index | sequential scans on `@>` | GIN index |
| A function or cast on a filtered column | index ignored | expression index or rewrite |

Strong answer:

> I start with `pg_stat_statements` sorted by total time, then `EXPLAIN (ANALYZE,
> BUFFERS)` on the worst offenders, comparing estimated and actual rows at each
> node. Most problems fall into a few buckets: a missing index — often on a
> foreign key, since PostgreSQL does not create those — a type or function
> mismatch that hides an index, stale or naive statistics, or bloat from
> something blocking VACUUM. Operationally I set statement, lock, and
> idle-in-transaction timeouts, pool connections, and alert on replication slots
> and transaction id age, because those are the failures that take a database
> down rather than merely slow it.

## Sources Used

- <https://www.postgresql.org/docs/current/mvcc.html>
- <https://www.postgresql.org/docs/current/routine-vacuuming.html>
- <https://www.postgresql.org/docs/current/storage-hot.html>
- <https://www.postgresql.org/docs/current/using-explain.html>
- <https://www.postgresql.org/docs/current/indexes-types.html>
- <https://www.postgresql.org/docs/current/indexes-index-only-scans.html>
- <https://www.postgresql.org/docs/current/planner-stats.html>
- <https://www.postgresql.org/docs/current/explicit-locking.html>
- <https://www.postgresql.org/docs/current/runtime-config-resource.html>
- <https://www.postgresql.org/docs/current/wal-intro.html>
- <https://www.postgresql.org/docs/current/high-availability.html>
- <https://www.postgresql.org/docs/current/ddl-partitioning.html>
- <https://www.postgresql.org/docs/current/continuous-archiving.html>
- <https://www.postgresql.org/docs/current/pgstatstatements.html>
- <https://www.pgbouncer.org/features.html>
