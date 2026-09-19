# JavaScript Execution Context Interview Guide

Execution model guidance covering execution contexts, creation and execution
phases, lexical environments and environment records, the scope chain, the call
stack, `this` binding, closures as retained environments, the global object, and
how multiple scripts and modules share scope.

This guide explains the machinery underneath scope. The JavaScript Scope,
Hoisting & Closures guide covers the same ground at a practical level, and the
JavaScript Event Loop & Runtime guide covers what happens once the stack empties.

## 1. What Is An Execution Context?

An execution context is the internal record the engine creates whenever it starts
running code. It holds everything that code needs to resolve names and evaluate
expressions.

Three kinds exist:

| Kind | Created when |
| --- | --- |
| Global | a script starts running |
| Function | a function is called |
| Module | a module is evaluated |

Each context carries:

```txt
ExecutionContext
├── LexicalEnvironment    let, const, class bindings
├── VariableEnvironment   var and function declarations
├── ThisBinding           the value of `this`
└── Realm                 the global object and built-ins in use
```

```js
const appName = "prep"; // global context

function greet(name) {
  const greeting = "Hi"; // a new function context per call
  return `${greeting} ${name} from ${appName}`;
}

greet("Mofasser");
```

Calling `greet` creates a fresh context with its own environment containing `name`
and `greeting`, linked outward to the global environment where `appName` lives.

Why it matters:

Every scope question — hoisting, closures, `this`, the TDZ — is a question about
what is in a context and when it got there. One model answers all of them.

## 2. What Are The Creation And Execution Phases?

Entering a context happens in two passes. The engine first sets up all bindings,
then runs the code.

```txt
CREATION PHASE
  scan for declarations
  var          -> binding created, initialized to undefined
  function     -> binding created AND fully initialized
  let / const  -> binding created but UNINITIALIZED (the TDZ)
  class        -> binding created but UNINITIALIZED

EXECUTION PHASE
  run statements top to bottom, assigning values
```

```js
console.log(hoistedVar);  // undefined  - created, not yet assigned
console.log(hoistedFn()); // "works"    - fully initialized
console.log(hoistedLet);  // ReferenceError - created but uninitialized

var hoistedVar = 1;
function hoistedFn() { return "works"; }
let hoistedLet = 2;
```

Output:

```txt
undefined
works
ReferenceError: Cannot access 'hoistedLet' before initialization
```

The rule:

Hoisting is not code moving to the top. It is bindings being **created** during the
creation phase. What differs between `var`, `function`, and `let` is only whether
the binding is also **initialized** at that moment.

Interview note:

The error message is the proof. `let` says "cannot access before initialization",
not "is not defined". The binding exists — it simply has no value yet. An undeclared
name gives a different message: `x is not defined`.

Function declarations and expressions differ for exactly this reason:

```js
declared();   // works
expressed();  // TypeError: expressed is not a function

function declared() {}
var expressed = function () {};
```

`expressed` is a `var`, so the binding is initialized to `undefined`, and calling
`undefined` is a `TypeError` rather than a `ReferenceError`.

## 3. What Is A Lexical Environment?

A Lexical Environment is the structure that holds bindings and a pointer to the
enclosing environment.

```txt
LexicalEnvironment
├── EnvironmentRecord   the actual name -> value bindings
└── [[OuterEnv]]        the enclosing environment, or null
```

```js
const a = 1;

function outer() {
  const b = 2;

  function inner() {
    const c = 3;
    console.log(a, b, c);
  }

  inner();
}

outer();
```

The chain of environments created:

```txt
inner env    { c: 3 }  ──[[OuterEnv]]──┐
outer env    { b: 2 }  ──[[OuterEnv]]──┤
global env   { a: 1 }  ──[[OuterEnv]]──> null
```

Output:

```txt
1 2 3
```

Important:

`[[OuterEnv]]` is set from **where the function was written**, not from where it was
called. That single fact is what makes JavaScript lexically scoped, and it is why a
function passed elsewhere still sees its original surroundings.

## 4. What Is An Environment Record?

The environment record is the part that actually stores bindings. The specification
defines several types, and knowing which is in play explains several behaviours.

