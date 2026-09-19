# React Native Architecture Interview Guide

The advanced architecture questions: what the old bridge-based architecture was,
why it was a bottleneck, what the New Architecture replaced it with, and what
JSI, TurboModules, Fabric, Codegen, bridgeless mode, Hermes, and Yoga each
actually do. This is the topic that separates "I use React Native" from "I
understand React Native".

## 1. What Are The Threads In A React Native App?

Three, and almost every performance question reduces to which one is blocked.

```viz
type: flow
title: The three threads
JS thread :: runs your JavaScript, React, business logic, list windowing
Shadow thread :: Yoga computes flexbox layout off the main thread
UI / main thread :: creates native views, handles gestures, draws frames
```

- **JS thread** — your code. Only one, and it is not the UI thread. Block it and
  taps stop responding, list rows stop appearing, and state updates stall — but a
  native scroll or a native-driven animation keeps running.
- **Shadow thread** — holds the shadow tree and runs Yoga to turn your flexbox
  styles into concrete x/y/width/height values.
- **UI thread** — the platform's main thread. Mounts and updates native views and
  renders at 60 (or 120) fps. Blocking it freezes everything, including scroll.

Why it matters:

The Performance Monitor shows JS fps and UI fps separately for exactly this
reason. Low JS fps and healthy UI fps is a re-render or heavy-JavaScript problem.
Low UI fps is a view-count, image, shadow, or overdraw problem. They have
completely different fixes.

## 2. What Was The Old Architecture?

Three separate realms — JavaScript, the C++/native shadow layer, and native UI —
connected by **the bridge**: an asynchronous, batched, JSON-serialised message
queue.

```viz
type: flow
title: Old architecture: a cross-bridge call
JS calls a module :: e.g. Camera.takePicture()
Serialise to JSON :: arguments become a JSON string
Queue and batch :: messages are batched, then sent asynchronously
Native deserialises :: parses JSON, finds the module, invokes it
Result returns :: serialised back over the bridge as a callback
```

Everything crossed that boundary this way: native module calls, UI updates, touch
events, and layout results. The design made JS and native fully decoupled — and
that decoupling was the problem.

## 3. Why Was The Bridge A Bottleneck?

Four concrete reasons, worth naming individually:

- **Everything was asynchronous.** JavaScript could never read a native value
  synchronously. There was no way to ask "how wide is this view?" and get an
  answer in the same tick, so measurement-dependent UI always flickered through
  an intermediate frame.
- **Everything was serialised.** Every call became a JSON string and was parsed
  on the other side. Passing a large array or a frequent stream of events meant
  paying encode + decode costs continuously.
- **It was a single queue.** High-frequency events — scroll, gesture, animation
  frames — competed with everything else. A busy JS thread delayed the whole
  queue, which is the classic "the list is blank while I scroll fast" symptom.
- **Startup was eager.** All native modules were initialised at launch whether or
  not the app used them, so every extra library cost startup time.

Interview trap:

The bridge was not "slow" in the sense of a slow function call. A single call was
cheap. The problem was the **asynchronous, serialised, shared-queue model** at
high frequency and the impossibility of synchronous access. Saying "JSON is slow"
alone is a shallow answer.

## 4. What Is The New Architecture?

A replacement of that whole model, built on four pieces that people often confuse
with each other:

| Piece | What it is | Replaces |
| --- | --- | --- |
| **JSI** | a C++ layer letting JS hold and call native objects directly | the bridge |
| **TurboModules** | lazily-loaded, type-safe native modules over JSI | old NativeModules |
| **Fabric** | the new renderer, with a C++ core | the old UIManager |
| **Codegen** | generates native interfaces from TypeScript specs | hand-written glue |

It is the **default** as of React Native 0.76, which also shipped bridgeless mode
by default. The legacy architecture is deprecated and slated for removal, so "we
are still on the old one" is now a migration question, not a choice.

Strong answer:

> The old architecture put an asynchronous, JSON-serialised queue between
> JavaScript and native. The New Architecture removes that queue: JSI lets
> JavaScript hold references to C++ objects and call them directly, including
> synchronously. TurboModules make native modules lazy and type-safe on top of
> that, Fabric rebuilds the renderer around a C++ shadow tree so layout can be
> synchronous and React 18 concurrent features work correctly, and Codegen
> generates the glue from TypeScript specs so the two sides cannot drift apart.

## 5. What Is JSI?

