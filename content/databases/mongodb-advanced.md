# MongoDB Advanced Interview Guide

Advanced MongoDB for senior interviews: replica sets and elections, the oplog,
read and write concerns, read preference and causal consistency, transactions and
how to avoid needing them, sharded cluster architecture and shard keys, change
streams, schema design patterns, modelling trees, anti-patterns, multi-tenancy,
time series collections, schema evolution, security and NoSQL injection, backups,
choosing between MongoDB and PostgreSQL `jsonb`, and diagnosing replication and
sharding problems.

Examples ran against a single-node replica set on MongoDB 8.2 — the oplog,
transactions, and change streams all need a replica set. Start one locally with
`mongod --replSet rs0` and `rs.initiate()`. Outputs marked "Output" are exactly
what `mongosh` printed; driver results are quoted as the driver reported them.

## 1. What Are Replica Sets, And How Do Elections Work?

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
automatically. Members declare the primary lost after `electionTimeoutMillis`
(10 seconds by default), and a failover typically completes within about 12
seconds.

The rules that decide whether an election can succeed:

- A candidate needs votes from a **majority of voting members** — and a primary
  that cannot see a majority steps down.
- Three members survive one failure; five survive two. **Even numbers add no
  fault tolerance** — four members also survive only one.
- At most 7 members vote, out of up to 50 in the set.

Member types worth knowing:

| Member | Purpose |
| --- | --- |
| Priority 0 | never becomes primary — a smaller machine, or a remote data centre |
| Hidden | invisible to applications; runs backups or analytics without competing with app reads |
| Delayed | applies the oplog an hour (say) late — a window to recover from a bad `deleteMany` |
| Arbiter | votes but holds no data |

Interview trap:

Arbiters look like a cheap third member and cause real problems. A
primary-secondary-arbiter set cannot acknowledge `w: "majority"` writes when the
secondary is down, and for that reason MongoDB's implicit default write concern
for such a set falls back to `w: 1`. Use three data-bearing members.

Important:

A delayed member is not a backup. It is a recovery aid for a narrow window, on
the same cluster, managed by the same people who might make the mistake.

## 2. What Is The Oplog, And Why Does Its Size Matter?

The **oplog** (`local.oplog.rs`) is a capped collection on every member recording
each write. Secondaries tail the primary's oplog and apply the same entries.

Entries are **idempotent** — applying one twice gives the same result. An `$inc`
is recorded as the value it produced, not as "add one":

```js
db.inventory.insertOne({ _id: 1, sku: "KB", qty: 5 });
db.inventory.updateOne({ _id: 1 }, { $inc: { qty: 1 } });
db.getSiblingDB("local").oplog.rs
  .find({ ns: "test.inventory" }, { _id: 0, op: 1, o: 1, o2: 1 })
  .sort({ $natural: -1 })
  .limit(2);
```

Output:

```txt
[
  { op: 'u', o: { '$v': 2, diff: { u: { qty: 6 } } }, o2: { _id: 1 } },
  { op: 'i', o: { _id: 1, sku: 'KB', qty: 5 }, o2: { _id: 1 } }
]
```

Newest first: the update (`op: 'u'`) stores `qty: 6`, the insert (`op: 'i'`) the
full document.

Why the size matters:

The oplog is capped, so it holds a **window** of history — hours or days,
depending on its size and the write rate.

- A secondary offline for longer than the window cannot catch up and needs a full
  **initial sync**.
- Change streams can resume only from a point still in the oplog.
- A bulk backfill that rewrites millions of documents can shrink the window from
  days to minutes.

```js
rs.printReplicationInfo(); // oplog size and the time window it covers
db.adminCommand({ replSetResizeOplog: 1, size: 51200, minRetentionHours: 48 });
```

`minRetentionHours` (4.4+) keeps entries for at least that long even if the size
limit is reached.

## 3. What Are Read And Write Concerns?

They control the durability and consistency guarantees per operation.

**Write concern** — how many members must acknowledge:

```js
db.orders.insertOne(doc, {
  writeConcern: { w: "majority", j: true, wtimeout: 5000 },
});
```

| Setting | Meaning |
| --- | --- |
| `w: 1` | the primary acknowledged |
| `w: "majority"` | a majority acknowledged — survives failover; **the implicit default since 5.0** |
| `j: true` | written to the on-disk journal |
| `wtimeout` | give up waiting after this long |