| Record type | Used for | Storage |
| --- | --- | --- |
| Declarative | function bodies, blocks, `catch` | internal, not observable |
| Object | the global `var` scope, `with` | properties of a real object |
| Function | a function call | declarative, plus `this` |
| Global | the global scope | **both** an object and a declarative record |
| Module | a module body | declarative, plus import bindings |

The global environment record being composite is the interesting one:

```js
var fromVar = 1;
let fromLet = 2;

console.log(globalThis.fromVar); // 1
console.log(globalThis.fromLet); // undefined
```

Output:

```txt
1
undefined
```

Why:

`var` at the top level of a classic script goes into the global record's **object**
half, which is `globalThis` itself, so it becomes a real property. `let` and `const`
go into the **declarative** half, which has no object representation at all.

Interview note:

This is why `let` does not overwrite built-in globals. `var name = "x"` at top level
clashes with `window.name`; `let name = "x"` does not, because it never touches the
object record.

## 5. `VariableEnvironment` vs `LexicalEnvironment`

A context has two environment slots, and the difference between them is exactly
what makes `var` function-scoped and `let` block-scoped.

```txt
VariableEnvironment  var and function declarations   - set once per function
LexicalEnvironment   let, const, class               - REPLACED by each block
```

On entering a function both point at the same record. Entering a block creates a
**new** lexical environment while the variable environment stays put:

```js
function demo() {
  var a = 1;
  let b = 2;

  {
    var c = 3; // goes to the function's VariableEnvironment
    let d = 4; // goes to the block's new LexicalEnvironment
  }

  console.log(a, c); // both visible
  console.log(d);    // ReferenceError
}

demo();
```

Output:

```txt
1 3
ReferenceError: d is not defined
```

What happened:

```txt
function context
├── VariableEnvironment  { a, c }     <- c hoisted out of the block
└── LexicalEnvironment   { b }
        │
        └── block env    { d }        <- discarded when the block ends
```

The rule:

`var` is function-scoped because it is always written to the VariableEnvironment,
which only changes at function boundaries. `let` is block-scoped because each block
gets a fresh LexicalEnvironment.

Interview note:

This also explains `catch`. The error parameter lives in a declarative record
created just for the catch block, which is why it is invisible outside.

## 6. How Is An Identifier Resolved?

The engine walks the `[[OuterEnv]]` chain outward, stopping at the first record that
has the binding.

```js
const value = "global";

function outer() {
  const value = "outer";

  function inner() {
    console.log(value);
  }

  return inner;
}

outer()();
```

Output:

```txt
outer
```

Resolution:

```txt
1. inner's record      -> no `value`
2. outer's record      -> found, "outer"     STOP
3. global record       -> never reached
```

Two consequences follow:

**Shadowing** — an inner binding hides an outer one of the same name, and the outer
one is unreachable from inside.

**Cost** — a deeply nested lookup traverses more records. In practice engines
optimise this heavily, so it is a correctness model rather than a performance
concern.

Important:

The chain is fixed when the function is **created**, not when it is called:

```js
const scope = "module";

function show() {
  console.log(scope);
}

function run() {
  const scope = "function";
  show(); // still logs "module"
}

run();
```

Output:

```txt
module
```

`show` closed over where it was written. The caller's local `scope` is not in its
chain at all.

Interview trap:

Assignment to an undeclared name in sloppy mode walks the chain, finds nothing, and
creates a **global**:

```js
function leak() {
  accidental = 42; // no declaration
}

leak();
console.log(globalThis.accidental); // 42
```

Strict mode and modules make this a `ReferenceError`, which is one concrete reason
modules are safer.

## 7. What Is The Execution Context Stack?

The execution context stack **is** the call stack. Calling a function pushes a
context; returning pops it.

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

The stack at its deepest point, just before `third` returns:

```viz
type: stack
title: Execution context stack
> third() :: running now, logs "third done"
second() :: suspended, waiting on third()
first() :: suspended, waiting on second()
global :: the script's own context
```

The stack over time:

```txt
[ global ]
[ global, first ]
[ global, first, second ]
[ global, first, second, third ]   <- third runs and pops
[ global, first, second ]
[ global, first ]
[ global ]
```

Only the top context runs. Everything beneath it is suspended with its bindings
intact, which is why `first` still has its locals when `second` returns.

Why it matters:

This is the "single-threaded" part of JavaScript. Nothing else can run while a
context is on the stack — not a timer, not a promise callback, not rendering.

