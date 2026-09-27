# React Native Push Notifications At Scale Interview Guide

How a React Native app and its Node.js backend push notifications to millions
of devices through Firebase Cloud Messaging (FCM): registration tokens, topics,
audience segmentation, condition expressions, server-owned subscriptions,
multicast batching, queue-backed sending, token hygiene, broadcast throttling,
and payload design.

Device-side handling lives in the Deep Linking & Notifications guide: channels
in question 10, foreground, background, and killed states in question 11,
silent push in question 12, tap routing in question 13, and permissions in
question 14. This guide starts where that one stops: what happens between your
backend and Google, and how to keep it working at ten million users.

Every answer follows the same shape:

1. The plain answer in a few sentences.
2. Why it matters in production.
3. A diagram, a table, or short code for the client and the server.
4. Edge cases, tradeoffs, or the interview trap.
5. A strong answer you can say out loud.

## 1. How Does FCM Deliver One Message To Millions Of Devices?

Your backend never talks to a device. It sends one HTTPS request to the FCM v1
API that names a target: a single token, a topic, or a condition. FCM's backend
assigns a message id, expands a topic into every subscribed token, and hands
each copy to the transport layer for that platform. The device's OS receives it
over a connection it already keeps open and either shows a banner or wakes your
app.

```viz
type: flow
title: From one request to millions of lock screens
Your backend :: one HTTPS request naming a token, topic, or condition
FCM backend :: assigns a message id and fans a topic out to every subscriber
Transport layer :: Android keeps a persistent connection; iOS goes through APNs
Offline device :: FCM holds the message until its TTL expires, then drops it
Device OS :: shows the banner, or hands a data payload to your app
```

Why it matters:

The expensive part, turning one message into millions of deliveries, runs on
Google's side. A backend that loops over device rows and sends one request per
user is doing FCM's job badly and will be the first thing to fall over.

Who does what:

| Layer | Responsibility |
| --- | --- |
| Your backend | Decide who gets what, build the payload, call FCM once |
| FCM backend | Fan out topics, hold messages for offline devices, apply TTL and collapse rules |
| Platform transport | Persistent Android connection, APNs on iOS, low-power wakeups |
| Device OS | Display notification messages, respect channels and permissions |
| Your app | Handle data payloads, route taps, sync real state |

Edge cases:

- Delivery is best effort. A device that stays offline past the message TTL
  never receives it, and the default TTL is four weeks. Sync real state when
  the app opens instead of trusting that a push arrived.
- Topic messages are optimized for throughput, not latency. The Firebase docs
  say to target registration tokens for fast delivery to one device or a small
  group.
- FCM limits concurrent topic fan-outs to 1,000 per project, so a campaign
  system that fires thousands of separate topic sends at once will see some of
  them deferred.

Strong answer:

> My backend sends one request per audience, not per device. FCM assigns the
> message id, fans topics out to every subscribed token, and delivers through
> the Android transport or APNs over connections the OS already holds. I treat
> delivery as best effort with a TTL, and I use tokens for latency-sensitive
> messages because topic sends are tuned for throughput.

## 2. What Is A Registration Token And How Does Your Backend Track It?

A registration token is a string the FCM SDK creates for one install of your
app on one device. It is the address FCM delivers to. It is not a user id: a
user with a phone and a tablet has two tokens, and a reinstall produces a new
one.

Why it matters:

Every direct push, every multicast, and every server-side topic change needs
tokens, and a registry full of dead tokens wastes sends and hides your real
delivery rate.

Client: upload the token on every launch and whenever it rotates.

```ts
import messaging from "@react-native-firebase/messaging";
import { Platform } from "react-native";

async function syncDevice(userId: string, token: string) {
  await api.post("/devices", {
    userId,
    token,
    platform: Platform.OS,
  });
}

export async function registerDevice(userId: string) {
  await syncDevice(userId, await messaging().getToken());

  // Tokens rotate, so keep the server in sync.
  return messaging().onTokenRefresh((token) => {
    syncDevice(userId, token);
  });
}
```

