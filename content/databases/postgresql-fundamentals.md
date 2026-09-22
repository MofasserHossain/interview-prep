# PostgreSQL Essentials Interview Guide

PostgreSQL-specific interview guidance: how it differs from MySQL, choosing data
types, `timestamptz`, identity columns and UUIDs, `jsonb`, arrays, `RETURNING`,
`ON CONFLICT` and `MERGE`, `DISTINCT ON`, `LATERAL` joins, `generate_series`,
`FILTER` and `ROLLUP`, views and materialized views, data-modifying and
cycle-safe CTEs, constraints beyond the basics, schemas and roles, row-level
security, functions and triggers, full-text search, extensions, job queues with
`SKIP LOCKED`, and isolation levels.

The SQL Fundamentals guide covers portable SQL with MySQL examples; this guide
covers what PostgreSQL does differently, or better. Every example ran on
PostgreSQL 17 in `psql`, with `\pset null NULL` so nulls are visible. Each
question starts from an empty database, and sessions use UTC unless an example
sets the time zone itself.

## 1. What Makes PostgreSQL Different From MySQL?

| | PostgreSQL | MySQL (InnoDB) |
| --- | --- | --- |
| Connections | one **process** per connection | one thread per connection |
| Table storage | heap; every index points to a row version | clustered on the primary key |
| MVCC | old row versions stay in the table until `VACUUM` | old versions kept in an undo log |
| Default isolation | `READ COMMITTED` | `REPEATABLE READ` |
| DDL | **transactional** — can be rolled back | implicit commit |
| Index types | B-tree, hash, GIN, GiST, SP-GiST, BRIN; partial, expression, covering | B-tree, full-text, spatial; functional via generated columns |
| Extensibility | custom types, operators, index methods, extensions | plugins, storage engines |
| Upsert | `ON CONFLICT`, `MERGE` | `ON DUPLICATE KEY UPDATE` |
| `RETURNING` | yes | no |

Transactional DDL in practice — a failed migration leaves nothing behind:

```sql
BEGIN;
CREATE TABLE audit_log (id int);
INSERT INTO audit_log VALUES (1);
ROLLBACK;
SELECT to_regclass('audit_log') AS table_exists;
```

Output:

```txt
 table_exists
--------------
 NULL
```

The `CREATE TABLE` was rolled back along with the insert. In MySQL the
`CREATE TABLE` would have committed immediately.

Interview note:

Most differences that matter in production come from the storage model. Because
PostgreSQL keeps old row versions in the table itself, `UPDATE`-heavy workloads
need healthy autovacuum, and every index on a table is touched on most updates.
The PostgreSQL Internals & Performance guide covers both.

## 2. Which Data Types Should You Choose?

| Need | Use | Avoid |
| --- | --- | --- |
| Ids | `bigint GENERATED ALWAYS AS IDENTITY`, or `uuid` | `serial` in new code, `int` if growth is plausible |
| Money | `numeric(12, 2)` | `real`, `double precision`, the `money` type |
| Text | `text`, with a `CHECK` for length if needed | `char(n)` |
| Points in time | `timestamptz` | `timestamp` for events |
| Durations | `interval` | integer seconds with no unit |
| Flags | `boolean` | `smallint`, `'Y'`/`'N'` |
| Semi-structured data | `jsonb` | `json`, or text holding JSON |
| Fixed small sets | a lookup table or `CHECK`; `enum` when it truly never changes | free text |
| IP addresses | `inet`, `cidr` | text |

`text` and `varchar(n)` perform the same in PostgreSQL — the length is only a
constraint. It is enforced strictly, never by silent truncation:

```sql
CREATE TABLE users (country_code varchar(2));
INSERT INTO users VALUES ('BGD');
```

Output:

```txt
ERROR:  value too long for type character varying(2)
```

Floating point cannot represent most decimal fractions, which is why money uses
`numeric`:

```sql
SELECT 0.1::float8 + 0.2::float8           AS float_sum,
       0.1::numeric + 0.2::numeric         AS numeric_sum,
       0.1::float8 + 0.2::float8 = 0.3     AS float_equals;
```

Output:

```txt
      float_sum      | numeric_sum | float_equals
---------------------+-------------+--------------
 0.30000000000000004 |         0.3 | f
```

## 3. What Is The Difference Between `timestamp` And `timestamptz`?

`timestamptz` stores an **instant**: input is converted to UTC using the session
time zone, and output is converted back to the session time zone. `timestamp`
stores a **wall-clock reading** with no zone at all.

```sql
CREATE TABLE events (id int, at_tz timestamptz, at_plain timestamp);
SET TIME ZONE 'Asia/Dhaka';
INSERT INTO events VALUES (1, '2026-03-10 09:00', '2026-03-10 09:00');
SET TIME ZONE 'UTC';
SELECT id, at_tz, at_plain FROM events;
```

Output:

```txt
 id |         at_tz          |      at_plain
----+------------------------+---------------------
  1 | 2026-03-10 03:00:00+00 | 2026-03-10 09:00:00
```

Both inputs said 09:00, typed by someone in Dhaka. The `timestamptz` column knows
that was 03:00 UTC; the `timestamp` column still says 09:00 and has forgotten
whose 09:00 it was.

Converting an instant to a local wall-clock time for display:

```sql
SELECT timestamptz '2026-03-10 03:00+00' AT TIME ZONE 'Asia/Dhaka'
       AS dhaka_local;
```

Output:

```txt
     dhaka_local
---------------------
 2026-03-10 09:00:00
```

When to use it:

- `timestamptz` for anything that happened: orders, logins, events
- `timestamp` for a wall-clock rule independent of place — "the shop opens at
  09:00" — stored alongside the zone it applies in
- `date` for birthdays and business dates

Interview trap:

`now()` returns the **start of the transaction**, and every call in the same
transaction returns the same value. `clock_timestamp()` returns the real time:

```sql
BEGIN;
CREATE TEMP TABLE t AS SELECT now() AS first_now;
DO $$ BEGIN PERFORM pg_sleep(0.2); END $$;
SELECT now() = first_now             AS now_is_frozen,
       clock_timestamp() > first_now AS clock_moved
FROM t;
COMMIT;
```

Output:

```txt
 now_is_frozen | clock_moved
---------------+-------------
 t             | t
```

That is usually what you want — every row a transaction writes gets the same
`created_at` — but it surprises people timing work inside a long transaction.

## 4. `serial` vs Identity Columns vs UUIDs

`serial` is a shorthand that creates a sequence and a default. **Identity
columns** (PostgreSQL 10+) are the SQL-standard replacement: the sequence belongs
to the column, and `GENERATED ALWAYS` stops application code from supplying ids.

```sql
CREATE TABLE invoices (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  total numeric(12, 2) NOT NULL
);
INSERT INTO invoices (id, total) VALUES (100, 9.99);
```

Output:

```txt
ERROR:  cannot insert a non-DEFAULT value into column "id"
DETAIL:  Column "id" is an identity column defined as GENERATED ALWAYS.
HINT:  Use OVERRIDING SYSTEM VALUE to override.
```

Interview trap:

Sequences are **not transactional**. A rolled-back insert still consumes a
number, so ids have gaps:

```sql
BEGIN;
INSERT INTO invoices (total) VALUES (10);
ROLLBACK;
INSERT INTO invoices (total) VALUES (20);
SELECT * FROM invoices;
```

Output:

```txt
 id | total
----+-------
  2 | 20.00
```

Never use an identity column where the business needs gap-free numbers, such as
legally sequential invoice numbers — generate those separately, under a lock.

UUIDs:

- `gen_random_uuid()` is built in since PostgreSQL 13 and produces a random
  version 4 UUID.
- Random UUIDs scatter inserts across the whole primary key index, which hurts
  cache hit rates and write amplification on large tables.
- PostgreSQL 18 adds `uuidv7()`, which is **time-ordered**: new values append to
  the end of the index like a sequence, while staying globally unique.

| | `bigint` identity | UUID v4 | UUID v7 |
| --- | --- | --- | --- |
| Size | 8 bytes | 16 bytes | 16 bytes |
| Generated | by the database | anywhere | anywhere |
| Index locality | excellent | poor | good |
| Leaks row count and order | yes | no | creation time only |

## 5. When Do You Use `jsonb`, And How Do You Query It?

`jsonb` stores JSON in a **decomposed binary** form: keys are deduplicated and
sorted, whitespace is dropped, and the value can be indexed. `json` stores the
original text verbatim.

```sql
SELECT '{"b": 1, "a": 2, "a": 3}'::json  AS as_json,
       '{"b": 1, "a": 2, "a": 3}'::jsonb AS as_jsonb;
```

Output:

```txt
         as_json          |     as_jsonb
--------------------------+------------------
 {"b": 1, "a": 2, "a": 3} | {"a": 3, "b": 1}
```

Querying:

```sql
CREATE TABLE products (id int PRIMARY KEY, data jsonb NOT NULL);
INSERT INTO products VALUES
  (1, '{"name": "Laptop", "price": 1200, "tags": ["tech", "sale"],
        "specs": {"ram": 16}}'),
  (2, '{"name": "Desk", "price": 300, "tags": ["home"],
        "specs": {"ram": null}}'),
  (3, '{"name": "Phone", "price": 800, "tags": ["tech"],
        "specs": {"ram": 8}, "color": "black"}');
SELECT id,
       data ->> 'name'              AS name,       -- text
       (data ->> 'price')::int      AS price,      -- cast before doing maths
       data -> 'specs' -> 'ram'     AS ram_jsonb,  -- still jsonb
       data #>> '{specs,ram}'       AS ram_text    -- path, as text
FROM products
ORDER BY id;
```

Output:

```txt
 id |  name  | price | ram_jsonb | ram_text
----+--------+-------+-----------+----------
  1 | Laptop |  1200 | 16        | 16
  2 | Desk   |   300 | null      | NULL
  3 | Phone  |   800 | 8         | 8
```

Note the difference on the Desk: `ram_jsonb` holds the JSON value `null`, while
`ram_text` is an SQL `NULL`.

Containment (`@>`) and key existence (`?`) are the operators a GIN index serves:

```sql
SELECT id, data ->> 'name' AS name
FROM products
WHERE data @> '{"tags": ["sale"]}';
```

Output:

```txt
 id |  name
----+--------
  1 | Laptop
```

```sql
CREATE INDEX products_data_idx ON products USING gin (data jsonb_path_ops);
SET enable_seqscan = off;     -- three rows would never use an index otherwise
EXPLAIN (COSTS OFF) SELECT id FROM products WHERE data @> '{"tags": ["sale"]}';
```

Output:

```txt
                        QUERY PLAN
-----------------------------------------------------------
 Bitmap Heap Scan on products
   Recheck Cond: (data @> '{"tags": ["sale"]}'::jsonb)
   ->  Bitmap Index Scan on products_data_idx
         Index Cond: (data @> '{"tags": ["sale"]}'::jsonb)
```

| Index | Serves |
| --- | --- |
| `gin (data)` | `@>`, `?`, `?|`, `?&` — any key |
| `gin (data jsonb_path_ops)` | `@>` only; smaller and faster |
| `btree ((data ->> 'email'))` | equality and sorting on one known path |

When to use it:

- genuinely variable attributes — product specifications, form answers,
  integration payloads
- data you store and return whole, rarely filter on

When not to use it:

