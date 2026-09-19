# JavaScript Loops & Array Methods Interview Guide

Focused JavaScript iteration questions for choosing between `for`, `for...of`,
`for...in`, `forEach`, `map`, `filter`, `find`, `reduce`, `some`, `every`,
`sort`, `slice`, `splice`, `flat`, and `flatMap`.

## 1. `for` Loop vs `for...of` vs `forEach`

All three can iterate arrays, but they fit different situations.

```js
const numbers = [10, 20, 30];

for (let index = 0; index < numbers.length; index += 1) {
  console.log(index, numbers[index]);
}

for (const number of numbers) {
  console.log(number);
}

numbers.forEach((number, index) => {
  console.log(index, number);
});
```

Use `for` when:

- You need index control
- You need to move forward or backward manually
- You need `break` or `continue`

Use `for...of` when:

- You need values from an iterable
- The code should be readable
- You need `break`, `continue`, or `await` inside the loop

Use `forEach` when:

- You want a simple side effect for every item
- You do not need `break` or `continue`
- You do not need to return a new array

Interview note:

> I usually prefer `for...of` for readable imperative loops, `for` for index
> control, and array methods when I am transforming or selecting data.

## 2. `for...of` vs `for...in`

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

- Arrays
- Strings
- Maps
- Sets
- Other iterables

Use `for...in` mainly for object keys, and usually combine it with
`Object.hasOwn()` if inherited properties matter.

```js
for (const key in object) {
  if (Object.hasOwn(object, key)) {
    console.log(key, object[key]);
  }
}
```

## 3. `map` vs `forEach`

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

## 4. `filter` vs `find`

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

- You need every match
- The result should always be an array

Use `find` when:

- Only one result matters
- You want to stop once the first match is found
- Absence should be represented by `undefined`

## 5. `reduce` vs A Normal Loop

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

## 6. `some` vs `every`

`some` checks whether at least one item passes. `every` checks whether all
items pass.

```js
const tasks = [
  { title: "Design", done: true },
  { title: "Build", done: false },
];

console.log(tasks.some((task) => task.done));
console.log(tasks.every((task) => task.done));
```

Output:

```txt
true
false
```

Use `some` for:

- Permission checks where one role is enough
- Search checks where any match is enough
- Validation where one failure exists

Use `every` for:

- Form validation where all fields must pass
- Feature checks where all requirements must be true
- Batch logic where every item must be ready

## 7. `find` vs `findIndex` vs `includes`

These methods answer different search questions.

```js
const users = [
  { id: 1, name: "Asha" },
  { id: 2, name: "Rafi" },
];

console.log(users.find((user) => user.id === 2));
console.log(users.findIndex((user) => user.id === 2));
console.log(["admin", "editor"].includes("admin"));
```

Output:

```txt
{ id: 2, name: 'Rafi' }
1
true
```

Use:

- `find` when you need the item
- `findIndex` when you need the position
- `includes` when checking primitive membership

## 8. `slice` vs `splice`

`slice` returns a copied portion of an array. `splice` mutates the original
array by removing or inserting items.

```js
const numbers = [1, 2, 3, 4];

const copy = numbers.slice(1, 3);
const removed = numbers.splice(1, 2);

console.log(copy);
console.log(removed);
console.log(numbers);
```

Output:

```txt
[ 2, 3 ]
[ 2, 3 ]
[ 1, 4 ]
```

Interview note:

> `slice` is safe for immutable reads. `splice` changes the original array, so
> I avoid it in React state updates unless I intentionally copy first.

## 9. How Does `sort` Work In JavaScript?

`sort` mutates the original array. Without a compare function, it sorts values
as strings.

```js
const numbers = [10, 2, 30];

console.log([...numbers].sort());
console.log([...numbers].sort((a, b) => a - b));
console.log(numbers);
```

Output:

```txt
[ 10, 2, 30 ]
[ 2, 10, 30 ]
[ 10, 2, 30 ]
```

Use a compare function for numeric sorting:

```js
items.sort((a, b) => a.createdAt - b.createdAt);
```

Safer immutable pattern:

```js
const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
```

## 10. `flat` vs `flatMap`

`flat` removes nesting. `flatMap` maps each item and flattens one level.

```js
const nested = [[1, 2], [3, 4]];
const users = [
  { name: "Asha", tags: ["react", "js"] },
  { name: "Rafi", tags: ["node"] },
];

console.log(nested.flat());
console.log(users.flatMap((user) => user.tags));
```

Output:

```txt
[ 1, 2, 3, 4 ]
[ 'react', 'js', 'node' ]
```

Use `flatMap` when transformation and one-level flattening naturally happen
together.

## 11. `Array.from` vs Spread

Both can convert iterable or array-like values into arrays, but `Array.from`
also accepts a mapping function.

```js
const text = "abc";
const set = new Set([1, 2, 3]);

console.log([...text]);
console.log([...set]);
console.log(Array.from(set, (value) => value * 2));
```

Output:

```txt
[ 'a', 'b', 'c' ]
[ 1, 2, 3 ]
[ 2, 4, 6 ]
```

Use spread for simple iterable conversion. Use `Array.from` when converting
array-like objects or when mapping during conversion.

## 12. Which Array Methods Mutate The Original Array?

Some array methods return new values. Others mutate the original array.

| Mutates | Does not mutate |
| --- | --- |
| `push` | `map` |
| `pop` | `filter` |
| `shift` | `find` |
| `unshift` | `reduce` |
| `splice` | `slice` |
| `sort` | `some` |
| `reverse` | `every` |

React-state-safe pattern:

```js
setItems((items) => [...items, newItem]);
setItems((items) => [...items].sort((a, b) => a.name.localeCompare(b.name)));
```

Strong answer:

> In interviews, I always mention whether an array method mutates. Mutation is
> not always wrong, but accidental mutation causes subtle bugs in React state,
> Redux, memoization, and cached data.

## Sources Used

- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...of>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...in>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort>
