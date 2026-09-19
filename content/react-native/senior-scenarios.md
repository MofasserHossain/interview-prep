# React Native Senior Scenarios Interview Guide

Scenario-driven questions for senior and lead React Native roles: structuring a
large codebase, choosing state management, writing native modules, brownfield
integration, sharing code with web, offline-first sync, background work,
permissions, security hardening, white-label builds, feature flags,
accessibility, localization and RTL, in-app purchases, production incident
triage, and planning a New Architecture migration.

## 1. How Do You Structure A Large React Native Codebase?

Organise by **feature**, not by file type. A `components/` folder with 200 files
tells you nothing about the app.

```txt
src/
  features/
    orders/          screens/ components/ hooks/ api/ types.ts index.ts
    checkout/
    profile/
  shared/
    ui/              design-system primitives
    api/             client, interceptors, error normalisation
    storage/         secure store, MMKV wrappers
    navigation/      navigators, linking config, navigationRef
  app/               providers, bootstrap, root navigator
```

The rules that keep it from rotting:

- **Features expose a public surface** through `index.ts` and do not reach into
  each other's internals. Cross-feature needs go through `shared/` or through
  navigation.
- **One design system layer.** Every screen uses `shared/ui`, never raw `View` +
  ad-hoc styles, or you get forty button variants.
- **Navigation is shared infrastructure**, because features need to route to each
  other without importing each other's screens.
- **Enforce it with tooling** — path aliases plus an import-boundary lint rule.
  A convention nobody can violate accidentally is the only kind that survives a
  growing team.

Tradeoff:

Feature folders duplicate a little structure and force an early call on what a
feature *is*. That is cheaper than the alternative, where a "small refactor"
touches nine top-level folders.

## 2. How Do You Choose A State Management Approach?

Separate the two kinds of state first — this is the actual answer.

**Server state** is data you fetched and do not own: it can be stale, it needs
caching, retries, deduplication, and revalidation. **TanStack Query** or RTK Query
handles it. Putting server responses in Redux by hand means reimplementing all of
that badly.

**Client state** is what the app itself owns: the selected filter, a multi-step
form, the theme, auth status.

| Scope | Tool |
| --- | --- |
| One component | `useState` |
| A subtree | `useReducer` + context, or a scoped store |
| App-wide, simple | Zustand or Jotai |
| App-wide, complex flows | Redux Toolkit |
| Server data | TanStack Query / RTK Query |

Mobile-specific considerations worth raising:

- **Context re-renders the whole subtree** when its value changes. On a device
  that cost is visible, so split contexts by update frequency or use a store with
  selectors.
- **Persistence.** Redux Persist defaults to AsyncStorage, which is async and
  plaintext. Use MMKV as the storage engine so hydration is synchronous, and
  never persist the auth slice.
- **Rehydration flash.** Async persistence means the first frame renders with
  default state. Either gate on a hydration flag or use synchronous storage.

Strong answer:

> I start by asking whether the state is server state or client state, because
> most "we need Redux" conversations are really "we need a cache". Server data
> goes to TanStack Query. Client state starts as local `useState` and only moves
> to a global store when two distant components genuinely need it. I reach for
> Redux Toolkit when flows are complex enough that traceable actions and devtools
> pay for the boilerplate, and Zustand when they are not.

## 3. How Do You Write A Native Module When No Library Exists?

You need something from the platform SDK — a payment terminal, a BLE peripheral, a
vendor analytics SDK — and nothing wraps it.

The New Architecture flow:

```ts
// specs/NativeScanner.ts  — the contract; Codegen reads this
import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  startScan(timeoutMs: number): Promise<string[]>;
  getLastResult(): string | null;   // sync is allowed over JSI
}

export default TurboModuleRegistry.getEnforcing<Spec>("Scanner");
```

Then implement the generated interface in Kotlin and Swift/Objective-C, register
the module in the package, and Codegen wires the types together at build time.

The design decisions an interviewer is listening for:

- **Keep the bridge surface small.** Do the work natively and return a result;
  do not expose fifty fine-grained methods that JavaScript orchestrates in a
  chatty loop.
- **Promises for anything that can fail or block.** Synchronous methods block the
  JS thread — reserve them for cheap reads.