## 8. What Causes A Stack Overflow, And How Do You Read A Stack Trace?

Each context consumes stack memory. Enough nested contexts exhausts it.

```js
function recurse(depth = 0) {
  return recurse(depth + 1);
}

recurse();
```

Output:

```txt
RangeError: Maximum call stack size exceeded
```

The limit is engine and platform specific — typically around ten thousand frames —
and is not something to rely on.

The usual real-world causes:

- missing or unreachable recursion base case
- two functions calling each other indirectly
- a getter that reads the property it defines
- a deep recursive walk over a large tree

```js
// Bad example: the getter reads itself.
const user = {
  get name() {
    return this.name;
  },
};
```

Fix for deep traversal — convert recursion to an explicit stack:

```js
function walk(root) {
  const stack = [root];
  const seen = [];

  while (stack.length > 0) {
    const node = stack.pop();
    seen.push(node.value);
    stack.push(...node.children);
  }

  return seen;
}
```

The loop's stack lives on the heap, which is far larger.

Reading a trace — innermost frame first:

```txt
TypeError: Cannot read properties of undefined (reading 'id')
    at formatUser (user.js:12:20)      <- where it threw
    at renderRow (table.js:44:14)      <- who called that
    at renderTable (table.js:60:5)     <- and so on outward
```

Interview note:

`async` functions do not keep their caller on the stack across an `await`, because
the continuation resumes as a microtask. Modern engines reconstruct async stack
traces in DevTools, but the physical stack really is unwound at the `await`.

## 9. How Does `this` Get Bound To A Context?

`this` is part of the context, and for ordinary functions it is decided by **how the
function is called**, not where it is defined.

```js
function show() {
  console.log(this?.label);
}

const a = { label: "a", show };
const b = { label: "b", show };

a.show();     // a
b.show();     // b
show();       // undefined (strict) / globalThis (sloppy)
show.call(a); // a
```

Output:

```txt
a
b
undefined
a
```

The binding rules, in priority order:

```txt
1. new Fn()          -> the newly created object
2. fn.call/apply/bind -> the explicitly provided value
3. obj.fn()          -> obj, the object before the dot
4. plain fn()        -> undefined in strict mode, globalThis in sloppy
```

The classic loss of binding:

```js
const user = {
  name: "Mofasser",
  greet() {
    console.log(this.name);
  },
};

user.greet();               // "Mofasser"

const detached = user.greet;
detached();                 // undefined - no object before the dot
```

Fix:

```js
const bound = user.greet.bind(user);
bound(); // "Mofasser"
```

Interview note:

Passing a method as a callback detaches it in exactly this way —
`setTimeout(user.greet, 0)` loses `this`. The call site is what matters, and a
callback's call site is inside the scheduler.

## 10. Why Do Arrow Functions Have No Own `this`?

An arrow function's environment record is marked as having a lexical `this`
binding. When `this` is referenced, resolution walks the outer chain exactly like
any other identifier.

```js
const timer = {
  seconds: 0,

  startBroken() {
    setInterval(function () {
      this.seconds += 1; // `this` is not `timer`
    }, 1000);
  },

  startWorking() {
    setInterval(() => {
      this.seconds += 1; // `this` resolves outward to `timer`
    }, 1000);
  },
};
```

Arrows also have no own `arguments`, `super`, or `new.target`, and cannot be called
with `new`.

```js
const arrow = () => {};
new arrow();
```

Output:

```txt
TypeError: arrow is not a constructor
```

When not to use an arrow:

As an object method, where you usually want dynamic `this`:

```js
const counter = {
  count: 0,
  increment: () => {
    this.count += 1; // `this` is NOT counter - it is the enclosing scope
  },
};
```

The rule:

Use an arrow when you want `this` from the surrounding code — callbacks, class
fields, array methods. Use a normal function when `this` should come from the call
site — object methods and prototype methods.

## 11. How Do Closures Retain Environments?

A closure is a function together with the environment it was created in. Because the
function holds `[[OuterEnv]]`, that environment cannot be garbage collected while
the function is alive.

```js
function createCounter() {
  let count = 0;

  return {
    increment: () => (count += 1),
    current: () => count,
  };
}

const counter = createCounter();
counter.increment();
counter.increment();
console.log(counter.current());
```