On MongoDB 8.2, `db.adminCommand({ getDefaultRWConcern: 1 })` reports
`defaultWriteConcern: { w: 'majority' }` with source `'implicit'`. Answers that
call `w: 1` the default describe MongoDB 4.4 and earlier.

**Read concern** — what you are allowed to see:

| Setting | Meaning |
| --- | --- |
| `local` | whatever this member has, may be rolled back — the default |
| `available` | like `local`; on sharded clusters, may also return orphaned documents |
| `majority` | only data acknowledged by a majority — will not be rolled back |
| `linearizable` | reflects all writes that completed before the read; primary only, slow |
| `snapshot` | a consistent point-in-time view — used by transactions |

Tradeoff:

`w: 1` is fast and can lose the write if the primary fails before replicating.
`w: "majority"` survives failover and costs a round trip to other members. For
money, use majority; for a view counter, `w: 1` is fine.

Interview note:

A `w: 1` write that the old primary acknowledged but never replicated is **rolled
back** when that node rejoins as a secondary — MongoDB writes it to a rollback
file rather than keeping it. That is the concrete meaning of "may be lost".

## 4. How Do Read Preferences And Causal Consistency Work?

Read preference controls **which member** serves a read:

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
not see their own change.

A **causally consistent session** fixes that without forcing reads to the
primary. The session carries the cluster time of each operation, and a secondary
waits until it has caught up to that time before answering:

```js
const session = client.startSession({ causalConsistency: true });
const orders = client.db("shop").collection("orders", {
  readConcern: { level: "majority" },
  writeConcern: { w: "majority" },
  readPreference: "secondaryPreferred",
});

await orders.insertOne({ _id: 1, status: "paid" }, { session });
// sees the insert
const order = await orders.findOne({ _id: 1 }, { session });
```

The guarantee — read your own writes, monotonic reads — holds only with
**majority** read and write concerns, and only for operations in the same session.

When to use it:

- `primary` for anything the user just changed
- `secondaryPreferred` for reports and exports that tolerate seconds of lag
- `nearest` for globally distributed read-heavy data
- a causally consistent session when you want secondary reads **and**
  read-your-own-writes

## 5. How Do Transactions Work In MongoDB?

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

Verified on 8.2: inside an open transaction that had already updated account 1,
a `$set: { note: "outside" }` without `{ session }` **waited** until the
transaction ended, then applied. After the transaction aborted, the balance change
was rolled back and `note: 'outside'` was still there.

Two transactions writing the same document conflict. The second one fails
immediately instead of waiting:

```txt
MongoServerError: WriteConflict (code 112)
Caused by :: Write conflict during plan execution and yielding is disabled.
:: Please retry your operation or multi-document transaction.
errorLabels: [ 'TransientTransactionError' ]
```

The `TransientTransactionError` label means "retry the whole transaction".
`withTransaction` does that automatically, and it retries the commit on
`UnknownTransactionCommitResult` — which is why the callback must be safe to run
more than once: no emails sent or HTTP calls made inside it.

Constraints worth knowing:

- a transaction has a default 60-second limit (`transactionLifetimeLimitSeconds`)
- long transactions hold resources and hurt throughput; keep them to hundreds of
  documents, not hundreds of thousands
- they are considerably more expensive than in a relational database

Interview note:

The idiomatic MongoDB answer is usually to **design so you do not need one** —
embed data that must change together in a single document, because single-document
operations are always atomic. Reaching for transactions often signals a schema
that should have been modelled differently.

## 6. How Do You Stay Correct Without A Transaction?

Every write to a **single document** is atomic, including updates to every
embedded field and array in it. Combine that with a **conditional filter** and
most "read, check, write" logic becomes one atomic statement.

Stock can never go negative — the filter and the update are applied together:

```js
db.stock.insertOne({ _id: "KB", available: 5 });
db.stock.updateOne(
  { _id: "KB", available: { $gte: 3 } },
  { $inc: { available: -3 } },
);
```

Output:

```txt
{
  acknowledged: true,
  insertedId: null,
  matchedCount: 1,
  modifiedCount: 1,
  upsertedCount: 0
}
```

A second order for 3 now finds only 2 left, matches nothing, and changes nothing:

```js
db.stock.updateOne(
  { _id: "KB", available: { $gte: 3 } },
  { $inc: { available: -3 } },
);
```

Output:

```txt
{
  acknowledged: true,
  insertedId: null,
  matchedCount: 0,
  modifiedCount: 0,
  upsertedCount: 0
}
```

`matchedCount: 0` is the "out of stock" signal — no lock, no race.

**Optimistic concurrency** protects an edit that spans a read and a later write,
such as a form a user keeps open for a minute. Store a version, and update only if
it has not moved:

```js
db.products.insertOne({ _id: 1, name: "Keyboard", price: 50, version: 7 });
db.products.updateOne(
  { _id: 1, version: 7 },
  { $set: { price: 45 }, $inc: { version: 1 } },
);
```

Output:

```txt
{
  acknowledged: true,
  insertedId: null,
  matchedCount: 1,
  modifiedCount: 1,
  upsertedCount: 0
}
```

The second editor also read version 7, and loses:

```js
db.products.updateOne(
  { _id: 1, version: 7 },
  { $set: { price: 55 }, $inc: { version: 1 } },
);
```

Output:

```txt
{
  acknowledged: true,
  insertedId: null,
  matchedCount: 0,
  modifiedCount: 0,
  upsertedCount: 0
}
```

Return a 409 Conflict and let that user reload.

When to use it:

| Need | Pattern |
| --- | --- |
| Change one entity's fields together | embed them; one update is atomic |
| Never oversell | a conditional `$inc` in the filter |
| Concurrent edits to the same document | a version field |
| Hand each job to exactly one worker | `findOneAndUpdate` from `queued` to `running` |
| Change several documents all-or-nothing | a transaction |

## 7. How Does A Sharded Cluster Work?

Sharding splits a collection across several replica sets — **shards** — by a
**shard key**.

```txt
             application
                  │
            ┌─────┴─────┐
            │  mongos   │   routers: stateless, usually one per app host
            └─────┬─────┘
                  │  reads the routing table from
            ┌─────┴──────────┐
            │ config servers │   a replica set holding the metadata
            └────────────────┘
     ┌────────────┼────────────┐
  shard A      shard B      shard C      each shard is a replica set
```

- Documents are grouped into **chunks** — contiguous ranges of the shard key,
  128MB by default in current versions.
- The **balancer** moves chunks between shards to even out data size.
- `mongos` routes each query using the chunk map: a query **with** the shard key
  goes to one shard (targeted); one **without** it goes to every shard
  (scatter-gather) and is merged.

Tradeoff:

Sharding gives horizontal write scale and very large data sizes. It costs
operational complexity, makes cross-shard transactions and `$lookup` expensive,
and makes the shard key a decision that is hard to change. It is the last option
after a bigger instance, read scaling, caching, and archiving.

## 8. How Do You Choose A Shard Key?

A good shard key has:

1. **High cardinality** — enough distinct values to spread across shards
2. **Even frequency** — no single value dominating
3. **Non-monotonic change** — otherwise every new write lands on the same shard
4. **Query isolation** — the most common queries include it, so they target one
   shard

```js
sh.shardCollection("app.orders", { customerId: 1, createdAt: 1 });
```

The classic mistake:

```js
sh.shardCollection("app.events", { createdAt: 1 }); // monotonically increasing
```

Every new document has the highest timestamp, so **all writes go to one shard** —
a hotspot that defeats the purpose.

| Strategy | Strength | Weakness |
| --- | --- | --- |
| Ranged `{ customerId: 1 }` | range queries on the key target one shard | skewed keys create hotspots |
| Hashed `{ _id: "hashed" }` | spreads monotonic keys evenly | range queries on the key become scatter-gather |
| Compound `{ customerId: 1, createdAt: 1 }` | locality per customer, and big customers can still split | queries need the prefix to target |

Interview trap:

A key with **low cardinality or skewed frequency** creates **jumbo chunks**. With
`{ tenantId: 1 }`, one enormous tenant's documents all share a single key value,
so their chunk can never be split or moved. Add a second field — `{ tenantId: 1,
_id: 1 }` — so a large tenant spans many chunks.

Important:

Queries that **do not include the shard key** are broadcast to every shard and
merged. The most common query should be answerable from a single shard.

Changing your mind:

- `refineCollectionShardKey` (4.4+) adds suffix fields to an existing key
- `reshardCollection` (5.0+) changes the key entirely, online — but it rewrites
  the whole collection, so plan capacity and time for it

## 9. What Are Change Streams, And What Are They Used For?

A change stream is a **subscription to changes** in a collection, database, or
whole cluster, built on the oplog. It needs a replica set or sharded cluster.

```js
const stream = db.collection("orders").watch(
  [{ $match: { operationType: { $in: ["insert", "update"] } } }],
  { fullDocument: "updateLookup" },
);

for await (const event of stream) {
  await handle(event);                           // must be idempotent
  await saveResumeToken(event._id);
}
```

Events the driver delivered for one insert and one update on MongoDB 8.2:

```txt
{ operationType: 'insert', ns: { db: 'adv', coll: 'events' },
  documentKey: { _id: 1 },
  fullDocument: { _id: 1, status: 'pending' } }

{ operationType: 'update', ns: { db: 'adv', coll: 'events' },
  documentKey: { _id: 1 },
  updateDescription: { updatedFields: { status: 'paid' }, removedFields: [], truncatedArrays: [] },
  fullDocument: { _id: 1, status: 'paid' } }
```

Every event's `_id` is a **resume token**. Store it after processing, and restart
with `resumeAfter` (or `startAfter`) to continue exactly where you stopped.

Use cases:

- keeping Elasticsearch, a cache, or an analytics store in sync
- publishing domain events without a separate outbox poller
- audit trails and real-time notifications

Interview trap:

The Node driver opens the stream **lazily**, on the first `next()`. Writes made
between `watch()` and that first call are never delivered — exactly what happened
while preparing this guide, where the stream waited forever for events that had
already happened. Start iterating before the writes you care about, or resume
from a saved token or `startAtOperationTime`.

Important:

- Delivery is **at least once** after a restart — design consumers to be
  idempotent.
- A resume token older than the oplog window fails with `ChangeStreamHistoryLost`;
  the consumer must re-sync from a snapshot.
- `fullDocument: "updateLookup"` reads the document **when the event is
  processed**, so it may already reflect later changes, or be `null` if the
  document was deleted. For exact before and after states, enable
  `changeStreamPreAndPostImages` on the collection (6.0+).

## 10. What Are The Common Schema Design Patterns?

| Pattern | Problem it solves | Shape |
| --- | --- | --- |
| **Extended reference** | a `$lookup` on every read for two display fields | copy the fields you show; reference the rest |
| **Subset** | a huge array, of which the UI shows the first few | embed the 10 most recent; full list in its own collection |
| **Computed** | the same expensive aggregate recomputed per read | store `reviewCount` and `avgRating`, update on write |
| **Bucket** | millions of tiny documents, one per measurement | group an hour of readings into one document |
| **Outlier** | a few documents far larger than the rest | normal shape for most; overflow documents for the outliers |
| **Attribute** | many sparse, similar fields to query | `attrs: [{ k: "color", v: "red" }]` with one index on `attrs.k` and `attrs.v` |
| **Polymorphic** | different shapes of one entity | one collection with a `type` field |
| **Schema versioning** | documents written under old shapes | a `schemaVersion` field — question 15 |
| **Archive** | old data slowing the working set | move cold documents to another collection or tier |

The **bucket** pattern, for a sensor that reports every minute:

```js
{
  sensorId: "s1",
  hour: ISODate("2026-03-01T10:00:00Z"),
  count: 60,
  sum: 1302.4,                                 // precomputed for averages
  readings: [ { m: 0, temp: 21.0 }, { m: 1, temp: 21.1 } /* ... */ ]
}
```

One document per sensor per hour: 24 index entries a day instead of 1,440, and
the hourly average is `sum / count` without reading the array. Time series
collections (question 14) apply this pattern automatically.

The **outlier** pattern, for the rare book with 50,000 buyers:

```js
{ _id: "book1", title: "Popular", hasOverflow: true,
  buyers: [/* first 1,000 */] }
{ bookId: "book1", page: 2, buyers: [/* next 1,000 */] }
```

Queries stay simple for the 99.9% of books that never overflow.

Interview method:

Name the pattern **from the access pattern**: "the product page reads the last 10
reviews and the average rating on every view" leads to subset plus computed. The
pattern follows from the query, never the other way round.