The **JavaScript Interface**: a lightweight C++ API that a JavaScript engine
implements, which lets native code expose objects and functions directly into the
JS runtime.

What changes because of it:

- **Direct references.** A JS value can be a *HostObject* — a real C++ object.
  Calling a method on it is a function call, not a serialised message.
- **Synchronous calls become possible.** `mmkv.getString("theme")` returns a value
  immediately, which is why MMKV can be read during the first render and
  AsyncStorage cannot.
- **Shared memory instead of copies.** Large buffers (camera frames, audio, SQLite
  rows) can be passed by reference rather than encoded.
- **Engine independence.** JSI is an abstraction, which is how React Native can
  run on Hermes or JSC without the rest of the system caring.

The libraries that exist *because* of JSI are the best illustration: MMKV
(synchronous storage), Reanimated (worklets on the UI thread), VisionCamera
(frame processors), and the fast SQLite bindings.

Tradeoff:

Synchronous native calls block the JS thread. JSI gives you the ability to make
them; it does not make them free. A synchronous call doing real work is now *your*
jank.

## 6. What Are TurboModules?

The New Architecture's native modules. Same idea as the old `NativeModules`, three
differences:

- **Lazy.** A TurboModule is initialised the first time JavaScript actually uses
  it, instead of every module loading at app start. Directly improves startup.
- **Type-safe.** The interface is generated by Codegen from a TypeScript spec, so
  a mismatch between the JS signature and the native implementation is a build
  error rather than a runtime crash.
- **Direct.** Calls go over JSI, so they can be synchronous and do not serialise.

```ts
// NativeDeviceInfo.ts - the spec Codegen reads
import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  getDeviceName(): string; // synchronous is now allowed
  getBatteryLevel(): Promise<number>;
}

export default TurboModuleRegistry.getEnforcing<Spec>("DeviceInfo");
```

## 7. What Is Fabric?

The new **renderer** — the part that turns your React tree into native views.

The old renderer kept view state in native-land and pushed updates over the
bridge. Fabric keeps an immutable **shadow tree** in C++, shared by both
platforms, and commits changes to native views directly.

What that buys you:

- **Synchronous layout and measurement**, so the flicker of measure-then-adjust is
  gone.
- **Concurrent React support.** Interruptible rendering, transitions, and Suspense
  need the renderer to be able to discard in-progress work. The old renderer
  could not, which is why React Native lagged React 18 features.
- **Priority-based updates**, so a gesture-driven update can jump ahead of a
  background data update.
- **View flattening** — layout-only views that contribute nothing visual are
  removed from the native hierarchy, reducing view count.
- **One C++ core** shared between iOS and Android instead of two parallel
  implementations that drifted.

Interview note:

Fabric is also why some old libraries broke. Direct manipulation APIs like
`setNativeProps` and `findNodeHandle` were tied to the old renderer's mutable
native state, and the migration deprecated them in favour of refs and native
commands.

## 8. What Is Codegen?

A build-time step that reads TypeScript (or Flow) **spec files** and generates the
C++/Java/Objective-C interfaces that TurboModules and Fabric components rely on.

```txt
NativeDeviceInfo.ts  ->  codegen  ->  C++ interface
                                       Java abstract class
                                       Obj-C protocol
```

Why it matters:

The old architecture required hand-written glue on both sides, and nothing
checked that they agreed. Passing a string where native expected a number was a
runtime crash — often on one platform only. Codegen makes the TypeScript spec the
single source of truth, so the mismatch fails at build time.

Spec files must be named `Native<Name>.ts` for modules or `<Name>NativeComponent.ts`
for components — Codegen finds them by convention, which is a detail interviewers
sometimes probe.

## 9. What Is Bridgeless Mode?

The final step: running with **no bridge at all**, rather than a New Architecture
that still keeps the legacy bridge around for compatibility. It became the
default in 0.76.

Practical effects:

- Faster startup, since the bridge and the legacy module registry are not
  initialised.
- A cleaner, more direct error and event path.
- Legacy APIs that assumed a bridge — some `NativeModules` access patterns and
  old event emitter usage — stop working and need the interop layer or a library
  update.

Important:

"New Architecture enabled" and "bridgeless" were separate flags during the
transition. Knowing that they were distinct, and that bridgeless is now the
default, is the up-to-date answer.

## 10. What Is Hermes And Why Does It Matter?

Hermes is a JavaScript engine built by Meta specifically for React Native, and
the default engine since 0.70.

