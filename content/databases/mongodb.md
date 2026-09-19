# MongoDB Interview Guide

MongoDB guidance covering documents and collections, `find` versus `findOne`,
reading an `explain` plan, index types and the ESR rule for compound indexes,
diagnosing a slow query on a large collection, aggregation pipeline optimization,
embedding versus referencing, replica sets, sharding, transactions, and schema
anti-patterns.

## 1. What Is MongoDB, And When Do You Choose It?

MongoDB is a document database. A record is a BSON document — binary JSON with
extra types such as `ObjectId`, `Date`, and `Decimal128`.

```js
{
  _id: ObjectId("65f1a2b3c4d5e6f7a8b9c0d1"),
  email: "a@b.com",
  profile: { name: "Mofasser", country: "BD" },
  roles: ["admin", "editor"],
  createdAt: ISODate("2026-01-15T10:00:00Z")
}
```

Choose it when:

- records are **self-contained aggregates** read as a unit — an order with its
  items, a post with its comments
- the shape varies per record, or evolves quickly
- you would otherwise join the same five tables on every read

Choose relational when:

- data has genuine many-to-many relationships queried from both directions
- you need multi-row transactions and database-enforced constraints
- reporting is ad hoc and you cannot predict the queries

Interview note:

"MongoDB scales better" is not a useful answer. A well-indexed relational database
handles far more load than most systems see, and MongoDB gains horizontal scaling
by giving up joins and cross-shard transactions. Name the tradeoff, not the trend.

Important:

Schemaless does not mean no schema. The schema lives in application code, where
the database cannot enforce it — and old documents keep their old shape forever.
Use schema validation to get some of that back:

```js
db.createCollection("users", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["email", "createdAt"],
      properties: { email: { bsonType: "string", pattern: "^.+@.+$" } },
    },
  },
});
```

## 2. What Is The Difference Between `find()` And `findOne()`?

| | `find()` | `findOne()` |
| --- | --- | --- |
| Returns | a **cursor** | a single document or `null` |
| Documents | many | one |
| Chainable | `.sort()`, `.limit()`, `.skip()` | no |
| Empty result | an empty cursor | `null` |

```js
const cursor = db.users.find({ country: "BD" });   // lazy, nothing fetched yet
const users = await cursor.toArray();               // now it executes

const user = await db.users.findOne({ email: "a@b.com" }); // one document or null
```

`find()` is **lazy** — it returns a cursor and fetches in batches as you iterate.
That matters for large result sets: iterating streams batches rather than loading
everything into memory.

```js
for await (const user of db.users.find({ active: true })) {
  await process(user); // constant memory
}
```

Interview trap:

`findOne()` still scans until it finds a match. On an unindexed field it reads the
whole collection just to return one document — it is not inherently cheap.

`findOne(query)` is equivalent to `find(query).limit(1)` and is implemented that
way.

## 3. How Do You Read An `explain` Plan?

```js
db.orders.find({ userId: 42, status: "paid" }).explain("executionStats");
```

The fields that matter:

| Field | Read it as |
| --- | --- |
| `stage` | `COLLSCAN` is a full scan; `IXSCAN` used an index |
| `nReturned` | documents actually returned |
| `totalDocsExamined` | documents read from disk |
| `totalKeysExamined` | index entries read |
| `executionTimeMillis` | wall-clock time |
| `indexName` | which index was chosen |

The ratio is the diagnosis:

```txt
nReturned: 14        totalDocsExamined: 14        -> ideal, 1:1
nReturned: 14        totalDocsExamined: 2,400,000 -> the index is missing or wrong
nReturned: 14        totalDocsExamined: 0         -> covered query, best case
```

```txt
"winningPlan": { "stage": "COLLSCAN" }    <- no usable index
"winningPlan": { "stage": "FETCH",
                 "inputStage": { "stage": "IXSCAN", "indexName": "user_1_status_1" } }
```

Important:

A `SORT` stage in the plan means MongoDB sorted **in memory**, because no index
provided the order. That is capped at 32MB and fails beyond it unless
`allowDiskUse` is set — and hitting the cap in production is a hard error, not a
slowdown.

## 4. What Index Types Does MongoDB Support?

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
the index small and skips dead documents entirely. Relational MySQL has no
equivalent.

