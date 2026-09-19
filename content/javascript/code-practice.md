# JavaScript Code Practice Interview Guide

Predict-the-output drills covering hoisting, closures, `this`, coercion,
references, array method traps, async ordering, prototypes, and destructuring
defaults. Every output below was verified by running the snippet.

Use this guide actively: read the code, commit to an answer, then check. The
walkthrough matters more than the result — the goal is a rule you can reuse, not a
memorised answer.

For implement-it exercises such as debounce, throttle, LRU cache, and a
`Promise.all` polyfill, see the JavaScript Language Fundamentals guide.

## 1. Hoisting: `var`, `function`, And `let`

```js
console.log(a);
console.log(b);
console.log(c);

var a = 1;
function b() {}
let c = 3;
```

Output:

```txt
undefined
[Function: b]
ReferenceError: Cannot access 'c' before initialization
```

Why:

All three bindings are created before any line runs. They differ in whether they are
also **initialized**:

- `var a` → initialized to `undefined`
- `function b` → fully initialized, so it is callable
- `let c` → created but uninitialized, which is the temporal dead zone

The rule:

Hoisting creates bindings, it does not move code. `var` gives `undefined`, `let` and
`const` throw, and functions are ready immediately.

## 2. Function Declaration vs Function Expression

```js
declared();
expressed();

function declared() {
  console.log("declared works");
}

var expressed = function () {
  console.log("expressed works");
};
```

Output:

```txt
declared works
TypeError: expressed is not a function
```

Why:

`expressed` is a `var`, so its binding exists and holds `undefined` at call time.
Calling `undefined` is a `TypeError`, not a `ReferenceError` — the variable is
declared, it just is not a function yet.

The rule:

The error type tells you which problem you have. `ReferenceError` means no usable
binding; `TypeError` means the binding exists and holds the wrong thing.

## 3. Closures In A Loop

```js
const withVar = [];
for (var i = 0; i < 3; i += 1) {
  withVar.push(() => i);
}

const withLet = [];
for (let j = 0; j < 3; j += 1) {
  withLet.push(() => j);
}

console.log(withVar.map((fn) => fn()));
console.log(withLet.map((fn) => fn()));
```

Output:

```txt
[ 3, 3, 3 ]
[ 0, 1, 2 ]
```

Why:

`var` creates **one** binding for the whole function, so all three closures share it
and read its final value. `for (let ...)` creates a fresh binding per iteration and
copies the current value in, so each closure captures a different one.

The rule:

Ask how many bindings exist, not how many closures. Shared binding means shared
value.

## 4. `this` When A Method Is Detached

```js
const user = {
  name: "Mofasser",
  regular() {
    return this?.name;
  },
};

console.log(user.regular());

const detached = user.regular;
console.log(detached());
```

Output:

```txt
Mofasser
undefined
```

Why:

`this` for an ordinary function is decided by the call site. `user.regular()` has
`user` before the dot. `detached()` has nothing before the dot, so in module or
strict code `this` is `undefined`.

The rule:

Look at what is immediately left of the parentheses at the call site. Assigning a
method to a variable, or passing it as a callback, throws that away.

## 5. `this` In A Nested Function vs An Arrow

```js
const user = {
  name: "Mofasser",
  nested() {
    function inner() {
      return this?.name;
    }

    const innerArrow = () => this?.name;

    return [inner(), innerArrow()];
  },
};

console.log(user.nested());
```

Output:

```txt
[ undefined, 'Mofasser' ]
```

Why:

`inner` is called as a plain function, so it gets its own `this`, which is
`undefined`. `innerArrow` has no `this` of its own, so the name resolves outward to
`nested`'s `this`, which is `user`.

The rule:

An arrow inherits `this` from where it was written. A normal function receives
`this` from how it was called.

## 6. Coercion With `+`

```js
console.log([] + {});
console.log("5" - 2);
console.log("5" + 2);
console.log(1 + "2" + 3);
console.log(1 + 2 + "3");
```

Output:

```txt
[object Object]
3
52
123
33
```

Why:

`+` is overloaded. If either operand is a string, it concatenates; otherwise it adds
numerically. `-` has no string meaning, so it always converts to numbers.