Server: one row per token, timestamped on every upload.

```sql
CREATE TABLE device_tokens (
  token        TEXT PRIMARY KEY,
  user_id      BIGINT NOT NULL,
  platform     TEXT NOT NULL,
  app_version  TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL
);
```

Upsert on every upload so `last_seen_at` moves forward. With the token as the
primary key, a device that changes users simply moves to the new user id.

Edge cases:

- Firebase treats a registration as stale when the app instance has not
  connected for over a month, and on Android it deletes registrations that are
  inactive for 270 days. Refreshing the token upload about once a month is
  the balance the docs recommend between battery use and accuracy.
- Clearing app data, restoring a backup to a new phone, or reinstalling all
  produce a new token. The old one stays in your table until a send fails or
  the sweeper removes it, see question 10.
- Logout must call `deleteToken()` and remove the row, or the next person to
  sign in on that phone receives the previous user's notifications.

Interview trap:

**The token identifies an install, not a person.** Store it keyed by user and
device, never as a single column on the users table.

Strong answer:

> On every launch I upload the current token with the user id and platform,
> and I listen for token refresh so rotations reach the server. The server
> keeps one row per token with a last-seen timestamp, upserts on upload, and
> deletes on logout and on unregistered errors. That registry is what lets
> me push to a specific person and what the server uses to manage topics.

## 3. Topics Or Tokens: How Do You Choose?

A token addresses one device. A topic is a named audience that FCM maintains:
devices subscribe, and you send once to the name. Both go through the same API;
the difference is who keeps the membership list and how many requests you make.

| | Tokens | Topics |
| --- | --- | --- |
| Membership stored by | your database | FCM |
| Requests to reach 1M devices | about 2,000 multicast calls | 1 |
| Personal content | yes | no, everyone gets the same message |
| Latency | fast, direct | tuned for throughput, can lag |
| Backend needs tokens | yes | only to change subscriptions |
| Best for | OTPs, chat, order updates, receipts | announcements, promos, tier-wide news |

Rule of thumb from the Firebase docs: topic messages are optimized for
throughput rather than latency. For fast, secure delivery to one device or a
small group, target registration tokens.

Limits worth knowing:

```txt
Topics per app install         2,000
Subscribers per topic          unlimited
Subscription changes           3,000 per second per project
Tokens per multicast call      500
Topics per condition           5
```

Edge cases:

- A message with personal data in it, such as a balance or a name, must go to
  a token. A topic message is the same bytes for every subscriber.
- Topic membership lives on Google's side, so FCM cannot tell you how many
  premium users have push enabled. Keep your own counts in the token table.

Strong answer:

> I use tokens when the message is personal or time-critical and topics when
> the same message goes to a whole audience. Tokens cost me a registry and one
> multicast call per 500 devices; topics cost me a subscription step on the
> device but make a broadcast a single request. Most apps need both.

## 4. How Do You Push To One User?

Look up the user's tokens, send to each, and clean up the ones FCM reports as
dead.

```txt
Event: order 88 shipped for user 42
  -> SELECT token FROM device_tokens WHERE user_id = 42
  -> one multicast call for all of the user's devices
  -> on UNREGISTERED: delete that token row
```

Server:

```js
import { getMessaging } from "firebase-admin/messaging";

const GONE = "messaging/registration-token-not-registered";

async function notifyUser(userId, notification, data) {
  const tokens = await db.tokensForUser(userId);
  if (tokens.length === 0) return;

  const fcm = getMessaging();
  const result = await fcm.sendEachForMulticast({
    tokens,
    notification,
    data,
  });

  const dead = [];
  result.responses.forEach((res, i) => {
    if (res.error?.code === GONE) dead.push(tokens[i]);
  });

  if (dead.length) await db.deleteTokens(dead);
}
```

Why it matters:

A user can have several devices. Sending to all of them keeps the phone and
the tablet consistent, and the per-token response tells you which installs
are gone.

Edge cases:

- Keep the payload small and impersonal where you can: a title, a short body,
  and a `link`. The app fetches details when the notification is opened, so
  nothing sensitive sits in the notification tray or in FCM logs.
- Make the send idempotent. If the worker retries after a crash, a dedupe key
  such as `order-88-shipped` stops the user getting two banners.
- Unregistered is the only error that means "delete the token". Transient
  errors such as unavailable or quota exceeded mean retry with backoff.

Strong answer:

> For a personal notification I look up every token the user has, send with
> multicast so all their devices get it, and read the per-token results.
> Unregistered tokens are deleted on the spot, transient failures are retried
> by the worker, and the payload carries a link rather than the sensitive
> details.

## 5. How Do You Segment By Plan, Region, Or Preference?

Treat topics as tags, one per trait, instead of one topic per combination. A
free user in the US who accepts marketing subscribes to `plan-free` and
`region-us`, and nothing else. Your backend then broadcasts to a tag, or
combines tags with a condition, see question 6.

| Trait | Topic names | Changes when |
| --- | --- | --- |
| Billing tier | `plan-free`, `plan-premium` | a subscription starts, ends, or upgrades |
| Region | `region-us`, `region-eu` | the account locale or detected country changes |
| Language | `lang-en`, `lang-bn` | the user changes the app language |
| Preference | `opted-out-marketing` | the user toggles the setting |
| Time zone | `tz-utc-5`, `tz-utc+6` | the device time zone changes |

Client: subscribe per trait after sign-in, and swap tags when a trait changes.

```ts
import messaging from "@react-native-firebase/messaging";

type Profile = {
  plan: "free" | "premium";
  region: string;
  marketingOptOut: boolean;
};

export async function syncTopics(profile: Profile) {
  const fcm = messaging();
  await fcm.subscribeToTopic(`plan-${profile.plan}`);
  await fcm.subscribeToTopic(`region-${profile.region}`);

  if (profile.marketingOptOut) {
    await fcm.subscribeToTopic("opted-out-marketing");
  } else {
    await fcm.unsubscribeFromTopic("opted-out-marketing");
  }
}

export async function changePlan(from: string, to: string) {
  const fcm = messaging();
  await fcm.unsubscribeFromTopic(`plan-${from}`);
  await fcm.subscribeToTopic(`plan-${to}`);
}
```

Server: one request reaches the whole tier.

```js
await getMessaging().send({
  topic: "plan-free",
  notification: {
    title: "50% off Premium this week",
    body: "Unlimited storage, no ads. Ends Sunday.",
  },
  data: { link: "myapp://upgrade?promo=UPGRADE50" },
  android: { notification: { channelId: "promotions" } },
});
```

Why it matters:

Atomic tags stay small. Five plans, twenty regions, and ten languages are 35
topics; the combined version is 1,000 topics that nobody can reason about, and
an install can hold at most 2,000 subscriptions.

Edge cases:

- Unsubscribe from every tag on logout, otherwise the next account on that
  phone inherits the previous user's plan and region.
- The client can only subscribe when it is online and running your code. A
  plan upgrade completed on the web while the phone is off leaves the phone on
  `plan-free` until the app next runs `syncTopics`. Question 7 fixes this from
  the server.
- Topic names allow letters, digits, and `-_.~%`. Treat them as labels, never
  as secrets; do not encode anything sensitive in them.

Strong answer:

> I model audience traits as atomic topics such as `plan-free` and
> `region-us`, subscribe the device to each after sign-in, and re-run that
> sync whenever the profile changes or the app starts. The backend then
> broadcasts to a tag with one request and combines tags with conditions when
> it needs an intersection.

## 6. How Do Condition Expressions Work?