## 11. How Do You Model Trees And Hierarchies?

```js
db.categories.insertMany([
  { _id: "electronics", parent: null,
    ancestors: [],
    path: ",electronics," },
  { _id: "computers", parent: "electronics",
    ancestors: ["electronics"],
    path: ",electronics,computers," },
  { _id: "laptops", parent: "computers",
    ancestors: ["electronics", "computers"],
    path: ",electronics,computers,laptops," },
  { _id: "desktops", parent: "computers",
    ancestors: ["electronics", "computers"],
    path: ",electronics,computers,desktops," },
  { _id: "phones", parent: "electronics",
    ancestors: ["electronics"],
    path: ",electronics,phones," },
]);
```

Direct children — **parent reference**:

```js
db.categories.find({ parent: "electronics" }, { _id: 1 });
```

Output:

```txt
[
  { _id: 'computers' },
  { _id: 'phones' }
]
```

Every descendant, at any depth — **array of ancestors**:

```js
db.categories.find({ ancestors: "computers" }, { _id: 1 });
```

Output:

```txt
[
  { _id: 'laptops' },
  { _id: 'desktops' }
]
```

A breadcrumb in one read:

```js
db.categories.findOne({ _id: "laptops" }, { ancestors: 1 });
```

Output:

```txt
{ _id: 'laptops', ancestors: [ 'electronics', 'computers' ] }
```

A subtree including its root — **materialized path**, an anchored regex that can
use an index on `path`:

```js
db.categories.find({ path: /^,electronics,computers,/ }, { _id: 1 });
```

Output:

```txt
[
  { _id: 'computers' },
  { _id: 'laptops' },
  { _id: 'desktops' }
]
```

| Model | Cheap | Expensive |
| --- | --- | --- |
| Parent reference | children, moving a subtree | all descendants (needs `$graphLookup`) |
| Array of ancestors | descendants, breadcrumbs | moving a subtree — every descendant's array changes |
| Materialized path | subtrees, ordering by path | moving a subtree — every path is rewritten |
| Child references | listing children in order | finding a node's parent |

Interview note:

Combining a parent reference with an ancestors array is the common production
choice: children and descendants are both one indexed query, and categories move
rarely. `$graphLookup` handles the cases no stored structure anticipated.

## 12. What Are The Common Schema Anti-Patterns?

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

## 13. How Do You Model A Multi-Tenant Collection?

Shared collections with a `tenantId` field is the usual choice.

```js
{ _id: ObjectId("..."), tenantId: "acme", name: "Order 1", total: 99 }
```

Rules that follow from it:

1. **Every compound index leads with `tenantId`**, because it is in every query.
2. **Every query includes `tenantId`** — enforce it in a data access layer, never
   by convention.
3. **Shard on `{ tenantId: 1, _id: 1 }`** rather than `tenantId` alone, so a
   tenant's data stays together while a very large tenant can still split across
   chunks.

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

Tradeoff:

| Model | Isolation | Cost at 10,000 tenants |
| --- | --- | --- |
| Shared collections, `tenantId` field | logical only | cheapest; one set of indexes |
| Collection per tenant | per collection | tens of thousands of collections and indexes |
| Database per tenant | strongest short of separate clusters | heavy metadata; hard to operate |

Large regulated tenants often get their own database or cluster while everyone
else shares — a hybrid, decided per tenant.

## 14. What Are Time Series Collections?

A time series collection (5.0+) stores measurements in an internal **bucket**
layout: MongoDB groups readings from the same source and time window into
compressed buckets automatically — the bucket pattern without the application
code.

