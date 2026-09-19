# SQL Fundamentals Interview Guide

SQL interview guidance covering logical query processing order, joins, grouping,
NULL semantics, subqueries, CTEs, window functions, set operators, upserts, and
the query patterns that come up repeatedly in interviews. Examples target MySQL 8
with notes where PostgreSQL differs.

Most examples use these two tables:

```sql
users  (id, name, email, country, created_at)
orders (id, user_id, status, total, created_at)
```

## 1. What Is The Logical Order Of SQL Query Processing?

SQL is written in one order and evaluated in another. The evaluation order
explains almost every confusing error message.

```txt
written:    SELECT ... FROM ... WHERE ... GROUP BY ... HAVING ... ORDER BY ... LIMIT
evaluated:  FROM -> JOIN -> WHERE -> GROUP BY -> HAVING -> SELECT -> DISTINCT
            -> ORDER BY -> LIMIT
```

This is why a `SELECT` alias cannot be used in `WHERE`:

```sql
-- Bad example: `revenue` does not exist yet when WHERE runs.
SELECT SUM(total) AS revenue
FROM   orders
WHERE  revenue > 1000
GROUP  BY user_id;
```

```txt
ERROR 1054 (42S22): Unknown column 'revenue' in 'where clause'
```

```sql
-- Good: HAVING runs after grouping, so it can filter aggregates.
SELECT user_id, SUM(total) AS revenue
FROM   orders
GROUP  BY user_id
HAVING revenue > 1000;
```

`ORDER BY` runs after `SELECT`, so it **can** use the alias:

```sql
SELECT SUM(total) AS revenue
FROM   orders
GROUP  BY user_id
ORDER  BY revenue DESC;
```

Why it matters:

Knowing this order lets you answer "why can I use the alias here but not there?"
from first principles instead of memorising exceptions.

Interview note:

Strict ANSI SQL does not allow an alias in `HAVING` either. MySQL and PostgreSQL
both permit it, so say "MySQL allows this" rather than claiming it is universal.

## 2. What Is The Difference Between `WHERE` And `HAVING`?

`WHERE` filters rows before grouping. `HAVING` filters groups after.

```sql
SELECT   country, COUNT(*) AS user_count
FROM     users
WHERE    created_at >= '2026-01-01'   -- filters rows first
GROUP BY country
HAVING   COUNT(*) > 10;               -- filters groups after
```

| | `WHERE` | `HAVING` |
| --- | --- | --- |
| Runs | before `GROUP BY` | after `GROUP BY` |
| Operates on | individual rows | grouped results |
| Can use aggregates | no | yes |
| Can use indexes | yes | no |

Important:

Put a condition in `WHERE` whenever you can. `WHERE` can use an index and reduces
the number of rows that need grouping; `HAVING` runs after all the work is done.

```sql
-- Bad example: groups everything, then throws most of it away.
SELECT   country, COUNT(*) FROM users
GROUP BY country
HAVING   country = 'BD';

-- Better: filters first, using the index on country.
SELECT   country, COUNT(*) FROM users
WHERE    country = 'BD'
GROUP BY country;
```

## 3. What Are The Join Types?

```txt
INNER JOIN   rows matching in both tables
LEFT JOIN    all left rows, plus matches (NULLs where none)
RIGHT JOIN   all right rows, plus matches
FULL JOIN    all rows from both sides
CROSS JOIN   every combination (Cartesian product)
SELF JOIN    a table joined to itself
```

```sql
-- users who have placed at least one order
SELECT u.name, o.total
FROM   users u
INNER JOIN orders o ON o.user_id = u.id;

-- every user, with order details where they exist
SELECT u.name, o.total
FROM   users u
LEFT JOIN orders o ON o.user_id = u.id;
```

`LEFT JOIN` with a null check finds rows with no match — users who never ordered:

```sql
SELECT u.name
FROM   users u
LEFT   JOIN orders o ON o.user_id = u.id
WHERE  o.id IS NULL;
```