For fields you filter, join, or constrain on every day. A column has statistics,
a type, `NOT NULL`, foreign keys, and cheap updates; a `jsonb` key has none of
those, and changing one key rewrites the whole value.

## 6. How Do Arrays Work, And When Are They A Mistake?

```sql
CREATE TABLE posts (id int PRIMARY KEY, title text, tags text[]);
INSERT INTO posts VALUES
  (1, 'Indexing', '{postgres,performance}'),
  (2, 'Joins',    '{sql}'),
  (3, 'VACUUM',   '{postgres,maintenance}');
SELECT id, title FROM posts WHERE 'postgres' = ANY (tags) ORDER BY id;
```

Output:

```txt
 id |  title
----+----------
  1 | Indexing
  3 | VACUUM
```

Containment — posts tagged with **both** values, which a GIN index can serve:

```sql
SELECT id, title FROM posts WHERE tags @> ARRAY['postgres', 'performance'];
```

Output:

```txt
 id |  title
----+----------
  1 | Indexing
```

`unnest` turns an array back into rows — tag counts across all posts:

```sql
SELECT tag, count(*) AS posts
FROM posts, unnest(tags) AS tag
GROUP BY tag
ORDER BY posts DESC, tag;
```

Output:

```txt
     tag     | posts
-------------+-------
 postgres    |     2
 maintenance |     1
 performance |     1
 sql         |     1
```

When not to use it:

When the elements are **entities**. An array of user ids cannot have a foreign
key, cannot carry a per-element attribute such as "added at", and is rewritten
whole on every change. That is a join table. Arrays suit small, value-like lists:
tags, labels, a few phone numbers.

## 7. `RETURNING`, `ON CONFLICT`, And `MERGE`

`RETURNING` sends back the rows a write produced — generated ids and defaults —
without a second query:

```sql
CREATE TABLE settings (
  user_id    int PRIMARY KEY,
  theme      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO settings (user_id, theme) VALUES (1, 'light')
RETURNING user_id, theme;
```

Output:

```txt
 user_id | theme
---------+-------
       1 | light
```

An upsert that reports which rows were inserted. `xmax = 0` is true only for a
freshly inserted row version:

```sql
INSERT INTO settings (user_id, theme) VALUES (1, 'dark'), (2, 'light')
ON CONFLICT (user_id) DO UPDATE SET theme = EXCLUDED.theme, updated_at = now()
RETURNING user_id, theme, (xmax = 0) AS inserted;
```

Output:

```txt
 user_id | theme | inserted
---------+-------+----------
       1 | dark  | f
       2 | light | t
```

A `WHERE` on the update skips no-op writes — no new row version, no trigger, no
WAL:

```sql
INSERT INTO settings (user_id, theme) VALUES (1, 'dark')
ON CONFLICT (user_id) DO UPDATE SET theme = EXCLUDED.theme
WHERE settings.theme IS DISTINCT FROM EXCLUDED.theme
RETURNING user_id;
```

Output:

```txt
 user_id
---------
```

No rows came back: user 1 already had `dark`, so nothing was written.

`MERGE` (15+) applies a source to a target with several actions, and `RETURNING`
on `MERGE` arrived in 17 along with `merge_action()`:

```sql
CREATE TABLE stock (sku text PRIMARY KEY, qty int NOT NULL);
INSERT INTO stock VALUES ('KB', 5), ('MS', 2);
CREATE TABLE deliveries (sku text, qty int);
INSERT INTO deliveries VALUES ('KB', 3), ('PEN', 10), ('MS', -2);
MERGE INTO stock s
USING deliveries d ON s.sku = d.sku
WHEN MATCHED AND s.qty + d.qty <= 0 THEN DELETE
WHEN MATCHED THEN UPDATE SET qty = s.qty + d.qty
WHEN NOT MATCHED THEN INSERT (sku, qty) VALUES (d.sku, d.qty)
RETURNING merge_action() AS action, s.sku, s.qty;
```

Output:

```txt
 action | sku | qty
--------+-----+-----
 UPDATE | KB  |   8
 INSERT | PEN |  10
 DELETE | MS  |   2
```

Important:

`ON CONFLICT` is the **concurrency-safe** upsert: it relies on a unique index and
never raises a duplicate-key error for the conflict target. `MERGE` has no such
guarantee — two sessions merging the same new key at once can both try to
insert, and one fails with a unique violation. Use `ON CONFLICT` for upserts and
`MERGE` for batch synchronisation.

## 8. What Does `DISTINCT ON` Do?

`DISTINCT ON (expr)` keeps the **first row of each group**, where "first" is set
by `ORDER BY` — the PostgreSQL answer to "latest row per group".

```sql
CREATE TABLE orders (
  id         int PRIMARY KEY,
  customer   text,
  total      numeric(10, 2),
  created_at date
);
INSERT INTO orders VALUES
  (1, 'alice', 70,  '2026-01-05'), (2, 'bob',   40,  '2026-01-18'),
  (3, 'alice', 20,  '2026-02-20'), (4, 'carol', 70,  '2026-02-11'),
  (5, 'bob',   100, '2026-03-14'), (6, 'alice', 55,  '2026-03-01');
SELECT DISTINCT ON (customer) customer, id, total, created_at
FROM orders
ORDER BY customer, created_at DESC;
```

Output:

```txt
 customer | id | total  | created_at
----------+----+--------+------------
 alice    |  6 |  55.00 | 2026-03-01
 bob      |  5 | 100.00 | 2026-03-14
 carol    |  4 |  70.00 | 2026-02-11
```

Interview trap:

The `ORDER BY` must **start with** the `DISTINCT ON` expressions:

```sql
SELECT DISTINCT ON (customer) customer, id FROM orders ORDER BY created_at DESC;
```

