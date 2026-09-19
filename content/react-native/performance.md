# React Native Lists And Performance Interview Guide

Performance questions as they are actually asked: optimizing a `FlatList` with
thousands of items, how virtualization works, what the tuning props really do,
preventing re-renders, images, 60fps animations, startup time, memory leaks, and
how to profile instead of guess.

## 1. How Do You Optimize A FlatList With 1000+ Items?

Answer in the order you would actually work, cheapest and highest-impact first.

**1. Make each row cheap.** The list can only be as fast as one item render.
Flatten the view hierarchy, drop wrapper `View`s, avoid per-item `.map()`, and
move formatting (dates, currency) out of render or memoize it.

**2. Stop rows re-rendering when the list re-renders.** Wrap the row in
`React.memo` and make sure the props you pass are referentially stable.

```tsx
const Row = memo(function Row({ item, onPress }: RowProps) {
  return (
    <Pressable onPress={() => onPress(item.id)}>
      <Text>{item.title}</Text>
    </Pressable>
  );
});
```

**3. Stabilise `renderItem` and `keyExtractor`.** Defined inline, they are new
functions on every parent render.

```tsx
const renderItem = useCallback(
  ({ item }: { item: Product }) => <Row item={item} onPress={handlePress} />,
  [handlePress],
);
const keyExtractor = useCallback((item: Product) => item.id, []);
```

**4. Give it `getItemLayout` when rows are a fixed height.** This removes
on-the-fly measurement entirely.

```tsx
const getItemLayout = (_: unknown, index: number) => ({
  index,
  length: ROW_HEIGHT,
  offset: ROW_HEIGHT * index,
});
```

**5. Tune the windowing props** to the actual row height and screen size:

```tsx
<FlatList
  data={products}
  getItemLayout={getItemLayout}
  initialNumToRender={8}
  keyExtractor={keyExtractor}
  maxToRenderPerBatch={8}
  onEndReached={loadMore}
  onEndReachedThreshold={0.5}
  removeClippedSubviews
  renderItem={renderItem}
  updateCellsBatchingPeriod={50}
  windowSize={11}
/>
```

**6. Do not load 1000 items at once.** Paginate or use infinite scroll — the
fastest render is the one you never do.

**7. Optimize images in rows** — correctly sized thumbnails from the server,
`expo-image` or FastImage for disk caching, never a full-resolution photo in a
64px avatar.

**8. If it is still slow, change the list.** Shopify's `FlashList` recycles views
instead of mounting and unmounting them, and is the standard answer for very
large or heterogeneous lists.

Interview answer:

> I start by measuring which thread is dropping frames, then work outward: make
> the row cheap, memoize it with stable props, give the list `getItemLayout` and
> a stable `keyExtractor`, tune `windowSize` and the batch props to the real row
> height, and paginate the data. If the list is still dropping frames after that,
> I move to FlashList for view recycling. What I do not do is sprinkle `memo`
> everywhere first and hope.

## 2. How Does FlatList Virtualization Actually Work?

`FlatList` wraps `VirtualizedList`. Instead of mounting 1000 rows, it mounts only
the rows near the viewport and **unmounts** the ones far away, replacing them with
blank spacer views that preserve total scroll height.

```viz
type: stack
title: What exists in the native view tree
Above window :: unmounted - replaced by a single blank spacer
Render window :: mounted rows, windowSize viewports tall
Viewport :: what the user can actually see
Below window :: unmounted - replaced by a single blank spacer
```

The loop as you scroll: the scroll event goes to the JS thread, JS recomputes
which items fall inside the window, mounts the newly-visible ones, unmounts the
ones that left, and commits the change to native.

Two consequences that explain most FlatList questions:

- **Rendering is driven by JS.** If the JS thread is busy, new rows are not ready
  by the time they scroll into view, and you see blanks.
- **Rows are unmounted, so their state is destroyed.** A row holding local state
  (an expanded toggle, a video position) loses it on scroll-away. Lift that state
  to the list's data.

Interview trap:

`FlatList` unmounts and remounts; it does **not** recycle. That is the actual
difference from Android's `RecyclerView` and from FlashList, and it is why
mount cost per row matters so much.

## 3. What Do windowSize, initialNumToRender, And maxToRenderPerBatch Do?

| Prop | Default | Meaning | Raise it when | Lower it when |
| --- | --- | --- | --- | --- |
| `initialNumToRender` | 10 | rows rendered on first paint | first screen looks empty | first paint is slow |
| `windowSize` | 21 | render window in viewport units | blanks while scrolling | memory pressure |
| `maxToRenderPerBatch` | 10 | rows added per batch | scrolling can't keep up | batches block touch |
| `updateCellsBatchingPeriod` | 50ms | delay between batches | — | need faster fill |
| `removeClippedSubviews` | off | detach off-screen views natively | long lists, Android | rows misbehave |