A self join compares rows within one table:

```sql
SELECT e.name AS employee, m.name AS manager
FROM   employees e
LEFT   JOIN employees m ON m.id = e.manager_id;
```

MySQL has no `FULL OUTER JOIN`; emulate it with a union:

```sql
SELECT ... FROM a LEFT JOIN b ON a.id = b.a_id
UNION
SELECT ... FROM a RIGHT JOIN b ON a.id = b.a_id;
```

Interview trap:

Putting a right-table condition in `WHERE` silently converts a `LEFT JOIN` into an
`INNER JOIN`, because `NULL = 'paid'` is never true:

```sql
-- Bad: drops users with no orders, defeating the LEFT JOIN.
SELECT u.name, o.total
FROM   users u
LEFT   JOIN orders o ON o.user_id = u.id
WHERE  o.status = 'paid';

-- Good: the condition belongs in ON.
SELECT u.name, o.total
FROM   users u
LEFT   JOIN orders o ON o.user_id = u.id AND o.status = 'paid';
```

## 4. Why Does A Join Multiply My Rows?

A join produces one row per **matching pair**, so a one-to-many join repeats the
"one" side.

```sql
SELECT u.name, o.total
FROM   users u
JOIN   orders o ON o.user_id = u.id;
```

Output:

```txt
name      total
--------  ------
Mofasser   99.00
Mofasser  149.00
Mofasser   19.00
```

One user, three orders, three rows. This becomes a real bug when aggregating
across two different one-to-many relationships:

```sql
-- Bad example: order totals are counted once per item.
SELECT u.id, SUM(o.total) AS revenue, COUNT(i.id) AS items
FROM   users u
JOIN   orders o      ON o.user_id = u.id
JOIN   order_items i ON i.order_id = o.id
GROUP  BY u.id;
```

An order with 3 items has its `total` added 3 times.

Fix — aggregate each branch separately before joining:

```sql
SELECT u.id,
       o.revenue,
       i.items
FROM   users u
LEFT   JOIN (
         SELECT user_id, SUM(total) AS revenue
         FROM   orders GROUP BY user_id
       ) o ON o.user_id = u.id
LEFT   JOIN (
         SELECT o.user_id, COUNT(*) AS items
         FROM   order_items i JOIN orders o ON o.id = i.order_id
         GROUP  BY o.user_id
       ) i ON i.user_id = u.id;
```

Interview note:

Reaching for `DISTINCT` to fix a row count is almost always a sign of this problem.
`DISTINCT` hides the duplication for `COUNT` but still produces wrong `SUM` values.

## 5. How Do Aggregate Functions And `GROUP BY` Work?

`GROUP BY` collapses rows into groups; aggregates summarise each group.

```sql
SELECT   user_id,
         COUNT(*)   AS order_count,
         SUM(total) AS revenue,
         AVG(total) AS average,
         MIN(created_at) AS first_order,
         MAX(created_at) AS last_order
FROM     orders
GROUP BY user_id;
```

Important:

`COUNT(*)` counts rows. `COUNT(column)` counts **non-null** values. The difference
matters on outer joins:

```sql
SELECT u.id,
       COUNT(*)    AS wrong,  -- 1 even for users with no orders
       COUNT(o.id) AS right   -- 0 for users with no orders
FROM   users u
LEFT   JOIN orders o ON o.user_id = u.id
GROUP  BY u.id;
```

`COUNT(DISTINCT column)` counts unique non-null values:

```sql
SELECT COUNT(DISTINCT user_id) AS customers FROM orders;
```

Interview trap:

Selecting a column that is neither grouped nor aggregated is invalid. MySQL
historically allowed it and returned an arbitrary value; with `ONLY_FULL_GROUP_BY`
enabled by default in MySQL 8 it now errors, matching PostgreSQL.

```sql
-- Errors under ONLY_FULL_GROUP_BY
SELECT user_id, status, SUM(total) FROM orders GROUP BY user_id;
```

