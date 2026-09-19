# React Native Production, Release And Gotchas Interview Guide

The things you only learn by shipping: over-the-air updates, app size, build
environments, deep links, push notifications, testing, crash reporting, version
upgrades, the cross-platform bugs that only appear on a real device, and the
small tricks experienced React Native developers reach for without thinking.

## 1. How Do You Ship An Over-The-Air Update?

React Native apps are mostly JavaScript, and the JS bundle can be replaced
without an app store review. `expo-updates` (EAS Update) is the current standard;
CodePush was the older Microsoft service and has been retired.

How it works: the app checks an update server on launch, downloads a new bundle
in the background, and applies it on the next launch.

Benefits:

- Fix a crash in hours instead of a multi-day review cycle.
- Roll out to a percentage of users and roll back instantly.
- Ship copy and config changes without a release.

The rules you must state, because they are what the question is really testing:

- **Only JavaScript and assets can change.** Anything touching native code — a new
  native dependency, a permission, a native config change — requires a store
  build. Shipping a JS bundle that calls a native module the installed binary
  does not have is an instant crash.
- **Store policy limits it.** Both stores allow bug fixes and content changes but
  not shipping a materially different app or bypassing review for new features.
- **Bundle and binary must stay compatible.** Updates are keyed to a runtime
  version; an update must never be delivered to an older incompatible binary.
- **You need a rollback path**, because a bad OTA reaches everyone at once — which
  is the flip side of the benefit.

## 2. How Do You Reduce App Size?

- **Hermes** — smaller than bundling JSC, and bytecode instead of source.
- **Android App Bundle (`.aab`)** instead of a universal APK, so Google Play
  delivers only the architecture and resources each device needs.
- **Enable R8/ProGuard and resource shrinking** in the release build
  (`minifyEnabled`, `shrinkResources`).
- **Audit dependencies.** A moment library, a full icon set, or a lodash default
  import can each add hundreds of kilobytes. `npx react-native-bundle-visualizer`
  shows where the JS bundle went.
- **Compress and right-size assets.** WebP over PNG, no 4K splash images, no
  unused fonts. Ship one font weight rather than nine.
- **Remove dev-only dependencies** from the production dependency list.
- **Split or lazy-load** rarely used heavy screens.

Interview note:

Download size and install size are different numbers, and the store shows users
the download size. Test with the actual store-reported size rather than the APK
on disk.

## 3. How Do You Handle Environment Variables And Build Variants?

You need dev, staging, and production to be **separate installable apps** with
different bundle identifiers, so a tester can hold all three at once.

- Different `bundleIdentifier` / `applicationId` per environment, plus a
  different app name and icon so nobody reports a bug against the wrong build.
- Environment values via `react-native-config`, `expo-constants` with EAS build
  profiles, or Xcode schemes and Gradle product flavours.
- `__DEV__` for code that must never reach production.

```ts
const API_URL = Config.API_URL; // injected at build time
```

Important:

These are **build-time substitutions**, not secrets. The values end up in the
binary in plain text. Non-sensitive config (API base URL, feature flags,
analytics keys designed to be public) is fine. Anything genuinely secret belongs
on a server.

## 4. How Do You Handle Deep Links?

A deep link opens a specific screen from outside the app: a URL, a push
notification, an OAuth callback.

Two kinds:

- **Custom scheme** (`myapp://post/42`) — simple, but any app can claim the same
  scheme.
- **Universal Links (iOS) / App Links (Android)** (`https://myapp.com/post/42`) —
  verified by a file hosted on your domain, so they cannot be hijacked and they
  fall back to the website when the app is not installed. This is the answer for
  anything user-facing.

With React Navigation you declare a linking config and it maps URLs to screens:

```ts
const linking = {
  config: { screens: { Post: "post/:id", Profile: "user/:handle" } },
  prefixes: ["myapp://", "https://myapp.com"],
};
```

Edge cases:

- **Cold start versus warm start.** A link that opens a closed app must be handled
  after the navigator is ready, or the navigation is dropped. This is the classic
  "deep links work only when the app is already open" bug.
- **Auth-gated links.** If the target requires login, store the intended
  destination, run the auth flow, then continue to it.
- Always validate parameters from a link — it is untrusted input from outside.

## 5. How Do You Implement Push Notifications?

```viz
type: flow
title: Push notification lifecycle
Request permission :: iOS requires it; Android 13+ does too
Get device token :: FCM on Android, APNs on iOS
Register token :: send it to your backend with the user id
Backend sends :: your server calls FCM/APNs (or Expo's service)
Delivered :: foreground, background, or killed - three different paths
Tap handled :: deep link into the right screen
Unregister :: delete the token on logout
```

What interviewers listen for:

- **Three delivery states behave differently.** In the foreground, the OS does not
  show a banner by default — your code decides. In the background the OS shows
  it. When the app is killed, only the tap handler runs, and only then.
- **Tokens rotate.** A device token can change at any time; re-register on every
  launch, not just on first install.
- **Unregister on logout**, or the next user of that device gets the previous
  user's notifications.
- **Delivery is best-effort.** Push is not a message queue — never rely on it for
  correctness. Fetch the real state when the app opens.
- Silent/data-only pushes are heavily throttled by both platforms.

## 6. How Do You Test A React Native App?

| Layer | Tool | What it covers |
| --- | --- | --- |
| Unit | Jest | pure functions, reducers, hooks |
| Component | React Native Testing Library | rendering and user interaction |
| End to end | Maestro or Detox | real flows on a simulator or device |
| Static | TypeScript, ESLint | whole classes of bugs, for free |

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";

test("shows an error when login fails", async () => {
  render(<LoginScreen />);
  fireEvent.changeText(screen.getByLabelText("Email"), "a@b.com");
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Invalid credentials")).toBeVisible();
});
```

The principles worth stating: query by what a user perceives (label, role, text)
rather than test ids where possible, mock the network at the boundary rather than
mocking your own modules, and keep E2E to the few flows that would be a
catastrophe if broken — login, checkout, the core action — because they are slow
and flaky by nature.

Maestro has largely displaced Detox for new projects because its YAML flows are
far cheaper to write and maintain.

## 7. How Do You Monitor A React Native App In Production?

- **Crash reporting** — Sentry or Firebase Crashlytics, with **source maps
  uploaded per release**. Without source maps, a release stack trace is minified
  garbage and the report is useless.
- **Native crashes count too.** A JS error boundary never sees an out-of-memory
  kill or a native module crash, so you need a reporter that captures both sides.
- **Error boundaries** to keep one broken screen from taking down the app, with a
  retry path rather than a dead end.
- **Performance RUM** — app start time, slow and frozen frames, screen render
  times, network latency, segmented by device tier and OS version. Your test
  device is not representative; low-end Android is where apps actually break.
- **Release health** — crash-free sessions per release, so a bad build is visible
  before the reviews arrive.
- **Breadcrumbs** — navigation events and network calls attached to each report,
  which is usually what makes a crash reproducible.

## 8. How Do You Upgrade React Native Versions?

- Use the **React Native Upgrade Helper**, which diffs the template between any
  two versions and shows exactly which native files changed.
- Upgrade **one minor at a time**. Jumping several versions merges several sets of
  native breaking changes into one unreviewable diff.
- Read the release notes for deprecations — they are where the real work is.
- Update dependencies with native code in the same pass, since they are usually
  pinned to a React Native range.
- Clean everything when it goes wrong: `watchman watch-del-all`, Metro cache,
  `node_modules`, Pods, Gradle caches. A surprising share of upgrade failures are
  stale artefacts.
- Verify on both platforms in a **release** build, and exercise the native-heavy
  paths: camera, maps, push, payments, biometrics.

Interview note:

Expo users upgrade the SDK instead, with `expo install --fix` aligning dependency
versions to the SDK — a meaningfully smaller job, and a fair point to raise when
asked why you would choose Expo.

## 9. What Are The Most Common Cross-Platform Gotchas?

The list that experience produces:

- **Shadows.** iOS uses `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius`;
  Android uses `elevation` only. Set both.
- **`zIndex` on Android** is unreliable and historically tied to `elevation`.
  Sibling order in the tree is more dependable than `zIndex`.
- **`overflow: "hidden"`** is not fully honoured on Android for some transformed
  or elevated views; children escape rounded corners.
- **Text vertical centring** differs — Android adds font padding, so identical
  styles sit a pixel or two apart.
- **`position: "absolute"` children** are not clipped by a parent the way they are
  on the web.
- **The Android hardware back button** exists and has no iOS equivalent. Unhandled,
  it pops navigation or closes the app from a modal you thought was blocking.
- **StatusBar** is translucent and configurable on Android and behaves differently
  on iOS; `StatusBar` props must be set per screen.
- **Fonts** must be named by PostScript name on iOS and file name on Android, so
  the same `fontFamily` string can work on one platform and silently fall back on
  the other. `fontWeight` on a custom font often needs the explicit weight file.
- **Permissions** differ in timing and granularity, and Android 13+ requires
  runtime permission for notifications.
- **Keyboard behaviour** genuinely differs, and `KeyboardAvoidingView` needs a
  different `behavior` per platform.

## 10. How Do You Handle The Android Back Button?

```tsx
useEffect(() => {
  const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
    if (!hasUnsavedChanges) return false; // false = let the default happen
    confirmDiscard();
    return true; // true = we handled it, do not pop
  });

  return () => subscription.remove();
}, [hasUnsavedChanges]);
```

The contract: returning `true` means "handled, stop here"; returning `false` lets
the next handler or the default behaviour run. Registering it without removing it
on unmount leaves a handler intercepting back presses for the rest of the session
— a very common bug.

Use `useFocusEffect` rather than `useEffect` so the handler is active only while
the screen is focused, since stacked screens all stay mounted.

## 11. Why Is My ScrollView Or List Not Scrolling?

Almost always a flex problem, and worth knowing because it wastes so much time:

- The `ScrollView` or its parent has no height. A `ScrollView` inside a `View`
  without `flex: 1` collapses to its content.
- `flex: 1` was put on `contentContainerStyle` instead of `style`. `style` sizes
  the scroll view; `contentContainerStyle` sizes the content. Putting `flex: 1` on
  the content forces it to the viewport height, so there is nothing to scroll.
- The content is genuinely shorter than the viewport.
- A parent has `overflow: "hidden"` or a fixed height smaller than expected.

The debugging trick: temporarily set `backgroundColor` on each level of the tree,
or open the element inspector from the Dev Menu. Invisible zero-height views are
the single most common React Native layout bug.

## 12. Does console.log Cost Anything In Production?

Yes. `console.log` calls still execute in a release build, still stringify their
arguments, and still retain whatever they reference until the call completes.
Logging an object inside a list row or a scroll handler is a measurable cost.

The fix is to strip them at build time:

```js
// babel.config.js
env: {
  production: {
    plugins: ["transform-remove-console"],
  },
}
```

Keep intentional diagnostics behind a logger that reports to Sentry or is gated
on `__DEV__`, rather than relying on stray `console.log` calls.

## 13. How Do You Debug A Crash That Only Happens In Release?

- **Get the real stack trace.** Upload source maps with every release build; a
  minified trace is not evidence.
- **Suspect minification.** Code depending on `Function.name`, class names, or
  property names surviving R8/ProGuard breaks only in release. Check your
  ProGuard rules.
- **Suspect `__DEV__`-gated code.** Something initialised only in development, or
  a dev-only polyfill, may be masking the bug locally.
- **Suspect native memory.** An out-of-memory kill produces no JS stack at all.
  Large images and unbounded caches are the usual culprits, and it shows up on
  low-end Android first.
- **Reproduce with a local release build** (`--variant release` / Release scheme)
  before guessing. Most "release-only" bugs reproduce fine there.
- **Read the native logs** — Logcat or the Xcode device console — because the JS
  debugger cannot attach to the failure.

## 14. What Are Your Go-To Small Tricks?

The ones that come up constantly:

- **`key` to reset a component.** Changing a component's `key` unmounts and
  remounts it with fresh state — the cleanest way to reset a form or a screen.
- **`hitSlop`** to expand a small icon button's touch area without changing
  layout.
- **`pointerEvents="none"`** on an overlay so touches pass through to what is
  underneath.
- **`InteractionManager.runAfterInteractions`** to defer expensive work until a
  navigation transition or animation has finished, so the transition stays smooth.
- **`Keyboard.dismiss()`** plus `keyboardShouldPersistTaps="handled"` for forms
  that otherwise need two taps.
- **`numberOfLines` and `ellipsizeMode`** so user-generated text cannot destroy a
  layout.
- **`useWindowDimensions`** instead of `Dimensions.get`, so rotation and
  split-screen actually update.
- **MMKV instead of AsyncStorage for anything read on first render**, because it
  is synchronous and kills the theme/auth flash.
- **`accessibilityLabel` and `accessibilityRole`** — they make the app usable with
  a screen reader *and* make your E2E queries stable.
- **`LayoutAnimation.configureNext`** for a one-line animated layout change, on
  simple trees only.
- **`react-native-gesture-handler` and Reanimated** for anything gesture-driven,
  so the interaction never depends on the JS thread.
- **`ErrorBoundary` around each screen**, so a single bad response does not take
  down the whole app.

## 15. What Is On Your Release Checklist?

- Release build tested on a **low-end Android device**, not just a simulator.
- Version and build number incremented; release notes written.
- Source maps uploaded to the crash reporter.
- `console.log` stripped; no dev-only endpoints or test accounts in the build.
- Production API URLs and keys confirmed via the production build variant.
- Permissions and their usage descriptions accurate — both stores reject vague
  ones.
- Deep links, push notifications, and the auth flow verified against a **fresh
  install**, not an upgrade over your dev build.
- Offline and airplane-mode behaviour checked.
- Large text and dark mode checked.
- Store metadata, screenshots, and privacy declarations up to date.
- A rollback plan: previous binary ready, and an OTA channel able to revert.