A condition is a boolean expression over topic membership that FCM evaluates
for you. It supports `&&`, `||`, and `!`, and up to five topics in one
expression. The phone never sees the condition; it only holds its atomic
topics.

```js
await getMessaging().send({
  notification: {
    title: "US holiday offer",
    body: "Upgrade today for 50% off.",
  },
  condition:
    "'plan-free' in topics && 'region-us' in topics" +
    " && !('opted-out-marketing' in topics)",
});
```

How FCM resolves it:

```txt
1. Start with every token subscribed to plan-free
2. Keep only tokens also subscribed to region-us
3. Drop tokens subscribed to opted-out-marketing
4. Fan out to what is left
```

Why it matters:

Without conditions you would need a topic for every combination, or a database
query plus a multicast loop. With conditions, "free users in the US who did not
opt out" is still one request.

The opt-out trick:

An opt-out is modelled as a topic you join, not one you leave. Absence cannot
be expressed by the client, but `!('opted-out-marketing' in topics)` can
exclude the people who joined it.

Edge cases:

- Five topics per expression is a hard limit. If a campaign needs six traits,
  either fold two traits into one derived topic, or query your database and
  fall back to multicast, see question 8.
- Conditions are still topic sends: throughput first, latency second.
- Every device that should be excluded must actually be subscribed to the
  exclusion topic. If the client failed to subscribe during a flaky session,
  the person receives marketing they refused. Server-owned subscriptions in
  question 7 close that gap.

Interview trap:

**The condition is written on the server, never on the phone.** The device
subscribes to atomic topics one by one; FCM does the set arithmetic.

Strong answer:

> The client subscribes to atomic topics, and the server writes a condition
> such as free and US and not opted-out, up to five topics with and, or, and
> not. FCM intersects the membership sets and fans out once. I model opt-outs
> as a topic people join so the not operator can exclude them.

## 7. Should The Device Or The Server Own Subscriptions?

Both can subscribe. The device uses the client SDK; the server uses the Admin
SDK with the device's tokens. For anything tied to money or consent, the server
should be the source of truth and the device should reconcile.

| | Device-managed | Server-managed |
| --- | --- | --- |
| Needs tokens in your database | no | yes |
| Works when the app is closed | no | yes |
| Survives a flaky network during an upgrade | no, silently | yes, retried by a worker |
| Extra code | a sync on launch | a job per profile change |

Server: react to the event that changes the trait, not to the app opening.

```js
import { getMessaging } from "firebase-admin/messaging";

async function movePlan(userId, from, to) {
  const tokens = await db.tokensForUser(userId);
  if (tokens.length === 0) return;

  const fcm = getMessaging();
  if (from) {
    await fcm.unsubscribeFromTopic(tokens, `plan-${from}`);
  }
  await fcm.subscribeToTopic(tokens, `plan-${to}`);
}
```

Flow:

```txt
Payment webhook: user 42 upgraded to premium
  -> update users.plan in the database (source of truth)
  -> enqueue job: sync-topics(42)
  -> worker: unsubscribe plan-free, subscribe plan-premium
  -> app start: client runs syncTopics(profile) as a safety net
```

Edge cases:

- Server-side subscribe takes up to 1,000 tokens per request, and a project
  is limited to 3,000 subscription changes per second. A migration that
  re-tags every user must run through the queue, not a loop in a script.
- The server can only subscribe tokens it knows. Keep the registry from
  question 2 accurate or the phone bought last week never gets tagged.
- Keep the client sync anyway. It heals installs that were registered before
  the server-side path existed and devices whose token rotated between jobs.

Strong answer:

> Consent and billing traits are managed from the server, triggered by the
> event that changed them and executed by a worker with the Admin SDK against
> the user's tokens. The client still reconciles its topics on launch, so the
> two paths converge instead of drifting.

## 8. How Do You Send To A Large Token List Without Topics?

When the audience comes from a database query rather than a tag, use
`sendEachForMulticast` with up to 500 tokens per call and loop over chunks in a
worker.

