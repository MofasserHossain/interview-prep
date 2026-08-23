# JavaScript Scope Hoisting And Closures Interview Guide

Scope interview guidance covering lexical scope, hoisting, temporal dead zone,
closures, module scope, and common loop/callback traps.

## 1. What is lexical scope?

Lexical scope means variable access is based on where code is written, not where
it is called from.

```js
const name = "global";

function outer() {
  const name = "outer";

  function inner() {
    console.log(name);
  }

  return inner;
}

const fn = outer();
fn();
```

Output:

```txt
outer
```

`inner` remembers the scope where it was created.

## 2. What is hoisting?

Hoisting means declarations are processed before code executes, but each
declaration type behaves differently.

`var` is hoisted and initialized as `undefined`.

```js
console.log(name);
var name = "Asha";
```

Output:

```txt
undefined
```

Function declarations are callable before their declaration line.

```js
sayHi();

function sayHi() {
  console.log("Hi");
}
```

Output:

```txt
Hi
```

Best practice:

Use `const` by default, `let` when reassignment is needed, and avoid `var` in
modern application code.

## 3. What is the temporal dead zone?

`let` and `const` declarations are hoisted but cannot be used before
initialization. That unavailable period is the temporal dead zone.

```js
console.log(age);
let age = 20;
```

Output:

```txt
ReferenceError: Cannot access 'age' before initialization
```

Benefit over `var`:

The temporal dead zone catches bugs earlier instead of silently returning
`undefined`.

## 4. What is a closure?

A closure is a function that remembers variables from its outer scope even after
that outer function has finished.

```js
function createCounter() {
  let count = 0;

  return function increment() {
    count += 1;
    return count;
  };
}

const counter = createCounter();

console.log(counter());
console.log(counter());
```

Output:

```txt
1
2
```

Use cases:

- private state
- function factories
- memoization
- event handlers
- module-style encapsulation

## 5. Why does `var` fail in loop callbacks?

`var` is function-scoped, so every callback shares the same variable.

```js
for (var index = 0; index < 3; index++) {
  setTimeout(() => console.log(index), 0);
}
```

Output:

```txt
3
3
3
```

Fix with `let`:

```js
for (let index = 0; index < 3; index++) {
  setTimeout(() => console.log(index), 0);
}
```

Output:

```txt
0
1
2
```

Why `let` works:

`let` creates a new block-scoped binding for each loop iteration.

## 6. Closure vs object state

Closure state is private by default. Object state is easier to inspect and
extend.

Closure:

```js
function createBankAccount(initialBalance) {
  let balance = initialBalance;

  return {
    deposit(amount) {
      balance += amount;
    },
    getBalance() {
      return balance;
    },
  };
}

const account = createBankAccount(100);
account.deposit(50);

console.log(account.balance);
console.log(account.getBalance());
```

Output:

```txt
undefined
150
```

Use closure state for encapsulation. Use object/class state when inspectability,
serialization, or inheritance matters.

## 7. Module scope vs global scope

Variables declared at the top of an ES module are module-scoped, not global.

```js
const token = "secret";

export function getTokenLength() {
  return token.length;
}
```

Benefit over script-style globals:

- avoids global namespace collisions
- makes dependencies explicit through imports
- helps bundlers and static analysis

Interview note:

In browser scripts, top-level `var` can become a global property. In ES modules,
top-level declarations stay inside the module.

## Sources Used

- <https://developer.mozilla.org/en-US/docs/Glossary/Scope>
- <https://developer.mozilla.org/en-US/docs/Glossary/Hoisting>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/let>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/const>