Output:

```txt
ERROR:  SELECT DISTINCT ON expressions must match initial ORDER BY expressions
LINE 1: SELECT DISTINCT ON (customer) customer, id FROM orders ORDER...
                            ^
```

To present the result in another order, wrap it in a subquery and sort outside.

Tradeoff:

`DISTINCT ON` is shorter than `ROW_NUMBER() OVER (PARTITION BY ...)` and, with an
index on `(customer, created_at DESC)`, fast. It is PostgreSQL-only and returns
exactly one row per group; for "top 3 per group" use a window function or a
`LATERAL` join.

## 9. What Is A `LATERAL` Join?

A `LATERAL` subquery can reference columns of the tables **before it** — a
subquery that runs per row. The classic use is top N per group with a `LIMIT`:

```sql
CREATE TABLE customers (id int PRIMARY KEY, name text);
INSERT INTO customers VALUES (1, 'Alice'), (2, 'Bob'), (3, 'Carol');
CREATE TABLE orders (
  id          int PRIMARY KEY,
  customer_id int REFERENCES customers,
  total       numeric(10, 2),
  created_at  date
);
INSERT INTO orders VALUES
  (1, 1, 70, '2026-01-05'), (2, 2, 40, '2026-01-18'), (3, 1, 20, '2026-02-20'),
  (5, 2, 100, '2026-03-14'), (6, 1, 55, '2026-03-01');
SELECT c.name, o.id, o.total, o.created_at
FROM customers c
LEFT JOIN LATERAL (
  SELECT id, total, created_at
  FROM orders
  WHERE customer_id = c.id
  ORDER BY created_at DESC
  LIMIT 2
) o ON true
ORDER BY c.name, o.created_at DESC;
```

Output:

```txt
 name  |  id  | total  | created_at
-------+------+--------+------------
 Alice |    6 |  55.00 | 2026-03-01
 Alice |    3 |  20.00 | 2026-02-20
 Bob   |    5 | 100.00 | 2026-03-14
 Bob   |    2 |  40.00 | 2026-01-18
 Carol | NULL |   NULL | NULL
```

`LEFT JOIN LATERAL ... ON true` keeps Carol, who has no orders.

Why it matters:

With an index on `orders (customer_id, created_at DESC)`, each customer costs one
short index scan that stops after 2 rows. A `ROW_NUMBER()` over the whole
`orders` table must number every order before filtering. When customers are few
and orders many, `LATERAL` wins by orders of magnitude.

## 10. How Do You Build Time Buckets And Fill Missing Days?

`generate_series` produces rows from nothing — a calendar to join against, so
days with no sales still appear:

```sql
CREATE TABLE orders (id int, total numeric(10, 2), created_at timestamptz);
INSERT INTO orders VALUES
  (1, 120, '2026-03-01 10:00+00'),
  (2, 80,  '2026-03-01 15:00+00'),
  (3, 150, '2026-03-04 09:00+00');
SELECT day::date AS day, coalesce(sum(o.total), 0.00) AS revenue
FROM generate_series(timestamptz '2026-03-01', timestamptz '2026-03-05',
                     interval '1 day') AS day
LEFT JOIN orders o
  ON o.created_at >= day AND o.created_at < day + interval '1 day'
GROUP BY day
ORDER BY day;
```

Output:

```txt
    day     | revenue
------------+---------
 2026-03-01 |  200.00
 2026-03-02 |    0.00
 2026-03-03 |    0.00
 2026-03-04 |  150.00
 2026-03-05 |    0.00
```

Truncating to a period — and doing it in the business's time zone:

```sql
SELECT date_trunc('month', timestamptz '2026-01-31 20:00+00')
         AS utc_month,
       date_trunc('month', timestamptz '2026-01-31 20:00+00', 'Asia/Dhaka')
         AS dhaka_month;
```

Output:

```txt
       utc_month        |      dhaka_month
------------------------+------------------------
 2026-01-01 00:00:00+00 | 2026-01-31 18:00:00+00
```

The order at 20:00 UTC on January 31 belongs to February in Dhaka. The
three-argument `date_trunc` (12+) takes the zone explicitly instead of relying on
the session setting. `date_bin` (14+) buckets into arbitrary widths, such as 15
minutes.

## 11. What Are `FILTER`, `GROUPING SETS`, And `ROLLUP`?

`FILTER` restricts one aggregate to some rows — cleaner than `SUM(CASE WHEN ...)`.
`ROLLUP` adds subtotal and grand-total rows in the same query.

```sql
CREATE TABLE orders (id int, region text, status text, total numeric(10, 2));
INSERT INTO orders VALUES
  (1, 'north', 'paid', 100), (2, 'north', 'refunded', 40),
  (3, 'south', 'paid', 70),  (4, 'south', 'paid', 30), (5, 'north', 'paid', 60);
SELECT CASE WHEN GROUPING(region) = 1 THEN 'all regions' ELSE region END
         AS region,
       count(*)                                        AS orders,
       count(*)   FILTER (WHERE status = 'paid')       AS paid,
       sum(total) FILTER (WHERE status = 'paid')       AS paid_revenue
FROM orders
GROUP BY ROLLUP (region)
ORDER BY GROUPING(region), region;
```

Output:

```txt
   region    | orders | paid | paid_revenue
-------------+--------+------+--------------
 north       |      3 |    2 |       160.00
 south       |      2 |    2 |       100.00
 all regions |      5 |    4 |       260.00
```

`GROUPING(region) = 1` marks the total row. It is the reliable test: checking
`region IS NULL` breaks as soon as real data contains a null region.

