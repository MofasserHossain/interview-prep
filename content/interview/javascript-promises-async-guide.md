# JavaScript Promises And Async Interview Guide

Promise and async interview guidance modeled after reference-style docs:
definition, states, static methods, instance methods, benefits over older
patterns, code, output, failure behavior, and interview traps.

## 1. What is a Promise?

A `Promise` represents an asynchronous operation that will eventually complete
with a value or fail with a reason.

It has three practical states:

- `pending`: not finished yet
- `fulfilled`: completed successfully
- `rejected`: failed

```js
const promise = new Promise((resolve) => {
  setTimeout(() => resolve("done"), 100);
});

console.log("start");

promise.then((value) => console.log(value));

console.log("end");
```

Output:

```txt
start
end
done
```

Benefit over traditional callbacks:

Promises give async work a standard return value. That means it can be chained,
returned, awaited, combined, retried, and handled with one error path.

Strong answer:

> A Promise is an object representing future success or failure. It lets async
> code return a value immediately while attaching success and failure handlers
> for later completion.

## 2. Why use promises instead of nested callbacks?

Callbacks work, but nested callbacks make sequencing, error handling, and reuse
harder.

Callback style:

```js
getUser(7, (userError, user) => {
  if (userError) return console.error(userError);

  getOrders(user.id, (orderError, orders) => {
    if (orderError) return console.error(orderError);

    console.log(orders.length);
  });
});
```

Promise style:

```js
getUser(7)
  .then((user) => getOrders(user.id))
  .then((orders) => console.log(orders.length))
  .catch(console.error);
```

Benefits:

- flatter control flow
- one `.catch()` can handle errors from the chain
- the async operation can be returned from a function
- the same promise can be used with `.then()` or `await`
- concurrency helpers such as `Promise.all()` become available

## 3. How do `.then`, `.catch`, and `.finally` work?

`.then()` handles fulfillment, `.catch()` handles rejection, and `.finally()`
runs cleanup after settlement.

```js
Promise.resolve(10)
  .then((value) => value * 2)
  .then((value) => {
    console.log("value:", value);
    throw new Error("failed after value");
  })
  .catch((error) => {
    console.log("error:", error.message);
    return 0;
  })
  .finally(() => {
    console.log("cleanup");
  })
  .then((value) => {
    console.log("recovered:", value);
  });
```

Output:

```txt
value: 20
error: failed after value
cleanup
recovered: 0
```

Interview notes:

- returning a value from `.then()` passes it to the next handler
- throwing inside `.then()` rejects the next promise
- returning from `.catch()` recovers the chain
- `.finally()` is for cleanup, not value transformation

## 4. When should you use `async` and `await`?

`async`/`await` is syntax over promises. Use it when the code has sequential
steps, branching, loops, or normal `try/catch` error handling.

Promise chain:

```js
function loadProfile(userId) {
  return getUser(userId)
    .then((user) => getOrders(user.id))
    .then((orders) => orders.slice(0, 2))
    .catch(() => []);
}
```

`async`/`await`:

```js
async function loadProfile(userId) {
  try {
    const user = await getUser(userId);
    const orders = await getOrders(user.id);
    return orders.slice(0, 2);
  } catch {
    return [];
  }
}
```

Benefits over `.then()` chains:

- reads top-to-bottom
- uses `try/catch/finally`
- easier conditional logic
- easier to debug in many codebases

When `.then()` is still fine:

- short one-line transformations
- returning a promise without making the parent function `async`
- functional composition pipelines

Important:

`await` pauses only the current async function. It does not block the JavaScript
main thread.

## 5. `Promise.all` vs sequential `await`

Use sequential `await` when one step depends on the previous result. Use
`Promise.all()` when independent tasks can run at the same time and all are
required.

Sequential:

```js
async function loadDashboard() {
  const user = await fetchUser();
  const settings = await fetchSettings();
  const notifications = await fetchNotifications();

  return { user, settings, notifications };
}
```