`1 + 2 + "3"` evaluates left to right: `1 + 2` is `3`, then `3 + "3"` is `"33"`.

The rule:

`+` with any string concatenates. Every other arithmetic operator coerces to number.
Evaluate left to right and the surprises disappear.

## 7. Equality Traps With `null`

```js
console.log(null == undefined);
console.log(null === undefined);
console.log(null == 0);
console.log(null >= 0);
```

Output:

```txt
true
false
false
true
```

Why:

`==` treats `null` and `undefined` as equal to each other and to nothing else — so
`null == 0` is `false`. But relational operators such as `>=` use numeric conversion,
where `null` becomes `0`, so `null >= 0` is `true`.

The rule:

`null` is special-cased for `==` but not for `<`, `>`, `<=`, or `>=`. This
inconsistency is in the specification; use `===` and explicit checks.

## 8. Falsy Comparisons With Arrays

```js
console.log([] == false);
console.log([0] == false);
console.log([1] == true);
console.log(Boolean([]));
```

Output:

```txt
true
true
true
true
```

Why:

`==` with a boolean converts the boolean to a number first, then converts the array
via its primitive value: `[]` becomes `""` becomes `0`, and `false` becomes `0`.

Meanwhile `Boolean([])` is `true`, because **every object is truthy**.

The rule:

An empty array is truthy on its own but equals `false` under `==`. This is the
clearest argument for never using `==`.

## 9. `NaN` Behaviour

```js
console.log(typeof NaN);
console.log(NaN === NaN);
console.log(Object.is(NaN, NaN));
console.log([NaN].includes(NaN));
console.log([NaN].indexOf(NaN));
```

Output:

```txt
number
false
true
true
-1
```

Why:

`NaN` is the only value not equal to itself. `Object.is` and `Array.prototype.includes`
use SameValueZero, which treats `NaN` as matching itself. `indexOf` uses strict
equality, so it never finds it.

The rule:

Test with `Number.isNaN(x)`. Never with `x === NaN`.

## 10. Floating Point

```js
console.log(0.1 + 0.2);
console.log(0.1 + 0.2 === 0.3);
```

Output:

```txt
0.30000000000000004
false
```

Why:

Binary floating point cannot represent `0.1` or `0.2` exactly, so the sum carries a
tiny error.

The rule:

Compare with a tolerance, or use integers for money — store cents, not dollars.

```js
const equal = Math.abs(0.1 + 0.2 - 0.3) < Number.EPSILON;
console.log(equal);
```

Output:

```txt
true
```

## 11. References And Mutation

```js
let a = 10;
let b = a;
b = 20;
console.log(a, b);

const objectA = { value: 10 };
const objectB = objectA;
objectB.value = 20;
console.log(objectA.value);
```

Output:

```txt
10 20
20
```

Why:

Primitives are copied by value. Objects are copied by reference, so both names point
at the same object.

The rule:

Assigning an object copies the reference, not the object. `const` prevents
reassigning the binding, never mutating the contents.

## 12. What Functions Can Change About Their Arguments

```js
function mutate(obj, arr, prim) {
  obj.a = 2;
  arr.push(4);
  prim = 99;
}

const object = { a: 1 };
const array = [1, 2, 3];
let primitive = 1;

mutate(object, array, primitive);
console.log(object, array, primitive);
```

Output:

```txt
{ a: 2 } [ 1, 2, 3, 4 ] 1
```

Why:

The reference is passed by value. Mutating through it is visible to the caller;
reassigning the parameter only rebinds the local name.

```js
function reassign(obj) {
  obj = { a: 99 }; // rebinds locally, caller unaffected
}
```

The rule:

JavaScript is pass-by-value everywhere — but for objects, the value being passed is
a reference. Mutation escapes; reassignment does not.

## 13. Shallow Copy With Spread

```js
const original = { name: "a", nested: { city: "x" } };
const copy = { ...original };

copy.name = "b";
copy.nested.city = "y";

console.log(original.name, original.nested.city);
```

Output:

```txt
a y
```

Why:

Spread copies one level. `name` is a new primitive slot, so changing it is safe.
`nested` is copied as a **reference**, so both objects point at the same inner object.

Fix:

```js
const deep = structuredClone(original);
deep.nested.city = "z";
console.log(original.nested.city);
```