## 6. How Does `NULL` Behave In SQL?

`NULL` means unknown, and comparisons with unknown produce unknown — not false.

```sql
SELECT NULL = NULL, NULL <> NULL, NULL = 0;
```

Output:

```txt
NULL  NULL  NULL
```

Because a `WHERE` clause only keeps rows that evaluate to **true**, unknown rows
are dropped. Always use `IS NULL` / `IS NOT NULL`:

```sql
SELECT * FROM users WHERE deleted_at IS NULL;
```

The most damaging trap is `NOT IN` with a null in the list:

```sql
SELECT * FROM users
WHERE  id NOT IN (SELECT user_id FROM orders);
```

If any `orders.user_id` is `NULL`, this returns **zero rows**, because
`id <> NULL` is unknown for every comparison.

Fix — use `NOT EXISTS`, which is null-safe:

```sql
SELECT * FROM users u
WHERE  NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);
```

Useful null functions:

```sql
SELECT COALESCE(nickname, name, 'Anonymous') AS display_name FROM users;
SELECT NULLIF(total, 0) FROM orders;      -- NULL when total = 0
SELECT id <=> NULL FROM users;            -- MySQL null-safe equality
```

Aggregates ignore nulls, which changes averages:

```sql
-- rows: 10, 20, NULL
SELECT AVG(score) FROM t;
```

Output:

```txt
15.0000
```

The average is over 2 rows, not 3. Use `AVG(COALESCE(score, 0))` if nulls should
count as zero.

## 7. What Kinds Of Subqueries Are There?

```sql
-- scalar: returns one value
SELECT name,
       (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count
FROM   users u;

-- derived table: a subquery in FROM, must be aliased
SELECT t.user_id, t.revenue
FROM   (SELECT user_id, SUM(total) AS revenue FROM orders GROUP BY user_id) t
WHERE  t.revenue > 1000;

-- correlated: references the outer query, runs per outer row
SELECT u.name
FROM   users u
WHERE  EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);
```

| Kind | Runs | Watch for |
| --- | --- | --- |
| Scalar | once per outer row | N+1 behaviour in `SELECT` |
| Derived | once | must have an alias in MySQL |
| Correlated | once per outer row | usually rewritable as a join |

Tradeoff:

A correlated subquery in the `SELECT` list is readable but executes per row. On
large result sets a join or a pre-aggregated derived table is typically much
faster.

```sql
-- Often faster than a correlated scalar subquery
SELECT u.name, COALESCE(o.order_count, 0) AS order_count
FROM   users u
LEFT   JOIN (
         SELECT user_id, COUNT(*) AS order_count FROM orders GROUP BY user_id
       ) o ON o.user_id = u.id;
```

## 8. What Is A CTE And When Do You Use One?

A common table expression is a named subquery defined with `WITH`, available to the
statement that follows.

```sql
WITH paid_orders AS (
  SELECT user_id, SUM(total) AS revenue
  FROM   orders
  WHERE  status = 'paid'
  GROUP  BY user_id
),
top_users AS (
  SELECT user_id, revenue
  FROM   paid_orders
  WHERE  revenue > 1000
)
SELECT u.name, t.revenue
FROM   top_users t
JOIN   users u ON u.id = t.user_id
ORDER  BY t.revenue DESC;
```

Benefits:

- a nested query reads top to bottom instead of inside out
- one CTE can be referenced several times in the same statement
- each step can be tested on its own

When to use it:

Multi-step logic, and anywhere the same derived set is needed twice.

Interview note:

A CTE is not automatically faster than a derived table — it is mainly a readability
feature. Whether the optimizer materialises it or inlines it differs by engine and
version, which matters for performance tuning.

## 9. What Are Recursive CTEs?

A recursive CTE walks hierarchies: org charts, category trees, threaded comments.

