# React Native Deep Linking And Notifications Interview Guide

The two features that look trivial in a demo and consume weeks in production:
custom schemes versus verified app links, hosting and debugging the association
files, wiring links into a nested navigator, cold start versus warm start,
deferred deep links, FCM and APNs delivery, Android notification channels,
foreground and background and killed-state handling, silent push, permission UX,
and diagnosing "notifications are not arriving".

## 1. What Kinds Of Links Can An App Respond To?

| Kind | Example | Verified | Falls back to web |
| --- | --- | --- | --- |
| Custom scheme | `myapp://post/42` | no | no — dead link |
| Universal Link (iOS) | `https://app.com/post/42` | yes, via AASA | yes |
| App Link (Android) | `https://app.com/post/42` | yes, via assetlinks | yes |
| Deferred deep link | link survives an install | no, needs a service | n/a |

**Custom schemes** are trivial to set up and are still the right tool for
internal navigation: OAuth callbacks, notification payloads, links you generate
yourself. Their flaw is that any app can register the same scheme, and a user
without the app installed gets an error page.

**Universal Links and App Links** are ordinary HTTPS URLs that the OS routes to
your app after verifying you own the domain. They cannot be hijacked, and they
degrade gracefully to your website when the app is not installed. This is the
answer for anything you send to users — emails, SMS, shared links, ads.

Strong answer:

> I use a custom scheme for internal plumbing like OAuth callbacks and
> notification payloads, and verified HTTPS links for anything a user might
> receive, because those can't be hijacked by another app and they fall back to
> the website when the app isn't installed. Shipping only a custom scheme means
> every link is broken for people who haven't installed yet, which is exactly the
> audience marketing is trying to reach.

## 2. How Do You Set Up Universal Links On iOS?

Three pieces, and all three must be right or the link silently opens Safari.

**1. Host the association file** at
`https://yourdomain.com/.well-known/apple-app-site-association`:

```json
{
  "applinks": {
    "details": [
      { "appIDs": ["TEAMID.com.yourcompany.app"], "components": [{ "/": "/post/*" }] }
    ]
  }
}
```

**2. Serve it correctly.** This is where most failures are: it must be HTTPS with
a valid certificate, `Content-Type: application/json`, **no `.json` extension**,
and **no redirects**. A CDN rule that redirects to `www.` breaks it.

**3. Add the Associated Domains entitlement** — `applinks:yourdomain.com` — which
requires the capability enabled on the App ID, so the provisioning profile must
be regenerated.

Edge cases:

- iOS fetches the file through Apple's CDN, so changes can take time to
  propagate. Append `?mode=developer` handling and enable the Associated Domains
  Development mode in device settings while testing.
- Universal Links **do not open from Safari's address bar** on the same domain, and
  do not fire from some in-app browsers. Testing by typing the URL into Safari
  and concluding it is broken is a classic false alarm.
- After a user taps the breadcrumb to open in Safari, iOS remembers that choice
  for that domain until they choose "Open in app" again.

## 3. How Do You Set Up App Links On Android?

**1. Host** `https://yourdomain.com/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.yourcompany.app",
    "sha256_cert_fingerprints": ["AB:CD:..."]
  }
}]
```

**2. Declare the intent filter** with `android:autoVerify="true"`:

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="yourdomain.com" />
</intent-filter>
```

Interview trap:

The `sha256_cert_fingerprints` must be the fingerprint of the key that **actually
signs the delivered APK**. With Play App Signing that is Google's app signing
key, not your upload key. Publishing your upload key's fingerprint is the single
most common reason App Links verify in a local build and fail in production — take
the fingerprint from the Play Console's App Integrity page.

Debugging:

```bash
adb shell pm get-app-links com.yourcompany.app   # shows verified / failed per host
adb shell pm verify-app-links --re-verify com.yourcompany.app
```

On Android 12+ verification is strict: if it fails, links open in the browser and
the user has to enable the association manually in system settings. There is no
warning at build time.

## 4. How Do You Wire Links Into React Navigation?

You declare a linking config that maps URL paths to your navigator structure —
including nested navigators, which is where it gets fiddly.

```tsx
const linking = {
  prefixes: ["myapp://", "https://app.com", "https://www.app.com"],
  config: {
    screens: {
      Tabs: {
        screens: {
          Feed: "feed",
          Profile: "user/:handle",
        },
      },
      Post: {
        path: "post/:id",
        parse: { id: (id: string) => id },
      },
      NotFound: "*",
    },
  },
};