Output:

```txt
2
```

`createCounter` returned long ago and its context was popped from the stack — but
its **environment record** lives on the heap, still referenced by the two returned
functions.

```txt
stack:  [ global ]                    createCounter's context is gone

heap:   { count: 2 }  <──── increment
              ▲
              └──────────── current
```

Both functions share one record, which is why `current()` sees `increment()`'s
changes.

Interview note:

This is also how closures leak. A closure capturing a large object keeps it alive
for as long as the closure exists:

```js
function attach(hugeData) {
  return () => hugeData.id; // the WHOLE object stays reachable
}
```

Fix — capture only what is needed:

```js
function attach(hugeData) {
  const { id } = hugeData;
  return () => id;
}
```

## 12. Why Does The `var` Loop Trap Happen?

Because `var` creates **one** binding in the function's VariableEnvironment, and
every callback closes over that same binding.

```js
for (var i = 0; i < 3; i += 1) {
  setTimeout(() => console.log(i), 0);
}
```

Output:

```txt
3
3
3
```

Walkthrough:

```txt
1. one binding `i` in the enclosing VariableEnvironment
2. three closures created, all with [[OuterEnv]] -> that same record
3. the loop finishes; `i` is now 3
4. the stack empties, the timers run, all three read the one binding
```

With `let` the output changes entirely:

```js
for (let i = 0; i < 3; i += 1) {
  setTimeout(() => console.log(i), 0);
}
```

Output:

```txt
0
1
2
```

Why:

`for (let ...)` gets special treatment in the specification. Before each iteration
the engine creates a **new environment** and copies the current value into it, so
each callback closes over a different binding.

```txt
var:  [ i ] <- closure 1, closure 2, closure 3    one record
let:  [ i=0 ] <- closure 1
      [ i=1 ] <- closure 2                        three records
      [ i=2 ] <- closure 3
```

The pre-`let` workaround created that environment manually with a function call:

```js
for (var i = 0; i < 3; i += 1) {
  ((captured) => setTimeout(() => console.log(captured), 0))(i);
}
```

Output:

```txt
0
1
2
```

Each invocation makes a new function environment record — the same mechanism `let`
now provides automatically.

Interview trap:

The per-iteration binding applies to `let` in a `for` statement specifically. A
`let` declared **inside** the body works for a different reason — the block itself
creates a new environment each pass.

## 13. How Do Multiple `<script>` Tags Share Scope?

Every classic script is evaluated as a separate job, but they all share **one global
environment**.

```html
<script src="/one.js"></script>
<script src="/two.js"></script>
```

```js
// one.js
var appName = "prep";
function helper() { return "shared"; }
let secret = "hidden";
```

```js
// two.js
console.log(appName);        // "prep"
console.log(helper());       // "shared"
console.log(secret);         // "hidden"
console.log(globalThis.appName); // "prep"
console.log(globalThis.secret);  // undefined
```

Output:

```txt
prep
shared
hidden
prep
undefined
```

Both halves of the global environment record are shared across scripts. `var` and
function declarations land on the object half and become `globalThis` properties;
`let` and `const` land on the declarative half and are visible to later scripts but
never appear on `globalThis`.

Important:

Order matters, and it is the source order for blocking and `defer` scripts:

```js
// two.js running BEFORE one.js
console.log(appName); // undefined - the var binding exists, unassigned
console.log(secret);  // ReferenceError - still in the TDZ
```

A `let` in a script that has not yet run is in the temporal dead zone for earlier
scripts, which produces a confusing error rather than `undefined`.

Interview trap:

Two scripts each declaring `let x` at top level throw a `SyntaxError` for redeclaring
a binding in the same environment. Two scripts each declaring `var x` are fine — the
second simply reuses the existing binding. This is a real source of conflicts when
combining third-party scripts.

Study path:

The loading and ordering rules — blocking, `async`, and `defer` — are covered in the
Browser Page Load & Rendering guide.

## 14. How Do Module Scripts Differ?

Each module gets its own **module environment record**. Nothing is shared implicitly.

```html
<script type="module" src="/main.js"></script>
```

```js
// main.js
const secret = "private";
var alsoPrivate = "not global";

console.log(globalThis.alsoPrivate); // undefined
console.log(this);                   // undefined, not globalThis
```