```sql
WITH RECURSIVE subordinates AS (
  -- anchor: where the walk starts
  SELECT id, name, manager_id, 1 AS depth
  FROM   employees
  WHERE  id = 1

  UNION ALL

  -- recursive: joins back to the CTE itself
  SELECT e.id, e.name, e.manager_id, s.depth + 1
  FROM   employees e
  JOIN   subordinates s ON e.manager_id = s.id
  WHERE  s.depth < 10            -- guard against cycles
)
SELECT * FROM subordinates;
```

Output:

```txt
id  name      manager_id  depth
--  --------  ----------  -----
 1  Alice           NULL      1
 2  Bob                1      2
 3  Carol              1      2
 4  Dan                2      3
```

Important:

Always bound the recursion. A cycle in the data — A reports to B reports to A —
loops forever without a depth guard. MySQL also caps it with
`cte_max_recursion_depth`, which defaults to 1000.

Use cases:

- org charts and reporting lines
- nested categories and menus
- threaded comments
- generating number or date series

## 10. What Are Window Functions?

A window function computes across a set of rows **without collapsing them**. That
is the key difference from `GROUP BY`.

```sql
SELECT id,
       user_id,
       total,
       SUM(total)   OVER (PARTITION BY user_id)                    AS user_total,
       AVG(total)   OVER (PARTITION BY user_id)                    AS user_avg,
       SUM(total)   OVER (PARTITION BY user_id ORDER BY created_at) AS running_total
FROM   orders;
```

Output:

```txt
id  user_id  total  user_total  user_avg  running_total
--  -------  -----  ----------  --------  -------------
 1        1  99.00      267.00     89.00          99.00
 2        1 149.00      267.00     89.00         248.00
 3        1  19.00      267.00     89.00         267.00
```

Every original row survives, with the aggregate attached.

```txt
OVER (
  PARTITION BY col   -- reset the calculation per group
  ORDER BY     col   -- order within the partition; enables running totals
)
```

Offset functions compare a row to its neighbours:

```sql
SELECT created_at,
       total,
       LAG(total)  OVER (ORDER BY created_at) AS previous,
       LEAD(total) OVER (ORDER BY created_at) AS next,
       total - LAG(total) OVER (ORDER BY created_at) AS change
FROM   orders;
```

Important:

Window functions are evaluated after `WHERE` and `GROUP BY`, so you cannot filter
on one directly. Wrap it in a CTE or subquery first.

```sql
-- Bad: ERROR, window function in WHERE
SELECT * FROM orders WHERE ROW_NUMBER() OVER (ORDER BY total) <= 3;

-- Good
WITH ranked AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY total DESC) AS rn FROM orders
)
SELECT * FROM ranked WHERE rn <= 3;
```

Interview note:

Window functions arrived in MySQL 8.0. On MySQL 5.7 the same results need
self-joins or user variables, which is worth mentioning if the role runs an older
version.

## 11. `ROW_NUMBER` vs `RANK` vs `DENSE_RANK`

All three number rows; they differ in how they handle ties.

```sql
SELECT name,
       score,
       ROW_NUMBER() OVER (ORDER BY score DESC) AS row_num,
       RANK()       OVER (ORDER BY score DESC) AS rnk,
       DENSE_RANK() OVER (ORDER BY score DESC) AS dense
FROM   scores;
```

Output:

```txt
name   score  row_num  rnk  dense
-----  -----  -------  ---  -----
Alice    100        1    1      1
Bob       90        2    2      2
Carol     90        3    2      2
Dan       80        4    4      3
```

| Function | Ties get | Next value after a tie |
| --- | --- | --- |
| `ROW_NUMBER` | different numbers, arbitrary order | continues |
| `RANK` | the same number | **skips** (2, 2, 4) |
| `DENSE_RANK` | the same number | no gap (2, 2, 3) |

When to use it:

- `ROW_NUMBER` — pagination, deduplication, picking exactly one row per group
- `RANK` — competition standings, where joint second means no second place
- `DENSE_RANK` — "top 3 distinct salaries", where gaps would be wrong