- **Events for streams**, via the event emitter, not polling.
- **Threading is yours to manage.** Native work must not run on the main thread,
  and UI calls must be dispatched back to it.
- **Errors need to cross the boundary usefully** — a typed code and message, not a
  bare rejection.
- **Test the native side natively.** JS tests cannot cover native failure modes.

Interview note:

If the app is on Expo, the **Expo Modules API** gives you the same result with
substantially less boilerplate and handles both architectures. Mentioning it
signals you know the current tooling rather than the 2019 bridging tutorial.

## 4. How Do You Add React Native To An Existing Native App?

"Brownfield" integration — the native app stays in charge and React Native renders
some screens.

```viz
type: flow
title: Who owns what
Native app :: owns launch, navigation stack, existing screens
React Native host :: one instance, created once, kept alive
RN view :: mounted inside a native view controller / activity
Bridge back :: native modules expose existing native services to JS
```

The decisions that make or break it:

- **Exactly one React Native instance.** Creating a host per screen multiplies
  memory and startup cost. Initialise it once, ideally eagerly during a moment
  the user is already waiting.
- **Decide who owns navigation.** Usually native owns the stack and React Native
  screens are individual view controllers or activities. Two routers fighting
  over a back stack is the classic failure.
- **Share state deliberately.** Auth tokens, user id, and feature flags come from
  the native side through initial props or a native module — not duplicated.
- **Startup cost is visible.** The first RN screen pays bundle load and first
  render. Pre-warm it, and design the transition so the delay hides behind an
  animation.
- **Build integration.** The native build must now run Metro in development and
  bundle JS in release, which affects every native developer's workflow — expect
  that to be the real organisational friction.

When to use it:

Incremental migration of a large native app, or letting one team ship a feature
cross-platform without rewriting the shell. It is a serious commitment: you take
on both toolchains at once.

## 5. How Do You Share Code Between A React Native App And A Web App?

Share **logic**, be careful about **UI**.

Reliably shareable: TypeScript types, API clients, validation schemas, business
rules, formatting, state stores, and feature flag logic. Put them in packages in
a monorepo.

```txt
packages/
  api/        generated client + zod schemas
  core/       domain logic, pure TS, no platform imports
  config/     shared eslint / tsconfig
apps/
  mobile/     React Native
  web/        Next.js
```

UI is harder because the primitives differ. Two approaches:

- **Share the design tokens, not the components.** Colors, spacing, and typography
  live in one package; `Button` is implemented once per platform. Simple,
  predictable, some duplication.
