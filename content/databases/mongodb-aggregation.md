# MongoDB Aggregation Pipeline Interview Guide

A stage-by-stage guide to the aggregation pipeline: what each stage does, a small
input collection, the pipeline, and the exact output. It covers `$match`,
`$project`, `$set`, `$group` and its accumulators, `$sort`/`$skip`/`$limit`,
`$unwind`, `$lookup` and `$graphLookup`, `$facet`, `$bucket`, `$replaceWith`,
`$unionWith`, window functions, gap filling, `$merge`/`$out`, the expression
operators you reach for inside stages, pipeline updates, optimization, and
multi-stage practice problems.

How to use the examples:

- Every question is self-contained. Start from an empty database
  (`use scratch` then `db.dropDatabase()`), paste the input, then run the
  question's blocks in order.
- Every output was produced by running the pipeline on MongoDB 8.2 and is shown
  the way `mongosh` prints it.
- A pipeline does not guarantee output order unless it sorts. Every example that
  shows ordered output ends with an explicit `$sort`.

## 1. What Is The Aggregation Pipeline, And How Do Documents Flow Through It?

The aggregation pipeline is an array of **stages**. Documents stream through the
stages in order, and each stage receives only what the previous stage emitted.

```js
db.orders.insertMany([
  { _id: 1, customer: "Alice", status: "paid",      total: 70 },
  { _id: 2, customer: "Bob",   status: "paid",      total: 40 },
  { _id: 3, customer: "Alice", status: "cancelled", total: 200 },
  { _id: 4, customer: "Carol", status: "paid",      total: 70 },
  { _id: 5, customer: "Alice", status: "paid",      total: 20 },
]);
```

```js
db.orders.aggregate([
  { $match: { status: "paid" } },
  {
    $group: {
      _id: "$customer",
      spent: { $sum: "$total" },
      orders: { $sum: 1 },
    },
  },
  { $sort: { spent: -1 } },
]);
```

Output:

```txt
[
  { _id: 'Alice', spent: 90, orders: 2 },
  { _id: 'Carol', spent: 70, orders: 1 },
  { _id: 'Bob', spent: 40, orders: 1 }
]
```

```viz
type: flow
title: Documents flowing through the pipeline
orders collection :: 5 documents in
$match status "paid" :: 4 documents — the cancelled order is dropped
$group by customer :: 3 documents — one per customer, new shape
$sort spent desc :: 3 documents, reordered
```

The vocabulary interviewers expect:

| Term | Example | Meaning |
| --- | --- | --- |
| Stage | `{ $match: {...} }` | one step of the pipeline |
| Field path | `"$total"` | the value of `total` in the current document |
| Expression | `{ $add: ["$a", "$b"] }` | computes a value from fields |
| Accumulator | `{ $sum: "$total" }` inside `$group` | folds many documents into one value |
| System variable | `"$$ROOT"`, `"$$NOW"`, `"$$REMOVE"` | the whole document, the current time, "omit this field" |

Mapping to SQL:

| SQL | Aggregation |
| --- | --- |
| `WHERE` | `$match` |
| `SELECT` columns and expressions | `$project`, `$set` |
| `GROUP BY` + aggregates | `$group` |
| `HAVING` | `$match` after `$group` |
| `ORDER BY` / `LIMIT` / `OFFSET` | `$sort` / `$limit` / `$skip` |
| `JOIN` | `$lookup` |
| `UNION ALL` | `$unionWith` |
| Window functions | `$setWindowFields` |
| `INSERT INTO ... SELECT` | `$merge`, `$out` |

Why it matters:

The pipeline runs on the server, next to the data. Aggregating a million orders
into twelve monthly totals sends twelve documents over the network instead of a
million.

Important:

Stage order is the whole game. A stage cannot see anything an earlier stage
removed — after `$group` above, `status` no longer exists. Order also decides
performance: filtering first shrinks the work for every later stage.

## 2. How Does `$match` Filter Documents, And When Do You Need `$expr`?

`$match` keeps the documents that satisfy a query filter. It uses the same query
language as `find()`.

```js
db.orders.insertMany([
  { _id: 1, status: "paid",      total: 70,  paid: 70 },
  { _id: 2, status: "shipped",   total: 40,  paid: 40 },
  { _id: 3, status: "cancelled", total: 200, paid: 0 },
  { _id: 4, status: "paid",      total: 120, paid: 100 },
  { _id: 5, status: "pending",   total: 55,  paid: 0 },
]);
```

```js
db.orders.aggregate([
  { $match: { status: { $in: ["paid", "shipped"] }, total: { $gte: 50 } } },
]);
```

Output:

```txt
[
  { _id: 1, status: 'paid', total: 70, paid: 70 },
  { _id: 4, status: 'paid', total: 120, paid: 100 }
]
```

Query operators compare a field with a **constant**. To compare two fields of the
same document — orders that are underpaid — you need an aggregation expression,
and `$expr` is the bridge:

```js
db.orders.aggregate([
  { $match: { $expr: { $lt: ["$paid", "$total"] } } },
]);
```

Output:

```txt
[
  { _id: 3, status: 'cancelled', total: 200, paid: 0 },
  { _id: 4, status: 'paid', total: 120, paid: 100 },
  { _id: 5, status: 'pending', total: 55, paid: 0 }
]
```

Interview trap:

Without `$expr`, `"$total"` is just a string. This compares every `paid` number
with the literal text `"$total"`, which never matches:

```js
db.orders.aggregate([
  { $match: { paid: { $lt: "$total" } } },
]);
```

Output:

```txt
[]
```

No error, no results — the most confusing kind of bug.

When to use it:

- `$match` first in the pipeline, on indexed fields — only a leading `$match` (or
  `$sort`) can use an index on the collection
- `$match` after `$group` to filter groups, the equivalent of SQL `HAVING`
- `$expr` only when a condition genuinely compares fields or needs an expression;
  a plain filter is easier for the planner to optimize

## 3. How Does `$project` Reshape Documents?

`$project` outputs a new shape: it keeps, drops, renames, and computes fields.
Anything not listed in an inclusion projection is removed, except `_id`.

```js
db.orders.insertMany([
  {
    _id: 1,
    customer: { name: "Alice", email: "alice@example.com" },
    items: [
      { sku: "KB", qty: 1, price: 50 },
      { sku: "NB", qty: 4, price: 5 },
    ],
    status: "paid",
    internalNote: "vip",
  },
  {
    _id: 2,
    customer: { name: "Bob", email: "bob@example.com" },
    items: [ { sku: "MS", qty: 2, price: 20 } ],
    status: "shipped",
    internalNote: "",
  },
]);
```

```js
db.orders.aggregate([
  {
    $project: {
      _id: 0, // drop _id explicitly
      orderId: "$_id", // rename
      status: 1, // keep as-is
      customerName: "$customer.name", // lift a nested field
      skus: "$items.sku", // a path through an array gives an array
      itemCount: { $size: "$items" }, // computed
    },
  },
]);
```

Output:

```txt
[
  {
    status: 'paid',
    orderId: 1,
    customerName: 'Alice',
    skus: [ 'KB', 'NB' ],
    itemCount: 2
  },
  {
    status: 'shipped',
    orderId: 2,
    customerName: 'Bob',
    skus: [ 'MS' ],
    itemCount: 1
  }
]
```

Notice `skus`: a field path that walks through an array returns an array of the
values found in each element. Notice the order too: fields kept with `1` come out
first, in their original order, and computed fields follow in the order written.

An exclusion projection removes the listed fields and keeps everything else:

```js
db.orders.aggregate([
  { $project: { internalNote: 0, "customer.email": 0, items: 0 } },
]);
```

Output:

```txt
[
  { _id: 1, customer: { name: 'Alice' }, status: 'paid' },
  { _id: 2, customer: { name: 'Bob' }, status: 'shipped' }
]
```

Interview trap:

You cannot mix inclusion and exclusion in one `$project`. `_id` is the only field
allowed to break the rule.

```js
db.orders.aggregate([
  { $project: { status: 1, internalNote: 0 } },
]);
```

Output:

```txt
MongoServerError: Invalid $project :: caused by :: Cannot do exclusion on field internalNote in inclusion projection
```

Use `$project` to define the output shape — usually as the **last** stage, for
the API response. A `$project` in the middle of a pipeline just to trim fields
rarely helps: the optimizer already reads only the fields later stages use. Use
`$set` when you only want to add fields and keep the rest.

## 4. `$set` vs `$project`, And What Do `$addFields` And `$unset` Do?

`$set` adds or overwrites fields and **keeps every other field**. `$addFields` is
the same stage under its original name; `$set` is the alias added in 4.2.
`$unset` removes fields.

```js
db.orders.insertMany([
  { _id: 1, items: [ { sku: "KB", qty: 1,
    price: 50 }, { sku: "NB", qty: 4, price: 5 } ], internalNote: "vip" },
  { _id: 2, items: [ { sku: "PEN", qty: 10,
    price: 2 } ], internalNote: "" },
]);
```

```js
db.orders.aggregate([
  {
    $set: {
      subtotal: {
        $sum: {
          $map: {
            input: "$items",
            as: "i",
            in: { $multiply: ["$$i.qty", "$$i.price"] },
          },
        },
      },
      itemCount: { $size: "$items" },
    },
  },
  { $set: { shipping: { $cond: [{ $gte: ["$subtotal", 50] }, 0, 5] } } },
  { $set: { grandTotal: { $add: ["$subtotal", "$shipping"] } } },
  { $unset: ["items", "internalNote"] },
]);
```

Output:

```txt
[
  { _id: 1, subtotal: 70, itemCount: 2, shipping: 0, grandTotal: 70 },
  { _id: 2, subtotal: 20, itemCount: 1, shipping: 5, grandTotal: 25 }
]
```

Interview trap:

Every expression in one `$set` is evaluated against the **incoming** document. A
field computed in the same stage does not exist yet, so referencing it gives
`null`:

```js
db.orders.aggregate([
  {
    $set: {
      subtotal: {
        $sum: {
          $map: {
            input: "$items",
            as: "i",
            in: { $multiply: ["$$i.qty", "$$i.price"] },
          },
        },
      },
      grandTotal: { $add: ["$subtotal", 5] }, // "$subtotal" is missing here
    },
  },
  { $project: { subtotal: 1, grandTotal: 1 } },
]);
```

Output:

```txt
[
  { _id: 1, subtotal: 70, grandTotal: null },
  { _id: 2, subtotal: 20, grandTotal: null }
]
```

Fix — compute dependent fields in a later `$set`, as in the first pipeline.

| Stage | Keeps other fields | Typical use |
| --- | --- | --- |
| `$project` | no (inclusion mode) | define the exact output shape |
| `$set` / `$addFields` | yes | add or overwrite computed fields |
| `$unset` | yes | drop a few fields |

Important:

`"$$REMOVE"` lets an expression omit a field conditionally:
`discount: { $cond: [{ $gt: ["$total", 100] }, 10, "$$REMOVE"] }` adds `discount`
only when it applies.

## 5. How Does `$group` Work, And Which Accumulators Should You Know?

`$group` collapses documents that share a key into one output document. `_id` is
the grouping key; every other field must be an **accumulator**.