## 12. `UNION` vs `UNION ALL`

Both stack result sets vertically. `UNION` removes duplicates; `UNION ALL` does not.

```sql
SELECT email FROM users
UNION
SELECT email FROM subscribers;      -- deduplicated

SELECT email FROM users
UNION ALL
SELECT email FROM subscribers;      -- every row, duplicates kept
```

Why it matters:

Deduplication is not free — the database must sort or hash the entire combined
result to find duplicates. On large sets that is a significant cost.

Tradeoff:

Use `UNION ALL` whenever duplicates are impossible or acceptable. Use `UNION` only
when you genuinely need deduplication, and know you are paying a sort for it.

Requirements for both:

- the same number of columns in each branch
- compatible data types, positionally matched
- `ORDER BY` applies to the whole result and goes at the very end

```sql
SELECT id, name, 'user' AS source FROM users
UNION ALL
SELECT id, name, 'admin'          FROM admins
ORDER BY name;
```

Related set operators:

```sql
SELECT email FROM users INTERSECT SELECT email FROM subscribers;  -- in both
SELECT email FROM users EXCEPT    SELECT email FROM subscribers;  -- in first only
```

`INTERSECT` and `EXCEPT` arrived in MySQL 8.0.31. PostgreSQL has had them for a
long time and calls `EXCEPT` the same thing; Oracle calls it `MINUS`.

## 13. `EXISTS` vs `IN` vs `JOIN`

Three ways to express "rows that have a related row".

```sql
-- EXISTS: stops at the first match
SELECT u.name FROM users u
WHERE  EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);

-- IN: builds the value set
SELECT u.name FROM users u
WHERE  u.id IN (SELECT user_id FROM orders);

-- JOIN: needs DISTINCT to avoid duplicate users
SELECT DISTINCT u.name FROM users u
JOIN   orders o ON o.user_id = u.id;
```

| | Best when | Watch for |
| --- | --- | --- |
| `EXISTS` | checking existence, large subquery | none; safest default |
| `IN` | small, static list of values | breaks with `NOT IN` + nulls |
| `JOIN` | you need columns from both tables | row multiplication |

When to use it:

- Only checking existence → `EXISTS`
- Need columns from the other table → `JOIN`
- Literal list such as `IN (1, 2, 3)` → `IN`
- Negation → **always** `NOT EXISTS`, never `NOT IN`, unless the column is
  guaranteed `NOT NULL`

Interview note:

Modern optimizers often rewrite `IN` and `EXISTS` into the same plan, so the
performance difference is smaller than older advice suggests. The null-handling
difference with `NOT IN`, however, is a correctness issue and never goes away.

## 14. How Do You Do An Upsert?

Insert, or update if the row already exists.

MySQL:

```sql
INSERT INTO settings (user_id, theme, updated_at)
VALUES (1, 'dark', NOW())
ON DUPLICATE KEY UPDATE
  theme      = VALUES(theme),
  updated_at = VALUES(updated_at);
```

PostgreSQL:

```sql
INSERT INTO settings (user_id, theme, updated_at)
VALUES (1, 'dark', NOW())
ON CONFLICT (user_id) DO UPDATE
SET theme = EXCLUDED.theme, updated_at = EXCLUDED.updated_at;
```

Important:

Both rely on a `PRIMARY KEY` or `UNIQUE` constraint to detect the conflict. Without
one, the upsert silently becomes a plain insert and creates duplicates.

Why it matters:

The alternative — select, then insert or update — has a race condition. Two
concurrent requests both see "not found" and both insert. An upsert is a single
atomic statement, so the database resolves the race.

Related patterns:

```sql
-- insert only if absent, no update
INSERT IGNORE INTO settings (user_id, theme) VALUES (1, 'dark');

-- PostgreSQL equivalent
INSERT INTO settings (user_id, theme) VALUES (1, 'dark')
ON CONFLICT DO NOTHING;
```