Concurrent:

```js
async function loadDashboard() {
  const [user, settings, notifications] = await Promise.all([
    fetchUser(),
    fetchSettings(),
    fetchNotifications(),
  ]);

  return { user, settings, notifications };
}
```

Example:

```js
const wait = (label, ms) =>
  new Promise((resolve) => setTimeout(() => resolve(label), ms));

async function run() {
  const result = await Promise.all([
    wait("user", 300),
    wait("settings", 100),
    wait("notifications", 200),
  ]);

  console.log(result);
}

run();
```

Output:

```txt
["user", "settings", "notifications"]
```

Even though `settings` finishes first, `Promise.all()` preserves input order.

When not to use `Promise.all()`:

- the second task needs the first result
- one failure should not fail the whole operation
- too many concurrent requests could overload an API
- each item needs independent retry or fallback behavior

## 6. `Promise.all` vs `Promise.allSettled`

Use `Promise.all()` when every task is required. Use `Promise.allSettled()` when
partial success is useful.

```js
const ok = (value) => Promise.resolve(value);
const fail = (reason) => Promise.reject(reason);

Promise.allSettled([ok("profile"), fail("avatar failed")]).then(console.log);
```

Output:

```txt
[
  { status: "fulfilled", value: "profile" },
  { status: "rejected", reason: "avatar failed" }
]
```

Benefit over `Promise.all()`:

`Promise.allSettled()` does not fail fast. It waits until every input has either
fulfilled or rejected.

Use cases:

- loading optional dashboard widgets
- batch upload result summaries
- showing partial data with per-item errors
- analytics calls where one failure should not hide all results

## 7. `Promise.any` vs `Promise.race`

`Promise.any()` returns the first fulfilled value. `Promise.race()` returns the
first settled result, whether success or failure.

```js
const ok = (value, ms) =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const fail = (reason, ms) =>
  new Promise((_, reject) => setTimeout(() => reject(reason), ms));

Promise.any([fail("bad", 10), ok("first success", 20)]).then(console.log);

Promise.race([ok("slow success", 50), fail("fast failure", 10)]).catch(console.log);
```

Output:

```txt
first success
fast failure
```

Use `Promise.any()` for fallback providers where the first success is enough.
Use `Promise.race()` for first-settled behavior, commonly timeouts.

## 8. How do you implement a timeout with `Promise.race`?

```js
function timeout(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Timeout")), ms);
  });
}

async function fetchWithTimeout(requestPromise) {
  return Promise.race([requestPromise, timeout(1000)]);
}
```

Example:

```js
const slowRequest = new Promise((resolve) => {
  setTimeout(() => resolve("data"), 2000);
});

fetchWithTimeout(slowRequest)
  .then(console.log)
  .catch((error) => console.log(error.message));
```

Output:

```txt
Timeout
```

Important:

`Promise.race()` stops waiting, but it does not cancel the original operation.
For `fetch`, use `AbortController` when real cancellation is needed.

## 9. What is the best async pattern in real projects?

Choose the pattern based on dependency and failure behavior.

```js
async function loadPage(userId) {
  const user = await getUser(userId);

  const [orders, recommendations] = await Promise.all([
    getOrders(user.id),
    getRecommendations(user.id),
  ]);

  return { user, orders, recommendations };
}
```

Why this is good:

- `getUser` is sequential because later calls need `user.id`
- `getOrders` and `getRecommendations` are concurrent
- `Promise.all()` is appropriate because both are required

If recommendations are optional:

```js
const [orders, recommendations] = await Promise.allSettled([
  getOrders(user.id),
  getRecommendations(user.id),
]);
```

Strong answer:

> I use sequential `await` for dependent work, `Promise.all()` for required
> independent work, `Promise.allSettled()` for partial success, `Promise.any()`
> for first successful fallback, and `Promise.race()` for first-settled behavior
> such as timeouts.

## Sources Used

- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/any>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function>