<NavigationContainer fallback={<Splash />} linking={linking}>
```

Points worth making:

- **The config must mirror the navigator nesting.** A flat config against a nested
  navigator produces a link that resolves to nothing, with no error.
- **`parse` and `stringify`** convert between URL strings and typed params.
- **A `*` NotFound route** stops an unknown path silently doing nothing.
- **`fallback`** renders while the initial URL is being resolved, which prevents a
  flash of the default screen before the deep-linked one.
- The same config drives **`Linking.createURL`** for generating share links, so
  routes and links stay in sync.

## 5. How Do You Handle Cold Start Versus Warm Start?

This is the bug in nearly every first implementation: links work when the app is
already open and do nothing when it is closed.

```viz
type: flow
title: Two very different paths
Warm start :: app is running - a url event fires, navigator already exists
Cold start :: app launches - the url must be read AFTER the navigator mounts
Race :: handling the url before navigation is ready silently drops it
```

The two APIs:

```tsx
// Cold start: the URL that launched the app
const initialUrl = await Linking.getInitialURL();

// Warm start: the app is already running
const subscription = Linking.addEventListener("url", ({ url }) => handle(url));
return () => subscription.remove();
```

React Navigation's `linking` prop handles both for you, which is the reason to use
it rather than hand-rolling. If you *do* handle links manually — for analytics, or
to gate on auth — you must wait for the navigator:

```tsx
if (!navigationRef.isReady()) {
  pendingUrl.current = url; // replay it once navigation mounts
  return;
}
```

Interview note:

Test cold start by force-quitting the app first. A link tapped while the app is
merely backgrounded takes the warm path, so the cold-start bug never appears in
casual testing. That is why it reaches production so often.

## 6. How Do You Handle A Deep Link That Requires Authentication?

The user taps `app.com/order/88` while logged out. Dropping them on the login
screen and forgetting where they were going is the bad outcome.

```tsx
function handleLink(url: string) {
  const target = parse(url);

  if (requiresAuth(target) && !session) {
    pendingDestination.current = target;  // remember it
    navigate("Login");
    return;
  }

  navigate(target.screen, target.params);
}

// after a successful login
const target = pendingDestination.current;
if (target) {
  pendingDestination.current = null;
  navigate(target.screen, target.params);
}
```

Things to cover:

- **Persist the pending destination** if login involves leaving the app (OAuth in
  a system browser), because your process may be killed in the meantime.
- **Authorise on the server, not on the link.** A deep link is untrusted input —
  `order/88` must still be checked against the logged-in user server-side.
- **Validate and whitelist paths.** Blindly navigating to a route named in a URL,
  or passing link content into a WebView, is an injection vector.
- **Handle "wrong account"** — a link for account A tapped by account B needs a
  clear message, not an empty screen.

## 7. What Is Deferred Deep Linking?

A link tapped by someone **who does not have the app installed**. They go to the
store, install, and open — and the original context is gone, because the OS passes
nothing through an install.

Why it matters:

This is how marketing campaigns, referral codes, and invite links work. "Join my
team" must still land on that team after the user installs.

How it is solved: a third-party service (Branch, AppsFlyer, Adjust, or Firebase
Dynamic Links' successors) records a fingerprint or a click identifier at tap
time, and the SDK claims it on first launch after install.

Tradeoff:

It is inherently probabilistic on iOS, because fingerprint matching is limited by
privacy rules and App Tracking Transparency. Expect it to work most of the time,
not always, and design the fallback: ask the user to paste a referral code rather
than assuming attribution succeeded.

## 8. How Do You Test Deep Links?

```bash
# iOS simulator
xcrun simctl openurl booted "https://app.com/post/42"

