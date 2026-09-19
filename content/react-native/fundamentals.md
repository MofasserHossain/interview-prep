# React Native Fundamentals Interview Guide

Beginner-to-intermediate React Native questions covering how React Native differs
from React, how an app actually runs on a device, core components and styling,
the mount and unmount lifecycle, platform-specific code, navigation, keyboard and
safe-area handling, images, app state, and debugging.

## 1. What Is The Difference Between React And React Native?

React is a library for describing UI as a tree of components. It is renderer
agnostic — it does not know what a button is.

React Native is a **renderer plus a platform runtime**. It takes the same React
component model and, instead of producing DOM nodes, produces real native views:
`UIView` on iOS, `android.view.View` on Android.

| Concern     | React (web)                   | React Native                      |
| ----------- | ----------------------------- | --------------------------------- |
| Output      | DOM nodes                     | Native platform views             |
| Primitives  | `div`, `span`, `p`, `img`     | `View`, `Text`, `Image`           |
| Styling     | CSS files, cascade, media queries | JS objects, no cascade, flexbox |
| Navigation  | URL and history               | Native stack, no URL by default   |
| Layout unit | `px`, `rem`, `%`              | density-independent numbers       |
| Runtime     | Browser engine                | Hermes + native UI layer          |

The part people miss: **React itself is unchanged**. Hooks, state, context,
reconciliation, Suspense, and `key` behaviour are identical. What changes is the
host environment underneath.

Important:

React Native is not a WebView. Cordova and Ionic render HTML in a browser shell.
React Native renders real native views, which is why a `Text` is a `UILabel` and
gets platform text selection, accessibility, and font scaling for free.

Strong answer:

> React is the component and reconciliation model. React Native is a host
> renderer for that model that outputs native views instead of DOM, plus the
> runtime that runs my JavaScript on the device. If I know React, I already know
> most of React Native — what I have to relearn is the platform layer: layout,
> navigation, storage, permissions, and release.

## 2. How Does A React Native App Actually Run On A Device?

Your JavaScript is bundled by **Metro** into one bundle, shipped inside the
native app binary, and executed by a JavaScript engine (**Hermes** by default)
embedded in the app process. Your components produce a tree description, and the
native side turns that description into real views.

```viz
type: flow
title: From your component to pixels
Metro bundles JS :: your app plus node_modules become one bundle
Hermes runs it :: precompiled bytecode executes on the JS thread
React reconciles :: computes what the view tree should look like
Layout is measured :: Yoga computes flexbox positions
Native views mount :: UIView / android.view.View created and updated
Device paints :: the user sees a native screen
```

Two consequences show up constantly in interviews:

- **Your JS runs on its own thread**, separate from the UI thread. Blocking the
  JS thread does not freeze a native scroll already in flight, but it does freeze
  anything that needs JS — touch handling, state updates, list item rendering.
- **There is no DOM and no browser.** No `window.document`, no `localStorage`, no
  CSS files. Libraries that assume a browser will not work unless they have a
  React Native build.

Interview note:

In debug mode the bundle is served by the Metro dev server over the network. In
release it is compiled and embedded in the binary. That is why performance
measured in debug means nothing.

## 3. Why Are There No div And span Elements?

Because there is no DOM. React Native ships a fixed set of **core components**
that map onto native views.

| React Native | iOS            | Android        | Web equivalent      |
| ------------ | -------------- | -------------- | ------------------- |
| `View`       | `UIView`       | `ViewGroup`    | `div`               |
| `Text`       | `UILabel`      | `TextView`     | `p` / `span`        |
| `Image`      | `UIImageView`  | `ImageView`    | `img`               |
| `ScrollView` | `UIScrollView` | `ScrollView`   | `div` with overflow |
| `TextInput`  | `UITextField`  | `EditText`     | `input`             |

```tsx
import { Image, Text, View } from "react-native";

export function ProfileCard({ user }: { user: User }) {
  return (
    <View style={styles.card}>
      <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
      <Text style={styles.name}>{user.name}</Text>
    </View>
  );
}
```

The rule that catches beginners: **every string must be inside a `Text`**. A bare
string inside a `View` throws, because there is no native view that renders loose
text.

```tsx
// Throws: "Text strings must be rendered within a <Text> component"
<View>Hello</View>

// Correct
<View>
  <Text>Hello</Text>
</View>
```

Also unlike the web, `Text` does not inherit styles from an ancestor `View`.
Nesting `Text` inside `Text` does inherit — that is the only inheritance you get.

## 4. How Does Styling Work In React Native?

Styles are plain JavaScript objects using a subset of CSS properties in
camelCase. There is no cascade, no selectors, no `!important`, and no stylesheet
file.

