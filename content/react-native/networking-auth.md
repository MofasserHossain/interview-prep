# React Native Networking, Auth And Storage Interview Guide

The production half of a React Native interview: making API calls, cancelling
them when a component unmounts, Axios versus Fetch, handling slow and flaky
networks, the authentication flow, bearer and refresh tokens, where tokens are
allowed to live, AsyncStorage limitations, secure storage, WebSockets, and
offline behaviour.

## 1. How Do You Implement An API Call With Fetch?

`fetch` is available globally in React Native — it is a polyfill implemented on
top of `XMLHttpRequest`, not the browser's native implementation.

```tsx
async function getUser(id: string): Promise<User> {
  const response = await fetch(`${API_URL}/users/${id}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as User;
}
```

Inside a component:

```tsx
function UserScreen({ id }: { id: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    getUser(id, controller.signal)
      .then(setUser)
      .catch((cause) => {
        if (cause.name !== "AbortError") setError(cause);
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [id]);

  if (isLoading) return <ActivityIndicator />;
  if (error) return <ErrorView onRetry={refetch} />;
  return <Profile user={user} />;
}
```

Interview trap:

`fetch` **does not reject on 4xx or 5xx**. It only rejects on network failure.
Forgetting `response.ok` means a 500 with an HTML error page reaches
`response.json()` and throws a confusing JSON parse error instead of a clean HTTP
error. This is the single most common fetch mistake, and interviewers look for it.

Interview note:

React Native's `fetch` is backed by XHR, so **streaming responses are not
supported** — the body is fully buffered before `text()` or `json()` resolves.
Token-by-token LLM streaming needs `react-native-sse`, `expo/fetch`, or a
WebSocket instead.

## 2. Axios Or Fetch — When And Why?

| | `fetch` | `axios` |
| --- | --- | --- |
| Availability | built in | extra dependency (~13KB) |
| HTTP errors | resolves; check `response.ok` | rejects automatically |
| JSON | manual `await res.json()` | automatic both ways |
| Timeout | none; wire up `AbortSignal` | `timeout` option |
| Interceptors | none; wrap it yourself | first class |
| Upload progress | not supported | `onUploadProgress` |
| Cancellation | `AbortController` | `AbortController` |

When to use it:

Reach for Axios when the app has **cross-cutting request concerns**: attaching a
bearer token to every call, refreshing an expired token and replaying the
original request, normalising error shapes, logging, and retries. Interceptors
are the real reason to pay for the dependency — the alternative is writing your
own wrapper that does the same thing.

```ts
const api = axios.create({ baseURL: API_URL, timeout: 10_000 });

api.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${getAccessToken()}`;
  return config;
});
```

Stay on `fetch` for a small app, a library that must not force a dependency on
consumers, or when you are already using a data layer (TanStack Query, RTK Query)
that handles caching and retries and leaves only the transport to you.

Strong answer:

> The transport itself is not the interesting choice — both do HTTP. I pick based
> on what I need around the request. If I need token refresh with request replay,
> upload progress, and a consistent error shape, Axios interceptors save me
> writing that layer. If I already have TanStack Query doing caching, retries,
> and deduplication, `fetch` plus a thin wrapper is enough and ships less code.

## 3. How Do You Handle An API Call When The Component Unmounts?

Two separate problems, and a good answer separates them:

1. **Stop the work** — the request should be cancelled so it stops consuming
   bandwidth, CPU, and a connection slot.
2. **Stop the state update** — even if the request finishes, a component that is
   gone must not have `setState` called on it.

`AbortController` solves both, and it is supported in React Native:

```tsx
useEffect(() => {
  const controller = new AbortController();

  fetch(`${API_URL}/feed`, { signal: controller.signal })
    .then((response) => response.json())
    .then(setFeed)
    .catch((error) => {
      if (error.name === "AbortError") return; // expected on unmount
      setError(error);
    });

  return () => controller.abort();
}, []);
```

With Axios, pass the same signal:

```ts
axios.get("/feed", { signal: controller.signal });
```

When you cannot cancel — a third-party SDK, a native module, a promise with no
signal support — fall back to an **ignore flag**, which fixes problem 2 only:

```tsx
useEffect(() => {
  let isActive = true;

  legacySdk.loadFeed().then((feed) => {
    if (isActive) setFeed(feed);
  });

  return () => {
    isActive = false;
  };
}, []);
```

Important:

React no longer logs the "can't perform a React state update on an unmounted
component" warning — it was removed because it produced false positives. The
warning going away did **not** make the leak go away. An uncancelled request still
holds its closure, its response body, and everything they reference until it
settles.

Interview note:

The ignore flag also fixes **race conditions**, which is why it matters even when
nothing unmounts. If `id` changes from 1 to 2, the cleanup runs before the new
effect, so a slow response for `id: 1` arriving after `id: 2` is discarded instead
of overwriting the newer data with older data.

## 4. How Do You Handle Multiple API Calls When A Component Unmounts?

**One controller can abort many requests.** Pass the same signal to each call, and
a single `abort()` cancels all of them.

```tsx
useEffect(() => {
  const controller = new AbortController();
  const { signal } = controller;

  async function load() {
    try {
      const [profile, orders, notifications] = await Promise.all([
        fetchJson("/profile", { signal }),
        fetchJson("/orders", { signal }),
        fetchJson("/notifications", { signal }),
      ]);

      setState({ notifications, orders, profile });
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      setError(error as Error);
    }
  }

  load();

  return () => controller.abort();
}, [userId]);
```

Three refinements worth mentioning:

- **`Promise.allSettled` when the calls are independent.** With `Promise.all`, one
  failed notification request blanks the entire screen. `allSettled` lets you
  render the profile and show an inline error for the part that failed.
- **Sequential calls need a check between steps**, because aborting mid-chain only
  stops requests that have actually started:

  ```ts
  const user = await fetchJson("/me", { signal });
  if (signal.aborted) return;
  const orders = await fetchJson(`/orders?user=${user.id}`, { signal });
  ```

- **`AbortSignal.any([controller.signal, AbortSignal.timeout(8000)])`** combines
  unmount cancellation with a per-request timeout, when your runtime supports it.

Strong answer:

> I create one `AbortController` per effect, thread its signal through every
> request in that effect, and abort it in cleanup. That way the number of calls
> does not change the shape of the code. I use `Promise.all` when the screen is
> useless without all of them and `allSettled` when parts of the screen can
> degrade independently, and I swallow `AbortError` because it is expected, not a
> failure.

## 5. How Do You Handle Slow APIs?

Split the answer into what you control on the client and what you push back to
the backend — interviewers want to hear both.

On the client:

- **Always set a timeout.** `fetch` has none, so a hung request spins forever.
  10-15s is typical for user-facing calls.
- **Show structure immediately.** Skeleton screens beat spinners because the
  layout does not jump when data lands.
- **Cache and revalidate.** Render the last known data instantly, refresh in the
  background (TanStack Query's `staleTime` model). A slow API feels fast when it
  is not on the critical path of first paint.
- **Paginate.** Ask for 20 rows, not 2000.
- **Parallelise.** Two independent 800ms calls awaited in sequence cost 1.6s;
  `Promise.all` costs 800ms.
- **Optimistic updates** for writes — apply the change locally, reconcile or roll
  back when the server answers.
- **Retry with exponential backoff and jitter**, but only for idempotent calls or
  ones protected by an idempotency key.
- **Debounce** search-as-you-type and cancel the superseded request.

Pushing back:

- Ask for a thinner payload or field selection — mobile pays for every byte.
- Ask whether the slow part can be precomputed, cached, or moved to a webhook or
  push notification instead of a poll.
- Measure first: a p95 from the client (not the server's p50) tells you whether
  it is the API, the network, or your own JSON parsing.

Interview answer:

> First I measure where the time goes — DNS and TLS, server time, payload size,
> or parsing. Then I make the app stop waiting on it: cached data on screen
> immediately, background revalidation, pagination, parallel requests, a hard
> timeout, and a retry policy. In parallel I take the p95 numbers to the backend
> team, because a 4-second endpoint is their bug, and the client work is
> mitigation, not a fix.

## 6. Describe The Authentication Flow In A React Native App.

```viz
type: flow
title: Login to authenticated request
App launch :: read stored refresh token from secure storage
Restore session :: exchange refresh token for a fresh access token
No token :: render the auth stack (login / register)
Login :: POST credentials, receive access + refresh tokens
Persist :: refresh token to Keychain/Keystore, access token in memory
Navigate :: swap to the app stack - do not push, replace
Requests :: interceptor attaches Bearer access token
401 :: refresh once, replay the request, or log out
```

The structural part interviewers care about is **how the navigator is split**:

```tsx
function RootNavigator() {
  const { isRestoring, user } = useAuth();

  if (isRestoring) return <SplashScreen />;

  return user ? <AppStack /> : <AuthStack />;
}
```

Conditionally rendering two different navigators — rather than navigating from
Login to Home — means there is no back gesture from the app into the login
screen, and logging out unmounts every authenticated screen along with its state
and subscriptions.

Do not forget the **restore step**. A returning user must not see the login
screen flash before the session is restored; that is what the splash/hydrating
state is for.

Edge cases:

- Biometric unlock (`expo-local-authentication`) gates access to the stored
  token — it is not authentication by itself.
- OAuth and social login should use the system browser (`expo-auth-session`,
  ASWebAuthenticationSession / Custom Tabs) with PKCE, never an embedded WebView.
  Embedded WebViews are phishable and are rejected by major providers.
- Deep links returning from the browser need the auth callback route registered.

## 7. What Is The Difference Between A Bearer Token And A Refresh Token?

A **bearer token** is an access token sent on every request in the
`Authorization: Bearer <token>` header. "Bearer" literally means whoever holds it
can use it — there is no proof of possession, so it must be short-lived and must
never leak.

A **refresh token** is a long-lived credential whose only purpose is to obtain new
access tokens. It goes to one endpoint (`/auth/refresh`), never to your API.

| | Access token | Refresh token |
| --- | --- | --- |
| Lifetime | minutes (5-60) | days to months |
| Sent to | every API request | the refresh endpoint only |
| Contents | usually a JWT with claims | usually opaque |
| If stolen | limited blast radius | full account takeover |
| Revocation | expires naturally | must be revocable server-side |

Why it matters:

The split exists so that the credential you expose constantly is cheap to lose,
and the credential that is expensive to lose is almost never transmitted. That is
the entire argument, and it is the answer to "why not just use a long-lived
access token".

Interview note:

Good implementations use **rotation with reuse detection**: every refresh returns
a new refresh token and invalidates the old one. If an already-used refresh token
appears again, the server assumes theft and revokes the whole token family.

## 8. Where Should Access And Refresh Tokens Be Stored?

The ranking, best to worst:

1. **Access token in memory** — a module variable or context value. It dies with
   the process, which is exactly what you want for a token that lives minutes.
2. **Refresh token in the OS secure store** — iOS Keychain, Android Keystore via
   EncryptedSharedPreferences. `expo-secure-store` or `react-native-keychain`.
3. **Encrypted MMKV** — acceptable for moderately sensitive data, still not the
   right home for a refresh token.
4. **AsyncStorage — never.** It is plaintext.

```ts
import * as SecureStore from "expo-secure-store";

let accessToken: string | null = null; // memory only

export async function saveSession(session: Session) {
  accessToken = session.accessToken;
  await SecureStore.setItemAsync("refresh_token", session.refreshToken, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
```

Points that separate a strong answer:

- Keeping the access token **out of persistent storage entirely** costs one
  refresh call on cold start and removes a whole class of exposure.
- `THIS_DEVICE_ONLY` accessibility prevents the value syncing to iCloud Keychain
  and landing on other devices or in backups.
- On a **rooted or jailbroken device, nothing is safe.** Secure storage raises the
  cost of extraction; it does not make it impossible. The real mitigations are
  short token lifetimes, rotation, and server-side revocation.
- Redux Persist defaults to AsyncStorage. Persisting an auth slice quietly writes
  your tokens to plaintext — blacklist that slice.

Interview trap:

There are no HttpOnly cookies to hide behind in a mobile app, so "store it in an
HttpOnly cookie like on the web" is the wrong answer here. Cookies do work with a
native cookie jar, but the token still sits in app storage, and you lose the
per-request control that interceptors give you.

## 9. What Is AsyncStorage And What Are Its Limitations?

AsyncStorage is an unencrypted, asynchronous, **string-only key-value store**,
global to the app. It is the React Native equivalent of `localStorage`, and it
now lives in the community package
`@react-native-async-storage/async-storage`.

```ts
await AsyncStorage.setItem("theme", JSON.stringify({ mode: "dark" }));
const raw = await AsyncStorage.getItem("theme");
const theme = raw ? JSON.parse(raw) : defaultTheme;
```

Limitations:

- **No encryption.** Plaintext on disk. Never tokens, PII, or payment data.
- **Strings only.** Everything is `JSON.stringify` / `JSON.parse` by hand, so
  every read costs a parse and every write a serialise on the JS thread.
- **Whole-value reads and writes.** Changing one field of a large cached object
  rewrites the entire object. There is no partial update.
- **No queries, no indexes, no relations.** Finding "all unsynced orders" means
  reading and parsing everything.
- **Android has a size limit** — the SQLite-backed implementation defaults to
  about 6MB and needs a Gradle property to raise it. Silent write failures at
  scale are a classic production bug.
- **Asynchronous everywhere**, so it cannot be read during the first render. That
  is why apps flash the wrong theme or a login screen on launch.
- **No transactions or atomic multi-key writes**, so a crash mid-write can leave
  related keys inconsistent.

When to use it:

Small, non-sensitive, non-critical values: theme preference, onboarding-seen
flag, last-used filter, a small cache.

Alternatives to name:

- **MMKV** (`react-native-mmkv`) — synchronous, JSI-backed, dramatically faster,
  supports encryption. Being synchronous means it can be read during the first
  render, which kills the theme flash.
- **SQLite** (`expo-sqlite`, `op-sqlite`) or **WatermelonDB** for relational or
  large offline datasets.
- **SecureStore / Keychain** for secrets.

Strong answer:

> AsyncStorage is a plaintext, async, string-only key-value store with an Android
> size limit and no partial updates. I use it for preferences and small caches.
> Tokens go to SecureStore, anything performance-sensitive or needed on first
> render goes to MMKV because it is synchronous, and anything relational or large
> goes to SQLite.

## 10. How Do You Refresh A Token Without Firing Ten Refresh Calls?

When an access token expires, every in-flight request gets a 401 at roughly the
same moment. A naive interceptor fires one refresh per 401 — which, with token
rotation, invalidates the tokens of its own siblings and logs the user out.

The fix is **single-flight refresh**: the first 401 starts the refresh, everyone
else waits on the same promise.

```ts
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  refreshPromise ??= (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync("refresh_token");
      const { data } = await plainAxios.post("/auth/refresh", { refreshToken });
      await saveSession(data);
      return data.accessToken;
    } finally {
      refreshPromise = null; // allow the next cycle to refresh again
    }
  })();

  return refreshPromise;
}

api.interceptors.response.use(undefined, async (error) => {
  const request = error.config;

  if (error.response?.status !== 401 || request._retried) {
    throw error;
  }

  request._retried = true; // one replay only, never a loop

  try {
    const token = await refreshAccessToken();
    request.headers.Authorization = `Bearer ${token}`;
    return api(request);
  } catch {
    await logout();
    throw error;
  }
});
```

Important:

The `_retried` flag is what prevents an infinite loop when the refresh itself
returns 401. Also, the refresh call must use a **separate Axios instance** —
otherwise the failing refresh hits its own interceptor and recurses.

Interview note:

The alternative is **proactive refresh**: decode the JWT's `exp` and refresh
before it expires, or on app foreground. It avoids the 401 storm entirely, but
you still need the reactive path as a safety net for clock skew and
server-side revocation.

## 11. How Do You Use WebSockets In React Native?

`WebSocket` is built in — no library required — and is the right tool for chat,
live prices, presence, and order tracking, where polling would be wasteful.

```tsx
useEffect(() => {
  const socket = new WebSocket(`${WS_URL}?token=${accessToken}`);

  socket.onopen = () => setStatus("connected");
  socket.onmessage = (event) => handleMessage(JSON.parse(event.data));
  socket.onerror = (error) => log.warn("ws error", error);
  socket.onclose = (event) => {
    setStatus("disconnected");
    if (!event.wasClean) scheduleReconnect();
  };

  return () => {
    socket.onclose = null; // stop the reconnect from firing on unmount
    socket.close(1000, "component unmounted");
  };
}, [accessToken]);
```

What production code has to add:

- **Reconnect with exponential backoff and jitter**, capped. Without jitter, every
  client reconnects in lockstep and hammers the server after an outage.
- **App state handling.** Backgrounded apps are suspended and the socket dies
  silently. Reconnect on `AppState` returning to `active`, and reconcile missed
  messages with a REST fetch using a last-seen cursor.
- **Heartbeats.** You cannot send protocol-level ping frames from JavaScript, so
  send an application-level `{"type":"ping"}` on a timer and treat a missing pong
  as a dead connection. A TCP connection that has silently died looks identical to
  an idle one.
- **Auth.** A WebSocket handshake from JS cannot carry custom headers portably, so
  tokens usually go in a query parameter (which gets logged — use a short-lived
  ticket token) or in a first `auth` message after open.
- **Cleanup**, as above: null the handler before closing so the unmount does not
  trigger a reconnect.

Tradeoff:

`socket.io-client` adds reconnection, heartbeats, rooms, and fallbacks for free,
but requires a Socket.IO server and is not plain WebSocket. Raw `WebSocket` keeps
the server simple and puts the reliability work on you.

## 12. How Do You Handle Offline And Flaky Networks?

Mobile networks fail differently from desktop: not "offline", but 3 bars of
nothing, captive portals, and 40-second lie-flat timeouts.

- **Detect** with `@react-native-community/netinfo`, and trust
  `isInternetReachable` over `isConnected` — connected to a Wi-Fi network that
  goes nowhere is the common case.
- **Cache reads** so screens render from last-known data instead of an error.
- **Queue writes** in a durable outbox (SQLite/MMKV), with an idempotency key per
  operation, and drain it when connectivity returns.
- **Show honest state** — a "pending sync" badge, not a fake success.
- **Resolve conflicts explicitly.** Last-write-wins is a decision, not a default;
  say which one you picked and why.
- **Retry only what is safe.** GET and idempotent PUT/DELETE, yes. A POST that
  charges a card, only with an idempotency key.

## 13. How Do You Handle Logout Safely?

Logout is not just clearing state:

```ts
export async function logout() {
  await api.post("/auth/logout").catch(() => {}); // revoke server-side, best effort
  accessToken = null;
  await SecureStore.deleteItemAsync("refresh_token");
  await AsyncStorage.multiRemove(["cached_profile", "cached_feed"]);
  queryClient.clear(); // drop cached responses
  socket?.close();
  setUser(null); // flips RootNavigator back to the auth stack
}
```

The parts people forget: revoking the refresh token **server-side** (otherwise it
stays valid until expiry), clearing cached API responses (the next user on a
shared device should not see them), closing sockets, and unregistering the push
token so notifications stop following the logged-out user.

## 14. Can You Keep API Keys Secret In A React Native App?

No. Anything in the JS bundle or in `Info.plist` / `AndroidManifest.xml` ships to
the device and can be extracted from the app package in minutes. `.env` files
bundled with `react-native-config` or `babel-plugin-dotenv` are **build-time
substitution**, not secrecy.

What to do instead:

- Keep secrets on a backend and let the app call your backend, which calls the
  third party. This is the answer for payment providers, LLM APIs, and anything
  billable.
- Use keys that are **designed to be public** (a Firebase web config, a publishable
  Stripe key) and restrict them server-side by bundle id, SHA fingerprint, or
  referrer.
- Use short-lived, per-user credentials minted by your backend.
- Add attestation (App Attest, Play Integrity) when abuse actually matters.

Strong answer:

> I treat the app binary as public. Anything that must stay secret lives behind
> my own API, and the app only ever holds user-scoped, short-lived credentials.
> Obfuscation raises the effort slightly but is not a security control, and I
> would not present it as one.