| Clause | Produces |
| --- | --- |
| `GROUP BY ROLLUP (a, b)` | `(a, b)`, `(a)`, and the grand total |
| `GROUP BY CUBE (a, b)` | every combination: `(a, b)`, `(a)`, `(b)`, `()` |
| `GROUP BY GROUPING SETS ((a), (b))` | exactly the groupings listed |

## 12. Views vs Materialized Views

A **view** is a stored query, run on every read. A **materialized view** stores
the result, and is only as fresh as its last refresh.

```sql
CREATE TABLE orders (id int PRIMARY KEY, customer text, total numeric(10, 2));
INSERT INTO orders VALUES (1, 'alice', 70), (2, 'bob', 40), (3, 'alice', 20);
CREATE VIEW customer_totals_v AS
  SELECT customer, sum(total) AS spent FROM orders GROUP BY customer;
CREATE MATERIALIZED VIEW customer_totals_mv AS
  SELECT customer, sum(total) AS spent FROM orders GROUP BY customer;
CREATE UNIQUE INDEX ON customer_totals_mv (customer);
INSERT INTO orders VALUES (4, 'bob', 25);
SELECT 'view' AS source, * FROM customer_totals_v
UNION ALL
SELECT 'matview', * FROM customer_totals_mv
ORDER BY customer, source;
```

Output:

```txt
 source  | customer | spent
---------+----------+-------
 matview | alice    | 90.00
 view    | alice    | 90.00
 matview | bob      | 40.00
 view    | bob      | 65.00
```

The view already shows Bob's new order; the materialized view does not until it
is refreshed:

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY customer_totals_mv;
SELECT * FROM customer_totals_mv ORDER BY customer;
```

Output:

```txt
 customer | spent
----------+-------
 alice    | 90.00
 bob      | 65.00
```

Important:

- A plain `REFRESH` locks the materialized view against **reads** while it
  rebuilds. `CONCURRENTLY` keeps it readable, but requires a unique index and
  does more work.
- There is no incremental refresh: every refresh recomputes the whole query.
  Schedule it (`pg_cron`, or a job in the application), or maintain a summary
  table yourself when the source is huge.

## 13. What Can PostgreSQL CTEs Do Beyond Readability?

**Data-modifying CTEs** chain writes in one statement. Archive and delete expired
sessions atomically:

```sql
CREATE TABLE sessions (id int PRIMARY KEY, user_id int, expires_at timestamptz);
CREATE TABLE sessions_archive (LIKE sessions);
INSERT INTO sessions VALUES
  (1, 10, '2026-01-01'), (2, 11, '2027-01-01'), (3, 12, '2026-02-01');
WITH moved AS (
  DELETE FROM sessions WHERE expires_at < '2026-06-01' RETURNING *
)
INSERT INTO sessions_archive SELECT * FROM moved;
SELECT 'live' AS in_table, id FROM sessions
UNION ALL
SELECT 'archive', id FROM sessions_archive
ORDER BY in_table, id;
```

Output:

```txt
 in_table | id
----------+----
 archive  |  1
 archive  |  3
 live     |  2
```

**Cycle-safe recursion** — the `CYCLE` clause (14+) detects loops instead of
relying on a depth guard:

```sql
CREATE TABLE edges (src int, dst int);
INSERT INTO edges VALUES (1, 2), (2, 3), (3, 1), (3, 4);
WITH RECURSIVE walk (node, depth) AS (
  SELECT 1, 0
  UNION ALL
  SELECT e.dst, w.depth + 1 FROM walk w JOIN edges e ON e.src = w.node
) CYCLE node SET is_cycle USING path
SELECT node, depth, is_cycle, path FROM walk ORDER BY depth, node;
```

Output:

```txt
 node | depth | is_cycle |       path
------+-------+----------+-------------------
    1 |     0 | f        | {(1)}
    2 |     1 | f        | {(1),(2)}
    3 |     2 | f        | {(1),(2),(3)}
    1 |     3 | t        | {(1),(2),(3),(1)}
    4 |     3 | f        | {(1),(2),(3),(4)}
```

The walk reached node 1 again at depth 3, marked it `is_cycle = t`, and stopped
that branch; node 4 was still found.

Interview note:

Since PostgreSQL 12, a CTE referenced once and free of side effects is inlined
into the main query, so the planner can push filters into it. `MATERIALIZED`
forces the old behaviour — computed once, an optimization fence — and `NOT
MATERIALIZED` forces inlining.

## 14. Which Constraints Beyond `CHECK` And `UNIQUE` Should You Know?

**Exclusion constraints** generalise uniqueness to any operator. No two bookings
for the same room may overlap:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE bookings (
  room   int       NOT NULL,
  during tstzrange NOT NULL,
  EXCLUDE USING gist (room WITH =, during WITH &&)
);
INSERT INTO bookings VALUES (101, '[2026-03-01 10:00+00, 2026-03-01 11:00+00)');
INSERT INTO bookings VALUES (101, '[2026-03-01 10:30+00, 2026-03-01 12:00+00)');
```

Output:

```txt
ERROR:  conflicting key value violates exclusion constraint "bookings_room_during_excl"
DETAIL:  Key (room, during)=(101, ["2026-03-01 10:30:00+00","2026-03-01 12:00:00+00")) conflicts with existing key (room, during)=(101, ["2026-03-01 10:00:00+00","2026-03-01 11:00:00+00")).
```

The check happens inside the database, so no race between two booking requests
can slip past it. `[)` makes each range include its start and exclude its end, so
back-to-back bookings do not overlap.

**`UNIQUE NULLS NOT DISTINCT`** (15+) closes the classic hole in which a unique
constraint allows any number of rows containing null:

```sql
CREATE TABLE memberships (
  user_id int,
  team_id int,
  UNIQUE NULLS NOT DISTINCT (user_id, team_id)
);
INSERT INTO memberships VALUES (1, NULL);
INSERT INTO memberships VALUES (1, NULL);
```