Benefits:

- **Ahead-of-time bytecode.** JavaScript is compiled to bytecode at build time, so
  the device never parses or compiles JS at launch. This is the biggest single
  startup win available.
- **Lower memory use**, which matters most on low-end Android.
- **Smaller app size** than bundling JSC.
- **Built-in debugging support**, which is what React Native DevTools connects to.

Tradeoff:

Hermes is not a JIT, so long-running, compute-heavy JavaScript can be slower than
JSC's optimised paths. For typical app workloads — UI, network, list rendering —
the startup and memory wins dominate. Heavy computation should not be on the JS
thread anyway.

Interview note:

Hermes and the New Architecture are independent. Hermes is the engine; JSI,
TurboModules, and Fabric are the architecture. They are commonly confused, and
keeping them straight is an easy way to sound precise.

## 11. What Is Yoga?

The cross-platform C layout engine that implements flexbox for React Native. It
takes your style props and computes concrete positions and sizes, on the shadow
thread in the old architecture and inside the C++ core with Fabric.

Yoga is why flexbox behaves *almost* like the web but not exactly: it implements
a practical subset. `flexDirection` defaults to `column`, `flex: 1` means
"grow to fill", and properties like `float`, `grid`, and the full set of CSS
layout modes do not exist.

## 12. How Do You Check Which Architecture An App Is Running?

Configuration:

```txt
android/gradle.properties   newArchEnabled=true
ios/Podfile                 RCT_NEW_ARCH_ENABLED=1  (or the env var at pod install)
app.json (Expo)             "newArchEnabled": true
```

At runtime:

```ts
const isFabric = Boolean(global.nativeFabricUIManager);
const isBridgeless = Boolean(global.RN$Bridgeless);
```

Symptoms of an app still on the legacy architecture: `setNativeProps` and
`findNodeHandle` still working, native modules all initialising at startup, and
libraries that require the New Architecture (current Reanimated, FlashList v2,
newer VisionCamera) refusing to build or warning at runtime.

## 13. What Breaks When You Migrate, And How Do You Handle It?

The honest answer names both the interop layer and the real friction.

React Native ships **interop layers** so most legacy modules and view managers
keep working on the New Architecture without a rewrite. That covers the majority
of a typical dependency list.

What actually breaks:

- **Unmaintained native libraries** with custom view managers. This is the usual
  blocker, and the fix is upgrade, replace, or fork.
- **Direct manipulation** — `setNativeProps`, `findNodeHandle`, and code reaching
  into `UIManager`. Replace with refs, native commands, or Reanimated.
- **Assumptions about asynchrony.** Code that relied on a native call always
  resolving on a later tick can behave differently when the call is synchronous.
- **Layout edge cases**, because view flattening changes the native hierarchy and
  some `onLayout`-dependent or absolutely-positioned code shifts.

The migration strategy to describe: upgrade React Native first with the Upgrade
Helper, get the app green on the legacy architecture, audit dependencies against
the React Native Directory's New Architecture support, then flip the flag on one
platform at a time and test the heavy screens — lists, camera, maps, video.

Strong answer:

> Migration is mostly a dependency problem, not an app-code problem. The interop
> layers carry most legacy modules, so I audit the dependency list first, replace
> the unmaintained native ones, remove direct-manipulation APIs, and then enable
> the flag per platform. The payoff is not a single benchmark — it is lazy module
> loading at startup, synchronous layout, and being able to use concurrent React
> features at all.

## 14. How Would You Summarise Old Versus New Architecture In A Minute?

> The old architecture connected JavaScript and native with an asynchronous,
> JSON-serialised, batched bridge. It worked, but nothing could be synchronous,
> every call paid serialisation, all native modules loaded at startup, and the
> renderer could not support React's concurrent features.
>
> The New Architecture replaces the bridge with JSI, a C++ interface that lets
> JavaScript hold and call native objects directly. On top of it, TurboModules
> make native modules lazy and type-safe, Fabric rebuilds the renderer around a
> shared C++ shadow tree so layout is synchronous and concurrent React works, and
> Codegen generates the interfaces from TypeScript specs so the two sides stay in
> sync. Bridgeless mode then removes the legacy bridge entirely.
>
> In practice it means faster startup, no serialisation cost on hot paths,
> synchronous native access where it helps, and libraries like Reanimated and
> MMKV that were not possible before. It has been the default since 0.76, and the
> legacy architecture is on its way out.
