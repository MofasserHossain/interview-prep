# Database Fundamentals Interview Guide

Database interview guidance covering the relational model, keys and
relationships, normalization, ACID, transactions and isolation levels, locking,
index internals, SQL vs NoSQL, replication, sharding, migrations, and connection
pooling. Examples target MySQL 8 with notes where PostgreSQL differs.

## 1. What Is A Relational Database?

A relational database stores data as tables of rows and columns, where
relationships are expressed by values rather than by pointers.

```sql
CREATE TABLE users (
  id         BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  email      VARCHAR(255) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id      BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  total   DECIMAL(10, 2) NOT NULL,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id)
);
```

An order belongs to a user because `orders.user_id` holds a value that exists in
`users.id`. Nothing stores a memory address, so the relationship survives backups,
replication, and restarts.

Why it matters:

The database enforces correctness itself. A foreign key means the application
cannot create an order for a user that does not exist, no matter how many services
write to the table.

Interview note:

"Relational" refers to the mathematical relation — the table — not to the fact that
tables reference each other. It is a common misconception worth getting right.

## 2. What Are Primary Keys, Foreign Keys, And Unique Constraints?

| Constraint | Guarantees |
| --- | --- |
| `PRIMARY KEY` | unique **and** not null; one per table |
| `UNIQUE` | unique, but allows nulls; many per table |
| `FOREIGN KEY` | the value exists in the referenced table |
| `NOT NULL` | a value is always present |
| `CHECK` | a value satisfies a condition |

```sql
CREATE TABLE memberships (
  id           BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NOT NULL,
  team_id      BIGINT UNSIGNED NOT NULL,
  role         VARCHAR(20) NOT NULL DEFAULT 'member',
  UNIQUE KEY uq_membership (user_id, team_id),
  CONSTRAINT fk_m_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_m_team FOREIGN KEY (team_id) REFERENCES teams (id),
  CONSTRAINT ck_role CHECK (role IN ('member', 'admin', 'owner'))
);
```

The composite `UNIQUE` prevents the same user joining the same team twice — a rule
the application would otherwise have to enforce with a race-prone check-then-insert.

Referential actions decide what happens when the parent goes away:

```sql
FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE   -- delete children
FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT  -- block the delete
FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL  -- orphan the child
```

Tradeoff:

`ON DELETE CASCADE` keeps data tidy but makes a single delete potentially enormous
and hard to audit. `RESTRICT` is safer for anything financial, because it forces the
application to decide explicitly.

Interview trap:

A `UNIQUE` constraint permits **multiple** null rows in MySQL and PostgreSQL,
because nulls are not equal to each other. Soft-delete schemas relying on a
nullable `deleted_at` inside a unique key often break on exactly this.

## 3. How Do You Model One-To-One, One-To-Many, And Many-To-Many?

```txt
one-to-one    users ──── user_profiles       FK + UNIQUE on the child
one-to-many   users ───< orders              FK on the many side
many-to-many  users >──< teams               a join table holding both FKs
```

One-to-many — the foreign key lives on the "many" side:

```sql
CREATE TABLE orders (
  id      BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id)
);
```

Many-to-many — a join table, with the pair as the key:

```sql
CREATE TABLE user_teams (
  user_id BIGINT UNSIGNED NOT NULL,
  team_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, team_id),
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (team_id) REFERENCES teams (id)
);
```

Why it matters:

Using the pair as the primary key gets uniqueness and the clustered index in one
step, with no surrogate id to maintain.

Important:

The moment the relationship itself has attributes — a role, a joined date, an
expiry — the join table is a real entity. Give it its own id and treat it as a
first-class table rather than pretending it is plumbing.

## 4. What Is Normalization?

Normalization organises columns so each fact is stored exactly once.

**1NF — atomic values, no repeating groups**

```sql
-- Bad: a list crammed into one column
phone_numbers VARCHAR(255)  -- '555-1234,555-9876'

-- Good: a separate row per value
CREATE TABLE user_phones (
  user_id BIGINT UNSIGNED NOT NULL,
  phone   VARCHAR(20) NOT NULL
);
```

**2NF — no column depends on only part of a composite key**

```sql
-- Bad: product_name depends on product_id alone, not the whole key
order_items (order_id, product_id, quantity, product_name)

-- Good
order_items (order_id, product_id, quantity)
products    (product_id, product_name)
```