# Android device or emulator
adb shell am start -W -a android.intent.action.VIEW \
  -d "https://app.com/post/42" com.yourcompany.app
```

The matrix that actually needs covering, because each combination behaves
differently: app **killed / backgrounded / foregrounded**, user **logged in /
logged out**, app **installed / not installed**, and link **scheme / verified
HTTPS**. Automate the common ones in a Maestro flow, because this is exactly the
area that regresses silently after a navigation refactor.

## 9. How Does A Push Notification Actually Get Delivered?

```viz
type: flow
title: Server to lock screen
Your backend :: decides to notify a user
Push service :: FCM for Android, APNs for iOS
Device token :: identifies one app install on one device
OS receives it :: the system - not your app - decides to display it
App state decides :: foreground, background, or killed take different paths
User taps :: your handler runs, and routes to a screen
```

The points that matter:

- **The token identifies an install, not a user.** Reinstalling, restoring a
  backup, or clearing data produces a new token. Store tokens server-side keyed
  by user *and* device, and refresh them on every launch.
- **The OS displays the notification, not your app.** When the app is killed,
  your JavaScript does not run at all for a standard notification.
- **Delivery is best-effort.** Both services drop messages for offline devices
  beyond a TTL, and Android battery optimizations delay them. Never rely on push
  for correctness — sync real state when the app opens.
- On iOS, APNs requires a push certificate or, preferably, an **APNs auth key**
  (`.p8`), which does not expire and works across all your apps.

## 10. What Are Android Notification Channels?

Since Android 8.0, **every notification must belong to a channel**, and a
notification posted to a nonexistent channel is silently dropped.

```ts
await notifee.createChannel({
  id: "orders",
  name: "Order updates",
  importance: AndroidImportance.HIGH, // heads-up banner + sound
});
```

Why it matters:

Channels move notification control from your app to the user. They can mute
"Marketing" while keeping "Order updates" at high importance, per channel, in
system settings.

Interview trap:

**Once a channel is created, you cannot raise its importance in code.** The user
owns it from that point. Shipping a channel with the wrong importance means every
existing install keeps the wrong behaviour forever, and the only fix is to create
a *new channel with a new id* — which loses the user's customisation. Get channel
design right before the first release: one channel per genuine category, named in
language the user understands.

## 11. How Do You Handle A Notification In Foreground, Background, And Killed States?

Three different code paths, and this is the question that separates people who
have shipped push from people who have read about it.

| State | Banner shown | Your JS runs |
| --- | --- | --- |
| Foreground | no, unless you show it | yes, in your handler |
| Background | yes, by the OS | only for data messages, limited |
| Killed | yes, by the OS | only when the user taps |

```tsx
// Foreground: you decide whether to display anything
messaging().onMessage(async (message) => {
  await notifee.displayNotification(toNotification(message));
});

// Background / killed: must be registered OUTSIDE the React tree, in index.js
messaging().setBackgroundMessageHandler(async (message) => {
  await updateLocalCache(message.data);
});

// Tap while backgrounded
messaging().onNotificationOpenedApp((message) => routeTo(message.data.link));

// Tap from killed - returns the message that launched the app, or null
const initial = await messaging().getInitialNotification();
if (initial) routeTo(initial.data.link);
```

Important:

`setBackgroundMessageHandler` must be registered at module scope in `index.js`,
not inside a component. On Android it runs as a **Headless JS** task with no UI,
and registering it inside the React tree means it does not exist when the app is
not running — which is precisely when it is needed.

Edge cases:

- On iOS, a user **force-quitting** the app stops background delivery entirely.
  Notifications with a display payload still appear; data-only ones do not arrive.
- Tapping from a killed state is `getInitialNotification`, not
  `onNotificationOpenedApp` — handling only the latter means taps work except from
  the lock screen after a reboot, which is a maddening bug report.

## 12. What Is A Silent (Data-Only) Push, And What Are Its Limits?

A push with no display payload, intended to wake the app and sync data in the
background.

```json
{ "content-available": 1, "data": { "type": "sync", "since": "2026-09-01" } }
```

The limits are severe, and knowing them is the point of the question:

- **iOS throttles them aggressively** — a few per hour at the system's discretion,
  lower priority than user-visible pushes, and not delivered at all if the user
  force-quit the app or is in Low Power Mode.
- **Android delays them under Doze** and App Standby unless sent as high priority,
  which itself has quotas.
- Neither platform guarantees delivery or timing.

When to use it:

As an *optimization* — a hint that lets the app prefetch so content is fresh when
opened. Never as the mechanism that makes data correct. If your feature breaks
when a silent push is dropped, the design is wrong; fetch on foreground instead.

## 13. How Do You Route From A Notification Tap To The Right Screen?

Put a link in the payload and reuse the deep linking system rather than building a
second routing mechanism:

```json
{ "notification": { "title": "Order shipped" },
  "data": { "link": "myapp://order/88" } }