## 5. How Do You Design A Compound Index? The ESR Rule

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
}).sort({ createdAt: -1 });

// Index, in ESR order
db.orders.createIndex({ userId: 1, status: 1, createdAt: -1, total: 1 });
```

Why sort comes before range:

A range predicate makes the index entries after it non-contiguous, so MongoDB can
no longer walk them in sorted order. Putting the sort field **before** the range
lets the index satisfy the sort and avoid a blocking in-memory `SORT` stage.

Interview note:

This differs from the rule for relational compound indexes, where the guidance is
equality, then range, then sort columns. The MongoDB-specific detail is that
avoiding the in-memory sort usually matters more, because it has a hard 32MB
limit.

The prefix rule still applies:

| Predicate | Uses `{ userId, status, createdAt }` |
| --- | --- |
| `userId` | yes |
| `userId` + `status` | yes |
| `userId` + `status` + `createdAt` | yes, fully |
| `status` alone | **no** |
| `status` + `createdAt` | **no** |

## 6. A Query On 50 Million Documents Takes Seconds. How Do You Fix It?

Symptom:

A frequently used query on a large collection takes several seconds.

```js
db.events.find({ tenantId: "acme", type: "purchase", createdAt: { $gte: since } })
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
  { name: "tenant_type_created", background: true },
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
- **Stale statistics** are not a MongoDB concern the way they are in MySQL, but
  the planner caches chosen plans; `db.collection.getPlanCache().clear()` forces a
  re-evaluation after adding an index.

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

```txt
totalDocsExamined: 0
stage: PROJECTION_COVERED -> IXSCAN
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

## 8. Why Is `skip()` Slow, And How Do You Paginate At Scale?

`skip(n)` must **walk and discard** n documents. Cost grows linearly with page
number.

```js
// Page 1000 - reads and throws away 20,000 documents
db.posts.find().sort({ createdAt: -1 }).skip(20000).limit(20);
```

Fix — range-based (keyset) pagination using the last seen value:

```js
db.posts
  .find({
    $or: [
      { createdAt: { $lt: lastCreatedAt } },
      { createdAt: lastCreatedAt, _id: { $lt: lastId } },  // tie-breaker
    ],
  })
  .sort({ createdAt: -1, _id: -1 })
  .limit(20);