How to reason about them:

- **`windowSize: 21`** means roughly 10 screens above, the visible screen, and 10
  screens below. That is deliberately generous. Dropping it to `5`-`11` cuts
  memory sharply; dropping it too far trades memory for blank cells.
- **`initialNumToRender` should cover one screen and no more.** Rendering 20 rows
  when 7 are visible directly delays time-to-interactive.
- **`maxToRenderPerBatch` is a throughput/responsiveness tradeoff.** Bigger
  batches fill faster but occupy the JS thread for longer, which makes taps feel
  laggy mid-scroll.

Edge cases:

`removeClippedSubviews` is an optimization with known bugs — missing or blank
content in some layouts, and broken behaviour with absolutely positioned
children. Turn it on, then actually test scrolling on both platforms before
keeping it.

## 4. When Should You Use getItemLayout?

Use it whenever every row has a **known, fixed height**.

Without it, the list must render a row, measure it with `onLayout`, and then know
its offset. With it, the list can compute any row's position arithmetically.

Benefits:

- Skips per-row measurement, which is a native round trip.
- Makes `scrollToIndex` and `initialScrollIndex` work reliably instead of
  throwing "scrollToIndex should be used in conjunction with getItemLayout".
- Produces an accurate scrollbar immediately.

```ts
// Fixed height plus a separator
const getItemLayout = (_: unknown, index: number) => ({
  index,
  length: ROW_HEIGHT + SEPARATOR,
  offset: (ROW_HEIGHT + SEPARATOR) * index,
});
```

When not to use it:

Variable-height rows — user-generated text, dynamic images. A wrong
`getItemLayout` is worse than none: scroll position drifts, `scrollToIndex` lands
in the wrong place, and the scrollbar lies. For variable heights, either fix the
height with `numberOfLines`, or move to FlashList, which handles variable sizes
natively.

## 5. What Makes A Good keyExtractor, And Why Do Keys Matter?

`keyExtractor` tells React which row is which across renders. The default looks
for `item.key`, then `item.id`, and falls back to the array index.

```tsx
keyExtractor={(item) => item.id}          // stable, unique  ✅
keyExtractor={(item, index) => String(index)}  // breaks on reorder ❌
keyExtractor={(item) => `${item.id}-${Math.random()}`} // remounts everything ❌
```

Why index keys break:

When an item is inserted at the top, every subsequent item's key shifts by one.
React sees "the item with key 0 changed its content" rather than "a new item
appeared", so it re-renders every row, throws away their state, and restarts
their images and animations. With a delete, rows can visually swap content.

The key must be **stable** (same item, same key across renders), **unique**, and a
**string**. If the API has no id, derive one deterministically from fields that do
not change — do not generate it during render.

## 6. Why Does renderItem Cause Unnecessary Re-Renders?

Three separate mistakes usually hide behind "my rows re-render":

```tsx
// ❌ new function identity every parent render
renderItem={({ item }) => <Row item={item} onPress={() => open(item.id)} />}
```

- **The inline `renderItem`** is a new function each render, so the list treats
  its content as changed.
- **The inline `onPress`** is a new closure per row per render, so even a
  `memo`-wrapped `Row` re-renders — `memo` compares props shallowly and the
  function reference differs every time.
- **Inline objects and arrays** (`style={{ padding: 8 }}`,
  `data={items.filter(...)}`) have the same problem. `filter` in JSX creates a new
  array every render, which invalidates the list's data comparison.

```tsx
// ✅ stable identities
const handlePress = useCallback((id: string) => open(id), [open]);
const renderItem = useCallback(
  ({ item }) => <Row item={item} onPress={handlePress} />,
  [handlePress],
);
const visible = useMemo(() => items.filter(isVisible), [items]);
```

Inside the row, pass the id back up instead of capturing it in a new closure:

```tsx
const Row = memo(({ item, onPress }) => {
  const press = useCallback(() => onPress(item.id), [item.id, onPress]);
  return <Pressable onPress={press}>{/* ... */}</Pressable>;
});
```

Interview note:

`extraData` exists for the case where a row depends on something outside `data` —
a selected id, a multi-select set. Without it, the list will not re-render rows
when that external value changes. With the React Compiler enabled, much of the
manual `useCallback`/`useMemo` work above is done for you, but the stable-key and
cheap-row rules still apply.

