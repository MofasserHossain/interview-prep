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

## 10. What Is The Browser Event Loop Priority Order?

For most frontend interview questions, use this priority model:

1. run the current synchronous JavaScript to completion
2. drain all microtasks
3. let the browser update rendering if needed
4. run the next task
5. drain microtasks created by that task
6. repeat

```viz
type: queues
title: What runs first after the current script
Call stack :: the running script, to completion
Microtasks :: promise handlers, queueMicrotask, await continuations
Rendering :: requestAnimationFrame, style, layout, paint
Tasks :: setTimeout, DOM events, messages, one per turn
```

Important queues:

| Queue or step | Examples | Priority |
| --- | --- | --- |
| Call stack | current function, current script | first |
| Microtask queue | promise handlers, `queueMicrotask` | before next task |
| Rendering opportunity | style, layout, paint | after microtasks, before next task when browser chooses |
| Task queue | timers, DOM events, message events | one task per loop turn |

Example:

```js
console.log("script");

setTimeout(() => console.log("timeout"), 0);

queueMicrotask(() => console.log("microtask"));

requestAnimationFrame(() => console.log("frame"));

console.log("end");
```

Typical order:

```txt
script
end
microtask
frame
timeout
```

Why:

Synchronous code runs first. Microtasks drain before the browser gets a chance
to render. `requestAnimationFrame` callbacks run before a paint. Timer tasks run
in a later task turn.

Interview caveat:

`requestAnimationFrame` depends on the browser's rendering schedule. In hidden
tabs or throttled environments, frame callbacks can be delayed.

## 11. What Does Run-To-Completion Mean?

Run-to-completion means JavaScript does not interrupt a running function to run
another callback in the middle. The current job finishes before the next queued
task or microtask can run.

Example:

```js
let value = 0;

setTimeout(() => {
  console.log(value);
}, 0);

for (let index = 0; index < 3; index += 1) {
  value += 1;
}

console.log("done");
```

Output:

```txt
done
3
```

Why:

The timer callback cannot run during the loop. It waits until the current script
finishes and the event loop reaches a later task.

Why it matters:

- shared local state is easier to reason about inside one synchronous job
- long loops freeze UI because nothing else can run
- timers do not preempt currently running JavaScript

Strong answer:

> JavaScript jobs run to completion. Async callbacks wait until the current
> stack is empty, which is why long synchronous work blocks input, timers,
> promises, and rendering.

## 12. What Are Task Sources In The Browser?

Tasks come from different browser systems, often called task sources. They all
represent work that should run later on the main thread.

Common task sources:

- initial script execution
- `setTimeout` and `setInterval`
- user events such as click, keydown, input, scroll
- network callbacks
- `postMessage`
- `MessageChannel`
- history navigation events

Example:

```js
button.addEventListener("click", () => {
  console.log("click task");
});

setTimeout(() => {
  console.log("timer task");
}, 0);

Promise.resolve().then(() => {
  console.log("microtask");
});
```

If the click and timer are both pending, the browser chooses tasks according to
its event loop rules and task sources. Do not write business logic that depends
on a race between unrelated task sources.

Reliable rule:

Inside a single task, all microtasks created by that task drain before the next
task starts.

## 13. How Does async/await Use The Microtask Queue?

`await` pauses the current async function and schedules the continuation as a
promise microtask when the awaited value is ready.

Example:

```js
async function run() {
  console.log("A");
  await Promise.resolve();
  console.log("B");
}

console.log("C");
run();
console.log("D");
```

Output:

```txt
C
A
D
B
```

Why:

`run()` starts synchronously and logs `A`. At `await`, the rest of `run` becomes
a microtask. The outer script continues and logs `D`. Then the async function
continues and logs `B`.

Interview trap:

Every unnecessary `await` can split execution into another microtask. That can
make ordering more complex and add overhead inside hot code.

## 14. What Is The Difference Between Microtasks And Rendering?

Microtasks run before the browser returns to the event loop and before the
browser gets a normal chance to render. That makes microtasks useful for
finishing small consistency work, but dangerous for heavy work.

Bad example:

```js
button.textContent = "Saving...";

Promise.resolve().then(() => {
  expensiveWork();
});
```

The browser may still not paint `"Saving..."` before `expensiveWork()` because
the microtask runs before rendering.

Better when you want to yield to paint:

```js
button.textContent = "Saving...";

requestAnimationFrame(() => {
  expensiveWork();
});
```

Or yield to a later task:

```js
button.textContent = "Saving...";

setTimeout(() => {
  expensiveWork();
}, 0);
```

Strong answer:

> Microtasks are higher priority than rendering. If I need the browser to paint
> first, I should yield to a frame or a later task instead of putting heavy work
> in a promise callback.

## 15. How Do You Solve A Deep Event Loop Output Question?

Use a table and write down each queue.

Question:

```js
console.log("1");

setTimeout(() => {
  console.log("2");
  Promise.resolve().then(() => console.log("3"));
}, 0);

Promise.resolve().then(() => {
  console.log("4");
  queueMicrotask(() => console.log("5"));
});

queueMicrotask(() => {
  console.log("6");
  setTimeout(() => console.log("7"), 0);
});

console.log("8");
```

Output:

```txt
1
8
4
6
5
2
3
7
```

Walkthrough:

| Step | What runs | Why |
| --- | --- | --- |
| 1 | `1`, `8` | synchronous script runs to completion |
| 2 | `4` | first promise microtask |
| 3 | `6` | queued microtask runs next |
| 4 | `5` | microtask created by `4` drains before tasks |
| 5 | `2` | first timer task |
| 6 | `3` | microtask created inside timer drains immediately after that timer |
| 7 | `7` | timer created by microtask runs in a later task turn |

Interview method:

1. write synchronous output first
2. list microtasks in enqueue order
3. run one task
4. drain new microtasks
5. repeat until all queues are empty

## Sources Used

- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model>
- <https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide>
- <https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide/In_depth>