Interview trap:

MySQL's `INSERT IGNORE` suppresses **all** errors, not just duplicate keys — it
will quietly discard rows failing other constraints or truncate values. Prefer
`ON DUPLICATE KEY UPDATE` with explicit columns.

## 15. How Do You Find Duplicate Rows?

Group by the columns that define a duplicate and keep groups larger than one.

```sql
SELECT email, COUNT(*) AS copies
FROM   users
GROUP  BY email
HAVING COUNT(*) > 1
ORDER  BY copies DESC;
```

To see the full rows, not just the keys:

```sql
SELECT *
FROM   users
WHERE  email IN (
         SELECT email FROM users GROUP BY email HAVING COUNT(*) > 1
       )
ORDER  BY email, id;
```

To delete duplicates but keep the earliest of each:

```sql
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY email ORDER BY id) AS rn
  FROM   users
)
DELETE FROM users
WHERE  id IN (SELECT id FROM ranked WHERE rn > 1);
```

Important:

Run the `SELECT` form first and check the count before deleting. Then add a
`UNIQUE` constraint so the duplicates cannot return:

```sql
ALTER TABLE users ADD UNIQUE KEY uq_users_email (email);
```

## 16. How Do You Find The Second-Highest Value?

The simplest form, when ties do not matter:

```sql
SELECT DISTINCT salary
FROM   employees
ORDER  BY salary DESC
LIMIT  1 OFFSET 1;
```

`DISTINCT` matters: without it, two people on the top salary make the second row
still the highest value.

With `DENSE_RANK`, which generalises to Nth:

```sql
WITH ranked AS (
  SELECT salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS rnk
  FROM   employees
)
SELECT DISTINCT salary FROM ranked WHERE rnk = 2;
```

Interview note:

The follow-up is usually "what if there is no second salary?" `LIMIT/OFFSET`
returns an empty set. If the interviewer wants a single `NULL` row instead, wrap it:

```sql
SELECT (SELECT DISTINCT salary
        FROM   employees
        ORDER  BY salary DESC
        LIMIT  1 OFFSET 1) AS second_highest;
```

Output when no such row exists:

```txt
NULL
```

## 17. How Do You Get The Top N Rows Per Group?

Rank inside each partition, then filter — the standard "greatest-n-per-group"
pattern.

```sql
WITH ranked AS (
  SELECT id,
         user_id,
         total,
         created_at,
         ROW_NUMBER() OVER (
           PARTITION BY user_id
           ORDER BY     total DESC
         ) AS rn
  FROM   orders
)
SELECT id, user_id, total
FROM   ranked
WHERE  rn <= 3
ORDER  BY user_id, total DESC;
```

Choosing the ranking function matters:

- `ROW_NUMBER` — exactly 3 rows per user, ties broken arbitrarily
- `RANK` — may return more than 3 if there are ties at the boundary
- `DENSE_RANK` — top 3 *distinct* values, possibly many rows

For just the single latest row per group, a correlated form also works:

```sql
SELECT o.*
FROM   orders o
WHERE  o.created_at = (
         SELECT MAX(o2.created_at) FROM orders o2 WHERE o2.user_id = o.user_id
       );
```

Tradeoff:

The correlated version is portable to MySQL 5.7, but it returns duplicates when two
orders share the exact same timestamp, and it re-scans per row. The window function
version is both correct and usually faster.

## 18. `DELETE` vs `TRUNCATE` vs `DROP`

| | `DELETE` | `TRUNCATE` | `DROP` |
| --- | --- | --- | --- |
| Removes | selected rows | all rows | the table itself |
| Type | DML | DDL | DDL |
| `WHERE` | yes | no | no |
| Rollback in MySQL | yes | **no** | **no** |
| Fires triggers | yes | no | no |
| Resets `AUTO_INCREMENT` | no | yes | n/a |
| Speed on a large table | slow, row by row | fast | fast |