```js
db.orders.insertMany([
  { _id: 1, customer: "Alice", city: "Dhaka",  total: 70,
    createdAt: ISODate("2026-01-05T10:00:00Z") },
  { _id: 2, customer: "Bob",   city: "Sylhet", total: 40,
    createdAt: ISODate("2026-01-18T14:30:00Z") },
  { _id: 3, customer: "Alice", city: "Dhaka",  total: 20,
    createdAt: ISODate("2026-02-20T11:00:00Z") },
  { _id: 4, customer: "Carol", city: "Dhaka",  total: 70,
    createdAt: ISODate("2026-02-11T16:45:00Z") },
  { _id: 5, customer: "Bob",   city: "Sylhet", total: 100,
    createdAt: ISODate("2026-03-14T19:05:00Z") },
]);
```

```js
db.orders.aggregate([
  { $sort: { createdAt: 1 } }, // makes $first / $last meaningful
  {
    $group: {
      _id: "$city",
      orders: { $count: {} }, // 5.0+, same as { $sum: 1 }
      revenue: { $sum: "$total" },
      avgOrder: { $avg: "$total" },
      smallest: { $min: "$total" },
      largest: { $max: "$total" },
      customers: { $addToSet: "$customer" }, // unique values, unordered
      totals: { $push: "$total" }, // every value, in arrival order
      firstOrderAt: { $first: "$createdAt" },
      lastOrderAt: { $last: "$createdAt" },
    },
  },
  {
    $set: {
      avgOrder: { $round: ["$avgOrder", 2] },
      // a stable order
      customers: { $sortArray: { input: "$customers", sortBy: 1 } },
    },
  },
  { $sort: { revenue: -1 } },
]);
```

Output:

```txt
[
  {
    _id: 'Dhaka',
    orders: 3,
    revenue: 160,
    avgOrder: 53.33,
    smallest: 20,
    largest: 70,
    customers: [ 'Alice', 'Carol' ],
    totals: [ 70, 70, 20 ],
    firstOrderAt: ISODate('2026-01-05T10:00:00.000Z'),
    lastOrderAt: ISODate('2026-02-20T11:00:00.000Z')
  },
  {
    _id: 'Sylhet',
    orders: 2,
    revenue: 140,
    avgOrder: 70,
    smallest: 40,
    largest: 100,
    customers: [ 'Bob' ],
    totals: [ 40, 100 ],
    firstOrderAt: ISODate('2026-01-18T14:30:00.000Z'),
    lastOrderAt: ISODate('2026-03-14T19:05:00.000Z')
  }
]
```

`$addToSet` makes no ordering promise: while preparing this guide, the same
pipeline returned Dhaka's customers as Carol, Alice on some runs and Alice, Carol
on others. That is why the pipeline sorts the set with `$sortArray` before
returning it. Use `$push` when arrival order matters, and `$sortArray` when a
stable order does.

`_id: null` puts every document in one group — the way to compute grand totals:

```js
db.orders.aggregate([
  { $group: { _id: null, revenue: { $sum: "$total" }, orders: { $sum: 1 } } },
]);
```

Output:

```txt
[
  { _id: null, revenue: 300, orders: 5 }
]
```

| Accumulator | Returns |
| --- | --- |
| `$sum`, `$avg` | total and mean of numeric values; non-numbers are ignored |
| `$min`, `$max` | smallest and largest value |
| `$count` | number of documents (5.0+) |
| `$push` | array of every value, duplicates kept |
| `$addToSet` | array of distinct values, **order not guaranteed** |
| `$first`, `$last` | value from the first / last document **in arrival order** |
| `$top`, `$topN`, `$maxN` | best values by their own sort (5.2+) — see question 24 |

Important:

- `$first` and `$last` are only meaningful after a `$sort`. Without one, "first" is
  whatever the storage engine returned first.
- `$group` does not emit groups in any particular order. Sort afterwards.
- `$group` is **blocking**: it consumes its whole input before emitting anything,
  and holds every group in memory — up to 100MB, after which it spills to disk.

Interview note:

`$sum: 1` counts documents; `$sum: "$field"` adds a field. A missing or non-numeric
field contributes nothing rather than failing, so a typo in the field name
returns `0`, not an error.

## 6. How Do You Group By Multiple Fields Or By Month?

Make `_id` a document. Each distinct combination of its values becomes one group.

```js
db.orders.insertMany([
  { _id: 1, city: "Dhaka",  total: 70,
    createdAt: ISODate("2026-01-05T10:00:00Z") },
  { _id: 2, city: "Sylhet", total: 40,
    createdAt: ISODate("2026-01-18T14:30:00Z") },
  { _id: 3, city: "Dhaka",  total: 30,
    createdAt: ISODate("2026-01-31T20:00:00Z") },
  { _id: 4, city: "Dhaka",  total: 20,
    createdAt: ISODate("2026-02-20T11:00:00Z") },
  { _id: 5, city: "Sylhet", total: 100,
    createdAt: ISODate("2026-03-14T19:05:00Z") },
]);
```

```js
db.orders.aggregate([
  {
    $group: {
      _id: {
        city: "$city",
        month: { $dateToString: { date: "$createdAt", format: "%Y-%m" } },
      },
      revenue: { $sum: "$total" },
    },
  },
  { $project: { _id: 0, city: "$_id.city", month: "$_id.month", revenue: 1 } },
  { $sort: { city: 1, month: 1 } },
]);
```

Output:

```txt
[
  { revenue: 100, city: 'Dhaka', month: '2026-01' },
  { revenue: 20, city: 'Dhaka', month: '2026-02' },
  { revenue: 40, city: 'Sylhet', month: '2026-01' },
  { revenue: 100, city: 'Sylhet', month: '2026-03' }
]
```

Interview trap:

Dates are stored in UTC, and so is the grouping above. Order 3 was placed at
`20:00 UTC on January 31` — which is **February 1** in Dhaka (UTC+6). A business
in Dhaka reports it in February. Group in the business's time zone:

```js
db.orders.aggregate([
  {
    $group: {
      _id: {
        city: "$city",
        month: {
          $dateToString: {
            date: "$createdAt",
            format: "%Y-%m",
            timezone: "Asia/Dhaka",
          },
        },
      },
      revenue: { $sum: "$total" },
    },
  },
  { $project: { _id: 0, city: "$_id.city", month: "$_id.month", revenue: 1 } },
  { $sort: { city: 1, month: 1 } },
]);
```

Output:

```txt
[
  { revenue: 70, city: 'Dhaka', month: '2026-01' },
  { revenue: 50, city: 'Dhaka', month: '2026-02' },
  { revenue: 40, city: 'Sylhet', month: '2026-01' },
  { revenue: 100, city: 'Sylhet', month: '2026-03' }
]
```

Dhaka's January falls from 100 to 70 and its February rises from 20 to 50. Both
reports are "correct"; only one matches the finance team's numbers.

`$dateTrunc` (5.0+) buckets by unit and keeps a real `Date`, which sorts and
compares properly and suits charts:

```js
db.orders.aggregate([
  {
    $group: {
      _id: {
        $dateTrunc: {
          date: "$createdAt",
          unit: "month",
          timezone: "Asia/Dhaka",
        },
      },
      revenue: { $sum: "$total" },
    },
  },
  { $sort: { _id: 1 } },
]);
```

Output:

```txt
[
  { _id: ISODate('2025-12-31T18:00:00.000Z'), revenue: 110 },
  { _id: ISODate('2026-01-31T18:00:00.000Z'), revenue: 50 },
  { _id: ISODate('2026-02-28T18:00:00.000Z'), revenue: 100 }
]
```

`2026-01-31T18:00:00Z` is midnight on February 1 in Dhaka — the start of the local
month, expressed in UTC.

## 7. How Do `$sort`, `$skip`, And `$limit` Work Together?

```js
db.products.insertMany([
  { _id: 1, name: "Keyboard", price: 50 },
  { _id: 2, name: "Mouse",    price: 20 },
  { _id: 3, name: "Monitor",  price: 200 },
  { _id: 4, name: "Webcam",   price: 50 },
  { _id: 5, name: "Cable",    price: 5 },
  { _id: 6, name: "Headset",  price: 50 },
]);
```

Top three by price:

```js
db.products.aggregate([
  { $sort: { price: -1, _id: 1 } },
  { $limit: 3 },
]);
```

Output:

```txt
[
  { _id: 3, name: 'Monitor', price: 200 },
  { _id: 1, name: 'Keyboard', price: 50 },
  { _id: 4, name: 'Webcam', price: 50 }
]
```

Page 2 with a page size of 2:

```js
db.products.aggregate([
  { $sort: { price: -1, _id: 1 } },
  { $skip: 2 },
  { $limit: 2 },
]);
```

Output:

```txt
[
  { _id: 4, name: 'Webcam', price: 50 },
  { _id: 6, name: 'Headset', price: 50 }
]
```

Important:

Three products cost `50`. Sorting on `price` alone leaves their order undefined,
so the same product can appear on two pages or on none. Always end a sort used
for paging with a unique field such as `_id`.

Why `$sort` + `$limit` is cheap:

The optimizer coalesces a `$sort` followed by `$limit` into a **top-k sort** that
keeps only `k` documents in memory, instead of sorting everything and then
discarding. `$sort` → `$skip` → `$limit` becomes a top-`(skip + limit)` sort.

When not to use it:

`$skip` still walks and discards every skipped document, so page 5,000 is slow.
For deep pagination, use a range condition on the sort key instead — covered in
the MongoDB Indexing & Performance guide.

## 8. `$count` vs `$sortByCount` vs Counting In `$group`

```js
db.orders.insertMany([
  { _id: 1, status: "paid" },    { _id: 2, status: "paid" },
  { _id: 3, status: "shipped" }, { _id: 4, status: "paid" },
  { _id: 5, status: "shipped" }, { _id: 6, status: "cancelled" },
]);
```

`$count` outputs a single document with the number of documents that reached it:

```js
db.orders.aggregate([
  { $match: { status: "paid" } },
  { $count: "paidOrders" },
]);
```

Output:

```txt
[
  { paidOrders: 3 }
]
```

`$sortByCount` groups by an expression, counts, and sorts descending — shorthand
for `$group` plus `$sort`:

```js
db.orders.aggregate([
  { $sortByCount: "$status" },
]);
```

Output:

```txt
[
  { _id: 'paid', count: 3 },
  { _id: 'shipped', count: 2 },
  { _id: 'cancelled', count: 1 }
]
```

Interview trap:

When nothing matches, `$count` emits **no document at all** — not `{ n: 0 }`:

```js
db.orders.aggregate([
  { $match: { status: "refunded" } },
  { $count: "n" },
]);
```

Output:

```txt
[]
```

The same is true of `$group` on an empty input. Code that reads `result[0].n`
crashes on an empty result. Default in the application (`result[0]?.n ?? 0`), use
`countDocuments()` when the count is the only thing you need, or build the count
inside `$facet` and default it there (question 13).

| Need | Use |
| --- | --- |
| Count of documents matching a filter | `db.collection.countDocuments(filter)` |
| Count at the end of a pipeline | `$count` |
| Count per value, most frequent first | `$sortByCount` |
| Count alongside other accumulators | `$group` with `$sum: 1` or `$count: {}` |

`$sortByCount` breaks ties in no particular order. When ties matter — a UI list
that must not reshuffle — use `$group` and `$sort` with a tie-breaker.

## 9. How Does `$unwind` Work, And What Happens To Empty Arrays?

`$unwind` turns one document with an array into **one document per element**.

