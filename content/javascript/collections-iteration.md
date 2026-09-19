# JavaScript Map, Object & Set Interview Guide

Focused JavaScript comparison questions for choosing between plain objects,
`Map`, `WeakMap`, `Set`, `WeakSet`, object key helpers, immutability guards, and
object merge patterns.

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

- Representing a known data shape
- Sending or receiving JSON
- Modeling entities such as user, order, or product

Use `Map` when:

- Keys are objects or functions
- Entries are added and removed frequently
- Insertion order matters
- Collection size is checked often
- User-provided keys should not touch object prototypes

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

- Building a dictionary from untrusted keys
- Avoiding accidental prototype collisions
- Implementing low-level lookup tables

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

- You need iteration
- You need `.size`
- Keys may be primitives
- Entries must remain until explicitly deleted

Use `WeakMap` when:

- Keys are objects
- Data should be associated privately with an object
- Cache entries should disappear when object keys are no longer reachable

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

- Duplicates are meaningful
- Index position matters
- You need array methods such as `map`, `filter`, or `reduce`

Use `Set` when:

- Values must be unique
- Membership checks are frequent
- You want simple deduplication

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

- You need to list values
- You need size
- Values include primitives

Use `WeakSet` when:

- Values are objects
- You only need to track whether an object was seen
- You do not want tracking to keep objects alive in memory

Interview example:

```js
function hasCycle(node, seen = new WeakSet()) {
  if (!node || typeof node !== "object") return false;
  if (seen.has(node)) return true;

  seen.add(node);

  return Object.values(node).some((value) => hasCycle(value, seen));
}
```

## 6. `Object.keys` vs `Object.values` vs `Object.entries`

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

## 7. `Object.freeze` vs `Object.seal` vs `Object.preventExtensions`

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

## 8. Spread vs `Object.assign`

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
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze>