Output:

```txt
y
```

The rule:

Spread and `Object.assign` are shallow. Use `structuredClone` for a real deep copy —
it handles cycles, `Map`, `Set`, and `Date`, unlike the `JSON.parse(JSON.stringify())`
trick, which loses functions, `undefined`, and `Date` types.

## 14. `map` With A Block Body

```js
const numbers = [1, 2, 3];

console.log(numbers.map((x) => { x * 2; }));
console.log(numbers.map((x) => x * 2));
console.log(numbers.forEach((x) => x * 2));
```

Output:

```txt
[ undefined, undefined, undefined ]
[ 2, 4, 6 ]
undefined
```

Why:

`=> { ... }` is a function **body**, not an object literal or an implicit return.
Without `return`, the function returns `undefined`. And `forEach` always returns
`undefined` by design — it is for side effects.

The rule:

Braces mean you must `return`. Parentheses or a bare expression return implicitly. Use
`map` to transform, `forEach` only to act.

## 15. `sort` Is Lexicographic And Mutating

```js
const numbers = [10, 9, 1, 25];

console.log(numbers.sort());
console.log(numbers);
console.log([10, 9, 1, 25].sort((a, b) => a - b));
```

Output:

```txt
[ 1, 10, 25, 9 ]
[ 1, 10, 25, 9 ]
[ 1, 9, 10, 25 ]
```

Why:

The default comparator converts every element to a string and compares code units, so
`"10"` sorts before `"9"`. `sort` also mutates the array in place and returns the same
reference.

The rule:

Always pass a comparator for numbers. Use `toSorted()` when you need a sorted copy and
want to leave the original alone.

## 16. `delete` Leaves A Hole

```js
const withDelete = [10, 20, 30];
delete withDelete[1];
console.log(withDelete, withDelete.length);
console.log(withDelete.map((x) => x * 2));

const withSplice = [10, 20, 30];
console.log(withSplice.splice(1, 1), withSplice);
```

Output:

```txt
[ 10, <1 empty item>, 30 ] 3
[ 20, <1 empty item>, 60 ]
[ 20 ] [ 10, 30 ]
```

Why:

`delete` removes the property but leaves the index, so `length` stays 3 and a sparse
hole remains. `map` **skips** holes without calling the callback, but preserves them in
the result. `splice` genuinely removes the element, shifts the rest, and returns what it
removed.

The rule:

Never `delete` from an array. Use `splice` to mutate, or `filter`/`toSpliced` to get a
new array.

## 17. `slice` vs `splice`

```js
const a = [1, 2, 3, 4];
console.log(a.slice(1, 3), a);

const b = [1, 2, 3, 4];
console.log(b.splice(1, 2), b);
```

Output:

```txt
[ 2, 3 ] [ 1, 2, 3, 4 ]
[ 2, 3 ] [ 1, 4 ]
```

Why:

`slice(start, end)` copies a range and leaves the original untouched. `splice(start,
count)` removes in place and returns what it removed.

The rule:

`slice` takes an **end index** and does not mutate. `splice` takes a **count** and does
mutate. The returned values look identical here, which is what makes this a good trap.

## 18. Sparse Arrays From `Array(n)`

```js
console.log(Array(3));
console.log(Array(3).map(() => 1));
console.log([...Array(3)].map(() => 1));
console.log(Array.from({ length: 3 }, () => 1));
```

Output:

```txt
[ <3 empty items> ]
[ <3 empty items> ]
[ 1, 1, 1 ]
[ 1, 1, 1 ]
```

Why:

`Array(3)` sets `length` without creating any indices. `map` skips holes, so it does
nothing. Spreading iterates and materialises each slot as `undefined`, which `map` then
visits.

The rule:

Use `Array.from({ length: n }, fn)` to build a filled array. `Array(n).map` silently
does nothing.

## 19. Destructuring Defaults: `undefined` vs `null`

```js
const { x = "default" } = { x: undefined };
const { y = "default" } = { y: null };
console.log(x, y);

const [a = 1, b = 2] = [undefined, null];
console.log(a, b);
```

Output:

```txt
default null
1 null
```

Why:

A default applies only when the value is `undefined`. `null` is a real value, so it is
kept.