```js
db.createCollection("readings", {
  timeseries: { timeField: "ts", metaField: "sensor", granularity: "minutes" },
});
db.readings.insertMany([
  { ts: ISODate("2026-03-01T10:00:00Z"), sensor: { id: "s1", room: "lab" },
    temp: 21.0 },
  { ts: ISODate("2026-03-01T10:20:00Z"), sensor: { id: "s1", room: "lab" },
    temp: 21.6 },
  { ts: ISODate("2026-03-01T10:40:00Z"), sensor: { id: "s1", room: "lab" },
    temp: 22.4 },
  { ts: ISODate("2026-03-01T11:00:00Z"), sensor: { id: "s1", room: "lab" },
    temp: 23.0 },
  { ts: ISODate("2026-03-01T11:30:00Z"), sensor: { id: "s1", room: "lab" },
    temp: 22.2 },
  { ts: ISODate("2026-03-01T10:10:00Z"), sensor: { id: "s2", room: "office" },
    temp: 19.5 },
  { ts: ISODate("2026-03-01T11:10:00Z"), sensor: { id: "s2", room: "office" },
    temp: 20.1 },
]);
db.readings.aggregate([
  {
    $group: {
      _id: {
        sensor: "$sensor.id",
        hour: { $dateTrunc: { date: "$ts", unit: "hour" } },
      },
      avgTemp: { $avg: "$temp" },
      maxTemp: { $max: "$temp" },
      readings: { $sum: 1 },
    },
  },
  { $set: { avgTemp: { $round: ["$avgTemp", 2] } } },
  { $sort: { "_id.sensor": 1, "_id.hour": 1 } },
]);
```

Output:

```txt
[
  {
    _id: { sensor: 's1', hour: ISODate('2026-03-01T10:00:00.000Z') },
    avgTemp: 21.67,
    maxTemp: 22.4,
    readings: 3
  },
  {
    _id: { sensor: 's1', hour: ISODate('2026-03-01T11:00:00.000Z') },
    avgTemp: 22.6,
    maxTemp: 23,
    readings: 2
  },
  {
    _id: { sensor: 's2', hour: ISODate('2026-03-01T10:00:00.000Z') },
    avgTemp: 19.5,
    maxTemp: 19.5,
    readings: 1
  },
  {
    _id: { sensor: 's2', hour: ISODate('2026-03-01T11:00:00.000Z') },
    avgTemp: 20.1,
    maxTemp: 20.1,
    readings: 1
  }
]
```

You insert and query ordinary documents; the storage underneath is a
`system.buckets.readings` collection that MongoDB manages.

| Option | Purpose |
| --- | --- |
| `timeField` | required; the measurement time |
| `metaField` | the source — sensor, device, ticker; readings are bucketed by it |
| `granularity` | `"seconds"`, `"minutes"`, or `"hours"` — match the arrival rate |
| `expireAfterSeconds` | automatic retention |

Why it matters:

Compared with one document per reading, buckets cut storage and index size
dramatically and make time-range scans sequential.

Important:

- Put what identifies the source in `metaField`, and nothing that changes per
  reading — each distinct `metaField` value gets its own buckets.
- Treat measurements as append-only. Updates and deletes were heavily restricted
  in early versions and remain far more expensive than inserts.
- Very high-cardinality `metaField` values produce tiny buckets and lose most of
  the benefit.

## 15. How Do You Evolve A Schema Without Downtime?

Documents written years ago keep their old shape, so the application must cope
with **several shapes at once**. The **schema versioning** pattern makes that
explicit:

```js
// v1
{ _id: 1, name: "Alice Smith", schemaVersion: 1 }
// v2: name split into parts
{ _id: 2, firstName: "Bob", lastName: "Jones", schemaVersion: 2 }
```

```js
function readUser(doc) {
  if ((doc.schemaVersion ?? 1) === 1) {
    const [firstName, ...rest] = doc.name.split(" ");
    return { ...doc, firstName, lastName: rest.join(" "), schemaVersion: 2 };
  }
  return doc;
}
```

Migrating in the background, in small throttled batches, with a pipeline update:

```js
db.users.updateMany(
  { schemaVersion: { $exists: false } },
  [
    {
      $set: {
        firstName: { $arrayElemAt: [{ $split: ["$name", " "] }, 0] },
        lastName: { $arrayElemAt: [{ $split: ["$name", " "] }, 1] },
        schemaVersion: 2,
      },
    },
    { $unset: "name" },
  ],
);
```

The rollout — the same expand-and-contract idea as a relational migration:

1. Deploy code that **reads both** shapes and **writes the new** one
2. Migrate old documents lazily on write, or in background batches
3. Tighten the validator (`validationLevel: "moderate"` first) once most documents
   are converted
4. Remove the old-shape code only when a count of v1 documents reaches zero

Important:

Run big migrations in batches filtered by `_id` ranges, with pauses. One
`updateMany` over 50 million documents floods the oplog, lags every secondary, and
can shrink the oplog window below what your change streams need.