**3NF — no column depends on another non-key column**

```sql
-- Bad: city depends on zip_code, not on the user
users (id, name, zip_code, city)

-- Good
users     (id, name, zip_code)
zip_codes (zip_code, city)
```

Benefits:

- an update touches one row, so values cannot drift out of sync
- no update, insert, or delete anomalies
- smaller rows, so more rows fit per page and scans are cheaper

Strong answer:

> Normalization means every fact lives in exactly one place. 1NF removes repeating
> groups, 2NF removes partial dependencies on a composite key, and 3NF removes
> transitive dependencies between non-key columns. In practice I aim for 3NF and
> denormalize deliberately where reads demand it.

## 5. When Should You Denormalize?

Denormalization trades write complexity for read speed, and it is a decision, not
an accident.

```sql
-- Normalized: correct, but a COUNT on every page view
SELECT COUNT(*) FROM order_items WHERE order_id = ?;

-- Denormalized: a maintained counter
ALTER TABLE orders ADD COLUMN item_count INT NOT NULL DEFAULT 0;
```

When to use it:

- a count or sum is read constantly and computed from many rows
- a join crosses a service or database boundary
- historical accuracy is required — an invoice must keep the price **as sold**,
  not the product's current price
- a reporting table that is rebuilt rather than updated in place

When not to use it:

Before you have a measured problem. Denormalizing early costs correctness and buys
performance you may not need.

Tradeoff:

Every denormalized value is a value that can go stale. You need a plan for keeping
it correct — a transaction, a trigger, or a scheduled rebuild — and a way to detect
drift.

Interview note:

Storing the price on `order_items` is not denormalization at all. The price at time
of sale is a genuinely different fact from the current price, and it belongs there.

## 6. How Do You Choose Column Data Types?

The smallest type that correctly holds the data is usually the right one, because
narrower rows mean more rows per page and smaller indexes.

| Need | Use | Avoid |
| --- | --- | --- |
| Money | `DECIMAL(10, 2)` | `FLOAT`, `DOUBLE` |
| Timestamps | `DATETIME` or `TIMESTAMP` | `VARCHAR` |
| Flags | `TINYINT(1)` / `BOOLEAN` | `VARCHAR('yes')` |
| Short text | `VARCHAR(n)` | `TEXT` |
| Fixed set | `VARCHAR` + `CHECK` | `ENUM` |
| Ids | `BIGINT UNSIGNED` | `INT` if growth is plausible |

Important:

Never store money in a floating-point type:

```sql
SELECT 0.1 + 0.2 = 0.3;
```

Output:

```txt
0
```

Binary floating point cannot represent those values exactly. `DECIMAL` stores them
precisely.

`TIMESTAMP` vs `DATETIME` in MySQL:

- `TIMESTAMP` is stored as UTC and converted to the session time zone; range ends
  in 2038
- `DATETIME` stores exactly what you give it, with no time zone awareness

Interview note:

Store UTC and convert for display. Storing local times makes daylight-saving
transitions ambiguous — an hour that happens twice, and an hour that never happens.

## 7. What Are The ACID Properties?

| Property | Meaning |
| --- | --- |
| **A**tomicity | all statements commit, or none do |
| **C**onsistency | constraints hold before and after |
| **I**solation | concurrent transactions do not corrupt each other |
| **D**urability | a committed transaction survives a crash |

```sql
START TRANSACTION;

UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;

COMMIT;
```

Atomicity guarantees money is never deducted without also being credited. If the
second statement fails, the first is rolled back.

Durability is why a commit is slower than it looks: the change must reach stable
storage, not just memory.

```sql
-- MySQL: flush the log to disk on every commit (the safe default)
SET GLOBAL innodb_flush_log_at_trx_commit = 1;
```

Tradeoff:

Relaxing that setting makes writes substantially faster and risks losing the last
second of committed transactions on a power loss. That is a business decision, not
a technical one.

Interview note:

Consistency in ACID means *your constraints are satisfied*. It is a different idea
from consistency in the CAP theorem, which is about replicas agreeing. Interviewers
ask this deliberately.

## 8. What Is A Transaction?

A transaction groups statements so they succeed or fail as a unit.