Output:

```txt
ERROR:  duplicate key value violates unique constraint "memberships_user_id_team_id_key"
DETAIL:  Key (user_id, team_id)=(1, null) already exists.
```

Without `NULLS NOT DISTINCT`, both rows are accepted.

**Partial unique indexes** — unique among live rows only, for soft deletes:

```sql
CREATE UNIQUE INDEX users_email_live ON users (email) WHERE deleted_at IS NULL;
```

**Adding a constraint to a big table without a long lock:**

```sql
ALTER TABLE orders
  ADD CONSTRAINT orders_total_positive CHECK (total >= 0) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT orders_total_positive;
```

`NOT VALID` enforces the rule for new writes immediately and skips the scan;
`VALIDATE` scans later under a lock that does not block writes. Foreign keys work
the same way. **Deferrable** constraints (`DEFERRABLE INITIALLY DEFERRED`) are
checked at commit instead of per statement — useful for circular references.

## 15. How Do Schemas, Roles, And Privileges Work?

A **schema** is a namespace inside a database; `search_path` decides which
schemas an unqualified name resolves in. A **role** is both user and group — a
"user" is a role with `LOGIN`.

```sql
CREATE SCHEMA billing;
CREATE TABLE billing.invoices (id int PRIMARY KEY, total numeric);
CREATE TABLE public.audit_log (id int);
CREATE ROLE app_ro NOLOGIN;
GRANT USAGE ON SCHEMA billing TO app_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA billing TO app_ro;
SET ROLE app_ro;
SELECT count(*) FROM billing.invoices;
DELETE FROM billing.invoices;
SELECT count(*) FROM public.audit_log;
```

Output:

```txt
 count
-------
     0

ERROR:  permission denied for table invoices
ERROR:  permission denied for table audit_log
```

The read-only role can read billing, cannot write to it, and cannot see tables it
was never granted.

Interview trap:

`GRANT ... ON ALL TABLES` covers only tables that **exist now**. Tables created
next week are not included. Set default privileges for future objects:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA billing GRANT SELECT ON TABLES TO app_ro;
```

A least-privilege layout:

| Role | Can |
| --- | --- |
| `app_owner` | own the tables; used only by migrations |
| `app_rw` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` — the application |
| `app_ro` | `SELECT` — reporting and read replicas |

Since PostgreSQL 15, ordinary users can no longer create objects in the `public`
schema by default — a long-standing security hole closed.

## 16. How Does Row-Level Security Enforce Multi-Tenancy?

**Row-level security** (RLS) adds a policy the database applies to every query on
a table, so a query that forgets its tenant filter still cannot see another
tenant's rows.

```sql
CREATE TABLE invoices (
  id        int PRIMARY KEY,
  tenant_id int NOT NULL,
  total     numeric(10, 2)
);
INSERT INTO invoices VALUES (1, 1, 100), (2, 1, 50), (3, 2, 999);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoices
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::int);
CREATE ROLE tenant_app NOLOGIN;
GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO tenant_app;
SET ROLE tenant_app;
SET app.tenant_id = '1';
SELECT * FROM invoices ORDER BY id;
```

Output:

```txt
 id | tenant_id | total
----+-----------+--------
  1 |         1 | 100.00
  2 |         1 |  50.00
```

`SELECT *` with no `WHERE` returned only tenant 1's rows. Writing a row for
another tenant is refused too:

```sql
SET ROLE tenant_app;
SET app.tenant_id = '1';
INSERT INTO invoices VALUES (4, 2, 10);
```

Output:

```txt
ERROR:  new row violates row-level security policy for table "invoices"
```

And with no tenant set, the policy fails closed — `current_setting(..., true)`
returns `NULL` instead of raising an error, and `tenant_id = NULL` matches
nothing:

```sql
SET ROLE tenant_app;
SELECT count(*) FROM invoices;
```

Output:

```txt
 count
-------
     0
```

Important:

- The table **owner** and superusers bypass RLS. The application must connect as
  a separate role, or the table needs `ALTER TABLE ... FORCE ROW LEVEL SECURITY`.
- With a connection pool, set the tenant with `SET LOCAL` (or
  `set_config('app.tenant_id', '1', true)`) inside each transaction. A plain
  `SET` survives on the pooled connection and leaks into the next request.
- Once a session has set the variable, `RESET` leaves it as an **empty string**,
  not `NULL`, and `''::int` raises `invalid input syntax for type integer`. That is
  why the policy wraps it in `nullif(..., '')`.
- Index `tenant_id` — every query now carries the policy's predicate.

## 17. Functions, Procedures, And Triggers — When Do You Use Them?

A trigger that maintains `updated_at` — application code cannot forget it:

```sql
CREATE TABLE products (
  id         int PRIMARY KEY,
  price      numeric(10, 2),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER products_touch BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
INSERT INTO products (id, price, updated_at) VALUES (1, 50, '2026-01-01');
UPDATE products SET price = 45 WHERE id = 1;
SELECT id, price, updated_at > '2026-01-01' AS touched FROM products;
```

Output:

```txt
 id | price | touched
----+-------+---------
  1 | 45.00 | t
```

A **procedure** (11+) can commit inside itself — the tool for batch jobs that must
not hold one giant transaction:

```sql
CREATE TABLE logs (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL
);
INSERT INTO logs (created_at)
  SELECT now() - interval '200 days' FROM generate_series(1, 2500)
  UNION ALL
  SELECT now() FROM generate_series(1, 10);
CREATE PROCEDURE purge_old_logs(batch int) LANGUAGE plpgsql AS $$
DECLARE deleted int;
BEGIN
  LOOP
    DELETE FROM logs WHERE id IN (
      SELECT id FROM logs
      WHERE created_at < now() - interval '90 days'
      LIMIT batch
    );
    GET DIAGNOSTICS deleted = ROW_COUNT;
    EXIT WHEN deleted = 0;
    COMMIT;                                   -- a function cannot do this
  END LOOP;
END $$;
CALL purge_old_logs(1000);
SELECT count(*) AS remaining FROM logs;
```