```tsx
import { StyleSheet, View } from "react-native";

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    flexDirection: "row",
    gap: 12,
    padding: 16,
  },
});

<View style={[styles.card, isActive && styles.cardActive]} />;
```

Key differences from web CSS:

- **`display: flex` is the default**, and `flexDirection` defaults to `column`,
  not `row`. This single difference explains most "why is my layout wrong"
  confusion.
- Numbers are **density-independent pixels**, not CSS pixels. `padding: 16` means
  16dp, scaled by the device's pixel ratio.
- No units and no percentages in most places — `width: "50%"` works, `width:
  "50vw"` does not.
- Styles do not cascade to children. Each component styles itself.
- The `style` prop accepts an array; falsy entries are ignored and later entries
  win. That array form is how you do conditional styling.

Tradeoff:

`StyleSheet.create` is not required any more — a plain object works. It still
helps: it validates keys in development and gives a stable object identity, so
you are not allocating a fresh style object every render.

Interview trap:

Shadows are not cross-platform. iOS uses `shadowColor`, `shadowOffset`,
`shadowOpacity`, `shadowRadius`; Android uses `elevation` only. Set both, or use
`boxShadow` on new enough versions.

## 5. What Is The Component Mount And Unmount Lifecycle?

Mount means React created the component instance and inserted its native views.
Unmount means React removed it and destroyed those views.

In function components the whole lifecycle is `useEffect`:

```tsx
useEffect(() => {
  // mount: subscribe, start timers, open sockets, fetch
  const subscription = DeviceEventEmitter.addListener("ping", onPing);

  return () => {
    // unmount (and before every re-run): clean up everything above
    subscription.remove();
  };
}, []);
```

```viz
type: flow
title: Effect lifecycle for one component
Render :: the component function runs and returns elements
Commit :: native views are created and attached
Effect runs :: useEffect callback fires after commit
Deps change :: cleanup runs, then the effect runs again
Unmount :: cleanup runs one last time; views are destroyed
```

What must be cleaned up, because none of it stops on its own:

- `setTimeout` / `setInterval` — `clearTimeout` / `clearInterval`
- event listeners and `NativeEventEmitter` subscriptions — `.remove()`
- WebSocket / EventSource connections — `.close()`
- in-flight requests — `AbortController.abort()`
- animation loops — cancel the frame or stop the animation
- geolocation watches, camera sessions, audio players

Interview trap:

In development with StrictMode, React mounts, unmounts, and remounts a component
once on purpose. If your effect leaks — two sockets, a doubled interval — you see
it immediately. That double invoke is a feature, not a bug, and it does not happen
in release builds.

Interview note:

Unmount is not the same as "the screen went away". With a native stack navigator,
pushing a new screen keeps the previous screen **mounted** underneath. It is
still subscribed, still holding memory, still re-rendering if its state changes.
Use `useFocusEffect` when you want focus-scoped behaviour rather than
mount-scoped behaviour.

## 6. How Do You Write Platform-Specific Code?

Three levels, from smallest to largest difference.

**One value differs** — `Platform.select` or `Platform.OS`:

```tsx
import { Platform, StyleSheet } from "react-native";

const styles = StyleSheet.create({
  header: {
    paddingTop: Platform.select({ android: 12, ios: 44 }),
    ...Platform.select({
      android: { elevation: 4 },
      ios: { shadowOpacity: 0.1, shadowRadius: 8 },
    }),
  },
});
```

**Behaviour differs** — branch explicitly:

```tsx
if (Platform.OS === "android") {
  await requestAndroidPermission();
}
```

**The whole implementation differs** — use platform file extensions. Metro
resolves `Picker.ios.tsx` or `Picker.android.tsx` automatically from a single
`import { Picker } from "./Picker"`:

```txt
components/
  Picker.ios.tsx
  Picker.android.tsx
  Picker.tsx        <- optional shared fallback
```

You can also check the OS version, which matters for permissions that changed
behaviour:

```tsx
const isAndroid13Plus = Platform.OS === "android" && Platform.Version >= 33;
```

Tradeoff:

Platform files give clean separation but double the code you maintain and hide
the difference from a reader of the call site. Prefer `Platform.select` for small
divergence; reach for separate files only when the implementations genuinely
share nothing.

## 7. Expo Or The React Native CLI — How Do You Choose?

Expo is a framework and toolchain on top of React Native. The bare CLI gives you
the raw native projects.

Benefits:

- Expo gives you a configured build pipeline, over-the-air updates, a large set
  of maintained native modules, and cloud builds through EAS.
- `expo-router`, `expo-image`, `expo-secure-store` and friends cover most of what
  an app needs without touching Xcode or Gradle.
