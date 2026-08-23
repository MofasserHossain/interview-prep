# JavaScript Types Equality And Copying Interview Guide

Type-system interview guidance covering primitives, reference values, equality,
coercion, truthy/falsy behavior, shallow copy, deep copy, optional chaining, and
array method traps.

## 1. What are primitive and reference values?

Primitive values are immutable values such as strings, numbers, booleans,
`null`, `undefined`, `bigint`, and symbols. Objects, arrays, and functions are
reference values.

```js
let a = 1;
let b = a;
b = 2;

console.log(a);

const first = { count: 1 };
const second = first;
second.count = 2;

console.log(first.count);
```

Output:

```txt
1
2
```

Why:

Primitive assignment copies the value. Object assignment copies the reference.

## 2. `==` vs `===`

`===` compares without type coercion. `==` allows coercion.

```js
console.log(0 == false);
console.log(0 === false);
console.log("" == false);
console.log(null == undefined);
console.log(null === undefined);
```

Output:

```txt
true
false
true
true
false
```

Best practice:

Use `===` by default. Use `==` only when you intentionally want JavaScript's
specific coercion rules.

## 3. What are `NaN`, `Object.is`, `0`, and `-0` traps?

```js
console.log(Number.isNaN(NaN));
console.log(NaN === NaN);
console.log(Object.is(NaN, NaN));
console.log(0 === -0);
console.log(Object.is(0, -0));
```

Output:

```txt
true
false
true
true
false
```

Use `Number.isNaN()` to test for `NaN`. Use `Object.is()` when `NaN`, `0`, and
`-0` distinctions matter.

## 4. Truthy/falsy vs nullish values

Falsy values include `false`, `0`, `-0`, `0n`, `""`, `null`, `undefined`, and
`NaN`.

Nullish values are only `null` and `undefined`.

```js
const name = "";
const count = 0;

console.log(name || "Anonymous");
console.log(name ?? "Anonymous");
console.log(count || 10);
console.log(count ?? 10);
```

Output:

```txt
Anonymous

10
0
```

Use `??` when valid values may be `0`, `false`, or `""`.

## 5. Shallow copy vs deep copy

A shallow copy copies top-level properties. Nested objects are still shared.

```js
const original = {
  name: "Asha",
  address: { city: "Dhaka" },
};

const copy = { ...original };
copy.address.city = "Chittagong";

console.log(original.address.city);
```

Output:

```txt
Chittagong
```

Deep copy option for structured data:

```js
const safeCopy = structuredClone(original);
safeCopy.address.city = "Sylhet";

console.log(original.address.city);
console.log(safeCopy.address.city);
```

Output:

```txt
Chittagong
Sylhet
```

Use shallow copies for controlled immutable updates. Use deep copies when nested
objects must be independent.

## 6. Optional chaining vs defensive `&&`

Optional chaining safely reads through missing values.

```js
const user = {
  profile: {
    name: "Asha",
  },
};

console.log(user.profile?.name);
console.log(user.settings?.theme);
```

Output:

```txt
Asha
undefined
```

Benefit over repeated `&&` checks:

```js
const theme = user && user.settings && user.settings.theme;
```

Optional chaining is shorter and avoids repeated property access:

```js
const theme = user.settings?.theme;
```

## 7. `map`, `filter`, `reduce`, and `forEach`

```js
const numbers = [1, 2, 3];

console.log(numbers.map((n) => n * 2));
console.log(numbers.filter((n) => n > 1));
console.log(numbers.reduce((sum, n) => sum + n, 0));
console.log(numbers.forEach((n) => n * 2));
```

Output:

```txt
[2, 4, 6]
[2, 3]
6
undefined
```

Use cases:

- `map`: transform each item
- `filter`: keep matching items
- `reduce`: accumulate into one value
- `forEach`: side effects only

Common trap:

```js
const result = numbers.map((n) => {
  value: n * 2;
});

console.log(result);
```

Output:

```txt
[undefined, undefined, undefined]
```

Fix:

```js
const result = numbers.map((n) => ({ value: n * 2 }));
```

## Sources Used

- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Strict_equality>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Equality>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is>
- <https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing>