```js
import { getMessaging } from "firebase-admin/messaging";

const CHUNK = 500;
const GONE = "messaging/registration-token-not-registered";

async function sendToTokens(tokens, notification, data) {
  const fcm = getMessaging();
  const dead = [];
  let sent = 0;

  for (let i = 0; i < tokens.length; i += CHUNK) {
    const chunk = tokens.slice(i, i + CHUNK);
    const result = await fcm.sendEachForMulticast({
      tokens: chunk,
      notification,
      data,
    });

    sent += result.successCount;
    result.responses.forEach((res, j) => {
      if (res.error?.code === GONE) dead.push(chunk[j]);
    });
  }

  await db.deleteTokens(dead);
  return { sent, removed: dead.length };
}
```

Topics vs multicast:

| | Topic send | Token multicast |
| --- | --- | --- |
| Requests for 1M devices | 1 | 2,000 |
| Membership source | FCM | your query |
| Personalize per device | no | yes, one message per token with `sendEach` |
| Failed-token feedback | none | per token |
| Cost to you | one call | worker time and retries |

Why it matters:

Multicast is the only way to reach "users whose trial ends tomorrow" or any
audience that changes faster than clients can resubscribe. It also returns
per-token results, which is how the registry gets cleaned.

Edge cases:

- `sendMulticast` and `sendAll` were deprecated and then removed from the
  Admin SDK because they relied on the legacy batch endpoint, which Firebase
  retired in 2024. Use `sendEachForMulticast` and `sendEach`, each of which
  takes up to 500 items per call.
- Retry only retryable errors, such as unavailable, internal, or quota
  exceeded, with exponential backoff and jitter. Retrying unregistered tokens
  just repeats the failure.
- Run this in a worker with an idempotency key per chunk, so a crash halfway
  through a million users resumes instead of restarting from the first row.

Strong answer:

> For a query-driven audience I page tokens out of the database, send them in
> chunks of 500 with sendEachForMulticast from a worker, collect unregistered
> tokens from the per-token responses, and delete them. Topics are cheaper
> when the audience is a stable trait; multicast wins when the audience is a
> query.

## 9. How Should The Sending Pipeline Look?

Never call FCM from the request handler that received the event. Put a small
job on a queue and let workers do the sending, with retries, rate limits, and
a record of what happened.

```viz
type: flow
title: Queue-backed push pipeline
Event :: order shipped, campaign scheduled, plan changed
Queue :: one job per user event or per 500-token chunk
Worker :: builds the payload, calls FCM, retries with backoff
Results :: success and failure counts, invalid tokens, message ids
Cleanup :: delete dead tokens, alert when failures spike
```

Worker sketch with BullMQ:

```js
import { Worker } from "bullmq";

new Worker(
  "push",
  async (job) => {
    const { tokens, notification, data } = job.data;
    return sendToTokens(tokens, notification, data);
  },
  {
    connection,
    concurrency: 8,
    limiter: { max: 200, duration: 1000 },
  },
);
```

What the queue buys you:

- **Isolation.** A slow FCM response or a million-row campaign never blocks the
  API that users are tapping on.
- **Retries with backoff** for transient errors, and a dead-letter list for
  jobs that keep failing.
- **Rate control** per worker, so a campaign drains at a pace your own backend
  can absorb when people tap.
- **Idempotency.** A job id such as `campaign-77-chunk-12` means a crash and
  retry cannot double-send a chunk.

Edge cases:

- One job per campaign is too coarse: a failure at chunk 900 retries all
  2,000. One job per chunk is the usual grain.
- Keep topic broadcasts in the same pipeline even though each is one call.
  Scheduling, throttling, and audit logging should not depend on the target
  type.
- The System Design track's notification case study covers the multi-channel
  version of this platform, with email and SMS beside push.

Strong answer:

> The API enqueues a job and returns. Workers build payloads, call FCM with
> bounded concurrency and a rate limit, retry transient failures with backoff,
> and write results so I can see delivery rates and prune dead tokens. Jobs
> are chunk-sized and idempotent, so failures resume instead of restarting.

## 10. How Do You Keep The Token Registry Clean?

Tokens die silently when apps are uninstalled, data is cleared, or devices are
replaced. Three signals tell you a token is dead, and a sweeper handles the
rest.

```txt
1. Send result   UNREGISTERED -> delete the token now
2. Timestamp     last_seen_at older than the window -> sweep
3. Logout        deleteToken() on the device, delete the row
```

Sweeper:

```sql
DELETE FROM device_tokens
WHERE last_seen_at < now() - interval '60 days';
```

Why it matters:

Dead tokens inflate every campaign, slow multicast loops, distort delivery
rates, and can deliver the old owner's messages to a phone's new owner if the
logout path was skipped.

Choosing the window:

Firebase considers a registration stale after the app instance has not
connected for over a month, recommends refreshing the token upload about
monthly, and on Android garbage-collects registrations inactive for 270 days.
A sweep between 30 and 90 days should match how often your users actually
open the app: a daily-use app can be aggressive, a tax app opened once a year
cannot.

Edge cases:

- Deleting a token from your database does not unsubscribe it from topics on
  FCM's side. Google expires stale registrations itself, but logout should
  still call `deleteToken()` so the install starts clean.
- Run the sweep in batches with a limit, off peak, so the first run over years
  of rows does not lock the table.
- Update `last_seen_at` on the upload, not on sends. A successful send proves
  FCM accepted the message, not that the device is alive.

Strong answer:

> I delete tokens the moment FCM returns unregistered, I refresh a last-seen
> timestamp on every launch upload, and a nightly job removes rows that have
> not been seen for about two months. Logout deletes the token on the device
> and the row on the server. The registry stays small and delivery metrics
> stay honest.

## 11. How Do You Stop A Broadcast From Taking Down Your Own Backend?

A promo sent to ten million people is a request to ten million people to open
your app in the same minute. The push is free; the taps are a traffic spike you
created.

| Practice | Effect |
| --- | --- |
| Time-zone topics such as `tz-utc-5` | lands at lunch locally, spreads load over 24 hours |
| Send in waves of regions or chunks | flattens the tap spike over 15 to 30 minutes |
| Deep link to a screen served from cache or CDN | the landing screen costs nothing per tap |
| Set a TTL on the message | late deliveries do not wake people at 3 AM |
| Use a collapse key for replaceable content | one banner for the latest score, not twenty |
| Rate limit the worker | drains at a pace your API can absorb |

Scheduling by time zone:

```txt
Campaign: lunch promo at 12:30 local time
  -> 24 jobs, one per time-zone topic
  -> each job scheduled for 12:30 in that zone
  -> tz-utc+6 fires at 06:30 UTC, tz-utc-5 at 17:30 UTC
```

Why it matters:

A same-instant global blast is a self-inflicted denial of service on the
endpoint behind the link, and a 3 AM notification is the fastest route to a
muted channel or an uninstall.

Edge cases:

- A device holds at most four different collapse keys at a time; beyond that,
  older ones are dropped.
- Frequency caps belong in your pipeline, not in FCM: keep a per-user count of
  promotional sends per week and skip users over the cap before enqueueing.
- Quiet hours are a product decision. Model them as time-zone topics plus a
  schedule, not as a check on the device, which cannot refuse a delivered
  push.

Strong answer:

> I schedule broadcasts per time-zone topic so they land at the right local
> hour, send in waves, put a TTL and a collapse key on replaceable content,
> and make the landing screen cheap to open. The worker's rate limit is set
> from what the API behind the link can absorb, not from what FCM can accept.

## 12. How Do You Design The Payload?

Every message has a target, an optional `notification` block that the OS
displays, an optional `data` map of strings that your app reads, and platform
overrides for Android and APNs. The whole message is limited to 4 KB.