```

Constant cost — page 1000 is as fast as page 1.

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

## 9. What Is The Aggregation Pipeline?

A sequence of stages, each transforming the documents that flow through it.

```js
db.orders.aggregate([
  { $match: { status: "paid", createdAt: { $gte: since } } },
  { $group: { _id: "$userId", total: { $sum: "$amount" }, count: { $sum: 1 } } },
  { $sort: { total: -1 } },
  { $limit: 10 },
]);
```

| Stage | Does |
| --- | --- |
| `$match` | filters documents — the `WHERE` |
| `$project` | reshapes and drops fields |
| `$group` | aggregates — the `GROUP BY` |
| `$sort` | orders |
| `$limit` / `$skip` | pagination |
| `$lookup` | left outer join to another collection |
| `$unwind` | one output document per array element |
| `$facet` | several sub-pipelines over the same input |

Important:

Each stage has a **100MB memory limit**. Exceeding it errors unless you pass
`{ allowDiskUse: true }`, which trades memory for much slower disk spilling.

## 10. An Aggregation Takes 8–10 Seconds. How Do You Optimize It?

Symptom:

```js
db.orders.aggregate([
  { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
  { $unwind: "$user" },
  { $match: { "user.country": "BD", status: "paid" } },
  { $sort: { createdAt: -1 } },
  { $group: { _id: "$userId", total: { $sum: "$amount" } } },
]);
```

Why it is slow:

The `$lookup` runs against **every** order before anything is filtered. Ten million
lookups happen, then `$match` throws most of the results away.

Fix — filter first, join last, and index the join key:

```js
db.orders.aggregate([
  // 1. $match FIRST, on indexed fields - shrinks the input immediately
  { $match: { status: "paid", createdAt: { $gte: since } } },

  // 2. $project to drop fields you do not need before the expensive stages
  { $project: { userId: 1, amount: 1, createdAt: 1 } },

  // 3. $group before $lookup - far fewer documents to join
  { $group: { _id: "$userId", total: { $sum: "$amount" } } },

  // 4. $lookup last, on the reduced set
  { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
  { $unwind: "$user" },
  { $match: { "user.country": "BD" } },

  { $sort: { total: -1 } },
  { $limit: 100 },
]);
```

```js
db.orders.createIndex({ status: 1, createdAt: -1 });
db.users.createIndex({ _id: 1, country: 1 });  // covers the lookup + filter
```

The rules:

1. **`$match` as early as possible** — only a `$match` at the very start can use an
   index on the source collection.
2. **`$sort` early enough to use an index**, or it becomes a blocking in-memory
   sort with the 100MB cap.
3. **`$project` before expensive stages** to cut document size.
4. **`$lookup` last**, on the smallest possible set, with the foreign field
   indexed.
5. **`$unwind` explodes documents** — a 100-element array turns one document into
   a hundred. Unwind after filtering, never before.

Diagnose with:

```js
db.orders.explain("executionStats").aggregate([ ... ]);
```

Interview note:

The pipeline optimizer does move some `$match` stages earlier automatically, but it
cannot move a `$match` that depends on a `$lookup` result — which is exactly the
case above. Never rely on the optimizer to fix a badly ordered pipeline.

## 11. Embedding vs Referencing: How Do You Model Relationships?

```js
// Embedded - one document
{
  _id: ObjectId("..."),
  title: "My Post",
  comments: [
    { author: "A", text: "Nice", createdAt: ISODate("...") },
    { author: "B", text: "Thanks", createdAt: ISODate("...") }
  ]
}
```

```js
// Referenced - two collections
{ _id: ObjectId("p1"), title: "My Post" }
{ _id: ObjectId("c1"), postId: ObjectId("p1"), author: "A", text: "Nice" }
```

| Embed when | Reference when |
| --- | --- |
| Read together, always | Queried independently |
| Bounded growth | **Unbounded** growth |
| Updated together | Updated at different rates |
| Child has no identity of its own | Child is a real entity |

The decisive question is **growth**. A document has a hard **16MB limit**, and an
unbounded array is the most common way to hit it.

The extended reference pattern is the usual compromise — duplicate the few fields
you display, reference the rest:

```js
{
  _id: ObjectId("o1"),
  userId: ObjectId("u1"),
  userName: "Mofasser",     // duplicated for display
  userEmail: "a@b.com",     // avoids a $lookup on every order read
  items: [...]
}
```

Tradeoff:

Duplication removes the join and adds a consistency burden — when a user renames
themselves, you need a plan for the copies. For an order, the name **at time of
purchase** is arguably the correct value anyway, which is the same reasoning as
storing price on an order line in SQL.

## 12. What Are Replica Sets?

A replica set is one **primary** that accepts writes, plus **secondaries** that
replicate from it via the oplog.

```txt
        writes
          ↓
      ┌─────────┐
      │ primary │
      └────┬────┘
           │ oplog replication
     ┌─────┴─────┐
     ↓           ↓
 secondary   secondary       <- reads, and election candidates
```

If the primary becomes unreachable, the remaining members **elect** a new primary
automatically — usually within seconds.

Read preference controls where reads go:

```js
db.orders.find({ userId: 42 }).readPref("secondaryPreferred");
```

| Preference | Reads from |
| --- | --- |
| `primary` | the primary only (default) |
| `primaryPreferred` | primary, falling back to secondary |
| `secondary` | secondaries only |
| `secondaryPreferred` | secondaries, falling back to primary |
| `nearest` | lowest latency member |

Important:

Secondaries **lag**. A user who writes and immediately reads from a secondary may
not see their own change. Route reads to the primary for read-your-own-writes, or
use `readConcern: "majority"` with causal consistency.

## 13. What Are Read And Write Concerns?

They control the durability and consistency guarantees per operation.

**Write concern** — how many members must acknowledge:

```js
db.orders.insertOne(doc, {
  writeConcern: { w: "majority", j: true, wtimeout: 5000 },
});
```

| Setting | Meaning |
| --- | --- |
| `w: 1` | the primary acknowledged (default) |
| `w: "majority"` | a majority acknowledged — survives failover |
| `j: true` | written to the on-disk journal |
| `wtimeout` | give up waiting after this long |

**Read concern** — what you are allowed to see:

| Setting | Meaning |
| --- | --- |
| `local` | whatever this member has, may be rolled back |
| `majority` | only data acknowledged by a majority — will not be rolled back |
| `linearizable` | reflects all writes that completed before the read |

Tradeoff:

`w: 1` is fast and can lose the write if the primary fails before replicating.
`w: "majority"` survives failover and costs a round trip to other members. For
money, use majority; for a view counter, `w: 1` is fine.

## 14. What Is Sharding, And How Do You Choose A Shard Key?

Sharding splits a collection across multiple replica sets by a **shard key**.

```txt
orders, sharded by tenantId (hashed)

shard A: tenants 1, 5, 9...
shard B: tenants 2, 6, 10...
shard C: tenants 3, 7, 11...
```

A good shard key has:

1. **High cardinality** — enough distinct values to spread across shards
2. **Even frequency** — no single value dominating
3. **Non-monotonic change** — otherwise every new write lands on the same shard

```js
sh.shardCollection("app.orders", { tenantId: "hashed" });
```

The classic mistake:

```js
sh.shardCollection("app.events", { createdAt: 1 }); // monotonically increasing
```

Every new document has the highest timestamp, so **all writes go to one shard** —
a hotspot that defeats the purpose. Use a hashed key, or a compound key leading
with something well-distributed.

Important:

Queries that **do not include the shard key** are broadcast to every shard and
merged — a scatter-gather. The most common query should be answerable from a
single shard.

Tradeoff:

Sharding gives up cross-shard transactions, makes `$lookup` expensive, and makes
rebalancing a project in itself. It is the last option after a bigger instance,
read scaling, caching, and archiving.

## 15. How Do Transactions Work In MongoDB?

Multi-document ACID transactions exist on replica sets (4.0+) and sharded clusters
(4.2+).

```js
const session = client.startSession();

try {
  await session.withTransaction(async () => {
    await accounts.updateOne(
      { _id: from }, { $inc: { balance: -100 } }, { session },
    );
    await accounts.updateOne(
      { _id: to }, { $inc: { balance: 100 } }, { session },
    );
  }, { readConcern: { level: "majority" }, writeConcern: { w: "majority" } });
} finally {
  await session.endSession();
}
```

Important:

Passing `{ session }` to **every** operation is required. An operation without it
runs outside the transaction and is not rolled back — a silent correctness bug.

Constraints worth knowing:

- a transaction has a default 60-second limit
- long transactions hold resources and hurt throughput
- they are considerably more expensive than in a relational database

Interview note:

The idiomatic MongoDB answer is usually to **design so you do not need one** —
embed data that must change together in a single document, because single-document
operations are always atomic. Reaching for transactions often signals a schema
that should have been modelled differently.

## 16. What Are The Common Schema Anti-Patterns?

**Unbounded arrays.** The 16MB document limit is reached eventually, and updating a
huge array rewrites the whole document.

```js
// Bad
{ _id: "post1", comments: [ /* grows forever */ ] }

// Better: a separate collection, or the bucket pattern
{ _id: "post1", recentComments: [ /* last 10 */ ], commentCount: 4213 }
```

**Massive documents.** Reading one field pulls the entire document into memory.
Split rarely-read fields into a separate collection.

**Too many collections.** Each one costs index and metadata overhead. A `type`
field with a partial index usually beats one collection per type.

**Indexing everything.** Every index slows inserts and consumes RAM. Find unused
ones:

```js
db.orders.aggregate([{ $indexStats: {} }]);
```

**Case-insensitive search without a collation index** — a `$regex` with `i` cannot
use a normal index.

```js
db.users.createIndex(
  { email: 1 },
  { collation: { locale: "en", strength: 2 } },   // case-insensitive
);
```

**Using MongoDB like a relational database.** Many collections joined with
`$lookup` on every read is the shape MongoDB is worst at. Either embed, or use a
relational database.

## 17. How Do You Model A Multi-Tenant Collection?

Shared collections with a `tenantId` field is the usual choice.

```js
{ _id: ObjectId("..."), tenantId: "acme", name: "Order 1", total: 99 }
```

Rules that follow from it:

1. **Every compound index leads with `tenantId`**, because it is in every query.
2. **Every query includes `tenantId`** — enforce it in a data access layer, never
   by convention.
3. **Shard on `tenantId`** so one tenant's data lives on one shard.

```js
db.orders.createIndex({ tenantId: 1, status: 1, createdAt: -1 });
```

```js
// Enforce in one place, not at every call site
function scoped(collection, tenantId) {
  return {
    find: (q = {}) => collection.find({ ...q, tenantId }),
    findOne: (q = {}) => collection.findOne({ ...q, tenantId }),
  };
}
```

Interview note:

A missing `tenantId` in one query is a cross-tenant data leak, not a bug. That is
the argument for a data access layer rather than raw driver calls scattered through
the codebase.

## 18. How Do You Connect MongoDB From Node.js Properly?

```js
import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI, {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  retryWrites: true,
});

let connected;

export async function getDb() {
  connected ??= client.connect();
  await connected;
  return client.db();
}
```

Important:

Create **one** client for the process and reuse it. The driver maintains its own
connection pool internally — calling `MongoClient.connect()` per request exhausts
connections and is the most common MongoDB performance bug in Node.

In serverless, cache the client on the global object so it survives warm
invocations:

```js
const globalWithMongo = global as typeof globalThis & { _mongo?: MongoClient };
const client = globalWithMongo._mongo ?? new MongoClient(uri);
if (process.env.NODE_ENV !== "production") globalWithMongo._mongo = client;
```

`retryWrites: true` lets the driver retry a write once after a failover, which
makes an election largely invisible to the application.

## 19. How Do You Diagnose A Slow MongoDB Deployment?

Method:

1. **Find the slow operations** — enable the profiler:

```js
db.setProfilingLevel(1, { slowms: 100 });
db.system.profile.find().sort({ millis: -1 }).limit(10);
```

2. **Check what is running now:**

```js
db.currentOp({ secs_running: { $gt: 3 } });
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
| Slow only at high page numbers | `skip()` | switch to range pagination |
| Slow aggregation | `$match` too late, `$lookup` too early | reorder stages |
| All writes on one shard | monotonic shard key | hashed or compound key |
| Connection errors under load | client created per request | one client per process |

## 20. What Are The Common MongoDB Gotchas?

**`findOne()` on an unindexed field** — still a full scan.

**`skip()` for deep pagination** — linear cost; use range pagination.

**Sorting without a supporting index** — in-memory sort with a 32MB cap that errors
rather than degrading.

**`$lookup` before `$match`** — joins everything, then discards most of it.

**`$unwind` before filtering** — multiplies documents before you reduce them.

**Aggregation stage memory** — 100MB per stage unless `allowDiskUse` is set.

**Unbounded arrays** — the 16MB document limit is real.

**A monotonically increasing shard key** — every write hits one shard.

**Forgetting `{ session }`** on an operation inside a transaction.

**A new `MongoClient` per request** — the driver already pools; this exhausts
connections.

**Reading from a secondary after writing** — replication lag means you may not see
your own write.

Strong answer:

> I start from `explain("executionStats")` and compare `nReturned` against
> `totalDocsExamined` — that ratio tells me immediately whether the index is
> missing, too broad, or fine. For compound indexes I follow ESR: equality, then
> sort, then range, because getting the sort into the index is what removes the
> in-memory `SORT` stage and its 32MB limit. For aggregations the single biggest
> win is ordering the stages so `$match` runs first on indexed fields and `$lookup`
> runs last on the smallest possible set.

## Sources Used

- <https://www.mongodb.com/docs/manual/core/document/>
- <https://www.mongodb.com/docs/manual/reference/explain-results/>
- <https://www.mongodb.com/docs/manual/indexes/>
- <https://www.mongodb.com/docs/manual/tutorial/equality-sort-range-guideline/>
- <https://www.mongodb.com/docs/manual/core/aggregation-pipeline-optimization/>
- <https://www.mongodb.com/docs/manual/core/data-model-design/>
- <https://www.mongodb.com/docs/manual/replication/>
- <https://www.mongodb.com/docs/manual/sharding/>
- <https://www.mongodb.com/docs/manual/core/transactions/>