Output:

```txt
undefined
undefined
```

What changes in a module:

| | Classic script | Module |
| --- | --- | --- |
| Top-level scope | global | module-private |
| `var` on `globalThis` | yes | no |
| Strict mode | opt-in | **always** |
| Top-level `this` | `globalThis` | `undefined` |
| Sharing | implicit globals | explicit `import` / `export` |
| Loading | blocking by default | deferred by default |
| `await` at top level | no | yes |

Sharing becomes explicit:

```js
// config.js
export const appName = "prep";

// main.js
import { appName } from "./config.js";
```

Import bindings are **live views**, not copies:

```js
// counter.js
export let count = 0;
export const increment = () => (count += 1);

// main.js
import { count, increment } from "./counter.js";

console.log(count); // 0
increment();
console.log(count); // 1
```

Output:

```txt
0
1
```

The imported `count` tracks the exporting module's binding. Assigning to it from the
importer is a `SyntaxError` — imports are read-only from the outside.

Tradeoff:

Modules give real encapsulation, a dependency graph, and safe parallel loading. The
cost is that implicit sharing between files is gone — which is the point, and
occasionally inconvenient when adapting older scripts.

## 15. What Are Realms?

A realm is a complete, isolated set of built-ins with its own global object. Each
iframe, each worker, and each tab has its own.

```js
const iframe = document.createElement("iframe");
document.body.append(iframe);

const ForeignArray = iframe.contentWindow.Array;
const foreign = new ForeignArray(1, 2, 3);

console.log(foreign instanceof Array);   // false
console.log(Array.isArray(foreign));     // true
console.log(foreign.constructor === Array); // false
```

Output:

```txt
false
true
false
```

Why:

`instanceof` walks the prototype chain looking for `Array.prototype` — **this**
realm's `Array.prototype`. The foreign array inherits from the iframe's, which is a
different object entirely.

`Array.isArray` exists precisely for this: it checks the internal slot rather than
the prototype, so it works across realms.

Where this actually bites:

- passing objects between an iframe and its parent
- `postMessage` between windows or workers
- `instanceof Error` failing for an error from another realm
- testing frameworks that run code in a separate context

Interview note:

An **agent** is the level above: one execution thread with its own stack and job
queues. A worker is a separate agent, which is why it cannot share objects with the
main thread — only structured-cloned copies or a `SharedArrayBuffer`.

## 16. How Do You Answer An Execution Context Question In An Interview?

Interview method:

1. Name the context being created — global, function, or module
2. Walk the **creation phase**: which bindings exist, and which are initialized
3. Walk the **execution phase**: assignments in order
4. For any identifier, trace the `[[OuterEnv]]` chain outward
5. For `this`, look at the **call site**, unless it is an arrow

Worked example:

```js
var x = 1;
let y = 2;

function outer() {
  console.log(x, z);

  var z = 3;

  function inner() {
    console.log(x, y, z);
  }

  return inner;
}

const fn = outer();
fn();
```

Output:

```txt
1 undefined
1 2 3
```

Walkthrough:

| Step | What happens |
| --- | --- |
| 1 | Global creation: `x` → undefined (object record), `y` → TDZ (declarative), `outer` initialized |
| 2 | Global execution: `x = 1`, `y = 2` |
| 3 | `outer()` called: new context; creation makes `z` → undefined, `inner` initialized |
| 4 | `console.log(x, z)` → `x` found in global, `z` exists but unassigned → `1 undefined` |
| 5 | `z = 3` assigned |
| 6 | `inner` returned; `outer`'s context pops but its record survives on the heap |
| 7 | `fn()` → `inner` resolves `x` and `y` in global, `z` in the retained record → `1 2 3` |

Strong answer:

> Entering any context happens in two phases. Creation makes the bindings — `var`
> as `undefined`, functions fully initialized, `let` and `const` uninitialized in
> the TDZ. Execution then assigns values. Every name resolves by walking
> `[[OuterEnv]]` outward from where the function was written, and closures work
> because that environment record outlives the stack frame.

## Sources Used

- <https://tc39.es/ecma262/#sec-execution-contexts>
- <https://tc39.es/ecma262/#sec-lexical-environments>
- <https://tc39.es/ecma262/#sec-environment-records>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules>
