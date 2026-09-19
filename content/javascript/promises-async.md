# JavaScript Promises And Async Interview Guide

Promise and async interview guidance modeled after reference-style docs:
definition, states, static methods, instance methods, benefits over older
patterns, code, output, failure behavior, and interview traps.

## 1. What is a Promise?

A `Promise` represents an asynchronous operation that will eventually complete
with a value or fail with a reason.

It has three practical states:

| State | Meaning | What handlers can run |
| --- | --- | --- |
| `pending` | The operation has started but has not finished yet. | None yet |
| `fulfilled` | The operation completed successfully with a value. | `.then()` / `await` continuation |
| `rejected` | The operation failed with a reason. | `.catch()` / `try...catch` |

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

| Promise capability | Why it helps over callbacks |
| --- | --- |
| Standard return value | Async work can be returned from functions instead of only calling another function later. |
| Composition | Work can be chained, awaited, combined, retried, or raced. |
| Central error path | Rejections can flow through `.catch()` or `try...catch` instead of repeated nested error checks. |

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

| Problem with nested callbacks | Promise improvement |
| --- | --- |
| Deep indentation makes the success path hard to read. | `.then()` chains or `await` keep the main flow flatter. |
| Each level needs its own error branch. | One `.catch()` can handle errors from the chain. |
| Async work is hard to return and compose. | A promise can be returned from a function and reused by callers. |
| Parallel work needs manual coordination. | Helpers such as `Promise.all()` and `Promise.allSettled()` handle coordination. |

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

| `async`/`await` benefit | Why it matters |
| --- | --- |
| Reads top-to-bottom | Sequential async code looks close to synchronous control flow. |
| Uses `try/catch/finally` | Error and cleanup logic can use normal language constructs. |
| Handles branching naturally | `if`, `switch`, loops, and early returns stay easy to follow. |
| Debugs cleanly | Many codebases and debuggers show async functions clearly in stack traces. |

When `.then()` is still fine:

| `.then()` use case | Why it can still be appropriate |
| --- | --- |
| Short one-line transformations | Avoids adding an `async` wrapper for simple mapping. |
| Returning an existing promise | Keeps the parent function from becoming `async` unnecessarily. |
| Functional composition pipelines | Chaining can be expressive when each step is a small transformation. |

Important:

`await` pauses only the current async function. It does not block the JavaScript
main thread.

## 5. `Promise.all` vs sequential `await`

Use sequential `await` when one step depends on the previous result. Use
`Promise.all()` when independent tasks can run at the same time and all are
required.

| Pattern | Use when | Tradeoff |
| --- | --- | --- |
| Sequential `await` | Later work needs the result of earlier work. | Easier dependency flow, but slower for independent tasks. |
| `Promise.all()` | Independent tasks can run at the same time and all are required. | Faster total time, but one rejection rejects the whole group. |

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

| Avoid `Promise.all()` when | Better approach |
| --- | --- |
| The second task needs the first result. | Use sequential `await`. |
| One failure should not fail the whole operation. | Use `Promise.allSettled()`. |
| Too many concurrent requests could overload an API. | Use batching or a concurrency limit. |
| Each item needs independent retry or fallback behavior. | Handle each item separately or wrap each promise. |

## 6. `Promise.all` vs `Promise.allSettled`

Use `Promise.all()` when every task is required. Use `Promise.allSettled()` when
partial success is useful.

| Method | Success behavior | Failure behavior | Best fit |
| --- | --- | --- | --- |
| `Promise.all()` | Resolves when every input fulfills. | Rejects as soon as one input rejects. | Required data where one failure should stop the flow. |
| `Promise.allSettled()` | Resolves after every input settles. | Never rejects because of an input rejection. | Optional or batch work where partial results matter. |

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

| Use case | Why `allSettled()` fits |
| --- | --- |
| Optional dashboard widgets | Failed widgets can show per-widget errors while others render. |
| Batch uploads | The UI can show which files succeeded and which failed. |
| Partial data screens | Available data can render without hiding everything. |
| Analytics calls | One failed analytics event should not hide all results. |

## 7. `Promise.any` vs `Promise.race`

`Promise.any()` returns the first fulfilled value. `Promise.race()` returns the
first settled result, whether success or failure.

| Method | Resolves with | Rejects when | Common use |
| --- | --- | --- | --- |
| `Promise.any()` | First fulfilled value. | Every input rejects. | Fallback providers where any success is enough. |
| `Promise.race()` | First settled result, fulfilled or rejected. | The first settled input is rejected. | Timeouts and first-response flows. |

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

| Step | Pattern | Reason |
| --- | --- | --- |
| `getUser` | Sequential `await` | Later calls need `user.id`. |
| `getOrders` + `getRecommendations` | `Promise.all()` | They are independent after the user is loaded. |
| Return combined data | Required result object | Both orders and recommendations are required for this version. |

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