- Config plugins let you modify native project files declaratively, so you can
  use custom native code and still never hand-edit `AndroidManifest.xml`.

Tradeoff:

- A native library with no Expo support needs a development build, which removes
  the "just scan the QR code" workflow.
- You inherit Expo's SDK release cadence, which is tied to specific React Native
  versions.
- Very unusual native requirements — a custom fork of a native SDK, deep build
  customisation — are simpler in a bare project.

Strong answer:

> I default to Expo now, because the React Native docs themselves point new apps
> at a framework, and I would otherwise rebuild the same build, update, and
> asset pipeline by hand. I would go bare if the app depended on native code that
> could not be expressed as a config plugin, or if an existing native app was
> adopting React Native incrementally.

## 8. How Does Navigation Work In React Native?

There is no URL bar and no history object. Navigation is a component tree plus a
navigation state, usually via **React Navigation** (or `expo-router`, which wraps
it with file-based routes).

```tsx
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { NavigationContainer } from "@react-navigation/native";

const Stack = createNativeStackNavigator();

export function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen component={FeedScreen} name="Feed" />
        <Stack.Screen component={PostScreen} name="Post" />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

The navigator types you are expected to know:

- **Native stack** — push/pop backed by the real platform navigator, so you get
  native transitions, swipe-back, and large titles. Prefer it over the JS stack.
- **Bottom tabs** — sibling screens, each keeping its own stack.
- **Drawer** — side menu.
- Nesting these is normal: tabs at the root, a stack inside each tab.

```tsx
const navigation = useNavigation();
const { id } = useRoute().params;

navigation.navigate("Post", { id: 42 });
```

Interview note:

Screens in a stack stay mounted when you push on top of them. That is why
`useFocusEffect` exists — to run something when a screen becomes focused rather
than when it mounts. Pass only serialisable params (ids, not objects), because
params are stored in navigation state and persisted across reloads.

## 9. How Do You Handle Touch — Pressable vs The Touchables?

`Pressable` is the current API and the one to reach for. The older
`TouchableOpacity`, `TouchableHighlight`, and `TouchableWithoutFeedback` still
exist and still ship, but `Pressable` supersedes them.

```tsx
<Pressable
  hitSlop={8}
  onPress={handlePress}
  style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
>
  <Text style={styles.label}>Save</Text>
</Pressable>
```

Why `Pressable` is better:

- `style` and `children` accept a function receiving `{ pressed }`, so press
  feedback is explicit rather than a fixed opacity animation.
- It exposes `onPressIn`, `onPressOut`, `onLongPress`, plus `delayLongPress` and
  `unstable_pressDelay`.
- `hitSlop` and `pressRetentionOffset` are first class.

Two things worth knowing:

- Touch targets should be at least 44x44 points. `hitSlop` expands the touchable
  area **without** changing layout — the trick for small icon buttons.
- A `View` does not respond to touches. Only touch-handling components do, which
  is why wrapping in `Pressable` is so common.

## 10. How Do You Handle The Keyboard And Safe Areas?

These are the two layout problems that do not exist on the web and that
interviewers use to tell app developers from web developers.

**Safe areas** — notches, dynamic islands, home indicators, and status bars.
Never hard-code `paddingTop: 44`:

```tsx
import { useSafeAreaInsets } from "react-native-safe-area-context";

const insets = useSafeAreaInsets();

<View style={{ paddingBottom: insets.bottom, paddingTop: insets.top }} />;
```

Use the hook rather than `SafeAreaView` when you need the inset applied to only
one edge, or applied as margin rather than padding.

**Keyboard** — the keyboard covers the bottom of the screen and does not move
your layout by itself:

```tsx
<KeyboardAvoidingView
  behavior={Platform.OS === "ios" ? "padding" : "height"}
  style={{ flex: 1 }}
>
  <ScrollView keyboardShouldPersistTaps="handled">{form}</ScrollView>
</KeyboardAvoidingView>
```

Edge cases:

- `behavior` genuinely differs per platform; `padding` on Android often
  double-counts because Android already resizes the window.
- Without `keyboardShouldPersistTaps="handled"`, the first tap only dismisses the
  keyboard and your button appears to do nothing.
- Android's behaviour also depends on `windowSoftInputMode` in the manifest.
- For anything complex, `react-native-keyboard-controller` is the current
  community answer.

## 11. How Do You Handle Images And Assets?

Two kinds of image source, and they behave differently.

```tsx
// Bundled: resolved at build time, dimensions known, no network
<Image source={require("./logo.png")} />