## 7. ScrollView, FlatList, SectionList, Or FlashList?

| Component | Renders | Use it for |
| --- | --- | --- |
| `ScrollView` | everything, immediately | short, known, small content |
| `FlatList` | a window, mount/unmount | long uniform lists |
| `SectionList` | a window, with sticky headers | grouped data |
| `FlashList` | recycled views | very long or heavy lists |

- **`ScrollView` renders every child up front.** Fine for a settings screen with
  12 rows; catastrophic for 1000. The rule of thumb is: if the count is unbounded
  or comes from an API, it is a `FlatList`.
- **`FlashList`** recycles item views instead of unmounting them, which removes
  most of the mount cost and the blank-cell problem. Its main constraint is that
  recycled rows must not hold internal state, exactly like a `RecyclerView`.

Interview trap:

Never nest a `FlatList` inside a `ScrollView` with the same orientation — React
Native warns about it explicitly. Virtualization needs to know the viewport, and a
`ScrollView` gives its child unbounded height, so every row mounts and you get the
memory cost of both. Use `ListHeaderComponent` / `ListFooterComponent`, or
`SectionList`, instead.

## 8. How Do You Implement Infinite Scroll?

```tsx
<FlatList
  data={items}
  ListFooterComponent={isFetchingMore ? <ActivityIndicator /> : null}
  onEndReached={handleEndReached}
  onEndReachedThreshold={0.5}
  onRefresh={refresh}
  refreshing={isRefreshing}
/>
```

```tsx
const handleEndReached = useCallback(() => {
  if (isFetchingMore || !hasNextPage) return; // guard against repeat fires
  fetchNextPage();
}, [fetchNextPage, hasNextPage, isFetchingMore]);
```

Edge cases:

- `onEndReached` **fires repeatedly** — on mount with a short list, and multiple
  times while scrolling. The `isFetching`/`hasNextPage` guard is mandatory.
- **Offset pagination duplicates or skips rows** when the underlying data changes
  between pages. Cursor (keyset) pagination does not — this is the same
  `WHERE id > ?` argument as in SQL.
- Appending to `data` must create a new array, but the **existing item objects
  must keep their identity**, or every previous row re-renders.
- Keep an empty state (`ListEmptyComponent`) and an error-with-retry state; a
  permanently spinning footer is the usual bug.

## 9. Why Do Blank Cells Appear While Scrolling Fast?

Because the JS thread cannot produce rows as fast as the native scroll moves.
Native scrolling runs on the UI thread and never waits for JS, so you scroll past
the render window and see the spacer.

Symptom:

Blank rectangles that fill in a moment later, worse on low-end Android, worse
with heavy rows, and always worse in debug builds.

Fixes, in order:

1. Make the row cheaper — this is the root cause most of the time.
2. Add `getItemLayout` so no measurement is needed.
3. Raise `windowSize` and `maxToRenderPerBatch` so more is ready in advance.
4. Render a lightweight placeholder for off-screen rows.
5. Move to FlashList, which recycles and so has far less work per row.
6. Confirm you are testing a **release build** — debug JS is several times slower.

## 10. How Do You Prevent Unnecessary Re-Renders In A React Native App?

The same React rules apply, with mobile stakes:

- **`React.memo`** for components that receive the same props often — list rows
  above all.
- **`useCallback` / `useMemo`** to keep props referentially stable. Memoizing a
  component while passing it a fresh object every render does nothing.
- **Split context.** One context holding `{ user, theme, cart }` re-renders every
  consumer when any part changes. Split by update frequency.
- **Keep state local.** State lifted to a screen root re-renders the whole screen;
  state that lives in the input that owns it does not.
- **Selectors** (Zustand, Redux `useSelector`, `useSyncExternalStore`) so a
  component subscribes to a slice, not the store.
- **`useRef` for values that are not rendered** — scroll offsets, timers, socket
  instances, animation values.

How to find them rather than guess: the React DevTools profiler in React Native
DevTools, with "highlight updates" on, shows exactly which components re-render
and why.

## 11. How Do You Optimize Images?

Images are the most common cause of memory pressure and jank on real devices.

- **Ship the right size.** A 3000x2000 JPEG in a 100dp avatar is decoded at full
  size into memory. Request server-side thumbnails.
- **Use a caching library.** `expo-image` or `react-native-fast-image` give disk
  and memory caching, placeholders, and cross-fade transitions that the built-in
  `Image` lacks.