| Message | Who displays it | Your JS runs | Use it for |
| --- | --- | --- | --- |
| Notification only | the OS, in every state | only on tap | announcements, promos |
| Data only | nobody unless your code does | yes, but throttled in background | silent sync hints |
| Notification + data | the OS | on tap, with the data | almost everything |

Server payload:

```js
const message = {
  topic: "plan-free",
  notification: {
    title: "50% off Premium this week",
    body: "Unlimited storage, no ads. Ends Sunday.",
  },
  data: {
    link: "myapp://upgrade?promo=UPGRADE50",
    campaignId: "77",
  },
  android: {
    priority: "normal",
    ttl: 6 * 60 * 60 * 1000,
    collapseKey: "promo",
    notification: { channelId: "promotions" },
  },
  apns: {
    headers: { "apns-priority": "5" },
    payload: { aps: { sound: "default", badge: 1 } },
  },
};
```

What the device receives:

```json
{
  "from": "/topics/plan-free",
  "messageId": "0:1758900000000000%4f828a2f",
  "collapseKey": "promo",
  "notification": {
    "title": "50% off Premium this week",
    "body": "Unlimited storage, no ads. Ends Sunday."
  },
  "data": {
    "link": "myapp://upgrade?promo=UPGRADE50",
    "campaignId": "77"
  }
}
```

Rules that keep payloads working:

- `data` values are strings. Serialize numbers and objects yourself and parse
  them on the device.
- Put a `link` in `data` and reuse the deep link router, as question 13 of the
  Deep Linking & Notifications guide shows. `from` tells you which topic or
  condition produced the message, which is useful for analytics.
- `channelId` must name a channel the app has already created, or Android
  drops the notification silently.
- Keep personal details out of a topic message; every subscriber gets the same
  bytes. For a token message, prefer a link over the sensitive value.
- Marketing goes at normal priority with a TTL; transactional alerts go at high
  priority with `apns-priority` 10.

Strong answer:

> I send notification plus data: the OS renders the banner in every app state,
> and the data carries a deep link and a campaign id my tap handler uses.
> Android gets a channel id, a TTL, and a collapse key; APNs gets its priority
> and sound. The payload stays under 4 KB, values are strings, and nothing
> sensitive rides in it.

## 13. Design Push For Ten Million Users: How Do You Answer In Two Minutes?

Walk the message from registration to the tap, naming the decision at each
step.

```txt
1. Register    token per install, keyed by user and device,
               refreshed on launch, deleted on logout
2. Segment     atomic topics per trait, owned by the server,
               reconciled by the client on start
3. Broadcast   one topic or condition send per audience;
               personal messages go to tokens via multicast
4. Pipeline    queue, workers, retries, rate limits,
               idempotent chunk jobs, result logging
5. Hygiene     delete on UNREGISTERED, sweep by last seen
6. Throttle    time-zone topics, waves, TTL, collapse keys
7. Payload     notification + data with a deep link,
               channels on Android, priority per type
8. Measure     delivery rate, open rate, opt-out rate per
               channel and campaign
```

What the interviewer is testing:

- Do you know that FCM does the fan-out, so the backend must not loop?
- Do you separate personal token sends from audience topic sends?
- Do you have a plan for consent, opt-out, and quiet hours?
- Do you treat delivery as best effort and keep app state correct without it?
- Do you protect your own backend from the taps you just caused?

Strong answer:

> Each install registers a token that my server stores per user and device.
> Audience traits become atomic topics that the server subscribes tokens to
> when the trait changes, and the client reconciles on launch. A campaign is
> one topic or condition send per audience, scheduled per time zone and
> drained by workers with rate limits and retries; personal messages go to the
> user's tokens with multicast. Unregistered tokens are deleted immediately
> and stale ones swept monthly. Payloads carry a deep link and a channel id so
> users can mute marketing without losing account alerts, and I measure
> delivery, opens, and opt-outs per campaign.