// Remote: must be given a size, loads asynchronously
<Image source={{ uri: url }} style={{ height: 80, width: 80 }} />
```

- **`require` is static.** The path must be a literal string; you cannot build it
  at runtime. Map keys to requires instead.
- **Remote images have no intrinsic size.** Without explicit `width`/`height` (or
  a flex-based size) they render at zero.
- Provide `@2x` and `@3x` variants beside the base file; Metro picks the right
  density automatically.
- `resizeMode` (`cover`, `contain`, `stretch`, `center`) controls fit.

Interview note:

The built-in `Image` has weak caching. For image-heavy lists, `expo-image` or
`react-native-fast-image` add real disk caching, better memory behaviour, and
placeholder/transition support. Naming that tradeoff is usually the point of the
question.

## 12. How Do You Support Different Screen Sizes?

```tsx
import { Dimensions, PixelRatio, useWindowDimensions } from "react-native";

const { height, width } = useWindowDimensions(); // re-renders on change
```

Use `useWindowDimensions` rather than `Dimensions.get("window")`, because the
hook updates on rotation, split-screen, and foldables while the static call
returns a stale snapshot captured at import time.

Rules that keep layouts adaptive:

- Prefer `flex`, `gap`, and percentages over fixed widths.
- Use `minHeight` / `maxWidth` instead of exact sizes for cards and text.
- `window` is the app's visible area; `screen` is the whole physical display —
  they differ on Android with a visible navigation bar.
- Respect OS font scaling. `allowFontScaling` is on by default and users do
  increase it; test at large text sizes instead of disabling it.

## 13. Why Does The App Behave Differently In Debug And Release Builds?

Because they are genuinely different builds.

| | Debug | Release |
| --- | --- | --- |
| Bundle | served live by Metro | compiled into the binary |
| JS | not minified, dev warnings on | minified, `__DEV__` false |
| React | development build, extra checks | production build |
| Native | debug symbols, assertions on | optimised, R8/ProGuard |
| Speed | much slower | representative |

Consequences to state out loud:

- **Never measure performance in debug.** A list that stutters in debug is often
  perfectly smooth in release.
- Code inside `if (__DEV__)` is stripped in release, which is how you keep debug
  logging out of production.
- Crashes that only happen in release are usually minification-related —
  something depending on `Function.name` or class names surviving R8.

## 14. How Do You Debug A React Native App?

- **React Native DevTools** is the current built-in debugger: press `j` in the
  Metro terminal or use the Dev Menu. It gives a Chrome-DevTools-style console,
  breakpoints, a React component inspector, and a profiler, connected to Hermes
  directly. Flipper was removed from the default template; do not name it as your
  current answer.
- **The Dev Menu** (shake, or `d` in Metro) toggles Fast Refresh, the element
  inspector, and the performance monitor.
- **The Performance Monitor** overlay shows JS and UI frame rates — the fastest
  way to tell whether a stutter is a JS-thread problem or a rendering problem.
- **Native tooling** for native crashes: Xcode console and Instruments, Android
  Studio's Logcat and profiler. A stack trace full of native frames means the
  JS debugger will not help you.
- **`npx react-native info`** and a clean Metro cache (`--reset-cache`) resolve a
  surprising share of "it works on my machine" problems.

## 15. How Do You React To The App Going To The Background?

`AppState` reports whether the app is active, in the background, or (iOS only)
inactive during a transition.

```tsx
useEffect(() => {
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      refetchStaleData();
    } else if (state === "background") {
      flushAnalytics();
      lockSensitiveScreens();
    }
  });

  return () => subscription.remove();
}, []);
```

Why it matters:

- The OS suspends your process in the background. Timers stop firing, sockets are
  dropped, and long-running work is killed — a "background sync" that is just a
  `setInterval` does not survive.
- Coming back to the foreground after hours means your cached data, and possibly
  your access token, are stale. Revalidate on `active`.
- Security-sensitive apps blur or hide the screen before backgrounding, because
  the OS screenshots it for the app switcher.

## 16. What Is Fast Refresh?

Fast Refresh reloads edited modules and re-renders the affected components while
**keeping state**, as long as the edit was to a component.

The rules it follows:

- Edit a component that only renders JSX → state is preserved.
- Edit a module that exports non-component values, or a hook's implementation →
  React Native does a full reload of that module tree, so state is lost.
- A syntax error shows a redbox; fixing it resumes without a manual reload.
- Anonymous default exports (`export default () => ...`) break state
  preservation. Name your components.

Interview note:

Fast Refresh replaced the older "hot reloading" and "live reloading" pair. It
handles the common cases reliably enough that the distinction is now historical
trivia, but knowing that it deliberately falls back to a full reload for
non-component edits is the answer that shows you have used it.