## 16. How Do You Secure A MongoDB Deployment?

The 2017 wave of ransomed MongoDB servers came from instances exposed to the
internet with authentication off. The defaults have improved since — `mongod`
binds to localhost only unless configured otherwise — but a secure deployment is
still a checklist:

| Layer | Control |
| --- | --- |
| Network | private networking or VPC peering; IP access lists; never a public `bindIp` |
| Transport | TLS for clients and between members |
| Authentication | SCRAM-SHA-256, x.509 certificates, or LDAP/OIDC through your identity provider |
| Authorization | role-based access: the app user gets `readWrite` on **its** database only |
| At rest | encrypted storage (Enterprise or Atlas), encrypted backups |
| Field level | Client-Side Field Level Encryption, or Queryable Encryption (equality 7.0, range 8.0) |
| Audit | auditing of authentication and privileged operations |

```js
db.getSiblingDB("admin").createUser({
  user: "orders_service",
  pwd: passwordPrompt(),
  // not root, not readWriteAnyDatabase
  roles: [{ role: "readWrite", db: "orders" }],
});
```

Interview note:

**Queryable Encryption** encrypts fields in the client, and the server can still
run equality and range queries on them without ever seeing the plaintext — so a
database administrator or a stolen backup reveals nothing about those fields.

## 17. What Is NoSQL Injection, And How Do You Prevent It?

MongoDB queries are objects, so an attacker who controls a JSON body can send an
**operator** where you expected a string. A password-reset endpoint that looks up
a token:

```js
db.users.insertMany([
  { _id: 1, email: "alice@example.com", resetToken: null },
  { _id: 2, email: "bob@example.com",   resetToken: "9f2c1e7a" },
]);
const body = { token: { $ne: null } };            // attacker-controlled JSON
db.users.findOne({ resetToken: body.token });
```

Output:

```txt
{ _id: 2, email: 'bob@example.com', resetToken: '9f2c1e7a' }
```

The attacker never knew a token, yet got Bob's account and can now set his
password.

Forcing an equality match treats the payload as a value:

```js
db.users.findOne({ resetToken: { $eq: body.token } });
```

Output:

```txt
null
```

Prevention, in order of strength:

1. **Validate types at the boundary** — `z.object({ token: z.string().length(8) })`
   rejects the object before it reaches a query.
2. **Never pass request objects straight into a filter.** Build filters from
   validated primitives.
3. **Use `$eq` explicitly** for values that came from a user.
4. In Mongoose, enable `sanitizeFilter`, which wraps suspicious values in `$eq`.
5. Avoid `$where`, `$function`, and `mapReduce` with user input — server-side
   JavaScript is deprecated as of 8.0.

Interview note:

The same class of bug appears in login forms (`{ password: { "$ne": "" } }`), in
search endpoints that accept a `filter` parameter, and in `$regex` values that let
a user send a catastrophic pattern. The fix is always the same: types first,
queries second.

## 18. How Do You Back Up And Restore MongoDB?

| Method | Suited to | Watch for |
| --- | --- | --- |
| `mongodump` / `mongorestore` | small databases, migrations, logical exports | slow for large data; rebuilds indexes on restore; use `--oplog` for a consistent replica set dump |
| Filesystem snapshots | large self-managed deployments | journal on the same volume, or fsync-lock; sharded clusters need coordinated snapshots |
| Atlas cloud backup | Atlas | continuous backup with **point-in-time restore** |
| Ops Manager / Cloud Manager | self-managed at scale | agents and storage to operate |

The questions an interviewer is really asking:

- **RPO** — how much data can you lose? Nightly dumps mean up to 24 hours;
  continuous backup with the oplog means seconds.
- **RTO** — how long may a restore take? Restoring 2TB with `mongorestore` takes
  far longer than attaching a snapshot.
- **Have you tested a restore?** An untested backup is a hope, not a backup.

Important:

Replication is not a backup. A `deleteMany({})` replicates to every member within
milliseconds. Delayed members and point-in-time restore exist for exactly that
case.

## 19. When Would You Choose MongoDB Over PostgreSQL With `jsonb`?

PostgreSQL stores and indexes JSON well, so "we need flexible documents" alone no
longer decides it.

