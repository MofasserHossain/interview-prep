# JavaScript Execution Context Interview Guide

Execution model guidance covering execution contexts, creation and execution
phases, lexical environments and environment records, the scope chain, the call
stack, `this` binding, closures as retained environments, the global object, and
how multiple scripts and modules share scope.

This guide explains the machinery underneath scope. The JavaScript Scope,
Hoisting & Closures guide covers the same ground at a practical level, and the
JavaScript Event Loop & Runtime guide covers what happens once the stack empties.

Questions 16–18 run whole programs step by step through the global and function
contexts, ending with how a returned function keeps its values. Their outputs and
engine scope dumps come from running the code in Node 24 and Chrome 153.

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

Each context carries (current specification):

```txt
ExecutionContext
├── LexicalEnvironment    current scope: let, const, class
├── VariableEnvironment   var and function declarations
├── PrivateEnvironment    #private names of the class
├── Function              the function being run, or null
├── ScriptOrModule        the script or module it came from
└── Realm                 the global object and built-ins
```

`this` is not on the list. Since ES2015 it lives in the environment records:
each function's record stores its `this` value, and the global record stores
`globalThis`. Looking up `this` walks outward to the nearest record that has one,
which is how an arrow function, whose record has none, sees the surrounding
`this` (question 10).

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

Interview note:

Older books and many courses describe this with ES3 terms. Each edition since
has reshaped the model, so map old terms before answering:

```txt
ES3 (1999)   variable object, activation object with
             `arguments`, scope chain, `this` on the context
ES5 (2009)   Lexical Environment = record + outer link;
             `this` still on the context as ThisBinding
ES2015       `this` moves into function records; let,
             const, class and the TDZ; a function's
             [[Scope]] slot becomes [[Environment]]
ES2021       the record itself carries [[OuterEnv]]; no
             separate Lexical Environment object
ES2022       PrivateEnvironment for #private class names
```

The old model still traces simple `var` and function code correctly, because the
steps are the same. It has no place for block records, the TDZ, or an arrow
function's `this`.

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

"Lexical environment" is the everyday name for a scope: the bindings visible at
one point in the code, plus a link to the enclosing scope. In the current
specification that is one structure, the environment record:

```txt
EnvironmentRecord
├── bindings       name -> value
└── [[OuterEnv]]   the enclosing record, or null
```

ES5 through ES2020 wrapped the record in a separate "Lexical Environment" object
that held the outer link. ES2021 merged the two, and the name survives as the
execution context's `LexicalEnvironment` slot, which points at the current
record.

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

The chain of records created:

```txt
inner record   { c: 3 }  ─[[OuterEnv]]─> outer record
outer record   { b: 2 }  ─[[OuterEnv]]─> global record
global record  { a: 1 }  ─[[OuterEnv]]─> null
```

Output:

```txt
1 2 3
```

Important:

`[[OuterEnv]]` is set from **where the function was written**, not from where it was
called. That single fact is what makes JavaScript lexically scoped, and it is why a
function passed elsewhere still sees its original surroundings. A call copies the
link from the function's `[[Environment]]` slot, which was filled in when the
function was created (question 16).

## 4. What Is An Environment Record?

The environment record is the structure that stores bindings. The specification
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
global :: the script's own context
first() :: suspended, waiting on second()
second() :: suspended, waiting on third()
> third() :: running now, logs "third done"
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

Each call stores its `this` in the function's record (question 1), and for ordinary
functions it is decided by **how the function is called**, not where it is defined.

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
function keeps that environment in its `[[Environment]]` slot, the environment
cannot be garbage collected while the function is alive.

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

## 16. How Does One Program Move Through Global And Function Contexts?

Questions 1–12 each explain one piece. Running one program from its first line to
its last shows how the pieces connect: the two phases, the record each context
builds, `this`, `arguments`, the call stack, the environment chain, and the TDZ.

Many courses draw this with ES3 (1999) names, which later editions replaced
(question 1 has the timeline). They map onto the current terms like this:

| Course diagram | Current specification |
| --- | --- |
| Loading / creation phase | creation phase |
| Variable Object (VO) | environment record |
| `arguments` and `this` boxes | entries in the function's record |
| Scope Chain | the `[[OuterEnv]]` links |
| Closure Scope | a record a live function points at |
| `0x001` beside a name | a reference to a heap object |