Output:

```txt
 remaining
-----------
        10
```

| | Function | Procedure |
| --- | --- | --- |
| Called with | `SELECT f()`, or inside queries | `CALL p()` |
| Returns | a value or a set of rows | nothing (output parameters only) |
| Transaction control | no | `COMMIT` / `ROLLBACK` inside |

Tradeoff:

Triggers and database functions are invisible from application code: they run
on every write, are hard to test, and surprise the next developer. Use them for
invariants that must hold **whatever** writes to the table — audit rows,
`updated_at`, denormalised counters — and keep business workflows in the
application.

Interview note:

Mark functions `IMMUTABLE`, `STABLE`, or `VOLATILE` truthfully. The planner uses
the label: only `IMMUTABLE` functions can appear in an index expression, and a
function wrongly marked `IMMUTABLE` returns stale results from cached plans.

## 18. How Does Full-Text Search Work, And When Is `pg_trgm` Better?

Full-text search turns text into normalised **lexemes** (`tsvector`) and matches
them against a query (`tsquery`). Stemming makes "indexes", "indexed", and
"indexing" the same word; stop words are dropped:

```sql
SELECT to_tsvector('english', 'The indexes were indexed quickly') AS lexemes;
```

Output:

```txt
        lexemes
-----------------------
 'index':2,4 'quick':5
```

A searchable table with a generated column and a GIN index:

```sql
CREATE TABLE articles (
  id int PRIMARY KEY,
  title text,
  body text,
  search tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
  ) STORED
);
CREATE INDEX articles_search_idx ON articles USING gin (search);
INSERT INTO articles (id, title, body) VALUES
  (1, 'Indexing strategies', 'How indexes speed up queries in PostgreSQL'),
  (2, 'Vacuum explained',    'Dead tuples, autovacuum, and table bloat'),
  (3, 'Query planning',      'The planner indexed the query and chose a plan');
SELECT id, title, round(ts_rank(search, q)::numeric, 4) AS rank
FROM articles, websearch_to_tsquery('english', 'index queries') AS q
WHERE search @@ q
ORDER BY rank DESC, id;
```

Output:

```txt
 id |        title        |  rank
----+---------------------+--------
  3 | Query planning      | 0.1844
  1 | Indexing strategies | 0.1744
```

`websearch_to_tsquery` accepts what users actually type — quotes, `or`, `-word`
— without raising syntax errors.

**`pg_trgm`** splits text into three-letter sequences, which gives substring and
fuzzy matching that full-text search cannot do:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE customers (id int PRIMARY KEY, name text);
INSERT INTO customers VALUES
  (1, 'Nadia Rahman'), (2, 'Alice Smith'), (3, 'Rahim Uddin');
CREATE INDEX customers_name_trgm ON customers USING gin (name gin_trgm_ops);
SELECT id, name FROM customers WHERE name ILIKE '%rah%' ORDER BY id;
```

Output:

```txt
 id |     name
----+--------------
  1 | Nadia Rahman
  3 | Rahim Uddin
```

The trigram index serves that `ILIKE`, which a B-tree never can. For typos, match
the search term against the **closest word** in the name — `<%` compares against
the best-matching part of the string:

```sql
SELECT id, name,
       round(similarity(name, 'Rahmn')::numeric, 2)      AS whole_string,
       round(word_similarity('Rahmn', name)::numeric, 2) AS best_word
FROM customers
WHERE 'Rahmn' <% name
ORDER BY best_word DESC;
```

Output:

```txt
 id |     name     | whole_string | best_word
----+--------------+--------------+-----------
  1 | Nadia Rahman |         0.27 |      0.67
```

The whole-string operator `name % 'Rahmn'` returns nothing here: "Rahmn" is
too short a part of "Nadia Rahman" to reach the default 0.3 similarity. Word
similarity (threshold 0.6) is the right tool for searching inside longer text.

| Need | Use |
| --- | --- |
| Word search with stemming and ranking | `tsvector` + GIN |
| `LIKE '%text%'` and `ILIKE` on large tables | `pg_trgm` GIN index |
| Typo-tolerant name lookup | `pg_trgm` similarity |
| Facets, synonyms, relevance tuning at scale | a search engine |

## 19. Which Extensions Are Worth Knowing?

Extensions add types, functions, and index methods. `CREATE EXTENSION` installs
one into the current database; managed services allow a published list.

| Extension | Adds |
| --- | --- |
| `pg_stat_statements` | per-query execution statistics — the first tool for slow queries |
| `pg_trgm` | trigram similarity and fast `LIKE '%...%'` |
| `btree_gist` | B-tree operators in GiST — needed for exclusion constraints on plain columns |
| `citext` | case-insensitive text |
| `pgcrypto` | hashing and encryption functions |
| `postgis` | geospatial types, indexes, and functions |
| `pgvector` | vector columns and similarity search for embeddings |
| `postgres_fdw` | query tables in another PostgreSQL server |
| `pg_partman`, `pg_cron` | partition management and scheduled jobs |

`citext` makes case-insensitive uniqueness a column type:

```sql
CREATE EXTENSION IF NOT EXISTS citext;
CREATE TABLE accounts (email citext UNIQUE);
INSERT INTO accounts VALUES ('Alice@Example.com');
INSERT INTO accounts VALUES ('alice@example.com');
```

Output:

```txt
ERROR:  duplicate key value violates unique constraint "accounts_email_key"
DETAIL:  Key (email)=(alice@example.com) already exists.
```

Interview note:

Extensions are a large part of why teams choose PostgreSQL: `pgvector` turns it
into a vector store for retrieval-augmented generation, and PostGIS into a
geospatial database, without a second system to operate.

## 20. How Do You Build A Job Queue With `SKIP LOCKED`?

`FOR UPDATE SKIP LOCKED` lets many workers claim rows from the same table without
blocking each other: each skips rows another transaction has already locked.

```sql
CREATE TABLE jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  locked_at timestamptz
);
INSERT INTO jobs (payload)
SELECT jsonb_build_object('n', g) FROM generate_series(1, 5) AS g;
UPDATE jobs SET status = 'running', locked_at = now()
WHERE id IN (
  SELECT id FROM jobs
  WHERE status = 'queued'
  ORDER BY id
  FOR UPDATE SKIP LOCKED
  LIMIT 2
)
RETURNING id, payload;
```

Output:

```txt
 id | payload