```js
db.orders.insertMany([
  { _id: 1, customer: "Alice",
    items: [ { sku: "KB", qty: 1 }, { sku: "NB", qty: 4 } ] },
  { _id: 2, customer: "Bob",   items: [ { sku: "MS", qty: 2 } ] },
  { _id: 3, customer: "Carol", items: [] },
  { _id: 4, customer: "Dan" },                              // no items field
]);
```

```js
db.orders.aggregate([
  { $unwind: "$items" },
]);
```

Output:

```txt
[
  { _id: 1, customer: 'Alice', items: { sku: 'KB', qty: 1 } },
  { _id: 1, customer: 'Alice', items: { sku: 'NB', qty: 4 } },
  { _id: 2, customer: 'Bob', items: { sku: 'MS', qty: 2 } }
]
```

Four orders went in, three documents came out — **Carol and Dan vanished**,
because an empty or missing array produces no elements. When those rows matter
(a report of every order, including empty ones), preserve them:

```js
db.orders.aggregate([
  {
    $unwind: {
      path: "$items",
      preserveNullAndEmptyArrays: true,
      includeArrayIndex: "position",
    },
  },
]);
```

Output:

```txt
[
  {
    _id: 1,
    customer: 'Alice',
    items: { sku: 'KB', qty: 1 },
    position: Long('0')
  },
  {
    _id: 1,
    customer: 'Alice',
    items: { sku: 'NB', qty: 4 },
    position: Long('1')
  },
  {
    _id: 2,
    customer: 'Bob',
    items: { sku: 'MS', qty: 2 },
    position: Long('0')
  },
  { _id: 3, customer: 'Carol', position: null },
  { _id: 4, customer: 'Dan', position: null }
]
```

Carol and Dan come back with no `items` field and `position: null`. The index
itself is a 64-bit integer, which `mongosh` prints as `Long`.

The classic use is unwind-then-group, to aggregate across array elements of many
documents — units sold per SKU:

```js
db.orders.aggregate([
  { $unwind: "$items" },
  { $group: { _id: "$items.sku", units: { $sum: "$items.qty" } } },
  { $sort: { units: -1 } },
]);
```

Output:

```txt
[
  { _id: 'NB', units: 4 },
  { _id: 'MS', units: 2 },
  { _id: 'KB', units: 1 }
]
```

When not to use it:

To compute something **per document** — units in this order — do not unwind and
regroup. Array expressions do it in place, with no document explosion:

```js
db.orders.aggregate([
  { $project: { customer: 1, units: { $sum: "$items.qty" } } },
]);
```

Output:

```txt
[
  { _id: 1, customer: 'Alice', units: 5 },
  { _id: 2, customer: 'Bob', units: 2 },
  { _id: 3, customer: 'Carol', units: 0 },
  { _id: 4, customer: 'Dan', units: 0 }
]
```

Important:

`$unwind` multiplies documents. An order with 100 items becomes 100 documents, so
always `$match` first and unwind as late as possible.

## 10. How Does `$lookup` Join Collections?

`$lookup` performs a **left outer join**: every input document is kept, and the
matching documents from the other collection are added as an **array**.

```js
db.customers.insertMany([
  { _id: "c1", name: "Alice", city: "Dhaka" },
  { _id: "c2", name: "Bob",   city: "Sylhet" },
  { _id: "c3", name: "Carol", city: "Dhaka" },
]);
db.orders.insertMany([
  { _id: 1, customerId: "c1", total: 70 },
  { _id: 2, customerId: "c2", total: 40 },
  { _id: 3, customerId: "c1", total: 20 },
  { _id: 4, customerId: "c9", total: 15 },          // no such customer
]);
```

One-to-many — each customer with their orders:

```js
db.customers.aggregate([
  {
    $lookup: {
      from: "orders",
      localField: "_id",
      foreignField: "customerId",
      as: "orders",
    },
  },
  {
    $project: {
      name: 1,
      orderCount: { $size: "$orders" },
      spent: { $sum: "$orders.total" },
    },
  },
  { $sort: { spent: -1 } },
]);
```

Output:

```txt
[
  { _id: 'c1', name: 'Alice', orderCount: 2, spent: 90 },
  { _id: 'c2', name: 'Bob', orderCount: 1, spent: 40 },
  { _id: 'c3', name: 'Carol', orderCount: 0, spent: 0 }
]
```

Carol has no orders and still appears, with an empty array — that is the "left
outer" part.

Many-to-one — each order with its customer. The joined value is always an array,
so take its first element:

```js
db.orders.aggregate([
  {
    $lookup: {
      from: "customers",
      localField: "customerId",
      foreignField: "_id",
      as: "customer",
    },
  },
  { $set: { customer: { $first: "$customer" } } },
  { $project: { total: 1, customerName: "$customer.name" } },
]);
```

Output:

```txt
[
  { _id: 1, total: 70, customerName: 'Alice' },
  { _id: 2, total: 40, customerName: 'Bob' },
  { _id: 3, total: 20, customerName: 'Alice' },
  { _id: 4, total: 15 }
]
```

Order 4 has no customer, so `$first` of an empty array produces nothing and
`customerName` is simply absent. Use `$unwind: "$customer"` instead when orphans
should be **dropped** (an inner join).

Important:

- Index `foreignField` in the `from` collection. With an index, each lookup is a
  cheap probe — `explain` shows `EQ_LOOKUP` with `strategy: "IndexedLoopJoin"`.
  Without one, MongoDB 6.0+ can hash-join a **small** foreign collection (by
  default up to 10,000 documents and 100MB); beyond that it falls back to
  `NestedLoopJoin`, which scans the foreign collection once per input document.
  On MongoDB 8.2, 200 orders joined to 12,000 unindexed customers examined
  2,400,200 documents.
- If `localField` is an array, it matches any element — the join behaves like
  `$in`.
- A missing or `null` `localField` matches foreign documents whose `foreignField`
  is `null` or missing — a surprising source of wrong joins on sparse data.
- `from` must be in the same database. Sharded `from` collections are supported
  from 5.1.

Interview note:

`$lookup` is not free just because it is one query. Joining on every read is the
shape MongoDB is worst at; if you always join two collections, ask whether the
data should be embedded or partly duplicated (the extended reference pattern).

## 11. How Do You Write A `$lookup` With A Pipeline?

A sub-pipeline lets the join **filter, sort, limit, and project** the foreign
documents — a correlated subquery.

```js
db.customers.insertMany([
  { _id: "c1", name: "Alice" },
  { _id: "c2", name: "Bob" },
  { _id: "c3", name: "Carol" },
]);
db.orders.insertMany([
  { _id: 1, customerId: "c1", status: "paid",      total: 70,
    createdAt: ISODate("2026-01-05T10:00:00Z") },
  { _id: 2, customerId: "c2", status: "paid",      total: 40,
    createdAt: ISODate("2026-01-18T14:30:00Z") },
  { _id: 3, customerId: "c1", status: "paid",      total: 20,
    createdAt: ISODate("2026-02-20T11:00:00Z") },
  { _id: 4, customerId: "c1", status: "paid",      total: 55,
    createdAt: ISODate("2026-03-01T09:00:00Z") },
  { _id: 5, customerId: "c2", status: "cancelled", total: 90,
    createdAt: ISODate("2026-03-02T12:00:00Z") },
]);
db.promotions.insertMany([
  { _id: "p1", code: "NEWYEAR", startsAt: ISODate("2026-01-01T00:00:00Z"),
    endsAt: ISODate("2026-01-10T00:00:00Z") },
  { _id: "p2", code: "SPRING",  startsAt: ISODate("2026-03-01T00:00:00Z"),
    endsAt: ISODate("2026-04-01T00:00:00Z") },
]);
```

Each customer's two most recent **paid** orders. Since 5.0, `localField` and
`foreignField` can be combined with a `pipeline` that runs on the matches:

```js
db.customers.aggregate([
  {
    $lookup: {
      from: "orders",
      localField: "_id",
      foreignField: "customerId",
      pipeline: [
        { $match: { status: "paid" } },
        { $sort: { createdAt: -1 } },
        { $limit: 2 },
        { $project: { _id: 0, total: 1, createdAt: 1 } },
      ],
      as: "recentPaid",
    },
  },
  { $sort: { _id: 1 } },
]);
```

Output:

```txt
[
  {
    _id: 'c1',
    name: 'Alice',
    recentPaid: [
      { total: 55, createdAt: ISODate('2026-03-01T09:00:00.000Z') },
      { total: 20, createdAt: ISODate('2026-02-20T11:00:00.000Z') }
    ]
  },
  {
    _id: 'c2',
    name: 'Bob',
    recentPaid: [ { total: 40, createdAt: ISODate('2026-01-18T14:30:00.000Z') } ]
  },
  { _id: 'c3', name: 'Carol', recentPaid: [] }
]
```

When the join condition is not a simple equality — here, "which promotion was
running when the order was placed" — use `let` to pass values in and `$expr` to
compare them. Inside the sub-pipeline, `$$orderedAt` is the variable and
`"$startsAt"` is a field of the foreign document:

```js
db.orders.aggregate([
  {
    $lookup: {
      from: "promotions",
      let: { orderedAt: "$createdAt" },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $lte: ["$startsAt", "$$orderedAt"] },
                { $gt: ["$endsAt", "$$orderedAt"] },
              ],
            },
          },
        },
        { $project: { _id: 0, code: 1 } },
      ],
      as: "promo",
    },
  },
  {
    $project: {
      createdAt: 1,
      promo: { $ifNull: [{ $first: "$promo.code" }, "none"] },
    },
  },
  { $sort: { _id: 1 } },
]);
```

Output:

```txt
[
  {
    _id: 1,
    createdAt: ISODate('2026-01-05T10:00:00.000Z'),
    promo: 'NEWYEAR'
  },
  {
    _id: 2,
    createdAt: ISODate('2026-01-18T14:30:00.000Z'),
    promo: 'none'
  },
  {
    _id: 3,
    createdAt: ISODate('2026-02-20T11:00:00.000Z'),
    promo: 'none'
  },
  {
    _id: 4,
    createdAt: ISODate('2026-03-01T09:00:00.000Z'),
    promo: 'SPRING'
  },
  {
    _id: 5,
    createdAt: ISODate('2026-03-02T12:00:00.000Z'),
    promo: 'SPRING'
  }
]
```

Why it matters:

The sub-pipeline shrinks the joined array **inside** the join. Joining every order
and trimming afterwards builds a huge array first — and a document, including its
joined arrays, cannot exceed 16MB.

Important:

The sub-pipeline runs once per input document. Index the fields it matches on —
`{ customerId: 1, status: 1, createdAt: -1 }` here — or the join degrades into
repeated collection scans.

## 12. How Does `$graphLookup` Walk A Hierarchy?

`$graphLookup` is a **recursive** lookup: it follows a reference repeatedly, the
way a recursive CTE walks a tree in SQL.

```js
db.employees.insertMany([
  { _id: 1, name: "Ava",  title: "CEO",      managerId: null },
  { _id: 2, name: "Ben",  title: "CTO",      managerId: 1 },
  { _id: 3, name: "Cara", title: "Eng Lead", managerId: 2 },
  { _id: 4, name: "Dev",  title: "Engineer", managerId: 3 },
  { _id: 5, name: "Eli",  title: "Engineer", managerId: 3 },
  { _id: 6, name: "Fay",  title: "CFO",      managerId: 1 },
]);
```

Walking **up** — Dev's management chain:

```js
db.employees.aggregate([
  { $match: { name: "Dev" } },
  {
    $graphLookup: {
      from: "employees",
      startWith: "$managerId", // first value to look for
      connectFromField: "managerId", // then keep following this field...
      connectToField: "_id", // ...matched against this one
      as: "chain",
      depthField: "depth",
    },
  },
  {
    $set: { chain: { $sortArray: { input: "$chain", sortBy: { depth: 1 } } } },
  },
  { $project: { _id: 0, name: 1, managers: "$chain.name" } },
]);
```

Output:

```txt
[
  { name: 'Dev', managers: [ 'Cara', 'Ben', 'Ava' ] }
]
```

Walking **down** — everyone who reports to Ben, directly or indirectly:

```js
db.employees.aggregate([
  { $match: { name: "Ben" } },
  {
    $graphLookup: {
      from: "employees",
      startWith: "$_id",
      connectFromField: "_id",
      connectToField: "managerId",
      as: "reports",
      depthField: "level",
      maxDepth: 5,
    },
  },
  {
    $project: {
      _id: 0,
      name: 1,
      reports: {
        $map: {
          input: {
            $sortArray: { input: "$reports", sortBy: { level: 1, _id: 1 } },
          },
          as: "r",
          in: { name: "$$r.name", level: "$$r.level" },
        },
      },
    },
  },
]);
```

Output:

```txt
[
  {
    name: 'Ben',
    reports: [
      { name: 'Cara', level: Long('0') },
      { name: 'Dev', level: Long('1') },
      { name: 'Eli', level: Long('1') }
    ]
  }
]
```

`level: 0` means a direct report, `1` a report's report, and so on.

Important:

- The result array has **no guaranteed order** — sort it with `$sortArray` (5.2+)
  or unwind and sort.
- Index `connectToField`; every hop is a query.
- `$graphLookup` must stay under 100MB of memory and **cannot spill to disk**, even
  with `allowDiskUse`. Bound it with `maxDepth` and narrow it with
  `restrictSearchWithMatch`.
- Documents already visited are not revisited, so a cycle in the data does not
  loop forever.

Use cases:

- org charts and approval chains
- category trees and breadcrumbs
- "friends of friends" within N hops
- bill-of-materials explosion

## 13. How Does `$facet` Run Several Pipelines At Once?

`$facet` runs several **independent sub-pipelines over the same input** and
returns one document with one array per facet. The classic use is a search page:
the results, the total, and the filter counts in a single round trip.

```js
db.products.insertMany([
  { _id: 1, name: "Keyboard",  category: "electronics", price: 50,
    inStock: true },
  { _id: 2, name: "Mouse",     category: "electronics", price: 20,
    inStock: true },
  { _id: 3, name: "Monitor",   category: "electronics", price: 200,
    inStock: false },
  { _id: 4, name: "Notebook",  category: "stationery",  price: 5,
    inStock: true },
  { _id: 5, name: "Pen",       category: "stationery",  price: 2,
    inStock: true },
  { _id: 6, name: "Desk Lamp", category: "home",        price: 35,
    inStock: true },
]);
```

```js
db.products.aggregate([
  { $match: { inStock: true } }, // shared filter — can use an index
  {
    $facet: {
      results: [
        { $sort: { price: -1, _id: 1 } },
        { $skip: 0 },
        { $limit: 2 },
        { $project: { _id: 0, name: 1, price: 1 } },
      ],
      total: [{ $count: "count" }],
      byCategory: [
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ],
      priceBands: [
        { $bucket: { groupBy: "$price", boundaries: [0, 10, 50, 1000] } },
      ],
    },
  },
  { $set: { total: { $ifNull: [{ $first: "$total.count" }, 0] } } },
]);
```

Output:

```txt
[
  {
    results: [
      { name: 'Keyboard', price: 50 },
      { name: 'Desk Lamp', price: 35 }
    ],
    total: 5,
    byCategory: [
      { _id: 'electronics', count: 2 },
      { _id: 'stationery', count: 2 },
      { _id: 'home', count: 1 }
    ],
    priceBands: [
      { _id: 0, count: 2 },
      { _id: 10, count: 2 },
      { _id: 50, count: 1 }
    ]
  }
]
```

The final `$set` turns `total: [{ count: 5 }]` into `total: 5` — and into `0`
when nothing matched, which fixes the empty-`$count` problem from question 8.

Important:

- Stages **inside** a facet cannot use indexes; they run on whatever reaches
  `$facet`. Put the shared `$match` (and `$sort`, if you can) before it.
- The output is a single document, so all facets together must fit in 16MB.
  Always `$limit` the results facet.
- Every facet processes the full input. A facet over a million documents is a
  million-document pass, even if it only returns a count.

Tradeoff:

One round trip is convenient, but on large collections two queries — a paged
`find` and a separately cached count — often beat one heavy `$facet`.

## 14. How Do `$bucket` And `$bucketAuto` Build Histograms?

`$bucket` groups documents into **ranges you choose**; `$bucketAuto` chooses the
ranges to spread documents evenly.

```js
db.orders.insertMany([
  { _id: 1, total: 8 },   { _id: 2, total: 15 },  { _id: 3, total: 42 },
  { _id: 4, total: 55 },  { _id: 5, total: 99 },  { _id: 6, total: 150 },
  { _id: 7, total: 480 }, { _id: 8, total: 1200 },
]);
```

```js
db.orders.aggregate([
  {
    $bucket: {
      groupBy: "$total",
      boundaries: [0, 50, 100, 500],     // [0, 50) [50, 100) [100, 500)
      default: "500+",                   // everything outside the boundaries
      output: { orders: { $sum: 1 }, revenue: { $sum: "$total" } },
    },
  },
]);
```

Output:

```txt
[
  { _id: 0, orders: 3, revenue: 65 },
  { _id: 50, orders: 2, revenue: 154 },
  { _id: 100, orders: 2, revenue: 630 },
  { _id: '500+', orders: 1, revenue: 1200 }
]
```

Each bucket's `_id` is its **inclusive lower bound**. Without `default`, the order
of `1200` has no bucket and the whole aggregation fails. The error names `$switch`
because `$bucket` is implemented as a `$group` over a `$switch` expression:

```js
db.orders.aggregate([
  { $bucket: { groupBy: "$total", boundaries: [0, 50, 100, 500] } },
]);
```

Output:

```txt
MongoServerError: Executor error during aggregate command on namespace: test.orders ::
caused by :: $switch could not find a matching branch for an input, and no default was specified.
```

`$bucketAuto` picks boundaries so each bucket holds roughly the same number of
documents:

```js
db.orders.aggregate([
  { $bucketAuto: { groupBy: "$total", buckets: 4 } },
]);
```

Output:

```txt
[
  { _id: { min: 8, max: 42 }, count: 2 },
  { _id: { min: 42, max: 99 }, count: 2 },
  { _id: { min: 99, max: 480 }, count: 2 },
  { _id: { min: 480, max: 1200 }, count: 2 }
]
```

When to use it:

- `$bucket` for business-defined bands: price tiers, age groups, SLA brackets
- `$bucketAuto` for exploring a distribution, such as quartiles of order value
- inside `$facet` for the price-range filters on a search page

## 15. How Do `$replaceRoot` And `$replaceWith` Promote Embedded Documents?

Both replace the whole document with the result of an expression. `$replaceWith`
(4.2+) is shorthand for `$replaceRoot: { newRoot: ... }`.

```js
db.users.insertMany([
  { _id: 1, email: "alice@example.com", profile: { name: "Alice",
    city: "Dhaka",  plan: "pro" } },
  { _id: 2, email: "bob@example.com",   profile: { name: "Bob",
    city: "Sylhet", plan: "free" } },
]);
```

Promote the embedded document to the top level:

```js
db.users.aggregate([
  { $replaceWith: "$profile" },
]);
```

Output:

```txt
[
  { name: 'Alice', city: 'Dhaka', plan: 'pro' },
  { name: 'Bob', city: 'Sylhet', plan: 'free' }
]
```

That discarded `_id` and `email`. `$mergeObjects` keeps them — later arguments
win on a field-name clash:

```js
db.users.aggregate([
  {
    $replaceWith: {
      $mergeObjects: [{ _id: "$_id", email: "$email" }, "$profile"],
    },
  },
]);
```

Output:

```txt
[
  {
    _id: 1,
    email: 'alice@example.com',
    name: 'Alice',
    city: 'Dhaka',
    plan: 'pro'
  },
  {
    _id: 2,
    email: 'bob@example.com',
    name: 'Bob',
    city: 'Sylhet',
    plan: 'free'
  }
]
```

Interview trap:

If any document lacks the field, the whole aggregation fails:

```js
db.users.insertOne({ _id: 3, email: "new@example.com" });   // no profile yet
db.users.aggregate([
  { $replaceWith: "$profile" },
]);
```

Output:

```txt
MongoServerError: Executor error during aggregate command on namespace: test.users ::
caused by :: 'replacement document' must evaluate to an object, but resulting value was: MISSING.
Type of resulting value: 'missing'. Input document: {}
```

Fix — give it a default: `{ $replaceWith: { $ifNull: ["$profile", {}] } }`, or
`$match: { profile: { $exists: true } }` first.

Use cases:

- flattening a `$lookup` result into the parent:
  `{ $replaceWith: { $mergeObjects: [{ $first: "$customer" }, "$$ROOT"] } }`
- turning the grouped `_id` back into top-level fields after `$group`
- building a document from an array of key/value pairs with `$arrayToObject`

## 16. How Does `$unionWith` Combine Collections?

`$unionWith` (4.4+) appends the documents of another collection to the stream —
SQL's `UNION ALL`. Duplicates are kept.

```js
db.orders.insertMany([
  { _id: 1, customer: "Alice", total: 70, year: 2026 },
  { _id: 2, customer: "Carol", total: 45, year: 2026 },
]);
db.orders_2025.insertMany([
  { _id: "a1", customer: "Alice", total: 30, year: 2025 },
  { _id: "a2", customer: "Bob",   total: 60, year: 2025 },
]);
```

```js
db.orders.aggregate([
  { $unionWith: "orders_2025" },
  { $sort: { year: 1, customer: 1 } },
]);
```

Output:

```txt
[
  { _id: 'a1', customer: 'Alice', total: 30, year: 2025 },
  { _id: 'a2', customer: 'Bob', total: 60, year: 2025 },
  { _id: 1, customer: 'Alice', total: 70, year: 2026 },
  { _id: 2, customer: 'Carol', total: 45, year: 2026 }
]
```

Lifetime spend across the live and archived collections:

```js
db.orders.aggregate([
  {
    $unionWith: {
      coll: "orders_2025",
      pipeline: [{ $project: { customer: 1, total: 1 } }],
    },
  },
  { $group: { _id: "$customer", lifetime: { $sum: "$total" } } },
  { $sort: { lifetime: -1 } },
]);
```

Output:

```txt
[
  { _id: 'Alice', lifetime: 100 },
  { _id: 'Bob', lifetime: 60 },
  { _id: 'Carol', lifetime: 45 }
]
```

Important:

- The `pipeline` option applies **only** to the unioned collection. Stages before
  `$unionWith` apply only to the first; stages after it see both.
- It does not deduplicate. Follow with `$group` if you need distinct values.

Use cases:

- live plus archived data (`orders` + `orders_2025`)
- one feed from several event collections
- unioning a collection with itself under two different pipelines, such as
  "top 5" plus "bottom 5" in one result