The snapshots below use the current model. `this` and `arguments` sit inside the
record, because that is where the specification keeps them: `arguments` is an
ordinary binding, and `this` is a field the record carries. Records are named
after the function whose call created them.

Mental model:

```txt
CREATE a function   fn.[[Environment]] = the current record
CALL a function     push a context with a new record
                    record.[[OuterEnv]] = fn.[[Environment]]
                    creation phase fills the record
                    execution phase runs the body
RETURN              pop the context; the record is collected
                    unless a function still points at it
```

Two internal slots do all the linking. A function's `[[Environment]]` stores the
record the function was created in, and a record's `[[OuterEnv]]` points at the
next record out. A call copies the first into the second. Every rule in
questions 1–12 is one of those three lines seen up close.

Line numbers below refer to this listing:

```js
var a = 1;
function one() {
  console.log(a);

  function two() {
    console.log(b);

    var b = 2;

    function three(d) {
      console.log(c + d);
      let c = 3;
    }

    three(4);
  }

  two();
}

one();
```

Output:

```txt
1
undefined
ReferenceError: Cannot access 'c' before initialization
```

**Step 1: global creation phase.** Before line 1 runs, the engine scans the
script's top level and builds the global record:

```txt
stack  [ global ]
record this       window          [[GlobalThisValue]]
       a          undefined       var: created as undefined
       one        fn one          declaration: created in full
chain  global -> null
```

`one` is already a complete function object, and it has stored the record it
was created in: `one.[[Environment]]` is the global record.

**Step 2: global execution phase.** Line 1 assigns `a = 1`. Lines 2–19 are a
declaration that step 1 already handled, so nothing runs there. Line 21 calls
`one()`.

**Step 3: `one()` creation phase.** The call pushes a new context and builds its
record before any of `one`'s code runs:

```txt
stack  [ global, one ]
record this       window          plain call, sloppy mode
       arguments  {}              nothing passed
       two        fn two          [[Environment]]: this record
chain  one -> global -> null
```

The new record's outer link is copied from `one.[[Environment]]`, which is why
the chain continues to the global record.

**Step 4: `one` executes.** Line 3 looks up `a`: not in `one`'s record, found in
the global record, so it prints `1`. Line 18 calls `two()`.

**Step 5: `two()` creation phase.**

```txt
stack  [ global, one, two ]
record this       window
       arguments  {}
       b          undefined
       three      fn three        [[Environment]]: this record
chain  two -> one -> global -> null
```

**Step 6: `two` executes.** Line 6 finds `b` in `two`'s record, but line 8 has
not run yet, so it prints `undefined`. Line 8 assigns `b = 2`. Line 15 calls `three(4)`.

**Step 7: `three(4)` creation phase.**

```txt
stack  [ global, one, two, three ]
record this       window
       arguments  { 0: 4 }
       d          4               parameter: gets its argument
       c          <uninitialized> let: in the TDZ
chain  three -> two -> one -> global -> null
```

A parameter is the one binding that gets a real value during creation: the
argument passed in. `arguments` is keyed by position, `{ 0: 4 }`, not by
parameter name.

**Step 8: `three` executes.** Line 11 reads `c`. The lookup stops at `three`'s
record, because `c` exists there, but it is still uninitialized, so the engine
throws.
Nothing catches the error, so `three`, `two`, and `one` are popped in turn and
the script stops.

```viz
type: stack
title: Stack when line 11 throws
global :: paused at line 21, a = 1
one() :: paused at line 18
two() :: paused at line 15, b = 2
> three(4) :: d = 4, c uninitialized, throws here
```

The error's stack trace is that stack, innermost first (Chrome):

```txt
ReferenceError: Cannot access 'c' before initialization
    at three (nested.js:11:19)
    at two (nested.js:15:5)
    at one (nested.js:18:3)
    at nested.js:21:1
```

Fix:

Swap lines 11 and 12 so `c` is initialized before it is read:

```js
function three(d) {
  let c = 3;
  console.log(c + d);
}
```

Output:

```txt
1
undefined
7
```

With the fix, the program unwinds normally:

```txt
line 12 logs 7   three returns   pop three, record collected
end of two       two returns     pop two, record collected
end of one       one returns     pop one, record collected
end of script    [ global ]      global record stays
```

Nothing outside those records points at them, so they are garbage. `two`'s
record holds `three`, and `three` points back at that record, but a cycle that
nothing else can reach is still garbage. Question 17 shows the one way a record outlives its call.

