# MongoDB Indexing & Performance Interview Guide

MongoDB performance guidance: how indexes work, the index types, reading an
`explain` plan, the ESR rule for compound indexes, sort direction and prefixes,
multikey and covered queries, partial and unique indexes, regex and text search,
diagnosing a slow query on a large collection, pagination at scale, the query
planner and plan cache, building and retiring indexes in production, memory and
the working set, and the profiler.

The plans quoted below were captured on MongoDB 8.2 from the practice dataset in
the next section — run it and you get the same numbers. The 50-million-document
scenario in question 10 is illustrative.

## Practice Dataset

A 100,000-document `orders` collection (5,000 users, six statuses, one order
every five minutes through 2026) and a 20,000-document `users` collection. Paste
into `mongosh`:

```js
db.orders.drop();
db.users.drop();

const statuses = ["paid", "paid", "paid", "shipped", "pending", "cancelled"];
const orders = [];
for (let i = 0; i < 100000; i++) {
  orders.push({
    _id: i + 1,
    userId: (i * 7919) % 5000,
    status: statuses[i % 6],
    total: (i * 37) % 500,
    createdAt: new Date(Date.UTC(2026, 0, 1) + i * 300000),
  });
}
db.orders.insertMany(orders);

const countries = ["BD", "US", "IN", "DE"];
const users = [];
for (let i = 0; i < 20000; i++) {
  users.push({
    _id: i,
    email: `user${i}@example.com`,
    country: countries[i % 4],
    name: `User ${i}`,
  });
}
db.users.insertMany(users);
```

## 1. How Does A MongoDB Index Work?

An index is a **B-tree** of field values, kept in sorted order, where each entry
points to a document's location. WiredTiger stores indexes separately from the
documents and compresses them with prefix compression.

```txt
index { userId: 1, status: 1 }

(41, "paid")     -> record 18,204
(42, "cancelled")-> record  3,561
(42, "paid")     -> record    873     <- a query for userId 42, status "paid"
(42, "paid")     -> record 51,907        jumps here and reads forward
(42, "pending")  -> record 66,030
(43, "paid")     -> record  9,118
```

Because the entries are sorted, one index serves several kinds of work:

- **equality** — jump straight to `(42, "paid")`
- **ranges** — walk forward from the first match to the last
- **sorting** — read entries in index order instead of sorting documents
- **covering** — answer from the index alone when it holds every needed field

Why it matters:

Without an index, MongoDB reads every document in the collection — a `COLLSCAN`.
With one, it reads the handful of index entries that match and fetches only those
documents.

Tradeoff:

Every index is updated on every insert, on every delete, and on every update that
touches an indexed field. It also competes for RAM with the documents. Indexes
speed up reads and tax writes and memory, so each one must earn its place.

## 2. What Index Types Does MongoDB Support?

| Type | Purpose |
| --- | --- |
| **Single field** | one field, ascending or descending |
| **Compound** | several fields, order matters |
| **Multikey** | automatic on array fields — one entry per element |
| **Text** | full-text search on string content |
| **Geospatial** | `2d` and `2dsphere` for location queries |
| **Hashed** | hash of the value; used for sharding |
| **Wildcard** | indexes unknown or variable field names |
| **TTL** | automatically deletes documents after a period |
| **Partial** | indexes only documents matching a filter |
| **Sparse** | skips documents missing the field |
| **Unique** | enforces uniqueness |
| **Hidden** | kept up to date but ignored by the planner (4.4+) |

```js
db.orders.createIndex({ userId: 1, status: 1, createdAt: -1 });   // compound
db.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL
db.users.createIndex({ email: 1 }, { unique: true });
db.orders.createIndex(
  { userId: 1 },
  { partialFilterExpression: { deletedAt: null } },               // partial
);
```

Two worth knowing well:

**Multikey** indexes are created automatically when a field holds an array. One
index entry is produced per array element, so an index on a 100-element array
costs 100 entries per document.