## 17. What Are Window Functions With `$setWindowFields`?

`$setWindowFields` (5.0+) computes a value **across a window of related
documents without collapsing them** — SQL's `OVER (PARTITION BY ... ORDER BY ...)`.
Unlike `$group`, every input document survives.

```js
db.sales.insertMany([
  { _id: 1, store: "Dhaka",  day: ISODate("2026-03-01"), amount: 100 },
  { _id: 2, store: "Dhaka",  day: ISODate("2026-03-02"), amount: 150 },
  { _id: 3, store: "Dhaka",  day: ISODate("2026-03-03"), amount: 50 },
  { _id: 4, store: "Dhaka",  day: ISODate("2026-03-04"), amount: 200 },
  { _id: 5, store: "Sylhet", day: ISODate("2026-03-01"), amount: 80 },
  { _id: 6, store: "Sylhet", day: ISODate("2026-03-02"), amount: 40 },
]);
```

```js
db.sales.aggregate([
  {
    $setWindowFields: {
      partitionBy: "$store", // restart the calculation per store
      sortBy: { day: 1 }, // order inside each partition
      output: {
        runningTotal: {
          $sum: "$amount",
          window: { documents: ["unbounded", "current"] },
        },
        avgLast2: { $avg: "$amount", window: { documents: [-1, "current"] } },
        storeTotal: { $sum: "$amount" }, // no window = the whole partition
      },
    },
  },
  { $set: { day: { $dateToString: { date: "$day", format: "%m-%d" } } } },
  { $project: { _id: 0 } },
  { $sort: { store: 1, day: 1 } },
]);
```

Output:

```txt
[
  {
    store: 'Dhaka',
    day: '03-01',
    amount: 100,
    runningTotal: 100,
    avgLast2: 100,
    storeTotal: 500
  },
  {
    store: 'Dhaka',
    day: '03-02',
    amount: 150,
    runningTotal: 250,
    avgLast2: 125,
    storeTotal: 500
  },
  {
    store: 'Dhaka',
    day: '03-03',
    amount: 50,
    runningTotal: 300,
    avgLast2: 100,
    storeTotal: 500
  },
  {
    store: 'Dhaka',
    day: '03-04',
    amount: 200,
    runningTotal: 500,
    avgLast2: 125,
    storeTotal: 500
  },
  {
    store: 'Sylhet',
    day: '03-01',
    amount: 80,
    runningTotal: 80,
    avgLast2: 80,
    storeTotal: 120
  },
  {
    store: 'Sylhet',
    day: '03-02',
    amount: 40,
    runningTotal: 120,
    avgLast2: 60,
    storeTotal: 120
  }
]
```

Reading the window bounds:

| Window | Means |
| --- | --- |
| `documents: ["unbounded", "current"]` | from the first row of the partition to this one — a running total |
| `documents: [-1, "current"]` | the previous row and this one |
| `documents: [-2, 2]` | two rows either side — a centred moving average |
| `range: [-6, 0], unit: "day"` | every row whose `day` is within the last 7 days of this row's `day` |
| omitted | the whole partition |

Interview trap:

A `documents` window counts **rows**; a `range` window measures **values**. If a
day is missing, "the last 7 documents" spans more than 7 days, while
`range: [-6, 0], unit: "day"` is still exactly one week. Rolling time windows
should almost always be `range`.

Window operators to know: `$sum`, `$avg`, `$min`, `$max`, `$count`, `$push`,
`$first`, `$last`, `$shift`, `$rank`, `$denseRank`, `$documentNumber`,
`$expMovingAvg`, `$derivative`, `$integral`, `$locf`, and `$linearFill`.

## 18. How Do You Rank Documents And Compare A Row With The Previous One?

`$rank`, `$denseRank`, and `$documentNumber` are the window versions of SQL's
`RANK`, `DENSE_RANK`, and `ROW_NUMBER`. `$shift` reads a neighbouring row, like
`LAG` and `LEAD`.

```js
db.monthly.insertMany([
  { _id: 1, month: "2026-01", revenue: 1000 },
  { _id: 2, month: "2026-02", revenue: 1300 },
  { _id: 3, month: "2026-03", revenue: 1300 },
  { _id: 4, month: "2026-04", revenue: 900 },
]);
```

Month-over-month growth:

```js
db.monthly.aggregate([
  {
    $setWindowFields: {
      sortBy: { month: 1 },
      // the previous row's revenue
      output: { prevRevenue: { $shift: { output: "$revenue", by: -1 } } },
    },
  },
  {
    $set: {
      growthPct: {
        $cond: [
          { $eq: ["$prevRevenue", null] }, // first month has no previous
          null,
          {
            $round: [
              {
                $multiply: [
                  {
                    $divide: [
                      { $subtract: ["$revenue", "$prevRevenue"] },
                      "$prevRevenue",
                    ],
                  },
                  100,
                ],
              },
              1,
            ],
          },
        ],
      },
    },
  },
  { $project: { _id: 0 } },
]);
```

Output:

```txt
[
  {
    month: '2026-01',
    revenue: 1000,
    prevRevenue: null,
    growthPct: null
  },
  { month: '2026-02', revenue: 1300, prevRevenue: 1000, growthPct: 30 },
  { month: '2026-03', revenue: 1300, prevRevenue: 1300, growthPct: 0 },
  {
    month: '2026-04',
    revenue: 900,
    prevRevenue: 1300,
    growthPct: -30.8
  }
]
```

Ranking by revenue, with a tie between February and March:

```js
db.monthly.aggregate([
  {
    $setWindowFields: {
      sortBy: { revenue: -1 },
      output: {
        rank: { $rank: {} },
        denseRank: { $denseRank: {} },
        rowNumber: { $documentNumber: {} },
      },
    },
  },
  { $project: { _id: 0 } },
]);
```

Output:

```txt
[
  {
    month: '2026-02',
    revenue: 1300,
    rank: 1,
    denseRank: 1,
    rowNumber: 1
  },
  {
    month: '2026-03',
    revenue: 1300,
    rank: 1,
    denseRank: 1,
    rowNumber: 2
  },
  {
    month: '2026-01',
    revenue: 1000,
    rank: 3,
    denseRank: 2,
    rowNumber: 3
  },
  {
    month: '2026-04',
    revenue: 900,
    rank: 4,
    denseRank: 3,
    rowNumber: 4
  }
]
```

| Operator | Ties get | After a tie |
| --- | --- | --- |
| `$rank` | the same rank | skips (1, 1, 3) |
| `$denseRank` | the same rank | no gap (1, 1, 2) |
| `$documentNumber` | different numbers | continues (1, 2, 3) |

Important:

All three require `sortBy` with **exactly one** field — adding a tie-breaker such
as `month: 1` is an error. February and March tie, so which of them
`$documentNumber` numbers 2 is not defined. When row numbers must be
deterministic, sort on a single field that is unique.

## 19. How Do `$densify` And `$fill` Fill Gaps In A Time Series?

Charts and reports need a row for every period, including the ones with no data.
`$densify` (5.1+) **creates** the missing documents; `$fill` (5.3+) **sets
values** in documents where a field is null or missing.

```js
db.daily.insertMany([
  { day: ISODate("2026-03-01T00:00:00Z"), sales: 120 },
  { day: ISODate("2026-03-02T00:00:00Z"), sales: 90 },
  { day: ISODate("2026-03-05T00:00:00Z"), sales: 150 },
]);
```

Missing days as zero:

```js
db.daily.aggregate([
  {
    $densify: { field: "day", range: { step: 1, unit: "day", bounds: "full" } },
  },
  { $fill: { output: { sales: { value: 0 } } } },
  {
    $project: {
      _id: 0,
      day: { $dateToString: { date: "$day", format: "%Y-%m-%d" } },
      sales: 1,
    },
  },
  { $sort: { day: 1 } },
]);
```

Output:

```txt
[
  { sales: 120, day: '2026-03-01' },
  { sales: 90, day: '2026-03-02' },
  { sales: 0, day: '2026-03-03' },
  { sales: 0, day: '2026-03-04' },
  { sales: 150, day: '2026-03-05' }
]
```

For a reading such as a stock level or a temperature, zero is wrong. Interpolate
between the neighbours instead:

```js
db.daily.aggregate([
  {
    $densify: { field: "day", range: { step: 1, unit: "day", bounds: "full" } },
  },
  { $fill: { sortBy: { day: 1 }, output: { sales: { method: "linear" } } } },
  {
    $project: {
      _id: 0,
      day: { $dateToString: { date: "$day", format: "%Y-%m-%d" } },
      sales: 1,
    },
  },
  { $sort: { day: 1 } },
]);
```

Output:

```txt
[
  { sales: 120, day: '2026-03-01' },
  { sales: 90, day: '2026-03-02' },
  { sales: 110, day: '2026-03-03' },
  { sales: 130, day: '2026-03-04' },
  { sales: 150, day: '2026-03-05' }
]
```

| `$fill` output | Fills with |
| --- | --- |
| `{ value: 0 }` | a constant |
| `{ method: "locf" }` | the last observed value, carried forward |
| `{ method: "linear" }` | a straight line between the neighbours; needs `sortBy` |

Important:

- `bounds: "full"` fills from the earliest to the latest value in the data;
  `bounds: [start, end]` fills a fixed report period, even beyond the data.
- Add `partitionByFields: ["store"]` to densify each store separately.
- The generated documents have no `_id` and only the densified field — `$fill`
  is what gives them values.

## 20. `$out` vs `$merge`: How Do You Write Aggregation Results?

Both write the pipeline's output to a collection, which turns an expensive
aggregation into a cheap read — an **on-demand materialized view**.

```js
db.orders.insertMany([
  { _id: 1, customer: "Alice", month: "2026-03", total: 70 },
  { _id: 2, customer: "Bob",   month: "2026-03", total: 40 },
  { _id: 3, customer: "Alice", month: "2026-03", total: 30 },
]);
db.orders.aggregate([
  {
    $group: {
      _id: { customer: "$customer", month: "$month" },
      revenue: { $sum: "$total" },
    },
  },
  {
    $merge: {
      into: "monthly_revenue",
      on: "_id",
      whenMatched: "replace",
      whenNotMatched: "insert",
    },
  },
]);
db.monthly_revenue.find().sort({ "_id.customer": 1 });
```

Output:

```txt
[
  { _id: { customer: 'Alice', month: '2026-03' }, revenue: 100 },
  { _id: { customer: 'Bob', month: '2026-03' }, revenue: 40 }
]
```

Now suppose February was computed earlier and a new March order arrives.
Re-running the pipeline for just the affected month refreshes only the documents
it produces, and leaves every other month alone:

```js
db.monthly_revenue.insertOne({
  _id: { customer: "Alice", month: "2026-02" },
  revenue: 500,
});
db.orders.insertOne({ _id: 4, customer: "Bob", month: "2026-03", total: 25 });
db.orders.aggregate([
  { $match: { month: "2026-03" } },
  {
    $group: {
      _id: { customer: "$customer", month: "$month" },
      revenue: { $sum: "$total" },
    },
  },
  {
    $merge: {
      into: "monthly_revenue",
      on: "_id",
      whenMatched: "replace",
      whenNotMatched: "insert",
    },
  },
]);
db.monthly_revenue.find().sort({ "_id.month": 1, "_id.customer": 1 });
```

Output:

```txt
[
  { _id: { customer: 'Alice', month: '2026-02' }, revenue: 500 },
  { _id: { customer: 'Alice', month: '2026-03' }, revenue: 100 },
  { _id: { customer: 'Bob', month: '2026-03' }, revenue: 65 }
]
```

February survived. `$out` would have **replaced the whole collection** with only
March's rows.

| | `$out` | `$merge` (4.2+) |
| --- | --- | --- |
| Effect on the target | replaces it entirely | inserts, replaces, merges, or keeps per document |
| Incremental refresh | no | yes |
| Other database | yes (4.4+) | yes |
| Sharded target | no | yes |
| Same collection as the input | no | yes (4.4+) |
| Position | last stage | last stage |

`whenMatched` options: `"replace"`, `"merge"` (combine fields), `"keepExisting"`,
`"fail"`, or an update pipeline. `whenNotMatched`: `"insert"`, `"discard"`, or
`"fail"`. An `on` field other than `_id` needs a unique index on the target.

When to use it:

- dashboards and reports read often and computed rarely
- rollups refreshed on a schedule or by a change stream
- `$out` for a full rebuild of a scratch or export collection

Interview note:

A **standard view** (`db.createView(name, source, pipeline)`) stores no data — it
runs its pipeline on every read, so it is always fresh and never faster. A
materialized view built with `$merge` is fast to read and exactly as stale as its
last refresh. Choose by how fresh the numbers must be.

## 21. Which Conditional Operators Should You Know?

`$cond` is if/else, `$switch` is a chain of cases, and `$ifNull` supplies a default.

```js
db.orders.insertMany([
  { _id: 1, total: 1200, coupon: "VIP10" },
  { _id: 2, total: 250,  coupon: null },
  { _id: 3, total: 40 },                    // no coupon field
]);
```

```js
db.orders.aggregate([
  {
    $project: {
      total: 1,
      size: {
        $switch: {
          branches: [
            { case: { $gte: ["$total", 1000] }, then: "large" },
            { case: { $gte: ["$total", 100] }, then: "medium" },
          ],
          default: "small",
        },
      },
      freeShipping: {
        $cond: { if: { $gte: ["$total", 100] }, then: true, else: false },
      },
      coupon: { $ifNull: ["$coupon", "none"] }, // null or missing -> "none"
      couponType: { $type: "$coupon" }, // tells null from missing
      discount: { $cond: [{ $eq: ["$coupon", "VIP10"] }, 0.1, "$$REMOVE"] },
    },
  },
]);
```

Output:

```txt
[
  {
    _id: 1,
    total: 1200,
    size: 'large',
    freeShipping: true,
    coupon: 'VIP10',
    couponType: 'string',
    discount: 0.1
  },
  {
    _id: 2,
    total: 250,
    size: 'medium',
    freeShipping: true,
    coupon: 'none',
    couponType: 'null'
  },
  {
    _id: 3,
    total: 40,
    size: 'small',
    freeShipping: false,
    coupon: 'none',
    couponType: 'missing'
  }
]
```

Reading it:

- `$ifNull` treats **null and missing** the same. `$type` distinguishes them:
  `'null'` for an explicit null, `'missing'` for an absent field.
- `$$REMOVE` omits `discount` entirely when the condition is false, rather than
  writing `discount: null`.
- `$switch` without a `default` fails at runtime when no case matches — the same
  error `$bucket` raised in question 14.
- `$cond` takes either the array form `[if, then, else]` or the named form.

## 22. How Do You Work With Arrays Inside Expressions?

Array operators compute over an array **inside one document** — no `$unwind`, no
regrouping.

```js
db.carts.insertOne({
  _id: 1,
  items: [
    { sku: "KB",  qty: 1,  price: 50 },
    { sku: "NB",  qty: 4,  price: 5 },
    { sku: "PEN", qty: 10, price: 2 },
  ],
});
```

```js
db.carts.aggregate([
  {
    $project: {
      _id: 0,
      skus: "$items.sku",
      lineTotals: {
        $map: {
          input: "$items",
          as: "i",
          in: { $multiply: ["$$i.qty", "$$i.price"] },
        },
      },
      bulkSkus: {
        $map: {
          input: {
            $filter: {
              input: "$items",
              as: "i",
              cond: { $gte: ["$$i.qty", 4] },
            },
          },
          as: "i",
          in: "$$i.sku",
        },
      },
      units: { $sum: "$items.qty" },
      cartTotal: {
        $reduce: {
          input: "$items",
          initialValue: 0,
          in: {
            $add: ["$$value", { $multiply: ["$$this.qty", "$$this.price"] }],
          },
        },
      },
      priciest: {
        $first: { $sortArray: { input: "$items", sortBy: { price: -1 } } },
      },
      hasPen: { $in: ["PEN", "$items.sku"] },
      itemCount: { $size: "$items" },
      firstTwo: { $slice: ["$items.sku", 2] },
    },
  },
]);
```

Output:

```txt
[
  {
    skus: [ 'KB', 'NB', 'PEN' ],
    lineTotals: [ 50, 20, 20 ],
    bulkSkus: [ 'NB', 'PEN' ],
    units: 15,
    cartTotal: 90,
    priciest: { sku: 'KB', qty: 1, price: 50 },
    hasPen: true,
    itemCount: 3,
    firstTwo: [ 'KB', 'NB' ]
  }
]
```

| Operator | Does |
| --- | --- |
| `$map` | transform every element |
| `$filter` | keep elements matching a condition |
| `$reduce` | fold to one value; `$$value` is the accumulator, `$$this` the element |
| `$size` | array length |
| `$first`, `$last`, `$arrayElemAt`, `$slice` | pick elements by position |
| `$in` | membership test |
| `$sortArray` (5.2+) | sort an array, including arrays of documents |
| `$concatArrays`, `$setUnion`, `$setIntersection` | combine arrays |
| `$arrayToObject`, `$objectToArray` | convert between arrays and documents |

Interview trap:

`$size` fails on a missing field instead of returning 0:

```js
db.carts.insertOne({ _id: 2 });            // a cart with no items field
db.carts.aggregate([
  { $project: { itemCount: { $size: "$items" } } },
]);
```

Output:

```txt
MongoServerError: Executor error during aggregate command on namespace: test.carts ::
caused by :: The argument to $size must be an array, but was of type: missing
```

Fix — `{ $size: { $ifNull: ["$items", []] } }`.

## 23. How Do You Work With Dates And Strings In A Pipeline?

```js
db.events.insertOne({
  _id: 1,
  user: "  Alice@Example.com ",
  at: ISODate("2026-03-31T20:30:00Z"),
  amount: "12.50",
});
```

```js
db.events.aggregate([
  {
    $project: {
      _id: 0,
      email: { $toLower: { $trim: { input: "$user" } } },
      domain: {
        $arrayElemAt: [
          { $split: [{ $toLower: { $trim: { input: "$user" } } }, "@"] },
          1,
        ],
      },
      utcDay: { $dateToString: { date: "$at", format: "%Y-%m-%d" } },
      dhakaTime: {
        $dateToString: {
          date: "$at",
          format: "%Y-%m-%d %H:%M",
          timezone: "Asia/Dhaka",
        },
      },
      dhakaMonthStart: {
        $dateTrunc: { date: "$at", unit: "month", timezone: "Asia/Dhaka" },
      },
      dueAt: { $dateAdd: { startDate: "$at", unit: "day", amount: 30 } },
      daysUntilMay: {
        $dateDiff: {
          startDate: "$at",
          endDate: ISODate("2026-05-01T00:00:00Z"),
          unit: "day",
        },
      },
      amount: { $toDecimal: "$amount" },
      badNumber: { $convert: { input: "abc", to: "int", onError: null } },
      greeting: { $concat: ["Hi ", "$nickname"] }, // nickname does not exist
    },
  },
]);
```

Output:

```txt
[
  {
    email: 'alice@example.com',
    domain: 'example.com',
    utcDay: '2026-03-31',
    dhakaTime: '2026-04-01 02:30',
    dhakaMonthStart: ISODate('2026-03-31T18:00:00.000Z'),
    dueAt: ISODate('2026-04-30T20:30:00.000Z'),
    daysUntilMay: Long('31'),
    amount: Decimal128('12.50'),
    badNumber: null,
    greeting: null
  }
]
```

What the output teaches:

- `utcDay` says March 31 while `dhakaTime` says April 1. Pass `timezone` to every
  date operator whose answer depends on the local calendar.
- `dhakaMonthStart` is April 1 in Dhaka, which is `2026-03-31T18:00Z`.
- `daysUntilMay` is 31 although the two instants are 30 days and 3.5 hours apart.
  `$dateDiff` counts **midnight boundaries crossed**, not full 24-hour periods,
  and returns a `Long`.
- `$convert` with `onError` turns bad input into `null` instead of failing the
  whole aggregation; `$toInt`, `$toDecimal`, and the other shortcuts fail.
- `$concat` returns `null` if **any** argument is null or missing. Wrap optional
  parts: `{ $ifNull: ["$nickname", ""] }`.
- Store money as `Decimal128` (`$toDecimal`), not as a string or a double.

Other operators worth recognising: `$year`, `$month`, `$dayOfWeek`, `$week` (all
accept `timezone`), `$dateFromString`, `$toDate`, `$substrCP`, `$regexMatch`,
`$replaceAll`, `$strLenCP`, and `$toString`.

## 24. What Are `$top`, `$topN`, `$firstN`, And `$maxN`?

These accumulators (5.2+) answer "latest per group" and "top N per group" inside
one `$group`, each with its **own** sort — no reliance on the stream's order.

```js
db.orders.insertMany([
  { _id: 1, customer: "Alice", total: 70,  createdAt: ISODate("2026-01-05") },
  { _id: 2, customer: "Alice", total: 20,  createdAt: ISODate("2026-02-20") },
  { _id: 3, customer: "Alice", total: 55,  createdAt: ISODate("2026-03-01") },
  { _id: 4, customer: "Bob",   total: 40,  createdAt: ISODate("2026-01-18") },
  { _id: 5, customer: "Bob",   total: 100, createdAt: ISODate("2026-03-14") },
]);
```

```js
db.orders.aggregate([
  {
    $group: {
      _id: "$customer",
      latest: {
        $top: {
          sortBy: { createdAt: -1 },
          output: { orderId: "$_id", total: "$total" },
        },
      },
      biggestTwo: { $topN: { n: 2, sortBy: { total: -1 }, output: "$_id" } },
      topTotals: { $maxN: { n: 2, input: "$total" } },
      firstTwoSeen: { $firstN: { n: 2, input: "$_id" } },
    },
  },
  { $sort: { _id: 1 } },
]);
```

Output:

```txt
[
  {
    _id: 'Alice',
    latest: { orderId: 3, total: 55 },
    biggestTwo: [ 1, 3 ],
    topTotals: [ 70, 55 ],
    firstTwoSeen: [ 1, 2 ]
  },
  {
    _id: 'Bob',
    latest: { orderId: 5, total: 100 },
    biggestTwo: [ 5, 4 ],
    topTotals: [ 100, 40 ],
    firstTwoSeen: [ 4, 5 ]
  }
]
```

| Accumulator | Sorts by | Returns |
| --- | --- | --- |
| `$top` / `$bottom` | its own `sortBy` | one value |
| `$topN` / `$bottomN` | its own `sortBy` | the first / last N values |
| `$maxN` / `$minN` | the value itself | the N largest / smallest values |
| `$firstN` / `$lastN` | arrival order | the first / last N values seen |
| `$first` / `$last` | arrival order | one value |