Interview trap:

Line 6 prints `undefined`, not an error, even though `b` is declared two lines
later: the creation phase made the `var` binding before `two` ran any code.
Change line 8 to `let b = 2` and line 6 throws `Cannot access 'b' before
initialization` instead.

Important:

Here the chain grew in step with the stack, because each function was written
inside the function that called it. That is a property of this program, not a
rule. In question 6's `show()` and `run()` example the two differ:

```txt
stack        global -> run -> show    who called whom
show chain   show's record -> global  where show was written
             run's record is on the stack but never searched
```

The stack decides what runs next. The chain decides what a name means.

Edge cases:

The `this` values are for a classic browser script: `window` at the top level and
for a plain call, while a strict-mode function gets `undefined`. Node runs each
CommonJS file inside a wrapper function, so there the top-level `this` is
`module.exports`, an empty object, and top-level `var`s do not become
`globalThis` properties. The console output of every program in questions 16–18
is the same in both.

## 17. How Does A Returned Function Keep Its Outer Variables?

Start with the normal case, where a record dies with its call:

```js
function hello() {
  var msg = "Hello world!";
}

hello();

console.log(msg);
```

Output:

```txt
ReferenceError: msg is not defined
```

Walkthrough:

```txt
global creation   global { hello -> fn hello }   no msg
line 5 hello()    push; hello's record { msg -> undefined }
                  line 2 runs: msg = "Hello world!"
return            pop; nothing points at hello's record
line 7            msg: not in global, outer is null: throws
```

The message says "is not defined" because no record in the chain ever had
`msg`. Compare question 16's TDZ error, where the binding existed but had no
value yet.

Now return a function instead. Line numbers refer to this listing:

```js
var sum = 0;

function doSum(a) {
  return function (b) {
    return a + b;
  };
}

var temp = doSum(2);
sum = sum + temp(8);
```

**Step 1: global creation phase.**

```txt
stack  [ global ]
record this       window
       sum        undefined
       doSum      fn doSum        [[Environment]]: this record
       temp       undefined
```

**Step 2: global execution phase.** Line 1 assigns `sum = 0`. Line 9 must call
`doSum(2)` before it can assign `temp`.

**Step 3: `doSum(2)` creation phase.**

```txt
stack  [ global, doSum ]
record this       window
       arguments  { 0: 2 }
       a          2
chain  doSum -> global -> null
```

**Step 4: `doSum` executes line 4, and the closure forms.** Evaluating the
function expression creates a new function object, and like every function it
stores the record it was created in:

```txt
anonymous function   [[Environment]] = doSum's record
```

`doSum` returns that function and its context is popped. But `doSum`'s record is
**not** collected, because the returned function still points at it. Line 9 then
assigns the function to `temp`:

```txt
stack   [ global ]                 doSum's context is gone
heap    doSum's record { a: 2 }    still reachable:
          ▲
          └── [[Environment]] of the returned function
                                   ▲
                                   └── global record: temp
```

This surviving record is what course diagrams label **Closure Scope**, and what
Chrome DevTools labels `Closure (doSum)`.

**Step 5: line 10 calls `temp(8)`.** The right-hand side runs left to right:
`sum` is read first (`0`), then the call:

```txt
stack  [ global, temp(8) ]
record this       window
       arguments  { 0: 8 }
       b          8
chain  temp -> doSum -> global -> null
```

The new record's outer link comes from `temp.[[Environment]]`, so the chain runs
through `doSum`'s record, even though `temp` was called from global code and
`doSum` returned long ago. Line 5 finds `b` in its own record and `a` in
`doSum`'s, and returns `10`.

**Step 6: assignment.** The call is popped, its record is collected, and line 10
finishes with `sum = 0 + 10`:

```txt
stack  [ global ]
record sum        10
       doSum      fn doSum
       temp       fn (anonymous)  still the function
heap   doSum's record { a: 2 }    kept alive by temp
```

Checking that state:

```js
console.log(sum);
console.log(typeof temp);
console.log(temp(8));
```

Output:

```txt
10
function
10
```

Interview trap:

A common diagram slip shows `temp -> 10` after line 10. `temp(8)` _returns_ 10
into the expression; only `sum` is assigned. `temp` is still the function, and
calling it again gives 10 again, because reading `a` does not use it up.