```sql
START TRANSACTION;

INSERT INTO orders (user_id, total) VALUES (1, 99.00);
SET @order_id = LAST_INSERT_ID();

INSERT INTO order_items (order_id, product_id, quantity)
VALUES (@order_id, 42, 2);

UPDATE inventory SET stock = stock - 2 WHERE product_id = 42;

COMMIT;
```

Savepoints allow partial rollback:

```sql
START TRANSACTION;
INSERT INTO orders (user_id, total) VALUES (1, 99.00);

SAVEPOINT after_order;

INSERT INTO order_items (order_id, product_id, quantity) VALUES (1, 42, 2);
ROLLBACK TO SAVEPOINT after_order;  -- keeps the order, drops the item

COMMIT;
```

Important:

Keep transactions short. An open transaction holds locks and forces the database to
retain old row versions for other readers, so a long transaction slows down everyone.

```js
// Bad example: an HTTP call inside a transaction.
await db.query("START TRANSACTION");
await db.query("UPDATE orders SET status = 'paid' WHERE id = ?", [id]);
await fetch("https://payments.example.com/charge"); // locks held for seconds
await db.query("COMMIT");
```

Fix — do external work outside the transaction, and make the operation idempotent
so a retry is safe.

Interview trap:

DDL statements such as `ALTER TABLE` cause an implicit commit in MySQL. A migration
that mixes DDL and DML inside one transaction does not roll back the way you expect.
PostgreSQL does support transactional DDL.

## 9. What Are Isolation Levels?

Isolation levels trade correctness against concurrency by choosing which anomalies
are allowed.

| Level | Dirty read | Non-repeatable read | Phantom read |
| --- | --- | --- | --- |
| READ UNCOMMITTED | possible | possible | possible |
| READ COMMITTED | no | possible | possible |
| REPEATABLE READ | no | no | possible* |
| SERIALIZABLE | no | no | no |

The three anomalies:

- **Dirty read** — you read a row another transaction has not committed, and it
  may roll back
- **Non-repeatable read** — you read the same row twice and get different values,
  because another transaction committed in between
- **Phantom read** — you run the same `WHERE` twice and get a different set of
  *rows*, because another transaction inserted matching rows

```sql
-- session 1
START TRANSACTION;
SELECT balance FROM accounts WHERE id = 1;  -- 500

-- session 2 commits: UPDATE accounts SET balance = 400 WHERE id = 1;

SELECT balance FROM accounts WHERE id = 1;  -- 400 under READ COMMITTED
                                            -- 500 under REPEATABLE READ
COMMIT;
```

Defaults differ, and this catches people out:

- **MySQL InnoDB** defaults to `REPEATABLE READ`
- **PostgreSQL** defaults to `READ COMMITTED`

*InnoDB's `REPEATABLE READ` also prevents most phantoms, because it takes next-key
locks on ranges rather than only on rows. That is stronger than the SQL standard
requires.

```sql
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
```

When to use it:

`READ COMMITTED` for most application work. `SERIALIZABLE` only for genuinely
critical invariants, and with retry logic — it aborts transactions that cannot be
serialised.

## 10. Optimistic vs Pessimistic Locking

Both prevent lost updates; they differ in whether they assume conflict is likely.

**Pessimistic** — lock the row up front:

```sql
START TRANSACTION;

SELECT stock FROM inventory WHERE product_id = 42 FOR UPDATE;
-- other transactions now block here

UPDATE inventory SET stock = stock - 1 WHERE product_id = 42;

COMMIT;
```

**Optimistic** — do not lock; detect conflict at write time with a version column:

```sql
UPDATE inventory
SET    stock = stock - 1,
       version = version + 1
WHERE  product_id = 42
  AND  version = 7;
```

```js
const [result] = await db.query(sql, params);

if (result.affectedRows === 0) {
  throw new ConflictError("Row changed since it was read; retry.");
}
```

Zero affected rows means someone else updated it first.

| | Pessimistic | Optimistic |
| --- | --- | --- |
| Conflict assumed | likely | rare |
| Cost when idle | holds locks, blocks others | none |
| Cost on conflict | waiting | a retry |
| Good for | inventory, seats, balances | user profiles, documents |

Interview note:

An atomic single-statement update avoids the question entirely:

```sql
UPDATE inventory SET stock = stock - 1
WHERE product_id = 42 AND stock >= 1;
```

The database applies this under its own row lock. Reach for explicit locking only
when the decision needs more than one statement.

## 11. What Is A Deadlock And How Do You Avoid It?