- **Give explicit dimensions** for remote images so layout does not shift.
- **Prefer WebP/AVIF** where supported — often half the bytes.
- **Do not animate large images**; animate a smaller placeholder and swap.
- **Watch total memory**, not per-image size. Fifty cached full-size bitmaps is an
  out-of-memory crash on a low-end Android device, and those crashes rarely show
  up in JS error tracking.

## 12. How Do You Keep Animations At 60fps?

The rule is: **animation must not depend on the JS thread per frame.**

```tsx
// Animated API - offload to native
Animated.timing(opacity, {
  duration: 200,
  toValue: 1,
  useNativeDriver: true, // required
}).start();
```

`useNativeDriver: true` sends the whole animation description to the native side
once, so it keeps running even if JS is busy. The limitation: it supports only
non-layout properties — `transform`, `opacity`. Width, height, top, and left
cannot be driven natively.

For anything beyond that, **Reanimated** is the standard:

```tsx
const offset = useSharedValue(0);
const style = useAnimatedStyle(() => ({
  transform: [{ translateX: offset.value }],
})); // this function runs on the UI thread as a worklet

const gesture = Gesture.Pan().onUpdate((e) => {
  offset.value = e.translationX; // no JS round trip per frame
});
```

Why it matters:

Reanimated compiles those functions into **worklets** that execute on the UI
thread, so gesture-driven animation stays at 60fps while the JS thread is
rendering a list or parsing a response. `react-native-gesture-handler` does the
same for touch handling.

Other rules: animate `transform` instead of layout properties, avoid
`LayoutAnimation` on complex trees, and use `InteractionManager.runAfterInteractions`
to defer expensive work until an animation or transition has finished.

## 13. How Do You Improve App Startup Time?

Startup is native init + JS bundle load + first render, and each part is
attackable.

- **Hermes** (default) precompiles JavaScript to bytecode at build time, so there
  is no parse/compile at launch. This is the single biggest startup win and the
  reason Hermes exists.
- **Inline requires** turn top-level imports into lazy ones, so a module is
  evaluated on first use rather than at bundle load. Metro enables this by
  default in recent versions; confirm rather than assume.
- **Do less at module scope.** A top-level `new Analytics()` or a heavy constant
  computed at import time runs before your first pixel.
- **Lazy-load routes and heavy screens** — `React.lazy` plus Suspense, or the
  navigator's own lazy option.
- **Defer non-critical init** (analytics, crash reporter config, remote config)
  with `InteractionManager.runAfterInteractions` or after first paint.
- **Control the splash screen** (`expo-splash-screen`) so you hide it when the
  first screen is genuinely ready, instead of showing a blank frame.
- **Trim the dependency graph.** Every module in the bundle costs load time even
  if unused, unless it is lazily required.

## 14. How Do You Find And Fix Memory Leaks?

Symptom:

Memory climbs as the user navigates and never comes back down; the app is killed
in the background; low-end Android crashes with no JS stack trace.

The usual causes are all "something outlived its component":

- timers and intervals never cleared
- event listeners and `NativeEventEmitter` subscriptions never removed
- WebSockets and geolocation watches never closed
- closures capturing large objects held by a long-lived subscription
- images and cached responses growing without bound
- navigation params carrying large objects, kept alive in navigation state
- a global store accumulating every API response ever fetched

How to investigate:

- Xcode Instruments (Allocations / Leaks) for iOS, Android Studio's Memory
  Profiler for Android — memory leaks are native-side observations.
- The Memory tab in React Native DevTools for JS heap snapshots; compare two
  snapshots taken after repeating the same navigation ten times.
- Reproduce with the **repeat test**: push and pop the same screen twenty times
  and watch whether memory returns to baseline.

## 15. What Tools Do You Use To Profile React Native?

- **Performance Monitor** (Dev Menu) — the fastest triage. It shows **JS fps** and
  **UI fps** separately. Low JS fps means your JavaScript is the bottleneck; low
  UI fps with healthy JS means the native side is — too many views, expensive
  shadows, huge images.
- **React Native DevTools** — console, breakpoints, React component tree, and the
  React profiler with render reasons.
- **React DevTools Profiler** — which components rendered, how long, and why.
- **Xcode Instruments / Android Studio Profiler / Perfetto** — CPU, memory, and
  frame timing at the native level.
- **Production RUM** — Sentry or Firebase Performance for real-device startup
  time, slow frames, and frozen frames across your actual user base.

Interview answer:

> I measure before I change anything. The Performance Monitor tells me which
> thread is the problem, which decides the whole direction: JS-thread problems
> are re-renders, heavy list items, or work on the wrong thread; UI-thread
> problems are view count, images, shadows, and overdraw. Then I profile that
> specific hypothesis rather than applying a checklist of optimizations blind.