The rule:

The closure forms when the inner function is **created** (step 4), not when it
is returned or called. Returning it only lets the function outlive the call that
made it, and the function carries its `[[Environment]]` along.

## 18. Does A Closure Copy The Outer Values?

No. Some diagrams draw `a -> 2` inside the inner function's own variable object,
as if the value were copied in. The inner function's record only ever holds its
own parameters and locals. It reaches `a` through its outer link, and it reads
the **current** value each time it runs.

Change the variable after the closure forms:

```js
function makeGreeter() {
  let name = "Ana";

  const greet = function () {
    return `Hi ${name}`;
  };

  name = "Ben";
  return greet;
}

const sayHi = makeGreeter();
console.log(sayHi());
```

Output:

```txt
Hi Ben
```

`greet` was created while `name` held `"Ana"`, but it reads the binding when it
runs, and by then the binding holds `"Ben"`. A copy would have printed `Hi Ana`.
The same live link is why question 11's `increment` and `current` see each
other's changes.

Each call creates its own record, so each returned function holds its own `a`:

```js
function doSum(a) {
  return function (b) {
    return a + b;
  };
}

const add2 = doSum(2);
const add5 = doSum(5);

console.log(add2(8));
console.log(add5(8));
console.log(add2(8));
```

Output:

```txt
10
13
10
```

```txt
add2  [[Environment]] -> record from doSum(2) { a: 2 }
add5  [[Environment]] -> record from doSum(5) { a: 5 }
```

V8 exposes a function's retained scopes as an internal `[[Scopes]]` slot. Dumped
through the inspector protocol after question 17's program ran:

```txt
temp.[[Scopes]]
  0: Closure (doSum)  { a: 2 }
  1: Global           { sum: 10, doSum: fn, temp: fn }
```

Paused on line 5 during `temp(8)`, the chain the lookup walks:

```txt
local              { b: 8 }
closure (doSum)    { a: 2 }
global             { sum: 0, doSum: fn, temp: fn }
```

`b` and `a` sit in **separate** scopes, exactly as in question 17's step 5. `sum`
is still `0` there because line 10 assigns it only after `temp(8)` returns.

Important:

The specification keeps a retained record whole, but V8 keeps only what inner
functions use. A variable moves to the heap only if some inner function
references it; the rest live in the stack frame and vanish on return. Paused
inside question 16's `three`, V8 shows only `local { d: 4, c }` and `global`,
with no scope for `one` or `two`. Make `three` read `b`, and a
`closure (two) { b: 2 }` scope appears, holding `b` alone. The program behaves
the same either way; only what the debugger can see changes.

Interview note:

Two consequences show up in real debugging:

- Paused inside that `three`, typing `b` into the DevTools console gives
  `ReferenceError: b is not defined`, although `b` is in scope in the source.
  Nothing captured it, so the engine did not keep it.
- Closures created by the same call share **one** captured scope. If one closure
  uses a large object, its siblings keep it alive too.

```js
function makeHandlers() {
  const big = new Array(1e6).fill("x");
  const small = 1;
  const usesBig = () => big.length;
  const usesSmall = () => small;
  return { usesBig, usesSmall };
}
```

`usesSmall.[[Scopes]]` shows `Closure (makeHandlers) { big, small }`: keeping
only `usesSmall` still keeps the million-element array reachable.

To see it yourself, paste question 17's program into the Chrome DevTools console,
run `console.dir(temp)`, and expand `[[Scopes]]`. Or set a breakpoint on line 5
and read the Scope panel: Local, Closure (doSum), Global.

Strong answer:

> A closure is not a copy. Every function stores the environment it was created
> in, and every call links its new environment to that stored one. When a
> returned function outlives its parent's call, the parent's record stays on the
> heap because the function still points at it, so later calls read and write
> the live variables. V8 keeps only the variables inner functions use, and
> closures from the same call share them.

## 19. How Do You Answer An Execution Context Question In An Interview?

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
- <https://tc39.es/ecma262/#sec-globaldeclarationinstantiation>
- <https://tc39.es/ecma262/#sec-functiondeclarationinstantiation>
- <https://tc39.es/ecma262/#sec-prepareforordinarycall>
- <https://tc39.es/ecma262/#sec-ordinaryfunctioncreate>
- <https://chromedevtools.github.io/devtools-protocol/v8/Debugger/#type-Scope>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules>