----+----------
  1 | {"n": 1}
  2 | {"n": 2}
```

A second worker running the same statement at the same moment receives jobs 3
and 4 instead of waiting for the first worker's lock.

Related tools:

- **Advisory locks** — `pg_try_advisory_lock(42)` takes an application-defined
  lock, for "only one instance may run this cron job". Session-level advisory
  locks are re-entrant and survive until released or the session ends, so prefer
  `pg_try_advisory_xact_lock` inside a transaction.
- **`LISTEN` / `NOTIFY`** — wakes workers without polling. Notifications are sent
  only on commit, are not stored for disconnected listeners, and carry at most
  8000 bytes, so use them as a signal to check the table, never as the queue.

When to use it:

A Postgres-backed queue is a good fit for moderate volumes — thousands of jobs a
minute — when you want jobs to be created in the **same transaction** as the data
that caused them. Past that, or for fan-out to many consumers, use a dedicated
broker.

## 21. How Do Isolation Levels Behave In PostgreSQL?

| Level | PostgreSQL behaviour |
| --- | --- |
| `READ UNCOMMITTED` | treated as `READ COMMITTED` — dirty reads never happen |
| `READ COMMITTED` (default) | each **statement** sees data committed before it began |
| `REPEATABLE READ` | one **snapshot** for the whole transaction — no phantoms, stronger than the standard requires |
| `SERIALIZABLE` | snapshot isolation plus conflict detection (SSI); anomalies abort a transaction |

Under `REPEATABLE READ` and `SERIALIZABLE`, PostgreSQL refuses to overwrite a row
that changed after the snapshot was taken. Captured from two concurrent `psql`
sessions on PostgreSQL 17:

```txt
A: BEGIN ISOLATION LEVEL REPEATABLE READ;
A: SELECT balance FROM accounts WHERE id = 1;          -- 100
B: UPDATE accounts SET balance = balance - 30 WHERE id = 1;   -- autocommits
A: UPDATE accounts SET balance = balance - 50 WHERE id = 1;
   ERROR:  could not serialize access due to concurrent update
```

The final balance was 70: B's change survived and A's transaction must be retried.
Under `READ COMMITTED`, A's update would instead apply `-50` to the committed 70 —
correct here, because the update is relative. An absolute write computed from
the 100 that A read earlier (`SET balance = 50`) would silently erase B's change:
a **lost update**.

**Write skew** is the anomaly `REPEATABLE READ` still allows. The rule "at least
one doctor on call": both transactions see two doctors on call, and each takes
one off:

```txt
A: BEGIN ISOLATION LEVEL SERIALIZABLE;
B: BEGIN ISOLATION LEVEL SERIALIZABLE;
A: SELECT count(*) FROM doctors WHERE on_call;           -- 2
B: SELECT count(*) FROM doctors WHERE on_call;           -- 2
A: UPDATE doctors SET on_call = false WHERE name = 'alice';
A: COMMIT;
B: UPDATE doctors SET on_call = false WHERE name = 'bob';
   ERROR:  could not serialize access due to read/write dependencies among transactions
   DETAIL:  Reason code: Canceled on identification as a pivot, during write.
   HINT:  The transaction might succeed if retried.
```

Run the same script under `REPEATABLE READ` and both transactions commit — zero
doctors on call. `SERIALIZABLE` detected the dangerous pattern and aborted B,
leaving one doctor on call.

Important:

Error `40001` (`serialization_failure`) is **expected** at the stricter levels.
The application must retry the whole transaction — so keep those transactions
short and free of side effects such as sending email.

Strong answer:

> PostgreSQL defaults to `READ COMMITTED`, where each statement sees fresh
> committed data — fine for most work, especially with atomic single-statement
> updates. I use `REPEATABLE READ` for consistent multi-query reports, and
> `SERIALIZABLE` when an invariant spans several rows, such as scheduling or
> balances across accounts. Both can fail with `40001`, so those code paths retry.

## Sources Used

- <https://www.postgresql.org/docs/current/datatype.html>
- <https://www.postgresql.org/docs/current/datatype-datetime.html>
- <https://www.postgresql.org/docs/current/datatype-json.html>
- <https://www.postgresql.org/docs/current/sql-insert.html>
- <https://www.postgresql.org/docs/current/sql-merge.html>
- <https://www.postgresql.org/docs/current/queries-with.html>
- <https://www.postgresql.org/docs/current/ddl-constraints.html>
- <https://www.postgresql.org/docs/current/ddl-rowsecurity.html>
- <https://www.postgresql.org/docs/current/plpgsql-trigger.html>
- <https://www.postgresql.org/docs/current/textsearch.html>
- <https://www.postgresql.org/docs/current/pgtrgm.html>
- <https://www.postgresql.org/docs/current/transaction-iso.html>
