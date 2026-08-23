# JavaScript Event Loop And Runtime Interview Guide

Event loop interview guidance covering the call stack, execution contexts, Web
APIs, task queue, microtask queue, rendering, promise timing, and common output
questions.

## 1. What is the JavaScript runtime model?

JavaScript execution is single-threaded per agent: one piece of JavaScript runs
on the call stack at a time. The browser or runtime provides surrounding systems
for async work.

Core pieces:

- call stack: currently executing function frames
- heap: memory for objects
- Web APIs or runtime APIs: timers, DOM events, fetch, I/O
- task queue: callbacks from timers, events, messages
- microtask queue: promise reactions and `queueMicrotask`
- event loop: coordinates when queued work enters the stack

```js
console.log("A");
console.log("B");
```

Output:

```txt
A
B
```

JavaScript executes each stack frame to completion before the next queued job
runs.

## 2. What is the call stack?

The call stack tracks active function calls.

```js
function first() {
  second();
  console.log("first done");
}

function second() {
  third();
  console.log("second done");
}

function third() {
  console.log("third done");
}

first();
```

Output:

```txt
third done
second done
first done
```

Why:

1. `first` enters the stack.
2. `second` enters above `first`.
3. `third` enters above `second`.
4. `third` finishes first, then `second`, then `first`.

Interview note:

Long synchronous work blocks the stack, so user input, rendering, timers, and
promise callbacks must wait.

## 3. What are Web APIs in the event loop model?

Web APIs are host-provided browser features. JavaScript asks the browser to do
work, and the browser schedules callbacks later.

```js
console.log("start");

setTimeout(() => {
  console.log("timer");
}, 0);

console.log("end");
```

Output:

```txt
start
end
timer
```

`setTimeout` does not run the callback immediately. It asks the runtime to place
the callback into a queue after the timer is ready and the stack is clear.

Examples of host APIs:

- timers
- DOM events
- fetch/networking
- storage events
- workers
- Node.js file system and networking APIs

## 4. What is the task queue?

The task queue stores callbacks such as timers, events, and message callbacks.
One task is processed when the stack is empty and after microtasks have been
drained.

```js
setTimeout(() => console.log("timer 1"), 0);
setTimeout(() => console.log("timer 2"), 0);

console.log("sync");
```

Output:

```txt
sync
timer 1
timer 2
```

Benefits of task scheduling:

- keeps browser UI responsive
- lets slow I/O finish outside the stack
- defers callbacks until synchronous code completes

Interview note:

People often call it the macrotask queue, but browser specs commonly describe
these as tasks.

## 5. What is the microtask queue?

Microtasks run after the current stack completes and before the next task.
Promise `.then`, `.catch`, `.finally`, and `queueMicrotask` use the microtask
queue.

```js
console.log("A");

setTimeout(() => console.log("task"), 0);

Promise.resolve().then(() => console.log("promise"));

queueMicrotask(() => console.log("microtask"));

console.log("B");
```

Output:

```txt
A
B
promise
microtask
task
```

Why:

1. synchronous code runs first
2. microtasks drain next
3. the next task runs after microtasks

## 6. Why do promises run before `setTimeout`?

Promise handlers are microtasks. Timer callbacks are tasks. Microtasks have
higher priority after the current stack finishes.

```js
setTimeout(() => console.log("timeout"), 0);

Promise.resolve().then(() => console.log("promise"));

console.log("sync");
```

Output:

```txt
sync
promise
timeout
```

This is why promises often appear to "jump ahead" of timers.

Interview answer:

> Both callbacks are async, but they are queued differently. Promise callbacks
> enter the microtask queue, which drains before the runtime takes the next task
> such as a timer callback.

## 7. What happens when microtasks create more microtasks?

The runtime keeps draining microtasks until the microtask queue is empty.

```js
Promise.resolve().then(() => {
  console.log("microtask 1");

  Promise.resolve().then(() => {
    console.log("microtask 2");
  });
});

setTimeout(() => console.log("task"), 0);
```

Output:

```txt
microtask 1
microtask 2
task
```

Risk:

If code keeps adding microtasks forever, the task queue and rendering can be
starved.

## 8. Where does rendering fit in?

In browsers, rendering usually happens between event loop turns after tasks and
microtasks have completed.

```js
button.addEventListener("click", () => {
  button.textContent = "Saving...";

  while (Date.now() < performance.now() + 1000) {
    // Bad example: blocks the main thread.
  }
});
```

Problem:

The browser cannot paint the `"Saving..."` text while JavaScript is blocking the
main thread.

Better approach:

```js
button.addEventListener("click", async () => {
  button.textContent = "Saving...";

  await new Promise((resolve) => setTimeout(resolve, 0));

  expensiveWork();
});
```

Why this helps:

Yielding gives the browser a chance to handle queued work and render before the
expensive work begins.

## 9. How do you solve event loop output questions?

Use this order:

1. run all synchronous code
2. drain microtasks
3. run one task
4. drain microtasks created by that task
5. repeat

```js
console.log("1");

setTimeout(() => {
  console.log("2");
  Promise.resolve().then(() => console.log("3"));
}, 0);

Promise.resolve().then(() => {
  console.log("4");
  setTimeout(() => console.log("5"), 0);
});

console.log("6");
```

Output:

```txt
1
6
4
2
3
5
```

Explanation:

`1` and `6` are synchronous. `4` is the first microtask. The first timer logs
`2`, then creates a microtask that logs `3`. The timer created inside the
microtask logs `5` later.

## Sources Used

- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model>
- <https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide>
- <https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide/In_depth>
