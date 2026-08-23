# JavaScript Interview Guide

JavaScript interview guidance covering language fundamentals, async behavior, memory, utilities, polyfills, and coding patterns.


## 1. What Is A Closure?

A closure is when a function remembers variables from its outer scope even after the outer function has returned.

```js
function createCounter() {
  let count = 0;

  return function increment() {
    count++;
    return count;
  };
}

const counter = createCounter();
counter(); // 1
counter(); // 2
```

Use cases:

- private state
- factories
- memoization
- event handlers

## 2. What Is Hoisting?

Hoisting is JavaScript behavior where declarations are processed before execution.

```js
console.log(name); // undefined
var name = "Asha";
```

With `let` and `const`, variables are hoisted but unavailable before declaration because of the temporal dead zone.

```js
console.log(age); // ReferenceError
let age = 20;
```

Function declarations are hoisted:

```js
sayHi();

function sayHi() {
  console.log("Hi");
}
```

## 3. Explain The Event Loop.

JavaScript has a call stack and uses the event loop to handle async callbacks.

```js
console.log("A");

setTimeout(() => console.log("B"), 0);

Promise.resolve().then(() => console.log("C"));

console.log("D");
```

Output:

```txt
A
D
C
B
```

Promises go to the microtask queue. Timers go to the macrotask queue. Microtasks run before macrotasks.

## 4. What Is `this` In JavaScript?

For normal functions, `this` depends on how the function is called.

```js
const user = {
  name: "Asha",
  greet() {
    console.log(this.name);
  },
};

user.greet(); // Asha
```

Arrow functions do not have their own `this`; they inherit it from the surrounding scope.

```js
const user = {
  name: "Asha",
  greet: () => console.log(this.name),
};

user.greet(); // usually undefined
```

## 5. Promise vs Async/Await

Promises represent future completion or failure of async work.

```js
fetch("/api/users")
  .then((res) => res.json())
  .then(console.log)
  .catch(console.error);
```

`async/await` is syntax over promises and is usually easier to read.

```js
async function loadUsers() {
  try {
    const res = await fetch("/api/users");
    return await res.json();
  } catch (error) {
    console.error(error);
  }
}
```

`await` pauses the async function, not the whole JavaScript main thread.

## 6. Debounce

Debounce waits until calls stop for a delay.

Use case: search input.

```js
function debounce(fn, delay) {
  let timerId;

  return function (...args) {
    clearTimeout(timerId);

    timerId = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}
```

## 7. Throttle

Throttle runs a function at most once per interval.

Use case: scroll or resize.

```js
function throttle(fn, delay) {
  let lastCall = 0;

  return function (...args) {
    const now = Date.now();

    if (now - lastCall >= delay) {
      lastCall = now;
      fn.apply(this, args);
    }
  };
}
```

## 8. Implement An LRU Cache.

LRU means least recently used. When capacity is full, remove the item that has not been used for the longest time.

```js
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return -1;

    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  put(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    this.cache.set(key, value);

    if (this.cache.size > this.capacity) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }
}
```

`Map` is useful because it preserves insertion order.

## 9. Implement An EventEmitter.

```js
class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, listener) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(listener);
  }

  off(event, listener) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter((fn) => fn !== listener);
  }

  emit(event, ...args) {
    if (!this.events[event]) return;
    this.events[event].forEach((listener) => listener(...args));
  }
}
```

Use cases:

- pub/sub
- custom events
- decoupled communication

## 10. Flatten A Nested Array.

```js
function flattenArray(arr) {
  const result = [];

  for (const item of arr) {
    if (Array.isArray(item)) {
      result.push(...flattenArray(item));
    } else {
      result.push(item);
    }
  }

  return result;
}

flattenArray([1, [2, [3, 4]]]); // [1, 2, 3, 4]
```

## 11. Memoization

Memoization caches expensive function results.

```js
function memoize(fn) {
  const cache = new Map();

  return function (...args) {
    const key = JSON.stringify(args);

    if (cache.has(key)) return cache.get(key);

    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}
```

Use it when:

- computation is expensive
- same inputs repeat
- memory growth is controlled

## 12. Deep Clone With Circular References.

```js
function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== "object") return value;

  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof RegExp) return new RegExp(value.source, value.flags);

  if (seen.has(value)) return seen.get(value);

  const clone = Array.isArray(value) ? [] : {};
  seen.set(value, clone);

  for (const key of Object.keys(value)) {
    clone[key] = deepClone(value[key], seen);
  }

  return clone;
}
```

`WeakMap` prevents infinite recursion for circular objects.

## 13. Promise.all Polyfill

```js
function promiseAll(items) {
  return new Promise((resolve, reject) => {
    if (items.length === 0) {
      resolve([]);
      return;
    }

    const results = [];
    let completed = 0;

    items.forEach((item, index) => {
      Promise.resolve(item)
        .then((value) => {
          results[index] = value;
          completed++;

          if (completed === items.length) {
            resolve(results);
          }
        })
        .catch(reject);
    });
  });
}
```

Rules:

- resolves in input order
- rejects immediately when one promise rejects
- handles non-promise values with `Promise.resolve`

---

