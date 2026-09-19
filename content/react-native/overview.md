# Mobile And React Native Interview Guide

Mobile interview guidance covering React Native fundamentals, native bridges,
navigation, performance, platform differences, offline behavior, and app
release concerns.

## 1. What Is React Native?

React Native lets developers build mobile apps using React concepts while
rendering native UI components.

Example:

```tsx
import { Text, View } from "react-native";

export function Profile() {
  return (
    <View>
      <Text>Hello</Text>
    </View>
  );
}
```

Strong answer:

> React Native is not a WebView by default. It uses React to describe UI and
> renders native platform components.

## 2. React Native vs Native Development

React Native can share business logic and UI across iOS and Android.

Benefits:

- faster cross-platform development
- shared team skills with React
- reusable components
- over-the-air updates in some setups

Tradeoffs:

- native modules may be needed
- platform differences still matter
- performance tuning can be harder
- upgrades require care

## 3. How Do You Improve React Native Performance?

Common techniques:

- avoid unnecessary re-renders
- use `FlatList` for large lists
- optimize images
- keep heavy work off the JS thread
- memoize expensive components carefully
- avoid excessive bridge communication
- profile with platform tools

Example:

```tsx
<FlatList
  data={users}
  keyExtractor={(user) => user.id}
  renderItem={({ item }) => <UserRow user={item} />}
/>
```

## 4. What Is The Native Bridge?

The bridge is the communication layer between JavaScript and native platform
code.

Example:

```txt
JavaScript calls camera module
  -> bridge/native interface
  -> iOS or Android camera API
```

Too much communication across the bridge can hurt performance, especially for
high-frequency events.

## 5. How Do You Handle Offline Mobile Apps?

Offline support requires local state and sync logic.

Use:

- local storage or SQLite
- optimistic updates
- background sync
- conflict resolution
- retry queues
- clear offline UI states

Strong answer:

> I design offline-first flows by saving user actions locally, showing pending
> status, syncing when network returns, and handling conflicts explicitly.