**Partial** indexes are the fix for soft deletes — indexing only live rows keeps
the index small and skips dead documents entirely. MySQL has no equivalent;
PostgreSQL has partial indexes too.

Interview note:

Prefer **partial** over **sparse**. A sparse index is just "documents where the
field exists"; a partial index accepts any supported filter, so it covers the
sparse case and more.

## 3. How Do You Read An `explain` Plan?

```js
db.orders.find({ userId: 42, status: "paid" }).explain("executionStats");
```

| Verbosity | Shows |
| --- | --- |
| `"queryPlanner"` (default) | the chosen plan and the rejected ones — nothing is executed |
| `"executionStats"` | runs the winning plan and reports what it read |
| `"allPlansExecution"` | also reports the trial run of each rejected plan |

The fields that matter:

| Field | Read it as |
| --- | --- |
| `stage` | `COLLSCAN` is a full scan; `IXSCAN` used an index |
| `nReturned` | documents actually returned |
| `totalDocsExamined` | documents read from disk |
| `totalKeysExamined` | index entries read |
| `executionTimeMillis` | wall-clock time |
| `indexName` | which index was chosen |

On the practice dataset, with no index:

Plan before:

```txt
winningPlan:         COLLSCAN
nReturned:           13
totalKeysExamined:   0
totalDocsExamined:   100000
executionTimeMillis: 25
```

After `db.orders.createIndex({ userId: 1, status: 1 })`:

Plan after:

```txt
winningPlan:         FETCH <- IXSCAN (userId_1_status_1)
nReturned:           13
totalKeysExamined:   13
totalDocsExamined:   13
executionTimeMillis: 1
```

The ratio is the diagnosis:

```txt
nReturned: 14        totalDocsExamined: 14        -> ideal, 1:1
nReturned: 14        totalDocsExamined: 2,400,000 -> the index is missing or wrong
nReturned: 14        totalDocsExamined: 0         -> covered query, best case
```

Important:

A `SORT` stage in the plan means MongoDB sorted **in memory**, because no index
provided the order. That sort may use **100MB**. Since 6.0 a larger sort spills to
disk by default instead of failing — on the practice machine, an unindexed sort
over 118MB reported `usedDisk: true` and `spills: 2`. It still completes, but
slowly, and with `allowDiskUse(false)` it fails outright:

```txt
Executor error during find command :: caused by :: Sort exceeded memory limit
of 104857600 bytes, but did not opt in to external sorting.
```

Before 4.4 the limit was 32MB and exceeding it was always an error, which is why
older answers call it a hard failure.

## 4. How Do You Design A Compound Index? The ESR Rule

MongoDB's guidance is **ESR — Equality, Sort, Range**:

```txt
1. Equality fields first    userId: 42, status: "paid"
2. Sort fields next         createdAt: -1
3. Range fields last        total: { $gt: 100 }
```

```js
// Query
db.orders.find({
  userId: 42,
  status: "paid",
  total: { $gt: 100 },
}).sort({ createdAt: -1 }).limit(5);

// Index, in ESR order
db.orders.createIndex({ userId: 1, status: 1, createdAt: -1, total: 1 });
```

Why sort comes before range:

A range predicate makes the index entries after it non-contiguous, so MongoDB can
no longer walk them in sorted order. Putting the sort field **before** the range
lets the index satisfy the sort and avoid a blocking in-memory `SORT` stage.

Measured on the practice dataset, the same query with each column order:

```txt
{ userId, status, total, createdAt }   ERS
  FETCH <- SORT <- IXSCAN      keys examined 13, docs 5, blocking SORT

{ userId, status, createdAt, total }   ESR
  LIMIT <- FETCH <- IXSCAN     keys examined 5,  docs 5, no SORT
```

With both indexes present, the planner raced them and chose the ESR index.
ESR read only as many entries as the `limit` needed; ERS had to read every
matching entry, then sort them. On a user with 50,000 orders instead of 13, that
difference is the whole query.

Interview note:

The B-tree logic is the same in relational databases — MySQL and PostgreSQL also
cannot use an index for `ORDER BY` when a range column comes before the sort
column. Relational advice often lists "equality, range, then sort" because it
minimises rows examined; ESR minimises blocking sorts. When the range is very
selective, ERS can win, so compare both plans rather than applying either rule
blindly.

The prefix rule still applies:

| Predicate | Uses `{ userId, status, createdAt }` |
| --- | --- |
| `userId` | yes |
| `userId` + `status` | yes |
| `userId` + `status` + `createdAt` | yes, fully |
| `status` alone | **no** |
| `status` + `createdAt` | **no** |

## 5. Which Sorts Can A Compound Index Serve?

An index can be read **forwards or backwards**, and equality on a prefix lets it
sort by the next field. With `{ status: 1, createdAt: -1 }`:

| Sort | Plan on the practice dataset |
| --- | --- |
| `{ status: 1, createdAt: -1 }` | `IXSCAN` — matches the index |
| `{ status: -1, createdAt: 1 }` | `IXSCAN` — the exact reverse, read backwards |
| `{ status: 1, createdAt: 1 }` | `SORT` — mixed directions do not match |

With `{ userId: 1, status: 1, createdAt: 1 }`:

| Query | Plan |
| --- | --- |
| `find({ userId: 42 }).sort({ status: 1 })` | `IXSCAN` — next field after the equality |
| `find({ userId: 42 }).sort({ createdAt: 1 })` | `SORT` — skips `status` |
| `find({ userId: 42, status: "paid" }).sort({ createdAt: 1 })` | `IXSCAN` — equality on both earlier fields |

The rule:

A sort is served by the index when its fields are a **contiguous run** of the
index, in the index's directions or all reversed, after equality conditions on
every earlier field.

Why it matters:

Direction only matters for **compound** sorts. A single-field index sorts either
way, so `{ createdAt: 1 }` serves `sort({ createdAt: -1 })` too.

## 6. How Do Multikey Indexes Work, And What Are Their Limits?

An index on an array field gets one entry **per element**, so `{ tags: 1 }` finds
documents containing a tag directly.

```js
db.products.createIndex({ tags: 1 });
db.products.find({ tags: "sale" });      // IXSCAN, isMultiKey: true
```

Limits worth knowing:

**No two array fields in one compound index.** The index would need an entry for
every combination of elements — the "parallel arrays" problem. MongoDB rejects
the insert that would create one:

```txt
cannot index parallel arrays [sizes] [tags]
```

That came from `{ tags: 1, sizes: 1 }` after a document with `tags: ["a"]` and
`sizes: ["S", "M"]` was inserted.

**Multikey indexes cannot cover queries on the array field**, because one entry
does not hold the whole array.

**Size multiplies.** A document with 500 tags adds 500 entries, and every change
to the array rewrites them.

Important:

Use `$elemMatch` for several conditions on one element of an array of documents.
It lets the planner combine the bounds for a single element instead of
evaluating each condition across the whole array.

## 7. What Is A Covered Query?

A covered query is answered **entirely from the index** — `totalDocsExamined` is
zero because no document is fetched.

```js
db.users.createIndex({ country: 1, email: 1 });

db.users.find(
  { country: "BD" },
  { _id: 0, country: 1, email: 1 },   // projection matches the index
);
```

Plan on the practice dataset:

```txt
PROJECTION_COVERED <- IXSCAN (country_1_email_1)
nReturned: 5000   totalKeysExamined: 5000   totalDocsExamined: 0
```

Leave `_id` in the projection and the same query fetches every document:

```txt
PROJECTION_SIMPLE <- FETCH <- IXSCAN (country_1_email_1)
nReturned: 5000   totalKeysExamined: 5000   totalDocsExamined: 5000
```

Two requirements:

1. Every field in the query **and** the projection must be in the index.
2. `_id` must be excluded explicitly, unless it is part of the index — it is
   returned by default and is not in your compound index.

Benefits:

No document fetch, far fewer pages read, and more of the working set fits in RAM.

When not to use it:

Adding wide fields to an index purely to make a query covered inflates the index
and slows every write. Cover a query that runs constantly; do not cover
everything.

## 8. When Do You Use Partial, Sparse, And Unique Indexes?

A **partial** index includes only documents matching a filter. Combined with
`unique`, it enforces "unique among the documents that matter" — the standard
answer for soft deletes, where a deleted user's email must be reusable:

```js
db.users.createIndex(
  { email: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
```

Two live users cannot share an email; any number of deleted ones can.

Interview trap:

The planner uses a partial index only when the query **implies the filter**.
`find({ email: "a@b.com" })` cannot use the index above, because it might need
deleted documents the index does not contain. `find({ email: "a@b.com",
deletedAt: null })` can.

Interview trap:

Not every filter is allowed. `{ deletedAt: null }` works, but the more obvious
`{ deletedAt: { $exists: false } }` is rejected:

```txt
Expression not supported in partial index: $not
    deletedAt exists
```

Supported filter expressions are equality, `$exists: true`, `$gt`/`$gte`/`$lt`/
`$lte`, `$type`, and top-level `$and` — plus `$or` and `$in` from 6.0. Anything
that negates, including `$ne`, is rejected the same way.

| Index | Contains | Use for |
| --- | --- | --- |
| Sparse | documents where the field exists | legacy; prefer partial |
| Partial | documents matching a filter | soft deletes, hot subsets such as `status: "active"` |
| Unique | every document; one per value | natural keys; missing counts as `null`, so only one document may lack the field |
| Unique + partial | matching documents; one per value among them | "unique email among live users" |

## 9. How Do Regex, Text Search, And Case-Insensitive Queries Use Indexes?

With `{ email: 1 }` on the practice `users` collection, three regexes that all
return the same 1,111 users:

| Query | Keys examined | Why |
| --- | --- | --- |
| `{ email: /^user12/ }` | 1,112 | anchored prefix: tight index bounds |
| `{ email: /user12/ }` | 20,000 | unanchored: every key must be tested |
| `{ email: /^user12/i }` | 20,000 | case-insensitive: bounds cannot be computed |

All three used the index, and all three are "IXSCAN" in `explain` — only
`totalKeysExamined` shows that two of them read the entire index.

Case-insensitive equality needs a **collation index**, queried with the same
collation:

```js
db.users.createIndex(
  { email: 1 },
  { collation: { locale: "en", strength: 2 } },
);
db.users
  .find({ email: "USER12@example.com" })
  .collation({ locale: "en", strength: 2 });
```

A common alternative is to store a normalised copy — `emailLower` — and index
that.

Text search:

```js
db.articles.createIndex({ title: "text", body: "text" });
db.articles.find({ $text: { $search: "index performance" } });
```

| | `$regex` | `$text` | Atlas Search (`$search`) |
| --- | --- | --- | --- |
| Matches | patterns | whole stemmed words | analysed terms, fuzzy, autocomplete |
| Partial words | yes | **no** | yes |
| Relevance ranking | no | basic `textScore` | full scoring |
| Indexes per collection | many | **one** text index | separate search index |

When to use it:

Anchored, case-sensitive prefixes for "starts with". `$text` for simple keyword
search on self-managed deployments. Atlas Search — or a dedicated search engine
— for anything a user types into a search box.

## 10. A Query On 50 Million Documents Takes Seconds. How Do You Fix It?

Symptom:

A frequently used query on a large collection takes several seconds.

```js
db.events
  .find({ tenantId: "acme", type: "purchase", createdAt: { $gte: since } })
  .sort({ createdAt: -1 })
  .limit(50);
```

Plan before:

```txt
stage: COLLSCAN
nReturned: 50
totalDocsExamined: 50,000,000
executionTimeMillis: 8,400
SORT stage present
```

Why:

No usable index, so every document is read and then sorted in memory.

Fix — an index in ESR order:

```js
db.events.createIndex(
  { tenantId: 1, type: 1, createdAt: -1 },
  { name: "tenant_type_created" },
);
```

Plan after:

```txt
stage: IXSCAN -> FETCH
nReturned: 50
totalDocsExamined: 50
totalKeysExamined: 50
executionTimeMillis: 3
no SORT stage
```

Here `createdAt` is both the sort and the range, so one index position serves
both.

Method, in order:

1. `explain("executionStats")` and compare `nReturned` to `totalDocsExamined`
2. Check selectivity — `db.events.distinct("type").length` tells you whether a
   field is worth indexing
3. Apply **ESR** for the compound index
4. Confirm the `SORT` stage is gone
5. Check the write cost — every index slows inserts

Edge cases:

- **Multi-tenant** collections should lead every compound index with `tenantId`,
  since it appears in every query.
- **Low-cardinality leading field** — a `status` with four values leading the index
  narrows 50M to 12M, which the planner may reject in favour of a scan.
- **Stale statistics** are not a MongoDB concern the way they are in relational
  databases — by default the planner races candidate plans instead of estimating
  costs. It does cache the winner, but creating or dropping an index clears that
  collection's plan cache automatically (question 12).
- **Building the index** on a busy 50M-document collection is itself an
  operation to plan — see question 13.

## 11. Why Is `skip()` Slow, And How Do You Paginate At Scale?

`skip(n)` must **walk and discard** n documents. Cost grows linearly with page
number.

```js
// Page 2,501 - reads and throws away 50,000 index entries
db.orders.find().sort({ createdAt: -1, _id: -1 }).skip(50000).limit(20);
```

Fix — range-based (keyset) pagination using the last seen value:

```js
db.orders
  .find({
    $or: [
      { createdAt: { $lt: lastCreatedAt } },
      { createdAt: lastCreatedAt, _id: { $lt: lastId } },  // tie-breaker
    ],
  })
  .sort({ createdAt: -1, _id: -1 })
  .limit(20);
```

Both on the practice dataset, with an index on `{ createdAt: -1, _id: -1 }`:

```txt
skip(50000).limit(20)   LIMIT <- FETCH <- SKIP <- IXSCAN   keys examined 50,020   17 ms
range .limit(20)        LIMIT <- FETCH <- IXSCAN            keys examined 20        0 ms
```

Constant cost — page 2,501 is as fast as page 1.

The `_id` tie-breaker is not optional. Without it, documents sharing a timestamp
are skipped or repeated across page boundaries.

`limit()` itself is cheap and important:

```js
db.posts.find({ authorId: id }).sort({ createdAt: -1 }).limit(10);
```

With a matching index, MongoDB stops after 10 index entries instead of sorting
every one of the author's posts.

Tradeoff:

Range pagination has no concept of "page 37" and gives no total count. That is the
same trade as cursor pagination in SQL, and it is what large feeds actually do.

## 12. How Does The Query Planner Choose A Plan?

Relational optimizers estimate each plan's cost from table statistics. MongoDB's
default planner — `planRankerMode: "multiPlanning"` on 8.2 — **races** the
candidate plans instead:

```viz
type: flow
title: Choosing a plan for a new query shape
Find candidate indexes :: every index that could serve the filter or the sort
Trial run :: each candidate plan runs a limited amount of work
Pick the winner :: most results for the least work; the others are rejected
Cache it :: stored per query shape — same fields and operators, any values
Reuse :: later queries of that shape skip the race
Replan :: if the cached plan starts doing far more work than it did in the trial
```

That is why `explain` lists `rejectedPlans`: in the ESR comparison from question
4, one plan was rejected — the ERS index.

Tools to know:

```js
// force an index
db.orders.find(query).hint({ userId: 1, status: 1, createdAt: -1 });
// inspect the cache
db.orders.aggregate([{ $planCacheStats: {} }]);
// clear it
db.orders.getPlanCache().clear();
```

Important:

- Creating or dropping an index **clears the collection's plan cache** — verified
  on 8.2: one cached plan before `createIndex`, zero after.
- A plan that won a race on one set of values can be wrong for another — a
  tenant with 10 documents versus one with 10 million. Watch for that when a query
  is fast for most users and slow for a few.
- `hint()` in application code overrides the planner forever. MongoDB 8.0 adds
  **query settings** (`setQuerySettings`), which pin index choices per query
  shape from the server side, without a code change; they replace the older
  index filters.

## 13. How Do You Build Or Drop An Index On A Live Production Collection?

Building:

- Since 4.2, every index build uses the same optimized process: an exclusive
  lock only **briefly at the start and end**, and reads and writes continue
  during the build. The old `background: true` option is ignored.
- On a replica set, the build runs on all data-bearing members at once (4.4+),
  and the index is ready only when enough members finish — `commitQuorum`
  controls how many.
- A build still costs CPU, I/O, and cache. For very large collections on a busy
  cluster, a **rolling build** — one secondary at a time, then step down the
  primary and build there — isolates the impact.

Dropping — hide it first:

```js
db.orders.hideIndex("status_1"); // still maintained, ignored by the planner
// watch latency and the slow query log for a few days
db.orders.unhideIndex("status_1"); // instant rollback if something regressed
db.orders.dropIndex("status_1"); // only once nothing missed it
```

On the practice data, hiding `status_1` turned `find({ status: "paid" })` into a
`COLLSCAN`; unhiding restored the `IXSCAN` immediately, with no rebuild.

Why it matters:

Rebuilding a dropped index on a large collection can take hours, during which the
queries it served are full scans. A hidden index can be restored in a second.

## 14. How Many Indexes Is Too Many?

There is no fixed number; there is a cost for each one. Every index:

- adds work to every insert and delete, and to updates of its fields
- takes RAM that could hold documents
- adds a candidate to every plan race for queries on its fields

Find unused indexes:

```js
db.orders.aggregate([
  { $indexStats: {} },
  { $project: { name: 1, "accesses.ops": 1 } },
]);
```

`accesses.ops` counts how often each index has been used since the server
started — check every member of the replica set, since reads may go to
secondaries.

Find redundant indexes:

```txt
{ userId: 1 }                          redundant — a prefix of the next one
{ userId: 1, status: 1 }               redundant — a prefix of the next one
{ userId: 1, status: 1, createdAt: -1 }
```

A compound index serves every query on its leftmost prefix, so the first two add
write cost and buy nothing — unless a unique constraint or a much smaller size
justifies them.

Check the size:

```js
db.orders.stats().indexSizes;     // per index, in bytes
db.orders.totalIndexSize();
```

## 15. What Is The Working Set, And How Much Memory Does MongoDB Need?

The **working set** is the data and indexes your queries touch regularly. When it
fits in memory, reads come from RAM; when it does not, they come from disk, and
latency jumps by orders of magnitude.

Memory layers:

| Layer | Holds |
| --- | --- |
| WiredTiger cache | uncompressed documents and indexes; by default **50% of (RAM − 1GB)**, minimum 256MB |
| Filesystem cache | the rest of RAM, holding compressed data files |

On a 16GB machine the cache defaults to 7.5GB — exactly what `serverStatus`
reports on the machine used for this guide:

```js
db.serverStatus().wiredTiger.cache["maximum bytes configured"];
```

Signs the working set does not fit:

- rising `wiredTiger.cache["bytes read into cache"]` alongside steady traffic
- high disk read IOPS and I/O wait on the host
- queries fast in the morning and slow at peak

Fixes, in order:

1. Remove unused indexes and shrink needed ones — indexes are the part that
   **must** be in memory
2. Archive cold data; move history to another collection
3. Project less, and stop fetching large documents you do not need
4. Add RAM, or shard to spread the working set across machines

Important:

Do not run other memory-hungry processes on a database host, and do not set the
cache to "all the RAM" — the filesystem cache is part of how MongoDB performs.