| | MongoDB | PostgreSQL + `jsonb` |
| --- | --- | --- |
| Core model | documents, natively | relational rows with JSON columns |
| Partial updates | `$set` on one nested field | rewrites the whole `jsonb` value |
| Indexing inside documents | any field, multikey arrays, compound | GIN on the column, or expression indexes per path |
| Joins | `$lookup`, discouraged on hot paths | first-class |
| Constraints | validators, unique indexes | foreign keys, checks, exclusion constraints |
| Transactions | single-document by default; multi-document costs more | multi-row by default |
| Horizontal scale | native sharding | partitioning, read replicas; sharding via extensions such as Citus |

Choose MongoDB when:

- the data is naturally document-shaped aggregates, read and written whole
- the schema varies per record, or evolves faster than migrations can follow
- the write volume or data size is heading toward sharding

Choose PostgreSQL when:

- most data is relational and a few attributes are flexible — put those in a
  `jsonb` column and keep the rest in columns
- integrity rules across entities matter more than write scale
- you need ad hoc reporting with joins

Strong answer:

> I would not pick on "flexibility" alone, because PostgreSQL's `jsonb` covers a
> flexible attribute bag well. I pick MongoDB when the core entities are
> aggregates read and written as a unit, the shapes vary, and I can see sharding
> in the future. I pick PostgreSQL when the data is relational, cross-entity
> constraints matter, and reporting needs joins.

## 20. How Do You Diagnose Replication Lag And Sharding Problems?

Replication lag:

```js
rs.printSecondaryReplicationInfo();   // how far each secondary is behind
rs.status();                          // member states and optimes
```

| Cause | Sign | Fix |
| --- | --- | --- |
| Under-provisioned secondary | lag grows under load | same hardware as the primary |
| Bulk writes or migrations | lag spikes during the job | smaller batches, with pauses |
| Index build on a secondary | lag during the build | schedule builds; rolling builds |
| Network between data centres | steady lag to one member | bandwidth; compression |
| `w: 1` writes | lag with no back-pressure | `w: "majority"` throttles writers naturally |

Since 4.2, **flow control** throttles writes on the primary when the majority
commit point falls too far behind, trading write latency for bounded lag.

Sharding problems:

```js
sh.status();                                   // shards, chunks, balancer state
db.orders.getShardDistribution();              // data and documents per shard
sh.balancerCollectionStatus("app.orders");     // is this collection balanced?
```

| Symptom | Likely cause |
| --- | --- |
| One shard at 90% CPU, others idle | monotonic or skewed shard key — a hot shard |
| Chunks that never move | jumbo chunks from a low-cardinality key |
| Every query slow as shards are added | queries without the shard key — scatter-gather |
| Periodic latency spikes | chunk migrations; set a balancer window |

`explain` on a query through `mongos` lists the shards it touched. A
`SHARD_MERGE` stage across every shard for a query that should be targeted means
the shard key is not in the filter.

Strong answer:

> For replication I check lag with `rs.printSecondaryReplicationInfo()` and look
> for the usual causes — undersized secondaries, bulk jobs, and `w: 1` writers
> outrunning replication — and I size the oplog so its window comfortably exceeds
> my longest maintenance or outage. For sharding I start from the shard key: a
> hot shard means monotonic or skewed keys, a jumbo chunk means low cardinality,
> and a slow query means scatter-gather — `explain` through `mongos` shows how
> many shards it touched.

## Sources Used

- <https://www.mongodb.com/docs/manual/replication/>
- <https://www.mongodb.com/docs/manual/core/replica-set-oplog/>
- <https://www.mongodb.com/docs/manual/reference/write-concern/>
- <https://www.mongodb.com/docs/manual/reference/read-concern/>
- <https://www.mongodb.com/docs/manual/core/causal-consistency-read-write-concerns/>
- <https://www.mongodb.com/docs/manual/core/transactions/>
- <https://www.mongodb.com/docs/manual/sharding/>
- <https://www.mongodb.com/docs/manual/core/sharding-choose-a-shard-key/>
- <https://www.mongodb.com/docs/manual/changeStreams/>
- <https://www.mongodb.com/docs/manual/core/timeseries-collections/>
- <https://www.mongodb.com/docs/manual/data-modeling/design-patterns/>
- <https://www.mongodb.com/docs/manual/security/>
- <https://www.mongodb.com/docs/manual/core/backups/>
