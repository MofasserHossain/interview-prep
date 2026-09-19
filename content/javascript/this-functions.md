# JavaScript This And Functions Interview Guide

Function interview guidance covering `this`, arrow functions, `call`, `apply`,
`bind`, method borrowing, constructors, and common callback mistakes.

## 1. What is `this` in JavaScript?

For normal functions, `this` is decided by how the function is called.

```js
const user = {
  name: "Asha",
  print() {
    console.log(this.name);
  },
};

user.print();
```

Output:

```txt
Asha
```

`user.print()` calls the function with `user` as the receiver.

Interview answer:

> `this` is not based on where a normal function is written. It is usually based
> on the call site: the object before the dot, explicit binding, constructor
> calls, or the default binding rules.

## 2. Why does `this` get lost in callbacks?

When a method is detached from its object, the receiver is lost.

```js
"use strict";

const user = {
  name: "Asha",
  print() {
    console.log(this.name);
  },
};

const printName = user.print;
printName();
```

Output:

```txt
TypeError: Cannot read properties of undefined
```

Fix with `bind`:

```js
const printName = user.print.bind(user);
printName();
```

Output:

```txt
Asha
```

Benefit over manually wrapping every call:

`bind` creates a reusable function with stable `this`, useful for callbacks and
event handlers.

## 3. Arrow functions vs normal functions

Arrow functions do not have their own `this`. They capture `this` from the
surrounding lexical scope.

Bad object method:

```js
const user = {
  name: "Asha",
  print: () => console.log(this.name),
};

user.print();
```

Output in modules:

```txt
undefined
```

Good object method:

```js
const user = {
  name: "Asha",
  print() {
    console.log(this.name);
  },
};
```

Good nested callback:

```js
const user = {
  name: "Asha",
  printLater() {
    setTimeout(() => {
      console.log(this.name);
    }, 0);
  },
};

user.printLater();
```

Output:

```txt
Asha
```

Use normal functions for methods that need dynamic `this`. Use arrow functions
for callbacks that should keep outer `this`.

## 4. `call` vs `apply` vs `bind`

All three control `this`.

```js
function introduce(city, role) {
  return `${this.name} from ${city} works as ${role}`;
}

const person = { name: "Asha" };

console.log(introduce.call(person, "Dhaka", "engineer"));
console.log(introduce.apply(person, ["Dhaka", "engineer"]));

const boundIntroduce = introduce.bind(person, "Dhaka");
console.log(boundIntroduce("engineer"));
```

Output:

```txt
Asha from Dhaka works as engineer
Asha from Dhaka works as engineer
Asha from Dhaka works as engineer
```

Use cases:

- `call`: execute now with comma-separated arguments
- `apply`: execute now with arguments as an array
- `bind`: create a new function for later

Strong answer:

> `call` and `apply` invoke immediately. `bind` returns a new function. `call`
> takes arguments one by one, while `apply` takes an array-like list.

## 5. When is `apply` still useful?

`apply` is useful when arguments already exist as an array-like value.

```js
function maxOfThree(a, b, c) {
  return Math.max(a, b, c);
}

const values = [4, 9, 2];

console.log(maxOfThree.apply(null, values));
console.log(maxOfThree(...values));
```

Output:

```txt
9
9
```

Modern JavaScript often uses spread syntax instead of `apply` for argument
lists. `apply` still matters in interviews because it explains older code and
the difference between argument array passing and direct arguments.

## 6. How does `bind` support partial application?

`bind` can lock `this` and preset arguments.

```js
function multiply(a, b) {
  return a * b;
}

const double = multiply.bind(null, 2);

console.log(double(5));
console.log(double(8));
```

Output:

```txt
10
16
```

Benefit:

This creates specialized functions from general ones without rewriting the
original function.

## 7. What happens with `new` and `this`?

When a function is called with `new`, JavaScript creates a new object and binds
`this` to it.

```js
function User(name) {
  this.name = name;
}

const user = new User("Asha");
console.log(user.name);
```

Output:

```txt
Asha
```

Class syntax is clearer:

```js
class User {
  constructor(name) {
    this.name = name;
  }
}
```

Interview note:

Arrow functions cannot be constructors because they do not have their own
`this` binding or `prototype`.

## Sources Used

- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/call>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/apply>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/bind>