The rule:

Defaults trigger on `undefined` only. This matches `??` and is the reason an API
returning `null` bypasses your fallback.

## 20. `||` vs `??`

```js
console.log(0 || 100);
console.log(0 ?? 100);
console.log("" || "fallback");
console.log("" ?? "fallback");
console.log(null ?? "fallback");
```

Output:

```txt
100
0
fallback

fallback
```

Why:

`||` falls back on any falsy value — `0`, `""`, `false`, `NaN`. `??` falls back only on
`null` and `undefined`.

The rule:

Use `??` for values where `0` or `""` are legitimate — counts, prices, search terms. The
fourth line prints an empty string, which is exactly the point.

## 21. Async Ordering: Sync, Microtask, Task

```js
console.log("1 sync");

setTimeout(() => console.log("2 timeout"), 0);

Promise.resolve().then(() => console.log("3 micro"));

queueMicrotask(() => console.log("4 queueMicrotask"));

console.log("5 sync");
```

Output:

```txt
1 sync
5 sync
3 micro
4 queueMicrotask
2 timeout
```

Why:

All synchronous code runs first. Then the microtask queue drains completely, in
enqueue order. Only then does the next task — the timer — run.

The rule:

Synchronous, then all microtasks, then one task. Promises are microtasks; timers are
tasks.

## 22. `await` Interleaved With A Promise Chain

This is the hardest ordering drill, and a common senior-level question.

```js
async function run() {
  console.log("A");
  await null;
  console.log("B");
  await null;
  console.log("C");
}

console.log("start");
run();
Promise.resolve()
  .then(() => console.log("P1"))
  .then(() => console.log("P2"));
console.log("end");
```

Output:

```txt
start
A
end
B
P1
C
P2
```

Walkthrough:

| Tick | What runs | Why |
| --- | --- | --- |
| sync | `start` | first statement |
| sync | `A` | `run()` executes synchronously up to the first `await` |
| sync | `end` | `run` suspended; the chain is only registered |
| micro 1 | `B` | the first `await` continuation was queued first |
| micro 1 | `P1` | queued second, after `run`'s continuation |
| micro 2 | `C` | queued when `B`'s `await` resolved |
| micro 2 | `P2` | queued when `P1` returned |

The rule:

An `async` function runs synchronously until its first `await`. Each `await` and each
`.then` queues one microtask, and they interleave in the order they were queued.

## 23. Prototype Chain And Shadowing

```js
function Animal(name) {
  this.name = name;
}

Animal.prototype.speak = function () {
  return `${this.name} speaks`;
};

const dog = new Animal("Rex");

console.log(dog.speak());
console.log(Object.hasOwn(dog, "speak"));
console.log("speak" in dog);

dog.speak = () => "shadowed";
console.log(dog.speak());
console.log(Animal.prototype.speak.call(dog));
```

Output:

```txt
Rex speaks
false
true
shadowed
Rex speaks
```

Why:

`speak` lives on the prototype, not the instance — so `hasOwn` is `false` while `in` is
`true`, because `in` searches the whole chain. Assigning to `dog.speak` creates an **own**
property that shadows the prototype's without modifying it.

The rule:

Property lookup walks the prototype chain; assignment always writes an own property. Use
`Object.hasOwn` to distinguish the two.

## 24. How To Work Through Any Output Question

Interview method:

1. **Separate the phases.** Write down what is synchronous, what is a microtask, and
   what is a task, before predicting anything.
2. **Count bindings, not closures.** For loops and closures, ask how many variables
   actually exist.
3. **Find the call site.** For `this`, look immediately left of the parentheses — unless
   it is an arrow, then look at where it was written.
4. **Check the operator.** For coercion, `+` with a string concatenates; everything else
   converts to number.
5. **Ask reference or value.** For mutation questions, ask whether the code mutated
   through a reference or reassigned a binding.
6. **Say the rule out loud.** If you cannot state the general rule, you have memorised
   the answer rather than learned it.

Strong answer:

> I work these out rather than recall them. I split the code into synchronous,
> microtask, and task phases, then resolve each identifier by where it was written and
> each `this` by how it was called. The output falls out of those two questions.

## Sources Used

- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Equality>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing>
- <https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model>