A deadlock is two transactions each holding a lock the other needs.

```txt
T1: locks row A ──waits for──> row B
T2: locks row B ──waits for──> row A
```

```sql
-- T1
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;

-- T2, at the same time
UPDATE accounts SET balance = balance - 50 WHERE id = 2;
UPDATE accounts SET balance = balance + 50 WHERE id = 1;
```

InnoDB detects the cycle and rolls one transaction back:

```txt
ERROR 1213 (40001): Deadlock found when trying to get lock;
try restarting transaction
```

How to reduce them:

1. **Always acquire locks in a consistent order** — sort ids before updating
2. Keep transactions short so locks are held briefly
3. Touch fewer rows, with better indexes — an unindexed `WHERE` can lock far more
   rows than it changes
4. Retry on error 1213, because some deadlocks are unavoidable

```js
async function withRetry(run, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (error.errno !== 1213 || attempt === attempts) {
        throw error;
      }
    }
  }
}
```

Strong answer:

> Deadlocks come from inconsistent lock ordering. I sort the rows a transaction
> will touch, keep transactions short, make sure the `WHERE` uses an index so
> fewer rows are locked, and treat error 1213 as retryable rather than fatal.

## 12. How Does A B-Tree Index Work?

InnoDB indexes are B+trees: a shallow, balanced tree where all data sits in the
leaves, and the leaves form a linked list.

```txt
                 [ 50 | 100 ]              root
                /      |     \
        [10|30]    [60|80]    [120|150]    internal
        /  |  \     /  |  \     /   |  \
      leaves: actual rows, linked left-to-right
      [1..10] <-> [11..30] <-> [31..50] <-> ...
```

Two properties follow from the shape:

1. **Lookups are logarithmic.** A tree three or four levels deep covers millions of
   rows, so a lookup is a handful of page reads instead of a full scan.
2. **Range scans are cheap.** Because leaves are linked, `BETWEEN`, `>`, and
   `ORDER BY` on the indexed column walk the list without returning to the root.

```sql
CREATE INDEX idx_orders_created ON orders (created_at);

SELECT * FROM orders WHERE created_at >= '2026-01-01';
```

This finds the first matching leaf, then walks forward.

Why it matters:

It explains what an index can and cannot do. Sorted-order operations — equality,
ranges, prefix matches, `ORDER BY` — are fast. Anything that breaks the ordering,
such as a leading wildcard or a function wrapped around the column, cannot use the
tree at all.

Tradeoff:

Every index must be updated on every `INSERT`, `UPDATE`, and `DELETE`, and occupies
disk and memory. Indexes speed up reads and slow down writes.

## 13. Clustered vs Secondary Indexes

In InnoDB the **clustered index is the table**. Rows are stored physically in
primary key order inside the primary key's B+tree leaves.

```txt
clustered index (PRIMARY KEY id)
  leaf: [ id=1 | email | name | created_at ]   <- the full row

secondary index (email)
  leaf: [ email | id=1 ]                       <- the PK, not the row
```

A secondary index stores the primary key as its pointer. So a query filtered by a
secondary index does **two** lookups:

```sql
SELECT name FROM users WHERE email = 'a@b.com';
```

```txt
1. search the email index  -> finds id = 1
2. search the clustered index by id = 1 -> reads name
```

That second step is the bookmark lookup.

Why it matters:

It explains two things at once. First, why a **covering index** is so much faster:
it skips step 2. Second, why the primary key should be narrow — every secondary
index stores a copy of it.

Important:

A random primary key such as a UUIDv4 makes inserts land at random positions in the
clustered index, causing page splits and fragmentation. An auto-increment key or a
time-ordered UUIDv7 appends instead.

Interview note:

PostgreSQL is different: its tables are heaps, and all indexes point to a physical
row location. It has no clustered index in the InnoDB sense, which is why this
question needs an engine named before it can be answered precisely.

## 14. What Is A Composite Index And The Leftmost Prefix Rule?

A composite index covers several columns in a defined order, and it can only be
used from the left.

```sql
CREATE INDEX idx_user_status_created ON orders (user_id, status, created_at);
```

