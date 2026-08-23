# JavaScript Collections And Iteration Interview Guide

JavaScript comparison questions covering `Map`, plain objects, `WeakMap`, `Set`,
array iteration methods, object iteration, immutability helpers, and common
interview traps.

## 1. Difference Between Map And Object In JavaScript

Plain objects are best for structured records. `Map` is best for dynamic
key-value collections.

```js
const user = {
  id: 1,
  name: "Asha",
};

const cache = new Map();
const request = { url: "/users/1" };

cache.set("user:1", user);
cache.set(request, { status: 200 });

console.log(user.name);
console.log(cache.get("user:1").name);
console.log(cache.get(request).status);
console.log(cache.size);
```

Output:

```txt
Asha
Asha
200
2
```

Main differences:

| Feature | Object | Map |
| --- | --- | --- |
| Key type | String or symbol | Any value |
| Size | `Object.keys(obj).length` | `map.size` |
| Iteration | Use `Object.keys`, `values`, or `entries` | Directly iterable |
| JSON | Works naturally with `JSON.stringify` | Needs conversion |
| Dynamic add/delete | Works, but not ideal for heavy churn | Designed for this |
| Prototype keys | Has a prototype unless created carefully | No accidental keys |

Use object when:

- representing a known data shape
- sending or receiving JSON
- modeling entities such as user, order, product

Use `Map` when:

- keys are objects or functions
- entries are added and removed frequently
- insertion order matters
- collection size is checked often
- user-provided keys should not touch object prototypes

Strong answer:

> Object is for records with known fields. Map is for dictionary-like
> collections where keys can be any value and frequent insertion, lookup, and
> deletion are expected.

## 2. When Should You Use `Object.create(null)`?

`Object.create(null)` creates an object with no prototype. It can be useful for
dictionary objects that should not inherit keys from `Object.prototype`.

```js
const normal = {};
const dictionary = Object.create(null);

normal.toString = "custom";
dictionary.toString = "custom";

console.log("constructor" in normal);
console.log("constructor" in dictionary);
console.log(dictionary.toString);
```

Output:

```txt
true
false
custom
```

Why it matters:

A normal object inherits keys such as `constructor` and methods such as
`toString`. A null-prototype object only has the keys you add.

Use it when:

- building a dictionary from untrusted keys
- avoiding accidental prototype collisions
- implementing low-level lookup tables

Tradeoff:

Null-prototype objects do not have normal object methods. In most application
code, `Map` is cleaner for dynamic dictionaries.

## 3. Map vs WeakMap

`Map` can use any value as a key and is iterable. `WeakMap` only accepts objects
as keys and does not prevent those key objects from being garbage-collected.

```js
const metadata = new WeakMap();

let user = { id: 1 };

metadata.set(user, { lastSeen: "today" });

console.log(metadata.get(user));

user = null;
```

Output:

```txt
{ lastSeen: 'today' }
```

After `user = null`, the object can be garbage-collected if nothing else
references it. The related `WeakMap` entry can disappear too.

Use `Map` when:

- you need iteration
- you need `.size`
- keys may be primitives
- entries must remain until explicitly deleted

Use `WeakMap` when:

- keys are objects
- data should be associated privately with an object
- cache entries should disappear when object keys are no longer reachable

Common use:

```js
const privateState = new WeakMap();

class Counter {
  constructor() {
    privateState.set(this, { count: 0 });
  }

  increment() {
    privateState.get(this).count += 1;
  }
}
```

## 4. Set vs Array

An array stores ordered values and allows duplicates. A `Set` stores unique
values.

```js
const tags = ["react", "node", "react", "js"];
const uniqueTags = new Set(tags);

console.log(tags.length);
console.log(uniqueTags.size);
console.log([...uniqueTags]);
console.log(uniqueTags.has("node"));
```

Output:

```txt
4
3
[ 'react', 'node', 'js' ]
true
```

Use array when:

- duplicates are meaningful
- index position matters
- you need array methods such as `map`, `filter`, or `reduce`

Use `Set` when:

- values must be unique
- membership checks are frequent
- you want simple deduplication

Example membership check:

```js
const blockedIds = new Set([10, 20, 30]);

console.log(blockedIds.has(20));
console.log(blockedIds.has(40));
```

Output:

```txt
true
false
```

## 5. Set vs WeakSet

`Set` can store primitives and objects, is iterable, and has a `size`.
`WeakSet` stores only objects and does not prevent those objects from being
garbage-collected.

```js
const visited = new WeakSet();
const node = { id: "root" };

visited.add(node);

console.log(visited.has(node));
```

Output:

```txt
true
```

Use `Set` when:

- you need to list values
- you need size
- values include primitives

Use `WeakSet` when:

- values are objects
- you only need to track whether an object was seen
- you do not want tracking to keep objects alive in memory

Interview example:

```js
function hasCycle(node, seen = new WeakSet()) {
  if (!node || typeof node !== "object") return false;
  if (seen.has(node)) return true;

  seen.add(node);

  return Object.values(node).some((value) => hasCycle(value, seen));
}
```

## 6. `map` vs `forEach`

Use `map` when you need a new transformed array. Use `forEach` when you only
need side effects.

```js
const prices = [10, 20, 30];

const withTax = prices.map((price) => price * 1.1);
const result = prices.forEach((price) => price * 1.1);

console.log(withTax);
console.log(result);
```

Output:

```txt
[ 11, 22, 33 ]
undefined
```

Common trap:

```js
const users = [{ name: "Asha" }, { name: "Rafi" }];

const names = users.forEach((user) => user.name);

console.log(names);
```

Output:

```txt
undefined
```

Fix:

```js
const names = users.map((user) => user.name);
```

Interview answer:

> `map` returns a new array and should be used for transformation. `forEach`
> returns `undefined` and should be used for side effects such as logging,
> metrics, or pushing into an external collection.

## 7. `filter` vs `find`

`filter` returns all matching items. `find` returns the first matching item or
`undefined`.

```js
const users = [
  { id: 1, role: "admin" },
  { id: 2, role: "user" },
  { id: 3, role: "admin" },
];

console.log(users.filter((user) => user.role === "admin"));
console.log(users.find((user) => user.role === "admin"));
```

Output:

```txt
[ { id: 1, role: 'admin' }, { id: 3, role: 'admin' } ]
{ id: 1, role: 'admin' }
```

Use `filter` when:

- you need every match
- the result should always be an array

Use `find` when:

- only one result matters
- you want to stop once the first match is found
- absence should be represented by `undefined`

## 8. `reduce` vs A Normal Loop

`reduce` combines an array into one value. A normal loop is often clearer for
complex logic.

```js
const orders = [
  { userId: 1, total: 40 },
  { userId: 2, total: 25 },
  { userId: 1, total: 10 },
];

const totalsByUser = orders.reduce((acc, order) => {
  acc[order.userId] = (acc[order.userId] ?? 0) + order.total;
  return acc;
}, {});

console.log(totalsByUser);
```

Output:

```txt
{ '1': 50, '2': 25 }
```

Equivalent loop:

```js
const totals = {};

for (const order of orders) {
  totals[order.userId] = (totals[order.userId] ?? 0) + order.total;
}
```

Use `reduce` when the accumulator pattern is obvious. Use a loop when the logic
has multiple branches, early exits, or side effects.

## 9. `Object.keys` vs `Object.values` vs `Object.entries`

These methods turn an object's own enumerable properties into arrays.

```js
const user = {
  id: 1,
  name: "Asha",
  role: "admin",
};

console.log(Object.keys(user));
console.log(Object.values(user));
console.log(Object.entries(user));
```

Output:

```txt
[ 'id', 'name', 'role' ]
[ 1, 'Asha', 'admin' ]
[ [ 'id', 1 ], [ 'name', 'Asha' ], [ 'role', 'admin' ] ]
```

Use:

- `Object.keys` when you need property names
- `Object.values` when you only need values
- `Object.entries` when you need both key and value

Useful conversion:

```js
const entries = [["theme", "dark"]];
const settings = Object.fromEntries(entries);

console.log(settings);
```

Output:

```txt
{ theme: 'dark' }
```

## 10. `for...of` vs `for...in`

`for...of` iterates values from an iterable. `for...in` iterates enumerable
property keys.

```js
const numbers = [10, 20, 30];

for (const value of numbers) {
  console.log("of", value);
}

for (const key in numbers) {
  console.log("in", key);
}
```

Output:

```txt
of 10
of 20
of 30
in 0
in 1
in 2
```

Use `for...of` for:

- arrays
- strings
- maps
- sets
- other iterables

Use `for...in` mainly for object keys, and usually combine it with
`Object.hasOwn()` if inherited properties matter.

```js
for (const key in object) {
  if (Object.hasOwn(object, key)) {
    console.log(key, object[key]);
  }
}
```

## 11. `Object.freeze` vs `Object.seal` vs `Object.preventExtensions`

These methods restrict object changes at different levels.

```js
const frozen = Object.freeze({ name: "Asha" });
const sealed = Object.seal({ name: "Rafi" });
const lockedShape = Object.preventExtensions({ name: "Mina" });

frozen.name = "Changed";
sealed.name = "Changed";
sealed.role = "admin";
lockedShape.name = "Changed";
lockedShape.role = "admin";

console.log(frozen);
console.log(sealed);
console.log(lockedShape);
```

Output in non-strict mode:

```txt
{ name: 'Asha' }
{ name: 'Changed' }
{ name: 'Changed' }
```

Difference:

| Method | Add property | Delete property | Modify existing property |
| --- | --- | --- | --- |
| `preventExtensions` | No | Yes | Yes |
| `seal` | No | No | Yes |
| `freeze` | No | No | No |

Important trap:

`Object.freeze` is shallow. Nested objects can still change unless they are
also frozen.

## 12. Spread vs `Object.assign`

Object spread and `Object.assign` both make shallow copies and merge objects.

```js
const defaults = { theme: "light", pageSize: 20 };
const userSettings = { theme: "dark" };

const spreadResult = { ...defaults, ...userSettings };
const assignResult = Object.assign({}, defaults, userSettings);

console.log(spreadResult);
console.log(assignResult);
```

Output:

```txt
{ theme: 'dark', pageSize: 20 }
{ theme: 'dark', pageSize: 20 }
```

Main difference:

`Object.assign(target, source)` mutates the target object. Spread creates a new
object literal.

Mutation trap:

```js
const target = { theme: "light" };
const result = Object.assign(target, { pageSize: 20 });

console.log(target === result);
console.log(target);
```

Output:

```txt
true
{ theme: 'light', pageSize: 20 }
```

Use spread for simple immutable object updates:

```js
const nextUser = { ...user, name: "Updated" };
```

Use `Object.assign` when intentionally writing into a target object or when you
need compatibility with older object-spread support.

## Sources Used

- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze>