```

```tsx
function routeTo(link?: string) {
  if (!link) return;
  if (!navigationRef.isReady()) {
    pendingLink.current = link;   // same cold-start replay as deep links
    return;
  }
  Linking.openURL(link);
}
```

Benefits:

One routing path for links, notifications, and OAuth callbacks means one set of
auth gating, one set of validation, and one place to fix the cold-start race.
Teams that build a separate `switch` on notification type end up with routing
that works for links and not for notifications, or vice versa.

## 14. How Do You Handle Notification Permissions Well?

- **iOS has always required permission.** Android added `POST_NOTIFICATIONS` as a
  runtime permission in Android 13 — an app that never handled it simply stops
  showing notifications on new devices, silently.
- **Ask in context, not on first launch.** A pre-permission screen explaining the
  value, shown at a moment when the benefit is obvious ("get notified when your
  order ships"), converts far better than a cold system prompt on launch.
- **You get one chance.** Once denied, the system dialog will not show again; you
  can only deep link to system settings with `Linking.openSettings()`.
- **Handle provisional authorization** on iOS if it fits — notifications are
  delivered quietly to Notification Centre without a prompt, and the user can
  promote them.
- **Respect the answer.** Check the current status on every launch, because the
  user can revoke it in settings at any time, and update your server so it stops
  sending.

## 15. How Do You Send Local And Scheduled Notifications?

Local notifications need no server and no network — reminders, timers, "your
session starts in 10 minutes".

```ts
await notifee.createTriggerNotification(
  { title: "Standup in 5 minutes", android: { channelId: "reminders" } },
  { type: TriggerType.TIMESTAMP, timestamp: Date.now() + 5 * 60 * 1000 },
);
```

Things to know: they still require notification permission, iOS caps pending
local notifications (64 per app), they do not survive an app uninstall, and
rescheduling on every launch is the usual way to keep a recurring reminder
accurate after a timezone change.

## 16. How Do You Debug "Notifications Are Not Arriving"?

Work down the chain, because the failure can be at any link:

1. **Permission** — is it actually granted, on this device, right now?
2. **Token** — did the device get one, and is it the token your backend is using?
   Log it and send a test push directly to it from the Firebase console or an
   APNs tool. This splits the problem in half immediately.
3. **Channel** (Android) — does the channel exist, and has the user muted it?
4. **Payload shape** — a `data`-only message when you expected a banner, or a
   malformed `notification` block.
5. **Credentials** — expired APNs key, wrong Firebase project, a `GoogleService-Info.plist`
   from the wrong environment, or a debug build using the sandbox APNs
   environment while the server sends to production.
6. **Device conditions** — Doze, battery optimization, Focus modes, force-quit on
   iOS, or an OEM Android skin that aggressively kills background apps.

Interview answer:

> I bisect it. First I send a push directly to the raw device token from the
> Firebase console — if that arrives, the device, permission, and channel are all
> fine and the problem is my backend or its credentials. If it does not, it is
> permission, token registration, or channel setup on the device. The most common
> real causes I have hit are the sandbox-versus-production APNs mismatch between a
> debug build and a production server, and Android 13 devices where the runtime
> notification permission was never requested.