```sql
DELETE FROM sessions WHERE expires_at < NOW();  -- selective, logged
TRUNCATE TABLE staging_import;                  -- empty it, reset counter
DROP TABLE old_reports;                          -- gone entirely
```

Important:

`TRUNCATE` causes an implicit commit in MySQL and cannot be rolled back, even
inside a transaction. Treat it as irreversible.

Interview note:

A large `DELETE` on a busy table holds locks and generates a large amount of undo
and replication traffic. Delete in batches:

```sql
DELETE FROM sessions WHERE expires_at < NOW() LIMIT 10000;
```

Repeat until zero rows are affected, with a short pause between batches.

## 19. How Do You Write Conditional Logic In SQL?

`CASE` works in `SELECT`, `WHERE`, `ORDER BY`, and inside aggregates.

```sql
SELECT id,
       total,
       CASE
         WHEN total >= 1000 THEN 'high'
         WHEN total >= 100  THEN 'medium'
         ELSE                    'low'
       END AS tier
FROM   orders;
```

Conditional aggregation turns rows into columns — a very common reporting pattern:

```sql
SELECT user_id,
       COUNT(*)                                        AS total_orders,
       SUM(CASE WHEN status = 'paid'     THEN 1 ELSE 0 END) AS paid,
       SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) AS refunded,
       SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) AS paid_revenue
FROM   orders
GROUP  BY user_id;
```

Custom sort order:

```sql
SELECT * FROM orders
ORDER BY CASE status
           WHEN 'pending'  THEN 1
           WHEN 'paid'     THEN 2
           WHEN 'refunded' THEN 3
           ELSE 4
         END;
```

Important:

`CASE` in a `WHERE` clause usually prevents index use. Prefer plain predicates
where possible, because `WHERE CASE WHEN ... END = 1` forces a scan.

Interview note:

`IF()` and `IFNULL()` are MySQL-specific. `CASE` and `COALESCE` are standard SQL and
work everywhere, which makes them the better habit.

## 20. How Do You Pivot Rows Into Columns?

MySQL has no `PIVOT` operator, so conditional aggregation does the job.

```sql
-- rows: (user_id, month, revenue)
SELECT user_id,
       SUM(CASE WHEN month = 1 THEN revenue ELSE 0 END) AS jan,
       SUM(CASE WHEN month = 2 THEN revenue ELSE 0 END) AS feb,
       SUM(CASE WHEN month = 3 THEN revenue ELSE 0 END) AS mar
FROM   monthly_revenue
GROUP  BY user_id;
```

Output:

```txt
user_id    jan     feb     mar
-------  ------  ------  ------
      1  100.00  250.00    0.00
      2   50.00    0.00  300.00
```

The reverse — unpivoting columns into rows — uses `UNION ALL`:

```sql
SELECT user_id, 'jan' AS month, jan AS revenue FROM pivoted
UNION ALL
SELECT user_id, 'feb', feb FROM pivoted
UNION ALL
SELECT user_id, 'mar', mar FROM pivoted;
```

Tradeoff:

A pivot needs the columns known in advance. Dynamic pivots require building the SQL
string in application code, which is usually a sign the reshaping belongs in the
application or reporting layer instead.

Interview note:

Aggregating in SQL and formatting in the application is normally the better split.
Pivot in SQL when it dramatically reduces the rows transferred; otherwise let the
application do it.

## Sources Used

- <https://dev.mysql.com/doc/refman/8.0/en/select.html>
- <https://dev.mysql.com/doc/refman/8.0/en/join.html>
- <https://dev.mysql.com/doc/refman/8.0/en/group-by-handling.html>
- <https://dev.mysql.com/doc/refman/8.0/en/with.html>
- <https://dev.mysql.com/doc/refman/8.0/en/window-functions.html>
- <https://dev.mysql.com/doc/refman/8.0/en/insert-on-duplicate.html>
- <https://www.postgresql.org/docs/current/queries-with.html>