Why it matters:

`$first` is only right if a `$sort` precedes the `$group` and nothing reorders
the stream in between. `$top` carries its sort with it, so the result cannot be
broken by an unrelated change earlier in the pipeline. Before 5.2 the same result
needed `$sort` + `$group` with `$push` + `$slice`.

Important:

`$firstN` is **not** "top N" — it takes the first N in arrival order, which is
only meaningful after a `$sort`, exactly like `$first`.

## 25. How Do You Update Documents With An Aggregation Pipeline?

Since 4.2, `updateOne`/`updateMany` accept a **pipeline** instead of an update
document. That lets an update compute a field from other fields of the same
document — something `$set: { total: "$price" }` cannot do.

```js
db.orders.insertMany([
  { _id: 1, items: [ { qty: 1, price: 50 }, { qty: 4, price: 5 } ],
    status: "paid" },
  { _id: 2, items: [ { qty: 10, price: 2 } ],
    status: "pending" },
]);
db.orders.updateMany({}, [
  {
    $set: {
      total: {
        $sum: {
          $map: {
            input: "$items",
            as: "i",
            in: { $multiply: ["$$i.qty", "$$i.price"] },
          },
        },
      },
      updatedAt: "$$NOW",
    },
  },
  { $set: { freeShipping: { $gte: ["$total", 50] } } },
]);
db.orders.find({}, { items: 0, updatedAt: 0 });
```

Output:

```txt
[
  { _id: 1, status: 'paid', total: 70, freeShipping: true },
  { _id: 2, status: 'pending', total: 20, freeShipping: false }
]
```

Interview trap:

The square brackets are the whole difference. The classic update form treats
`"$items"`-style strings as **literal values**:

```js
// update document: "$status" is a plain string
db.orders.updateOne({ _id: 2 }, { $set: { label: "$status" } });
// pipeline: "$status" is a field path
db.orders.updateOne({ _id: 1 }, [{ $set: { label: "$status" } }]);
db.orders.find({}, { _id: 1, label: 1 });
```

Output:

```txt
[
  { _id: 1, label: 'paid' },
  { _id: 2, label: '$status' }
]
```

Order 2 now literally says `'$status'`.

Important:

- Only `$set`/`$addFields`, `$unset`/`$project`, and `$replaceWith`/`$replaceRoot`
  are allowed in an update pipeline.
- Update operators such as `$inc` and `$push` do not exist there; use expressions
  (`$add`, `$concatArrays`) instead.
- `$$NOW` is fixed for the whole operation, so every document updated by one
  `updateMany` gets the same timestamp.

Use cases:

- backfilling a derived field during a migration
- normalising data in place, such as lower-casing emails
- conditional updates that depend on the current value, in one atomic statement

## 26. What Other Stages Should You Recognise?

| Stage | Does |
| --- | --- |
| `$sample` | returns N random documents |
| `$geoNear` | sorts by distance from a point; must be the **first** stage and needs a geospatial index |
| `$redact` | prunes document content per level, for field-level access rules |
| `$documents` (5.1+) | produces documents from literal values, without a collection |
| `$indexStats` | per-index usage counters — finds unused indexes |
| `$collStats` | collection size, storage, and latency statistics |
| `$currentOp` | running operations (on the `admin` database) |
| `$changeStream` | what `watch()` uses under the hood |
| `$search`, `$searchMeta`, `$vectorSearch` | full-text and vector search; require an Atlas Search or Vector Search index |
| `$out`, `$merge` | write results — question 20 |

`$documents` is the fastest way to **test an expression** — no collection, no
insert:

```js
db.aggregate([
  { $documents: [{ price: 19.999 }, { price: 5 }] },
  {
    $set: {
      rounded: { $round: ["$price", 2] },
      withTax: { $multiply: ["$price", 1.15] },
    },
  },
]);
```

Output:

```txt
[
  { price: 19.999, rounded: 20, withTax: 22.998849999999997 },
  { price: 5, rounded: 5, withTax: 5.75 }
]
```

Notice `withTax: 22.998849999999997` — binary floating point cannot represent most
decimal fractions exactly. That is the reason to store money as `Decimal128`.

`$sample` picks random documents, so its output changes on every run:

```js
db.products.insertMany([
  { _id: 1,
    name: "Keyboard" }, { _id: 2, name: "Mouse" }, { _id: 3, name: "Monitor" },
  { _id: 4,
    name: "Webcam" },   { _id: 5, name: "Cable" },
]);
db.products.aggregate([{ $sample: { size: 2 } }]);
```

Output (one possible result):

```txt
[
  { _id: 4, name: 'Webcam' },
  { _id: 1, name: 'Keyboard' }
]
```

Interview note:

`$sample` as the first stage uses a pseudo-random cursor when the sample is under
5% of the collection; otherwise it scans and sorts the whole collection randomly.
Sampling 50% of a large collection is a full scan.

## 27. An Aggregation Takes 8–10 Seconds. How Do You Optimize It?

Symptom:

```js
db.orders.aggregate([
  {
    $lookup: {
      from: "users",
      localField: "userId",
      foreignField: "_id",
      as: "user",
    },
  },
  { $unwind: "$user" },
  { $match: { "user.country": "BD", status: "paid" } },
  { $sort: { createdAt: -1 } },
  { $group: { _id: "$userId", total: { $sum: "$amount" } } },
]);
```

Why it is slow:

As written, the `$lookup` runs against **every** order before anything is
filtered, and the `$sort` sorts documents that `$group` then reorders anyway.

Modern versions rescue part of this automatically. `explain` on MongoDB 8.2
shows the optimizer moving `status: "paid"` in front of the `$lookup` and onto an
index, and folding the `$unwind` and the `user.country` filter into the `$lookup`
itself. What it cannot do is change **what** you join: it still performs one
lookup per paid order.

Fix — reduce first, join last, and join as few documents as possible:

```js
db.orders.aggregate([
  // 1. $match first, on indexed fields
  { $match: { status: "paid" } },

  // 2. $group BEFORE $lookup: one lookup per customer instead of one per order
  { $group: { _id: "$userId", total: { $sum: "$amount" } } },

  // 3. join the reduced set, filtering inside the join
  {
    $lookup: {
      from: "users",
      localField: "_id",
      foreignField: "_id",
      pipeline: [{ $match: { country: "BD" } }, { $project: { _id: 1 } }],
      as: "user",
    },
  },
  { $match: { user: { $ne: [] } } },
  { $unset: "user" },
]);
```

```js
// serves the $match, and covers the $group
db.orders.createIndex({ status: 1, userId: 1, amount: 1 });
```

If Bangladeshi users are a small minority, **drive from the smaller side** instead
— start at `users`, filter on an indexed `country`, and look up each user's paid
orders with an index on `{ userId: 1, status: 1 }`.

The rules:

1. **`$match` as early as possible.** Only a `$match` or `$sort` at the start of
   the pipeline can use an index on the collection.
2. **Reduce before you join.** `$group`, `$limit`, and `$match` before `$lookup`
   shrink the number of lookups.
3. **Index the join key.** Check `EQ_LOOKUP` in `explain`: `IndexedLoopJoin` is
   good; `NestedLoopJoin` means a scan of the foreign collection per document.
4. **`$sort` where an index can serve it,** or not at all — a sort before
   `$group` is wasted work.
5. **Unwind late.** `$unwind` multiplies documents; filter first.
6. **Do not `$project` mid-pipeline for speed.** The optimizer already fetches
   only the fields later stages need; project at the end to shape the output.

Memory limits:

- Each blocking stage (`$group`, `$sort`, `$bucket`, `$setWindowFields`) may use
  **100MB**. Since 6.0, `allowDiskUseByDefault` is on, so exceeding it **spills to
  disk** instead of failing — the query survives but slows sharply. Pass
  `{ allowDiskUse: false }` when you would rather fail fast.
- `$graphLookup` cannot spill; it fails at 100MB.
- Every document the pipeline emits, including `$facet` output and `$group`
  results with `$push`, must fit in **16MB**.

Diagnose with:

```js
db.orders.explain("executionStats").aggregate([
  { $match: { status: "paid" } },
  { $group: { _id: "$userId", total: { $sum: "$amount" } } },
]);
```

Read, per stage: `nReturned`, `executionTimeMillisEstimate`, `usedDisk` and
`spills`, and for `$lookup` the join `strategy`, `totalDocsExamined`, and
`collectionScans`.

Interview note:

The optimizer reorders what it can prove is safe — moving independent `$match`
predicates earlier, coalescing `$sort` + `$limit`, pushing filters into
`$lookup`. It never changes the algorithm you chose. Read `explain` to see what
it actually did rather than assuming, and fix the pipeline's shape yourself.

## 28. Practice: Monthly Revenue With Month-Over-Month Growth

Task: revenue per calendar month **in Dhaka time**, counting delivered and
shipped orders, with the change from the previous month.

```js
db.orders.insertMany([
  { _id: 1, status: "delivered", total: 120,
    createdAt: ISODate("2026-01-03T09:00:00Z") },
  { _id: 2, status: "delivered", total: 80,
    createdAt: ISODate("2026-01-20T15:00:00Z") },
  { _id: 3, status: "cancelled", total: 500,
    createdAt: ISODate("2026-01-25T10:00:00Z") },
  { _id: 4, status: "delivered", total: 150,
    createdAt: ISODate("2026-01-31T19:30:00Z") },  // Feb 1 in Dhaka
  { _id: 5, status: "delivered", total: 100,
    createdAt: ISODate("2026-02-14T12:00:00Z") },
  { _id: 6, status: "shipped",   total: 60,
    createdAt: ISODate("2026-02-27T08:00:00Z") },
  { _id: 7, status: "delivered", total: 90,
    createdAt: ISODate("2026-03-05T11:00:00Z") },
  { _id: 8, status: "delivered", total: 45,
    createdAt: ISODate("2026-03-18T17:00:00Z") },
]);
```

Solution:

```js
db.orders.aggregate([
  { $match: { status: { $in: ["delivered", "shipped"] } } },
  {
    $group: {
      _id: {
        $dateTrunc: {
          date: "$createdAt",
          unit: "month",
          timezone: "Asia/Dhaka",
        },
      },
      revenue: { $sum: "$total" },
      orders: { $sum: 1 },
    },
  },
  {
    $setWindowFields: {
      sortBy: { _id: 1 },
      output: { prevRevenue: { $shift: { output: "$revenue", by: -1 } } },
    },
  },
  {
    $project: {
      _id: 0,
      month: {
        $dateToString: {
          date: "$_id",
          format: "%Y-%m",
          timezone: "Asia/Dhaka",
        },
      },
      orders: 1,
      revenue: 1,
      change: { $subtract: ["$revenue", "$prevRevenue"] },
      growthPct: {
        $cond: [
          { $in: ["$prevRevenue", [null, 0]] },
          null,
          {
            $round: [
              {
                $multiply: [
                  {
                    $divide: [
                      { $subtract: ["$revenue", "$prevRevenue"] },
                      "$prevRevenue",
                    ],
                  },
                  100,
                ],
              },
              1,
            ],
          },
        ],
      },
    },
  },
  { $sort: { month: 1 } },
]);
```

Output:

```txt
[
  {
    revenue: 200,
    orders: 2,
    month: '2026-01',
    change: null,
    growthPct: null
  },
  {
    revenue: 310,
    orders: 3,
    month: '2026-02',
    change: 110,
    growthPct: 55
  },
  {
    revenue: 135,
    orders: 2,
    month: '2026-03',
    change: -175,
    growthPct: -56.5
  }
]
```

Walkthrough:

- `$match` first drops the cancelled order before any grouping.
- `$dateTrunc` with `timezone` puts order 4 in February, where a Dhaka finance
  team counts it.
- `$shift` reads the previous month's revenue; the first month gets `null`, and
  `$subtract` with `null` yields `null`.
- The `$cond` guards against dividing by `null` **and by zero** — `$divide` by
  zero fails the whole pipeline.

## 29. Practice: Top 2 Best-Selling Products Per Category

Task: units sold per product across delivered orders, then the two best sellers
in each category.

```js
db.products.insertMany([
  { _id: "P1", name: "Keyboard", category: "electronics" },
  { _id: "P2", name: "Mouse",    category: "electronics" },
  { _id: "P3", name: "Monitor",  category: "electronics" },
  { _id: "P4", name: "Notebook", category: "stationery" },
  { _id: "P5", name: "Pen",      category: "stationery" },
  { _id: "P6", name: "Stapler",  category: "stationery" },
]);
db.orders.insertMany([
  { _id: 1, status: "delivered", items: [ { productId: "P1",
    qty: 2 }, { productId: "P4", qty: 5 } ] },
  { _id: 2, status: "delivered", items: [ { productId: "P2",
    qty: 3 }, { productId: "P5", qty: 10 } ] },
  { _id: 3, status: "delivered", items: [ { productId: "P1",
    qty: 1 }, { productId: "P3", qty: 1 }, { productId: "P5", qty: 4 } ] },
  { _id: 4, status: "cancelled", items: [ { productId: "P3",
    qty: 9 } ] },
  { _id: 5, status: "delivered", items: [ { productId: "P6",
    qty: 2 }, { productId: "P4", qty: 1 } ] },
]);
```

Solution:

```js
db.orders.aggregate([
  { $match: { status: "delivered" } },
  { $unwind: "$items" },
  { $group: { _id: "$items.productId", units: { $sum: "$items.qty" } } },
  {
    $lookup: {
      from: "products",
      localField: "_id",
      foreignField: "_id",
      as: "product",
    },
  },
  { $unwind: "$product" },
  {
    $group: {
      _id: "$product.category",
      top: {
        $topN: {
          n: 2,
          sortBy: { units: -1, "product.name": 1 }, // name breaks ties
          output: { name: "$product.name", units: "$units" },
        },
      },
    },
  },
  { $sort: { _id: 1 } },
]);
```

Output:

```txt
[
  {
    _id: 'electronics',
    top: [ { name: 'Keyboard', units: 3 }, { name: 'Mouse', units: 3 } ]
  },
  {
    _id: 'stationery',
    top: [ { name: 'Pen', units: 14 }, { name: 'Notebook', units: 6 } ]
  }
]
```

Walkthrough:

- Grouping by product **before** the `$lookup` means six lookups, not one per
  order line.
- Keyboard and Mouse both sold 3 units; the second sort key makes the result
  deterministic instead of arbitrary.
- The cancelled order's 9 monitors never count, because `$match` runs first.
- Before 5.2: `$sort` by category and units, then `$group` with `$push`, then
  `$slice` the array to 2.

## 30. Practice: Customers Who Never Ordered, And Repeat Customers

```js
db.customers.insertMany([
  { _id: "c1", name: "Alice", joinedAt: ISODate("2026-01-02T00:00:00Z") },
  { _id: "c2", name: "Bob",   joinedAt: ISODate("2026-01-15T00:00:00Z") },
  { _id: "c3", name: "Carol", joinedAt: ISODate("2026-02-01T00:00:00Z") },
  { _id: "c4", name: "Dan",   joinedAt: ISODate("2026-02-20T00:00:00Z") },
]);
db.orders.insertMany([
  { _id: 1, customerId: "c1", total: 70,
    createdAt: ISODate("2026-01-05T10:00:00Z") },
  { _id: 2, customerId: "c1", total: 20,
    createdAt: ISODate("2026-02-10T10:00:00Z") },
  { _id: 3, customerId: "c2", total: 40,
    createdAt: ISODate("2026-01-18T10:00:00Z") },
  { _id: 4, customerId: "c1", total: 55,
    createdAt: ISODate("2026-03-01T10:00:00Z") },
]);
```

Task 1 — customers who have never ordered (an anti-join):

```js
db.customers.aggregate([
  {
    $lookup: {
      from: "orders",
      localField: "_id",
      foreignField: "customerId",
      // existence is enough
      pipeline: [{ $limit: 1 }, { $project: { _id: 1 } }],
      as: "anyOrder",
    },
  },
  { $match: { anyOrder: { $size: 0 } } },
  { $project: { _id: 0, name: 1 } },
  { $sort: { name: 1 } },
]);
```

Output:

```txt
[
  { name: 'Carol' },
  { name: 'Dan' }
]
```

Task 2 — for customers who have ordered: order count, whether they came back,
and days from sign-up to first order:

```js
db.orders.aggregate([
  {
    $group: {
      _id: "$customerId",
      orders: { $sum: 1 },
      firstOrderAt: { $min: "$createdAt" },
    },
  },
  {
    $lookup: {
      from: "customers",
      localField: "_id",
      foreignField: "_id",
      as: "customer",
    },
  },
  { $set: { customer: { $first: "$customer" } } },
  {
    $project: {
      _id: 0,
      name: "$customer.name",
      orders: 1,
      repeat: { $gt: ["$orders", 1] },
      daysToFirstOrder: {
        $dateDiff: {
          startDate: "$customer.joinedAt",
          endDate: "$firstOrderAt",
          unit: "day",
        },
      },
    },
  },
  { $sort: { name: 1 } },
]);
```

Output:

```txt
[
  {
    orders: 3,
    name: 'Alice',
    repeat: true,
    daysToFirstOrder: Long('3')
  },
  {
    orders: 1,
    name: 'Bob',
    repeat: false,
    daysToFirstOrder: Long('3')
  }
]
```

Walkthrough:

- The anti-join only needs to know whether **any** order exists, so the
  sub-pipeline stops at one. This is SQL's `NOT EXISTS`.
- Task 2 starts from `orders` and groups first, so it joins one document per
  customer who ordered — two lookups here, not four.
- `$min` on `createdAt` finds the first order without sorting.

## 31. Practice: Pivot Order Counts By Status Per Month

Task: one row per month, one field per status.

```js
db.orders.insertMany([
  { _id: 1, status: "delivered", createdAt: ISODate("2026-01-05T10:00:00Z") },
  { _id: 2, status: "cancelled", createdAt: ISODate("2026-01-09T10:00:00Z") },
  { _id: 3, status: "delivered", createdAt: ISODate("2026-01-20T10:00:00Z") },
  { _id: 4, status: "delivered", createdAt: ISODate("2026-02-02T10:00:00Z") },
  { _id: 5, status: "returned",  createdAt: ISODate("2026-02-11T10:00:00Z") },
  { _id: 6, status: "shipped",   createdAt: ISODate("2026-02-25T10:00:00Z") },
]);
```

Dynamic columns — whatever statuses exist become fields:

```js
db.orders.aggregate([
  {
    $group: {
      _id: {
        month: { $dateToString: { date: "$createdAt", format: "%Y-%m" } },
        status: "$status",
      },
      count: { $sum: 1 },
    },
  },
  { $sort: { "_id.status": 1 } },
  {
    $group: {
      _id: "$_id.month",
      counts: { $push: { k: "$_id.status", v: "$count" } },
    },
  },
  {
    $replaceWith: {
      $mergeObjects: [{ month: "$_id" }, { $arrayToObject: "$counts" }],
    },
  },
  { $sort: { month: 1 } },
]);
```

Output:

```txt
[
  { month: '2026-01', cancelled: 1, delivered: 2 },
  { month: '2026-02', delivered: 1, returned: 1, shipped: 1 }
]
```

Fixed columns, with zeros — conditional sums, exactly like SQL's
`SUM(CASE WHEN ...)`:

```js
db.orders.aggregate([
  {
    $group: {
      _id: { $dateToString: { date: "$createdAt", format: "%Y-%m" } },
      delivered: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } },
      cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
      returned: { $sum: { $cond: [{ $eq: ["$status", "returned"] }, 1, 0] } },
    },
  },
  { $sort: { _id: 1 } },
]);
```

Output:

```txt
[
  { _id: '2026-01', delivered: 2, cancelled: 1, returned: 0 },
  { _id: '2026-02', delivered: 1, cancelled: 0, returned: 1 }
]
```

Tradeoff:

The dynamic pivot adapts to new statuses but omits zero counts — January has no
`returned` field at all. The fixed pivot always has the same fields, which a
table or chart usually wants, and silently ignores statuses you did not list,
such as `shipped`.

## 32. What Are The Common Aggregation Mistakes?

**`$match` late or `$lookup` early** — the join runs for documents you throw away.

**`$unwind` before filtering** — multiplies documents before reducing them.

**Relying on output order** — `$group`, `$lookup`, `$unionWith`, and
`$graphLookup` results are unordered. Sort explicitly.

**`$first`/`$last` without a `$sort`** — "first" is arbitrary. Prefer `$top`.

**Reading `result[0].count`** — `$count` and `$group` return nothing on an empty
input.

**Comparing two fields without `$expr`** — `{ paid: { $lt: "$total" } }` compares
with the string `"$total"`.

**Referencing a field computed in the same `$set`** — it does not exist yet.

**`$set: { x: "$y" }` in a normal update** — writes the literal string; use a
pipeline update.

**Grouping dates in UTC** for a business in another time zone.

**`$concat` and `$size` on missing fields** — `null` and a hard error
respectively.

**`$out` when you meant `$merge`** — `$out` replaces the entire collection.

**No index on `foreignField` or `connectToField`** — a scan per input document.

**Huge `$push` or `$facet` results** — every output document must fit in 16MB.

Strong answer:

> I treat a pipeline as a funnel. `$match` runs first on indexed fields, anything
> that reduces the document count — `$group`, `$limit` — runs before anything
> that multiplies or joins — `$unwind`, `$lookup` — and every join key is
> indexed. For "top N per group" I use `$topN` rather than `$sort` + `$first`,
> for time-based reports I group with an explicit time zone, and for dashboards I
> precompute with `$merge` instead of aggregating on every request. Then I confirm
> with `explain("executionStats")`: per-stage `nReturned`, disk spills, and the
> `$lookup` join strategy.

## Sources Used

- <https://www.mongodb.com/docs/manual/core/aggregation-pipeline/>
- <https://www.mongodb.com/docs/manual/reference/operator/aggregation-pipeline/>
- <https://www.mongodb.com/docs/manual/reference/operator/aggregation/>
- <https://www.mongodb.com/docs/manual/core/aggregation-pipeline-optimization/>
- <https://www.mongodb.com/docs/manual/core/aggregation-pipeline-limits/>
- <https://www.mongodb.com/docs/manual/reference/operator/aggregation/lookup/>
- <https://www.mongodb.com/docs/manual/reference/operator/aggregation/setWindowFields/>
- <https://www.mongodb.com/docs/manual/reference/operator/aggregation/merge/>
- <https://www.mongodb.com/docs/manual/tutorial/update-documents-with-aggregation-pipeline/>