- **`react-native-web`** (what Expo's universal setup uses) actually shares
  components across both. Powerful, but you inherit its constraints and the web
  bundle carries a compatibility layer.

Edge cases:

Metro needs monorepo configuration — `watchFolders` for sibling packages and
`nodeModulesPaths` for hoisted dependencies — or it will not resolve workspace
imports. Shared packages must also avoid Node built-ins and browser globals,
which is why `core/` should be pure TypeScript with no platform imports.

## 6. How Do You Design Offline-First Sync?

The shift in thinking: **the local database is the source of truth for the UI**,
and the network is a background synchroniser. The UI never waits on a request.

```viz
type: flow
title: Offline-first write path
User acts :: write to the local DB immediately
UI updates :: reads from the local DB, so it is instant
Outbox :: the mutation is queued with an idempotency key
Sync worker :: drains the outbox when connectivity allows
Server responds :: reconcile, mark synced, or surface a conflict
Pull :: fetch changes since the last cursor, merge locally
```

What a complete answer covers:

- **A real local database** — SQLite, WatermelonDB, or Realm — not AsyncStorage,
  because you need queries and partial updates.
- **An outbox table** for pending mutations, each with an **idempotency key** so a
  retry after an ambiguous failure cannot double-charge or double-post.
- **A sync cursor** (`updated_since`) rather than refetching everything.
- **Tombstones for deletes**, or a deleted row silently reappears on the next pull.
- **A conflict policy you can name.** Last-write-wins is acceptable for
  preferences and wrong for inventory. Server-authoritative is the usual default;
  CRDTs only if the domain truly needs concurrent editing.
- **Honest UI state** — pending, synced, failed — instead of a fake success.
- **Schema migrations**, because the local database outlives app versions and an
  old client will be syncing against a newer server for months.

Tradeoff:

Offline-first roughly doubles the state surface and makes every feature a
distributed systems problem. Worth it for field apps, messaging, and anything used
on transit. Not worth it for an app that is useless without the network anyway.

## 7. How Do You Run Work In The Background?

The honest framing: **you do not control when background work runs — the OS does.**

| Need | Android | iOS |
| --- | --- | --- |
| Periodic refresh | WorkManager | `BGAppRefreshTask` |
| Longer processing | WorkManager | `BGProcessingTask` (charging/idle) |
| Push-triggered | Headless JS | silent push (throttled) |
| Continuous, user-visible | Foreground service + notification | limited; needs a mode |

Points to make:

- **No guarantees on timing or execution.** iOS schedules background refresh based
  on usage patterns and may never run it for an app the user rarely opens.
  Android Doze batches work into maintenance windows.
- **Execution windows are short** — seconds, not minutes. Design work to be
  resumable and chunked.
- **Android OEM skins are worse than stock.** Several manufacturers kill
  background work aggressively regardless of what the API promises.
- **Long-running, user-visible work needs a foreground service** on Android, with
  a persistent notification, and recent Android versions require a declared type.
- **Background location** needs extra permissions and a store justification on
  both platforms, and is a common review rejection.

Strong answer:

> I treat background execution as opportunistic. Anything that must happen gets
> done on next foreground or on the server, and background tasks only make the
> app *fresher*, never *correct*. Concretely: sync on app foreground, use
> background refresh to pre-warm, and put anything that truly must happen on a
> schedule into a backend job that notifies the device.

## 8. How Do You Handle Runtime Permissions Properly?

```tsx
const status = await check(PERMISSIONS.IOS.CAMERA);

switch (status) {
  case RESULTS.GRANTED:      return open();
  case RESULTS.DENIED:       return request(PERMISSIONS.IOS.CAMERA); // can still ask
  case RESULTS.BLOCKED:      return promptOpenSettings();            // cannot ask again
  case RESULTS.UNAVAILABLE:  return showNoHardwareState();
}
```

The practice that separates a senior answer:

- **Ask in context**, at the moment the user has asked for the feature — not on
  launch. A pre-permission explanation screen first, so the system dialog is only
  shown to people likely to accept.
- **`BLOCKED` is terminal.** You cannot re-prompt; you can only deep link to
  settings. Burning the prompt on a cold launch is permanently costly.
- **iOS usage strings must be specific.** A vague `NSCameraUsageDescription` is a
  rejection, and the string is shown in the dialog, so it is also conversion copy.
- **Degrade gracefully.** Denied camera means "choose from library", not a dead
  screen.
- **Re-check on every use**, since permission can be revoked in settings while the
  app is backgrounded.
- Newer platform versions keep splitting permissions — Android's media permissions
  and photo picker, iOS limited photo access — so "granted" is not binary any more.

## 9. How Do You Harden A React Native App?

Assume the binary is public and the device may be hostile.

- **Nothing secret in the bundle.** Hermes bytecode is not readable as source but
  it is still extractable. Secrets live on a server. (See the API-key question in
  the networking guide.)
- **Certificate pinning** via Android's Network Security Config or iOS's
  `NSPinnedDomains`, so a user-installed proxy CA cannot read traffic.

  Tradeoff:

  Pinning to a leaf certificate bricks the app the day the certificate rotates.
  Pin the intermediate CA, ship **backup pins**, and keep a remote kill switch —
  otherwise a routine renewal becomes an outage you cannot patch over the air.

- **Root and jailbreak detection** (`jail-monkey`) — best-effort signal, trivially
  bypassed by a determined attacker. Use it to raise risk scores server-side, not
  as a hard gate.
- **Prevent screen capture on sensitive screens** — `FLAG_SECURE` on Android; iOS
  has no true equivalent, so blur the view before backgrounding and detect
  screenshots where it matters.
- **Attestation** — Play Integrity and App Attest give the server a cryptographic
  signal that the client is a genuine, unmodified app. This is the only one on the
  list an attacker cannot simply patch out, because it is verified server-side.
- **Obfuscation and tamper checks** raise the cost slightly. They are not a
  security control and should never be presented as one.

The framing that matters:

Every client-side check can be removed by someone who controls the device. Client
hardening buys time and deters casual attackers; **authorization, rate limiting,
and anomaly detection on the server are the actual controls.**

## 10. How Do You Build A White-Label App From One Codebase?

Ten brands, one codebase, ten store listings.

- **Build-time configuration, not runtime.** Each brand is its own artifact with
  its own bundle id, name, icon, splash, and theme. A single app that switches
  brand at runtime ships every brand's assets to every user and usually fails
  review.
- **Android product flavors, iOS schemes/targets** — or, on Expo, a dynamic
  `app.config.ts` driven by an env var plus one EAS build profile per brand.
- **A brand package per client**: tokens, copy overrides, feature toggles, assets.
  The app reads one typed `brand` object; no `if (brand === "acme")` scattered
  through screens.
- **CI matrix** building all brands in parallel, because releasing ten apps by
  hand does not scale.
- **Per-brand credentials** — each has its own keystore, certificates, push
  credentials, and store account.

Edge cases:

Brand-specific features are the trap. Allow feature *toggles* from the brand
config; refuse brand-specific *code paths* inside shared screens, or within a year
every component is a nest of conditionals and no brand can be released
independently.

## 11. How Do You Run Feature Flags And A/B Tests On Mobile?

The mobile-specific problem: **you cannot force users to update.** Some people run
a version from eighteen months ago forever, so flags must be safe across versions.

- **Remote config** (Firebase Remote Config, LaunchDarkly, Statsig) fetched on
  launch and cached, with **safe defaults compiled in** so the first launch and
  offline launches behave correctly.
- **Version-gate every flag.** A flag that turns on a feature requiring native
  code that old binaries do not contain will crash them. Scope flags by minimum
  app version.
- **Flags need an expiry.** Untended flags accumulate until no combination is
  tested. Give each one an owner and a removal date.
- **Kill switches for risky features**, because that is your only real rollback
  once an update is out.
- **A/B tests must assign consistently** per user and persist the assignment, or a
  user flips variants between launches and the data is meaningless.
- Watch the **crash rate per variant**, not only the conversion metric.

## 12. How Do You Make A React Native App Accessible?

```tsx
<Pressable
  accessibilityHint="Opens your order history"
  accessibilityLabel="Orders"
  accessibilityRole="button"
  accessibilityState={{ selected: isActive }}
  hitSlop={8}
>
```

The checklist:

- **Label every interactive element.** An icon-only button reads as "button" to a
  screen reader — useless.
- **Roles and states** so VoiceOver and TalkBack announce what a control *is* and
  whether it is selected, disabled, checked, or expanded.
- **Group related content** with `accessible={true}` on the container so a card
  reads as one item instead of six fragments.
- **Respect font scaling.** Users do set large text; test at maximum. Disabling
  `allowFontScaling` to protect a layout is fixing the wrong thing.
- **Announce dynamic changes** with `AccessibilityInfo.announceForAccessibility`
  or a live region, since a screen reader is not told a new error appeared.
- **Manage focus** on navigation and modal open.
- **Honour reduce-motion** via `AccessibilityInfo.isReduceMotionEnabled`.
- **Touch targets of at least 44x44** and sufficient contrast.

Why it matters:

Beyond being the right thing and legally required in many markets, accessibility
labels are the most stable selectors available to your E2E tests — so the work
pays for itself twice.

## 13. How Do You Localize A React Native App, Including RTL?

Strings, formatting, and layout direction are three separate problems.

- **Strings** — `i18next` with `expo-localization` or `react-native-localize` for
  detection. Externalise everything; never concatenate translated fragments.
- **Plurals and formatting** — ICU plural rules and `Intl` for dates, numbers, and
  currency. Verify `Intl` support on your Hermes version and platform; older
  setups need a polyfill.
- **Layout direction** is the part people miss:

```ts
I18nManager.allowRTL(true);
I18nManager.forceRTL(isRtlLocale);
// requires an app restart to take effect
```

Interview trap:

Switching RTL requires **restarting the app** — the layout engine reads the
direction at startup. A language picker that switches to Arabic and does not
restart leaves the app in a half-mirrored state. Plan the restart (or a
`RNRestart` call) into the UX.

Then write direction-agnostic styles: use `marginStart`/`paddingEnd` instead of
`marginLeft`/`paddingRight`, `textAlign: "left"` becomes `"auto"`, and
directional icons (back arrows, chevrons) need mirroring. Leave text length
headroom — German and Finnish run far longer than English.

## 14. How Do You Handle In-App Purchases And Subscriptions?

```viz
type: flow
title: A purchase you can actually trust
App requests products :: fetched from App Store / Play, prices are localised
User buys :: the store handles payment, not your app
Receipt returned :: a signed token proving the purchase
Server validates :: your backend verifies with Apple/Google - never the client
Entitlement granted :: stored server-side, keyed to the user
Webhooks keep it true :: renewals, cancellations, refunds, billing retry
```

What must be said:

- **Digital goods must use IAP / Play Billing.** Linking out to your own payment
  page is the most reliable way to be rejected.
- **Validate receipts server-side.** A client-side check is trivially spoofed, and
  the client cannot be the authority on who has paid.
- **Server notifications are the source of truth** for subscription lifecycle —
  App Store Server Notifications and Google Play Real-time Developer
  Notifications. A subscription can lapse, be refunded, enter a billing grace
  period, or be cancelled while the app is closed.
- **"Restore purchases" is mandatory** on iOS and must work on a fresh install and
  a new device.
- **Entitlements belong to the account, not the device**, if the app has accounts.
- Most teams use **RevenueCat** rather than building receipt validation and
  webhook handling twice; saying so is realistic, not a cop-out.

## 15. Crash Reports Spiked For One Segment Of Android Users. How Do You Investigate?

A structured triage, which is what the interviewer is scoring:

1. **Scope it.** Segment crash-free sessions by app version, OS version, device
   model, and manufacturer. "20% of users" is usually "one OEM on one OS version".
2. **Correlate with a release.** Did it start with a version rollout, a server
   change, or a remote-config flip? A spike with no client release points at the
   backend or a flag.
3. **Classify the crash.** A JS stack means an error boundary gap. A native stack
   means a library or native module. **No stack at all, with memory climbing,
   means an out-of-memory kill** — common on low-RAM Android and invisible to JS
   error tracking. ANRs are a separate bucket: the main thread was blocked, not
   crashed.
4. **Read the breadcrumbs.** Navigation and network breadcrumbs before the crash
   usually identify the screen and the payload.
5. **Reproduce** on a matching device, or on Firebase Test Lab / a device farm if
   you do not have one. Reproduce in a **release** build.
6. **Stop the bleeding first.** Halt the rollout, flip the kill switch, or ship an
   OTA update if the fix is in JavaScript — before spending a day on root cause.
7. **Fix, verify against the same segment**, and add the missing signal so the
   next occurrence is detected faster.

Interview answer:

> First I scope and stop the bleeding — halt the rollout and check whether a flag
> or OTA can neutralise it, because every hour of investigation is more affected
> users. Then I segment by device and OS, because a spike confined to one
> segment is almost always an OEM behaviour or a memory limit rather than a
> logic bug. The detail I watch for is a crash with no JS stack and rising
> memory, which means an OOM kill, and that changes the investigation completely.

## 16. How Would You Plan A New Architecture Migration For A Large App?

Treat it as a dependency and risk programme, not a code change.

1. **Get current first.** Upgrade React Native incrementally on the legacy
   architecture until the app is on a recent version and green.
2. **Audit dependencies** against the React Native Directory's New Architecture
   support. This is where the real work is: unmaintained native libraries are the
   blocker, not your app code.
3. **Remove legacy patterns** — `setNativeProps`, `findNodeHandle`, direct
   `UIManager` access — which you should be removing anyway.
4. **Flip the flag on one platform, in one environment**, behind a build variant
   so you can ship the legacy build if needed.
5. **Test the native-heavy surfaces**: lists, camera, maps, video, gestures,
   WebViews. Layout shifts from view flattening show up here.
6. **Measure.** Startup time, memory, and frame rates before and after, on a
   low-end device. You need evidence for the people who approved the time.
7. **Roll out staged**, watching crash-free rate by architecture.

Strong answer:

> The migration itself is a flag. The programme around it is dependency
> remediation, which is why I would start with an audit rather than a spike. I
> would keep both architectures buildable behind a variant until the New
> Architecture build has matched the old one on crash-free rate in staged
> rollout, because the ability to ship the old build is the only real rollback I
> have once an update is out.