## 16. How Do You Diagnose A Slow MongoDB Deployment?

Method:

1. **Find the slow operations.** Operations slower than `slowms` (default 100ms)
   are written to the log even with the profiler off. The profiler also stores
   them in a collection:

```js
db.setProfilingLevel(1, { slowms: 100 });
db.system.profile.find().sort({ millis: -1 }).limit(10);
```

2. **Check what is running now:**

```js
db.currentOp({ secs_running: { $gt: 3 } });
db.killOp(opid);                    // stop a runaway operation
```

3. **`explain` the offenders** and compare `nReturned` to `totalDocsExamined`.

4. **Check index usage** with `$indexStats` and drop what is never used.

5. **Check the working set** — if the indexes do not fit in RAM, every query pages
   from disk.

| Symptom | Likely cause | First check |
| --- | --- | --- |
| `COLLSCAN` in the plan | missing index | `explain` |
| `SORT` stage present | sort not served by an index | index order — ESR |
| High `totalDocsExamined` | index too broad | add a field to the compound index |
| `totalKeysExamined` far above `nReturned` | unanchored or case-insensitive regex | anchor it, or use a collation index |
| Slow only at high page numbers | `skip()` | switch to range pagination |
| Slow aggregation | `$match` too late, `$lookup` too early | reorder stages |
| Fast for most users, slow for a few | cached plan wrong for skewed data | `$planCacheStats`, `hint`, query settings |
| All writes on one shard | monotonic shard key | hashed or compound key |
| Connection errors under load | client created per request | one client per process |

Interview note:

Profiler level 2 records **every** operation and adds real overhead — use it
briefly on a staging system, not in production. On Atlas, the Query Profiler and
Performance Advisor surface the same data, with index suggestions.

## 17. What Are The Common MongoDB Performance Gotchas?

**`findOne()` on an unindexed field** — still a full scan.

**`skip()` for deep pagination** — linear cost; use range pagination.

**Sorting without a supporting index** — an in-memory sort limited to 100MB that
spills to disk, or fails if disk use is disabled.

**A range field before the sort field** — the index cannot provide the order.
Follow ESR.

**Unanchored or case-insensitive regex** — "uses the index" while reading every
key.

**Forgetting `_id: 0` in a covered projection** — every document is fetched.

**A partial index the query cannot use** — the query must imply the filter.

**Redundant prefix indexes** — write cost with no read benefit.

**`$lookup` before `$match`, `$unwind` before filtering** — see the Aggregation
Pipeline guide.

**Dropping an index without hiding it first** — no fast way back.

**A new `MongoClient` per request** — the driver already pools; this exhausts
connections.

Strong answer:

> I start from `explain("executionStats")` and compare `nReturned` against
> `totalDocsExamined` — that ratio tells me immediately whether the index is
> missing, too broad, or fine. For compound indexes I follow ESR: equality, then
> sort, then range, because getting the sort into the index removes the blocking
> `SORT` stage and lets a `limit` stop early. I check `totalKeysExamined` too,
> because an unanchored regex can "use" an index and still read all of it. Before
> dropping an index I hide it, and I watch `$indexStats` and the working set so
> that every index earns its RAM.

## Sources Used

- <https://www.mongodb.com/docs/manual/indexes/>
- <https://www.mongodb.com/docs/manual/reference/explain-results/>
- <https://www.mongodb.com/docs/manual/tutorial/equality-sort-range-guideline/>
- <https://www.mongodb.com/docs/manual/core/index-multikey/>
- <https://www.mongodb.com/docs/manual/core/index-partial/>
- <https://www.mongodb.com/docs/manual/core/query-plans/>
- <https://www.mongodb.com/docs/manual/core/index-creation/>
- <https://www.mongodb.com/docs/manual/core/index-hidden/>
- <https://www.mongodb.com/docs/manual/core/wiredtiger/>
- <https://www.mongodb.com/docs/manual/tutorial/manage-the-database-profiler/>