| Query predicate | Uses the index |
| --- | --- |
| `user_id = 1` | yes |
| `user_id = 1 AND status = 'paid'` | yes |
| `user_id = 1 AND status = 'paid' AND created_at > ?` | yes, fully |
| `status = 'paid'` | **no** |
| `status = 'paid' AND created_at > ?` | **no** |
| `user_id = 1 AND created_at > ?` | partially — `user_id` only |

Think of a phone book sorted by last name, then first name. You can find everyone
called "Hossain", and "Hossain, Mofasser". You cannot efficiently find everyone
called "Mofasser".

Column order rules:

1. Equality predicates first
2. Then the range predicate
3. Then columns needed only for `ORDER BY`

```sql
-- for: WHERE user_id = ? AND status = ? AND created_at > ?
CREATE INDEX idx_good ON orders (user_id, status, created_at);
```

Interview trap:

A range predicate stops the index being used for columns after it. In
`(user_id, created_at, status)` with a range on `created_at`, the `status` column
cannot be used for lookup — only for filtering rows already fetched.

Tradeoff:

One well-ordered composite index often replaces three single-column indexes,
reducing write cost. The cost is that it only serves queries matching its prefix.

## 15. What Is A Covering Index?

A covering index contains every column a query needs, so the database answers from
the index alone and never touches the table.

```sql
-- needs: user_id (filter), status (filter), total (output)
SELECT total FROM orders WHERE user_id = 1 AND status = 'paid';

CREATE INDEX idx_cover ON orders (user_id, status, total);
```

```sql
EXPLAIN SELECT total FROM orders WHERE user_id = 1 AND status = 'paid';
```

```txt
+----+-------+------+-----------+-------------+
| id | table | type | key       | Extra       |
+----+-------+------+-----------+-------------+
|  1 | orders| ref  | idx_cover | Using index |
+----+-------+------+-----------+-------------+
```

`Using index` in the `Extra` column is the signal — it means covering, and it skips
the bookmark lookup entirely.

Benefits:

- no second lookup into the clustered index
- fewer pages read, so more of the working set stays in memory
- often several times faster on a large table

When not to use it:

Adding wide columns purely to make an index covering inflates the index and slows
writes. Cover a query that runs constantly; do not cover everything.

Interview note:

`SELECT *` can almost never be covered, which is one concrete reason to list the
columns you actually need.

## 16. SQL vs NoSQL: How Do You Choose?

The real question is what shape your access patterns have, not which technology is
newer.

| | Relational | Document | Key-value | Wide-column | Graph |
| --- | --- | --- | --- | --- | --- |
| Example | MySQL, PostgreSQL | MongoDB | Redis | Cassandra | Neo4j |
| Schema | fixed, enforced | flexible per document | none | column families | nodes and edges |
| Joins | first-class | limited | none | none | traversal-native |
| Transactions | multi-row ACID | usually single document | limited | limited | varies |
| Scales by | vertical, read replicas | sharding | sharding | horizontal, linear | varies |
| Best at | relationships, correctness | nested aggregates | caching, sessions | huge write volume | networks |

Choose relational when:

- data has genuine relationships you will query across
- you need multi-row transactions and constraints
- reporting is ad hoc and you cannot predict every query

Choose a document store when:

- records are self-contained aggregates read as a unit
- the shape varies per record
- you would otherwise join the same five tables on every read

Choose key-value when:

- access is strictly by a known key
- the data is a cache, a session, or a rate-limit counter

Interview note:

"NoSQL scales better" is not a useful answer. A single well-indexed MySQL instance
handles far more load than most systems ever see, and document stores gain
horizontal scaling by giving up joins and cross-document transactions. Name the
tradeoff, not the trend.

Tradeoff:

Schemaless does not mean no schema. It means the schema lives in application code,
where the database cannot enforce it and old documents keep their old shape
forever.

## 17. What Are Replication And Read Replicas?

Replication copies writes from a primary to one or more replicas.

```txt
        writes
          ↓
      ┌─────────┐
      │ primary │
      └────┬────┘
           │ replication stream
     ┌─────┴─────┐
     ↓           ↓
┌─────────┐ ┌─────────┐
│ replica │ │ replica │   <- reads
└─────────┘ └─────────┘
```

Benefits:

- read capacity scales by adding replicas
- a replica can be promoted if the primary fails
- backups and heavy reporting run off the primary

Important:

Replication is normally **asynchronous**, so a replica lags behind. A user who
writes and immediately reads may not see their own change:

```js
await db.write("UPDATE users SET name = ? WHERE id = ?", [name, id]);
const user = await db.read("SELECT name FROM users WHERE id = ?", [id]);
// may return the OLD name
```

Fix — read-your-own-writes: route a user's reads to the primary for a short window
after they write, or read from the primary when the query is on the write path.

Interview note:

This is eventual consistency showing up inside a relational database. People
associate it only with NoSQL, but any async replica has it.

## 18. What Is Sharding?

Sharding splits one logical table across multiple databases by a shard key.

```txt
users, sharded by user_id % 4

shard 0: user_id 4, 8, 12...
shard 1: user_id 1, 5, 9...
shard 2: user_id 2, 6, 10...
shard 3: user_id 3, 7, 11...
```

Unlike replication, each shard holds a **different** subset, so writes scale too.

Choosing the shard key is the whole decision:

- it should spread load evenly
- the most common queries should be answerable from one shard
- it should rarely change, because moving a row between shards is expensive

Tradeoff:

Sharding gives up most of what makes a relational database convenient:

- no joins across shards
- no cross-shard transactions or foreign keys
- `ORDER BY` with `LIMIT` must be gathered and merged in the application
- rebalancing when you add a shard is a project in itself

When not to use it:

Almost always, until you have exhausted the alternatives — a bigger instance, read
replicas, caching, archiving cold rows, and fixing the slow queries. Sharding is
the last option because it is the hardest to undo.

Study path:

Cross-service data ownership and distributed transaction patterns are covered in
the System Design & Microservices guide.

## 19. How Do Schema Migrations Work Safely In Production?

The rule is that schema and code deploy separately, and every intermediate state
must work.

An unsafe rename, all at once:

```sql
ALTER TABLE users CHANGE COLUMN username handle VARCHAR(50);
```

Old application instances immediately break — they still select `username`.

The expand-and-contract pattern:

```txt
1. EXPAND    add `handle`, nullable; deploy code that writes BOTH columns
2. BACKFILL  copy username -> handle in batches
3. MIGRATE   deploy code that reads `handle`
4. CONTRACT  stop writing `username`; later, drop it
```

```sql
-- 1. expand
ALTER TABLE users ADD COLUMN handle VARCHAR(50) NULL;

-- 2. backfill in batches to avoid a long lock
UPDATE users SET handle = username
WHERE handle IS NULL AND id BETWEEN ? AND ?;

-- 4. contract, days later
ALTER TABLE users DROP COLUMN username;
```

Important:

`ALTER TABLE` on a large table can lock it for a long time. Use
`ALGORITHM=INPLACE, LOCK=NONE` where supported, or a tool such as
`pt-online-schema-change` or `gh-ost`, which build a shadow table and swap it.

Rules worth stating in an interview:

- every migration must be backward compatible with the currently running code
- never add a `NOT NULL` column without a default to a large table in one step
- backfill in batches with a sleep between them, not in one statement
- have a tested rollback, and remember that dropping a column is irreversible

## 20. What Is Connection Pooling?

A pool keeps a set of open database connections and hands them out, instead of
opening a new one per request.

```js
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  queueLimit: 0,
});

const [rows] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
```

Why it matters:

Opening a connection costs a TCP handshake, authentication, and session setup —
milliseconds each time, on every request. Reuse removes that per-request cost.

Interview trap:

A bigger pool is not faster. Each connection consumes memory and a server thread,
and past the point where the database can run queries in parallel, more connections
only add contention:

```txt
total connections = pool size x number of application instances
```

Ten instances with a pool of 100 is 1000 connections, which will exhaust
`max_connections` long before it helps.

A practical starting point is a small pool per instance — often 5 to 20 — tuned by
measuring. Add a connection acquisition timeout so a saturated pool fails fast
rather than queueing forever.

Important:

Always release connections, including on error. A connection taken out for a
transaction and never returned leaks until the pool is empty and every request
hangs.

## Sources Used

- <https://dev.mysql.com/doc/refman/8.0/en/innodb-index-types.html>
- <https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-isolation-levels.html>
- <https://dev.mysql.com/doc/refman/8.0/en/innodb-deadlocks.html>
- <https://dev.mysql.com/doc/refman/8.0/en/multiple-column-indexes.html>
- <https://www.postgresql.org/docs/current/transaction-iso.html>
- <https://en.wikipedia.org/wiki/Database_normalization>
