# Node.js Microservices Case Study Interview Guide

A worked example of a small Node.js microservices backend, explained the way
you would walk an interviewer through a system you know: its services, how one
request and one event move through them, how the RabbitMQ code works line by
line, and what breaks.

The system is a small social-media backend. Users sign up, upload images,
create and delete posts, and search them. An API gateway sits in front of four
Express services, each with its own MongoDB database. Redis handles rate
limiting and caching, RabbitMQ carries events between services, and Cloudinary
stores the uploaded files. The code has real bugs, and they are part of the
lesson: "what would you change?" is the usual follow-up to "walk me through
it".

The three groups follow that order: services and dataflow, then RabbitMQ in
this codebase, then running and reviewing it. The general concepts live in
[RabbitMQ Message Broker](/topics/rabbitmq-message-broker) and
[System Design & Microservices](/topics/system-design-microservices); this
guide is the concrete case.

## 1. Services And Dataflow Overview

Five Node.js processes, one folder and one Dockerfile each. Every service owns
its data, and no service reads another service's database.

```txt
                             Client
                               │ HTTP :3000
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ api-gateway :3000                                           │
│  1. rate limit (Redis)       2. verify JWT (not /v1/auth)   │
│  3. rewrite /v1/* → /api/*   4. add header x-user-id        │
└──────┬───────────────┬───────────────┬───────────────┬──────┘
       │ /v1/auth      │ /v1/posts     │ /v1/media     │ /v1/search
       ▼               ▼               ▼               ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ identity    │ │ post        │ │ media       │ │ search      │
│ :3001       │ │ :3002       │ │ :3003       │ │ :3004       │
├─────────────┤ ├─────────────┤ ├─────────────┤ ├─────────────┤
│ Mongo:      │ │ Mongo:      │ │ Mongo:      │ │ Mongo:      │
│  users      │ │  posts      │ │  media      │ │  searches   │
│  tokens     │ │ Redis:      │ │ Cloudinary: │ │  (copy of   │
│ Redis:      │ │  cache      │ │  files      │ │   posts)    │
│  rate limit │ │             │ │             │ │             │
└─────────────┘ └──────┬──────┘ └──────▲──────┘ └──────▲──────┘
                       │ publish       │ consume       │ consume
                ┌──────▼───────────────┴───────────────┴──────┐
                │ RabbitMQ  topic exchange "facebook_events"  │
                │  post.created ─────────────────────▶ search │
                │  post.deleted ─────────▶ media  +  search   │
                └─────────────────────────────────────────────┘
```

| Service | Port | Responsible for | Stores | RabbitMQ |
| --- | --- | --- | --- | --- |
| api-gateway | 3000 | the only public entry: rate limit, JWT check, routing | Redis: rate-limit counters | no |
| identity-service | 3001 | users, passwords, tokens | MongoDB: `User`, `RefreshToken`; Redis: rate limits | no |
| post-service | 3002 | posts, the source of truth | MongoDB: `Post`; Redis: read cache | publishes |
| media-service | 3003 | uploaded files | MongoDB: `Media`; Cloudinary: the files | consumes |
| search-service | 3004 | full-text search | MongoDB: `Search`, a copy of the posts | consumes |

The services communicate in exactly two ways:

- HTTP, synchronous: client → gateway → one service. Services never call each
  other.
- Events, asynchronous: post-service announces `post.created` and
  `post.deleted` on RabbitMQ, and media and search react. Post-service doesn't
  know they exist.

Why it matters:

Those two rules are the architecture. Every request is one hop deep behind the
gateway, so one slow service can't stall another, and anything that must
happen "because a post changed" happens through events.

Tradeoff:

Five deployables plus Redis, RabbitMQ, MongoDB and Cloudinary, for a feature
set one Express app could serve. The split buys independent deploys and
failure isolation, and costs eventual consistency, more failure modes, and
harder debugging across process boundaries.

Strong answer:

> It's an API gateway in front of four Express services, each owning its own
> MongoDB database. Clients only talk to the gateway, which rate-limits,
> verifies the JWT and proxies to exactly one service. Post-service is the
> source of truth for posts and publishes events on a RabbitMQ topic exchange;
> media and search consume them to delete files and maintain a search index.
> Requests are synchronous HTTP, and propagation between services is
> asynchronous events.

## 2. What Does The API Gateway Do On Every Request?

Everything lives in one file, `api-gateway/src/server.js`, as a chain of
Express middleware:

```viz
type: flow
title: One request through the gateway
helmet, cors, express.json() :: security headers, CORS, JSON body parsing
rate limiter :: 100 requests per 15 minutes per IP, counted in Redis
> validateToken :: verifies the JWT on every prefix except /v1/auth
proxy :: rewrites /v1/... to /api/..., sets x-user-id, forwards to one service
```

| Client calls (port 3000) | JWT | Service | Handler |
| --- | --- | --- | --- |
| `POST /v1/auth/register`, `/login`, `/refresh-token`, `/logout` | no | identity | `identity-controller.js` |
| `POST /v1/posts/create-post` | yes | post | `createPost` |
| `GET /v1/posts/all-posts?page=&limit=` | yes | post | `getAllPosts` |
| `GET` and `DELETE /v1/posts/:id` | yes | post | `getPost`, `deletePost` |
| `POST /v1/media/upload` (multipart, field `file`) | yes | media | `uploadMedia` |
| `GET /v1/media/get` | yes | media | `getAllMedias` |
| `GET /v1/search/posts?query=` | yes | search | `searchPostController` |

Each prefix gets its own proxy. Condensed, the posts route looks like this:

```js
app.use(
  "/v1/posts",
  validateToken, // 401 without a token; puts the decoded JWT on req.user
  proxy(process.env.POST_SERVICE_URL, {
    // public /v1/posts/create-post -> internal /api/posts/create-post
    proxyReqPathResolver: (req) => req.originalUrl.replace(/^\/v1/, "/api"),
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["Content-Type"] = "application/json";
      // the caller's identity, for a service that never sees the token
      proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;
      return proxyReqOpts;
    },
  }),
);
```

The media route adds `parseReqBody: false`, so multipart uploads stream
through to media-service instead of being buffered and re-serialized.

Why it matters:

Cross-cutting concerns run once, at the edge. The rate limiter keeps its
counters in Redis rather than in memory, so several gateway replicas share one
limit instead of each allowing 100 requests. The `/v1` → `/api` rewrite
decouples the public URL from internal routes.

Symptom:

Two gateway bugs show up immediately:

- An invalid or expired token returns 429 "Invalid token!" instead of 401. 429
  means "slow down and retry", so a well-behaved client retries a request that
  can never succeed.
- `GET /v1/media/get` always fails with 500. The media proxy calls
  `srcReq.headers["content-type"].startsWith(...)`, a GET usually has no
  Content-Type, and the proxy throws "Cannot read properties of undefined
  (reading 'startsWith')". Reproduced with the same proxy configuration.

Fix:

Return 401 for bad tokens, and guard the header:
`(srcReq.headers["content-type"] ?? "").startsWith("multipart/form-data")`.

Tradeoff:

The gateway is a single point of failure and an extra network hop. It needs
replicas behind a load balancer, and it has to stay thin: business logic that
creeps into it ties every service's releases to the gateway's.

Strong answer:

> The gateway is the only public entry point. It applies security headers, a
> Redis-backed rate limit shared across replicas, and JWT verification, then
> rewrites the public /v1 path to the internal /api path of exactly one service
> and forwards the caller's identity in an x-user-id header. Services never see
> raw tokens, which keeps them simple but makes the gateway the trust boundary.

## 3. Edge Authentication: When Is Trusting x-user-id Safe?

Only the gateway verifies JWTs. Post, media and search share one middleware
that takes the header at its word:

```js
// src/middleware/authMiddleware.js in post, media and search (condensed)
const authenticateRequest = (req, res, next) => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  }
  // no signature, no expiry: whoever sends the header is that user
  req.user = { userId };
  next();
};
```

This is edge authentication: authenticate once at the gateway, then pass a
trusted identity inward. It is safe only while three things hold:

1. Services are unreachable except through the gateway. Of the five apps in
   docker-compose, only the gateway publishes a port; the four services exist
   only on the internal network.
2. The gateway overwrites the header on every forwarded request, so a client
   can't smuggle in its own `x-user-id`. This one does: express-http-proxy
   copies the client's headers first, then the decorator replaces the value
   with the one from the verified token.
3. Nothing inside the network is hostile.

Where it breaks: anything that can reach a service port directly — a
compromised container, an SSRF bug in any service, a stray `ports:` entry —
can send `x-user-id: <anyone>` and act as that user.

Fix:

Harden in layers, cheapest first:

- keep services on a private network with no published ports (Kubernetes
  NetworkPolicy, cloud security groups)
- forward a signed identity instead of a bare header: the original JWT, or a
  short-lived internal token that each service verifies
- use mutual TLS between services, often through a service mesh, so a service
  only accepts calls from the gateway

Tradeoff:

Verifying in every service costs a signature check per hop and needs key
distribution. With asymmetric signing (RS256 or ES256 plus a JWKS endpoint),
services can verify tokens without being able to mint them. With the shared
HS256 `JWT_SECRET` used here, anything that can verify a token can also forge
one.

Strong answer:

> The services trust x-user-id because the gateway already verified the JWT —
> that's edge authentication. It's only as strong as the network boundary: if
> anything else can reach a service, one header impersonates any user. I'd keep
> the services unreachable from outside, have the gateway overwrite the header,
> and for defense in depth forward a signed short-lived token or use mTLS so
> each service can check the caller itself.

## 4. How Do Registration, Login, And Token Refresh Work?

The identity service is the only one that sees passwords or issues tokens.

```txt
POST /v1/auth/register { username, email, password }
 gateway   rate limit → proxy (no JWT needed)
 identity  rate limits → Joi validation → 400 if email or username taken
           → save User (argon2 hash) → sign JWT + store refresh token
 ← 201 { accessToken, refreshToken }
```

Login has the same shape: find the user by email, check the password with
`argon2.verify`, and return both tokens plus the `userId`.

| Token | What it is | Lifetime | Stored |
| --- | --- | --- | --- |
| Access token | JWT with `{ userId, username }`, signed with `JWT_SECRET` | 60 minutes | client only; the gateway verifies it without calling identity |
| Refresh token | 40 random bytes as hex (80 characters), opaque | 7 days | client, and the `RefreshToken` collection |

Key mechanics:

- Hashing happens in a Mongoose `pre("save")` hook, and only when the password
  field changed, so re-saving a user doesn't hash the hash.
- A TTL index, `{ expiresAt: 1 }` with `expireAfterSeconds: 0`, makes MongoDB
  delete expired refresh tokens. The TTL monitor runs about once a minute, so
  the refresh handler still checks `expiresAt` itself.
- Refresh rotates: each use deletes the old refresh token and issues a new
  pair, so every refresh token works once.
- Logout deletes the refresh token only. The access token keeps working until
  it expires, because nothing checks a revocation list.

Symptom:

identity-service doesn't start. The refresh handler declares
`const storedToken` twice, once from `findOne` and once from `deleteOne`, which
is a SyntaxError when the module loads (`node --check` confirms it). No one can
register or log in, so every protected route is unusable too.

Fix:

Delete the `deleteOne` line. The handler already deletes the old token after
issuing new ones, and a `deleteOne` result is always truthy, so it would have
defeated the "invalid refresh token" check anyway.

Other review points:

- identity-service rate-limits by `req.ip`, but every request arrives from the
  gateway, so all users share one bucket: 10 requests per second and 50
  registrations per 15 minutes. Rate-limit at the edge, or forward the client
  IP and enable `trust proxy`.
- Login answers "Invalid credentials" for an unknown email and "Invalid
  password" for a known one, which tells an attacker which emails are
  registered. Use one message and a 401 for both.

Follow-up probe:

"How would you revoke an access token immediately?" Keep access tokens short,
and for instant revocation store revoked token ids (`jti`), or a per-user
"tokens issued before this time are invalid" timestamp, in Redis, checked by
the gateway. That adds a lookup to every request, which is the price of
revocation.

Strong answer:

> Identity issues a 60-minute JWT and a 7-day opaque refresh token stored in
> MongoDB with a TTL index. The gateway verifies the JWT without calling
> identity, so logout only deletes the refresh token and the access token lives
> until it expires — acceptable because it's short. Refresh rotates both tokens.
> For instant revocation I'd add a jti denylist in Redis checked at the gateway.

## 5. Why Does The Post Service Publish Events Instead Of Calling Other Services?

When a post is created or deleted, two other services care: search has to
index or drop it, and media has to delete its files. Post-service could call
them over HTTP. Instead it publishes a fact to RabbitMQ and returns.

| | HTTP calls from post-service | Events (this code) |
| --- | --- | --- |
| Post-service must know | every downstream URL and API | one exchange name and the event shape |
| Search is down | create-post fails, or needs retry logic | create-post still succeeds; search catches up if its queue kept the event (here it doesn't; see question 17) |
| Adding a notification service | change and redeploy post-service | the new service binds to `post.*` |
| Latency the user waits for | the database write plus every downstream call | the database write plus one publish |
| Consistency | immediate, if every call succeeds | eventual: search lags, and drifts if an event is lost |

HTTP is still right when the caller needs an answer to continue. "Does this
user own these media ids?" before saving a post is a query, not a
notification. Queries, and commands that need a result, are synchronous;
facts about something that already happened are events.

Tradeoff:

Events bring the dual-write problem. `createPost` saves to MongoDB and then
publishes to RabbitMQ: two systems, no shared transaction. If the process dies
between the two or the publish fails, the post exists and search never hears
about it. The standard fix is a transactional outbox: write the event to an
outbox collection in the same MongoDB transaction as the post, and let a relay
publish it (see [RabbitMQ Message Broker](/topics/rabbitmq-message-broker)).

Strong answer:

> Post-service announces facts — post created, post deleted — without knowing
> who listens. That keeps it independently deployable, keeps the request fast,
> and means a search outage can't fail post creation. The costs are eventual
> consistency and a dual write between MongoDB and RabbitMQ, which I'd close
> with a transactional outbox.

## 6. Walk Through Creating A Post With An Image.

Two client calls, then an asynchronous step the client never sees:

```txt
1. POST /v1/media/upload        multipart/form-data, field "file"
   gateway  JWT → x-user-id, body streamed through (parseReqBody: false)
   media    multer (in memory, 5 MB max) → Cloudinary → save Media doc
   ← 201 { mediaId, url }

2. POST /v1/posts/create-post   { content, mediaIds: [mediaId] }
   post     Joi → save Post → publish post.created → clear list caches
   ← 201 { success, message }   no post id in the response

3. async    search consumes post.created → saves its own Search doc
```

Points worth raising:

- Step 1 holds the whole file in memory (`multer.memoryStorage()`) before
  streaming it to Cloudinary. Fine at 5 MB; for larger files, use disk storage
  or let the client upload straight to Cloudinary with a signed upload.
- Step 2 stores `mediaIds` as plain strings. Nothing checks that they exist or
  belong to the caller, which becomes a security hole in question 7.
- Step 2 saves and then publishes, a dual write (question 5), and doesn't
  return the new post's id, so the client can't link to what it just created.
- Step 3 runs after the 201, so a search right after posting may miss the new
  post.

Interview trap:

"What happens if RabbitMQ is down during step 2?" Trace it through the code.
If the broker was never reachable, `publishEvent` finds no channel and calls
`connectToRabbitMQ`, which catches the connection error and returns nothing;
`channel` is still `null`, so `channel.publish` throws a TypeError. If the
broker went away after startup, the channel object exists but is closed, and
`publish` throws "Channel closed". Either way the catch block then throws a
ReferenceError of its own (question 23), so the client never gets a response
— but the post is already saved. A client that retries creates a duplicate
post, and search never hears about the first one.

Strong answer:

> Upload and post creation are separate calls: media returns a mediaId, and the
> post only stores ids. After saving, post-service publishes post.created and
> search indexes it asynchronously. The weak spots are unvalidated media ids, a
> save-then-publish that isn't atomic, and a create response without the id.
> I'd validate ownership, add an outbox, and return the created post.

## 7. Walk Through Deleting A Post: One Event, Two Consumers.

```txt
DELETE /v1/posts/:id
  post    findOneAndDelete({ _id, user: userId })    only the owner matches
          → publish post.deleted { postId, userId, mediaIds } → clear caches
  ← 200
   ├─▶ media    for each mediaId: Cloudinary destroy → delete Media doc
   └─▶ search   delete the Search doc for postId
```

- Ownership lives in the query: `{ _id: req.params.id, user: req.user.userId }`.
  Another user's post simply doesn't match, so the answer is 404, with no
  separate permission check and no hint that the post exists.
- One publish, two independent reactions. Media and search each have their own
  queue bound to `post.deleted`, so each gets its own copy (question 10).
- Both handlers are idempotent: deleting something already deleted does
  nothing. That matters because a correctly configured RabbitMQ setup delivers
  at least once, so duplicates happen.

Symptom:

One user can delete another user's files:

1. Read someone's media id: `GET /v1/posts/all-posts` returns every post with
   its `mediaIds`.
2. Create your own post with `mediaIds: ["<their id>"]`. Nothing validates
   ownership.
3. Delete your post. The `post.deleted` event carries their id, and
   media-service deletes their file from Cloudinary.

Fix:

The event already carries the owner, so scope the handler's query, and also
validate ownership when the post is created:

```js
// media-service/src/eventHandlers/media-event-handlers.js
const mediaToDelete = await Media.find({
  _id: { $in: mediaIds },
  userId: event.userId, // only files that belong to the post's owner
});
```

What the interviewer is testing:

Whether you notice an authorization bug that no single service contains.
Post-service checks ownership of the post, and media-service trusts the event;
the hole is in the contract between them. It's an insecure direct object
reference that crosses a service boundary.

Strong answer:

> Delete is one event with two consumers. Post-service deletes with an
> owner-scoped query and publishes post.deleted with the post's media ids;
> media deletes the files and search deletes its copy, each from its own queue.
> The bug is trusting ids inside the event: they were never validated, so the
> media handler must scope by the owner's userId, and create-post should reject
> media the caller doesn't own.

## 8. How Does The Search Service Build Its Own Copy Of The Posts?

Search never calls post-service. It keeps a denormalized read model built only
from events:

```js
// search-service/src/eventHandlers/search-event-handlers.js (condensed)
async function handlePostCreated(event) {
  await new Search({
    postId: event.postId,
    userId: event.userId,
    content: event.content,
    createdAt: event.createdAt,
  }).save();
}

async function handlePostDeleted(event) {
  await Search.findOneAndDelete({ postId: event.postId });
}
```

`Search` has a unique index on `postId` and a text index on `content`. A query
runs MongoDB `$text` over this copy, sorts by relevance, and returns the top
10:

```js
Search.find({ $text: { $search: query } }, { score: { $meta: "textScore" } })
  .sort({ score: { $meta: "textScore" } })
  .limit(10);
```

Why it matters:

This is the read side of CQRS in miniature. The write model (post-service) and
the read model (search-service) are different databases shaped for different
jobs, so search can be scaled, rebuilt, or moved to Elasticsearch or
OpenSearch without touching post-service.

Tradeoff:

- The copy is eventually consistent, so a new post may not be searchable for a
  moment.
- Results carry text only. For media, the client calls `GET /v1/posts/:id`,
  one request per result if it wants all ten.
- Lost events (question 17) make the copy drift forever. Classic queues keep
  no history, so a rebuild needs a backfill job that reads posts from the
  source of truth, or a replayable log such as Kafka or RabbitMQ streams.

Edge cases:

- A duplicate `post.created` delivery fails on the unique `postId` index, and
  the handler logs and swallows the error, so it is idempotent by accident. An
  upsert, `updateOne({ postId }, { $set: ... }, { upsert: true })`, makes it
  idempotent on purpose.
- Created and deleted events travel on two separate queues, and the handlers
  aren't awaited, so a post deleted right after it was created can be handled
  out of order: the delete finds nothing, then the create inserts a document
  that is never removed. One queue per service, processed in order (question
  15), or a tombstone for deleted ids prevents the ghost.

Strong answer:

> Search owns a denormalized copy of posts built purely from post.created and
> post.deleted, with a text index for relevance search. It's CQRS-style: the
> write model and the search model evolve and scale independently. The price is
> eventual consistency and drift when events are lost, so I'd make the handlers
> idempotent with upserts, keep per-post ordering, and keep a backfill job that
> can rebuild the index from post-service's data.

## 9. How Does The Post Service Cache Reads In Redis, And What Is Wrong With It?

Cache-aside: check Redis, fall back to MongoDB, and store the result with a
TTL.

| Read | Key | TTL |
| --- | --- | --- |
| `GET /all-posts?page=&limit=` | `posts:<page>:<limit>` | 5 minutes |
| `GET /:id` | `post:<id>` | 1 hour |

Every create and delete clears the post's own key and every list page:

```js
async function invalidatePostCache(req, input) {
  await req.redisClient.del(`post:${input}`);
  // KEYS walks the whole keyspace
  const keys = await req.redisClient.keys("posts:*");
  if (keys.length > 0) {
    await req.redisClient.del(keys);
  }
}
```

Symptom:

The single-post cache never hits:

```js
const cachekey = `post:${postId}`;
const cachedPost = await req.redisClient.get(cachekey); // null on a miss
// ...later, on the same miss:
// wrong variable: cachedPost is null here, not the key
await req.redisClient.setex(cachedPost, 3600, JSON.stringify(post));
```

ioredis sends a `null` key as an empty string (checked: `setex(null, 3600,
"{}")` produces the arguments `["", "3600", "{}"]`), so every miss overwrites
one shared key named `""`, and the next read misses again.

Fix:

Use `cachekey`. A test that reads the same post twice and expects the second
read to come from Redis would have caught it.

Tradeoff:

Even with the key fixed:

- `KEYS posts:*` is O(N) over the whole keyspace and blocks Redis while it
  runs. Use `SCAN`, track the list keys in a Redis set, or version the keys
  (`posts:v42:1:10`) and `INCR` the version on every write so old pages simply
  expire.
- Every write wipes every list page, so a busy feed invalidates constantly,
  and each wipe sends a burst of misses to MongoDB (a cache stampede).
- Invalidate-after-write races: a reader that missed just before a write can
  finish its MongoDB read after the delete and put the old list back, where it
  stays for the full TTL. Short TTLs bound the damage.

Strong answer:

> It's cache-aside with TTLs and delete-on-write invalidation. I'd fix the
> getPost key bug, replace KEYS with versioned keys or SCAN, and treat the list
> cache as best-effort: short TTLs bound the staleness from the
> invalidate-after-write race, and a hit-ratio metric proves the cache helps at
> all.

## 10. RabbitMQ In This Codebase Overview

RabbitMQ is a message broker, a post office between services. A producer
hands a message to an exchange with a routing key; the exchange copies it into
every queue whose binding matches; each consumer reads its own queue and
acknowledges messages when it's done. Senders never know who receives a
message, or whether the receivers are online.

```txt
                                  RabbitMQ
                ┌───────────────────────────────────────────┐
post-service    │ exchange            bindings       queues │
 publish ───────▶ facebook_events ─┬─ post.created ─▶ Q1 ───┼─▶ search
                │ (topic)          ├─ post.deleted ─▶ Q2 ───┼─▶ search
                │                  └─ post.deleted ─▶ Q3 ───┼─▶ media
                └───────────────────────────────────────────┘
```

There are three queues because search-service calls `consumeEvent` twice and
media-service calls it once.

| Term | Meaning | In this code |
| --- | --- | --- |
| Connection, channel | a TCP connection, and a lightweight session inside it that carries every command | `amqp.connect(RABBITMQ_URL)`, then `createChannel()` |
| Producer | sends messages | post-service, `publishEvent` |
| Exchange | the sorting desk; producers always publish to an exchange, never straight into a queue | `facebook_events` |
| Routing key | the label on each message | `"post.created"`, `"post.deleted"` |
| Queue | a mailbox that holds messages until they're consumed | server-named `amq.gen-…` queues |
| Binding | a rule: queue X wants messages whose key matches Y | `bindQueue(q.queue, "facebook_events", "post.deleted")` |
| Consumer | reads from a queue | media-service, search-service |
| Ack | the consumer saying "done, delete it" | `channel.ack(msg)` |

| Routing key | Published by | Consumed by |
| --- | --- | --- |
| `post.created` | `createPost` | search: `handlePostCreated` |
| `post.deleted` | `deletePost` | search: `handlePostDeleted`; media: `handlePostDeleted` |

```viz
type: flow
title: One post.deleted message
publish :: post-service sends routing key post.deleted to facebook_events
route :: the exchange checks every binding; Q2 and Q3 match, Q1 doesn't
> copy :: each matching queue gets its own copy
deliver :: RabbitMQ pushes each copy to that queue's consumer
ack :: each consumer acks, and RabbitMQ deletes its copy
```

Important:

If no binding matches, the exchange drops the message silently, and the
publisher gets no error. A typo in a routing key, or a consumer that isn't
running, loses events without anyone noticing.

Strong answer:

> Post-service publishes JSON events to a topic exchange called
> facebook_events, with the keys post.created and post.deleted. Each consumer
> service declares its own queue per key and binds it, so every service gets
> its own copy: publish/subscribe. Consumers parse, handle and ack. The exchange
> only routes; queues are the only place messages wait.

## 11. Walk Through The Publisher Code Line By Line.

```js
// post-service/src/utils/rabbitmq.js (info logs removed)
const amqp = require("amqplib");

// One connection and one channel per process. Node caches modules, so every
// file that requires this one shares them.
let connection = null;
let channel = null;

// The name all three services have to spell identically.
const EXCHANGE_NAME = "facebook_events";

async function connectToRabbitMQ() {
  try {
    // A TCP connection to amqp://rabbitmq:5672, then a channel inside it.
    // Every command goes through a channel.
    connection = await amqp.connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();

    // Create the exchange if it's missing; do nothing if it already exists.
    await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: false });
    return channel;
  } catch (e) {
    // Swallowed: the function returns undefined and channel stays null.
    logger.error("Error connecting to rabbit mq", e);
  }
}

async function publishEvent(routingKey, message) {
  if (!channel) {
    await connectToRabbitMQ(); // lazy retry if the startup connection failed
  }

  channel.publish(
    EXCHANGE_NAME, // to the exchange, not to a queue
    routingKey, // the label, e.g. "post.created"
    Buffer.from(JSON.stringify(message)), // bytes: object → JSON → Buffer
  );
  // Fire-and-forget: no confirmation, and no error if no queue is bound.
}
```

- Module-level `connection` and `channel` give one long-lived connection per
  process, which is the right shape: connections are expensive, channels are
  cheap.
- `assertExchange` is idempotent, so post, media and search can all run it, and
  whichever starts first creates the exchange (question 13).
- `publish` takes an exchange, a routing key and a Buffer. It returns a
  boolean: `false` means the channel's write buffer is full and the caller
  should wait for the `drain` event. This code ignores it.
- There's no `persistent: true` and no publisher confirm, so post-service never
  learns whether RabbitMQ stored the message.

Symptom:

`connectToRabbitMQ` hides failures. When RabbitMQ is down at startup, it logs
and returns, so post-service starts anyway; that's how it survives a slow
broker. But a publish while the broker is still down retries, fails the same
silent way, and then crashes on `channel.publish` because `channel` is still
`null`.

Fix:

Let connection errors throw, retry with backoff at startup, and treat "could
not publish" as a failure of the request. Better still, write the event to an
outbox and publish it from there.

Strong answer:

> The publisher keeps one connection and one channel per process, declares the
> topic exchange idempotently, and publishes JSON bytes with a routing key. It's
> fire-and-forget: no persistent flag, no publisher confirms, backpressure
> ignored, and connection errors swallowed. For events that matter I'd use a
> confirm channel, persistent messages and an outbox.

## 12. Walk Through The Consumer Code: Why Four Calls Before Any Message?

The rule behind it: a consumer can't read from an exchange, only from a queue.
So each consumer does four things, and each line does one of them:

```js
// search-service/src/utils/rabbitmq.js (media-service has the same function)
async function consumeEvent(routingKey, callback) {
  if (!channel) {
    await connectToRabbitMQ(); // 1. connection, channel, assertExchange
  }

  // 2. a private queue with a name the broker generates
  const q = await channel.assertQueue("", { exclusive: true });

  // 3. tell the exchange: copy messages with this key into my queue
  await channel.bindQueue(q.queue, EXCHANGE_NAME, routingKey);

  // 4. push every message in my queue into this function
  channel.consume(q.queue, (msg) => {
    // null: the broker cancelled this consumer (e.g. its queue was deleted)
    if (msg !== null) {
      // Buffer → string → object, the reverse of publish
      const content = JSON.parse(msg.content.toString());
      callback(content); // the handler, e.g. handlePostCreated (not awaited)
      channel.ack(msg); // "done, delete it", before the handler finishes
    }
  });
}
```

What exists on the broker after each step, when search-service runs
`consumeEvent("post.created", handlePostCreated)`:

```txt
1. assertExchange
   [facebook_events]

2. assertQueue("")
   [facebook_events]                   (amq.gen-Xk2)   ← empty, not connected

3. bindQueue(..., "post.created")
   [facebook_events] ──post.created──▶ (amq.gen-Xk2)

4. consume(..., handlePostCreated)
   [facebook_events] ──post.created──▶ (amq.gen-Xk2) ──▶ handlePostCreated()
```

Mental model:

- Exchange: the sorting room. It never keeps letters; it only decides which
  mailboxes get a copy.
- Queue: a mailbox. Letters wait there until someone collects them.
- Binding: a note you give the sorting room: "put letters about X in my
  mailbox."
- Routing key: the subject written on the envelope, such as `post.created`.
- Consume: "call me whenever a letter lands in my mailbox."

search-service calls `consumeEvent` twice, so these four steps run twice: two
mailboxes, each with one binding and one consumer, sharing one connection and
one channel.

Strong answer:

> Consumers can't read from exchanges, so each one declares the exchange,
> declares its own queue, binds the queue to the exchange with a routing key,
> and consumes from the queue. The binding is what makes the exchange copy
> matching messages into the queue; without it, the queue never receives
> anything.

## 13. Declaring The Exchange: What Do "topic" And durable: false Mean?

`assertExchange("facebook_events", "topic", { durable: false })` packs three
decisions into one line.

**Assert** means "make sure it exists": create it if it's missing, otherwise
do nothing. Consumers run it too, because `bindQueue` fails with a
`NOT_FOUND` error when the exchange doesn't exist. Without it, search-service
booting before post-service would fail; with every service asserting, start
order stops mattering.

**"topic"** is the matching rule: how the exchange compares a message's
routing key with each binding.

- direct: the key must match exactly.
- fanout: keys are ignored, and every bound queue gets a copy.
- topic: keys are dot-separated words, and bindings may use wildcards: `*`
  matches exactly one word, `#` matches zero or more words.
- headers: matches message headers instead of the key.

| Message routing key | binding `post.created` | binding `post.*` | binding `#` |
| --- | --- | --- | --- |
| `post.created` | yes | yes | yes |
| `post.deleted` | no | yes | yes |
| `user.registered` | no | no | yes |

This code binds exact keys only, so today the topic exchange behaves like a
direct one. The payoff comes later: a notification service can bind `post.*`
without anyone touching post-service.

**durable: false** means the exchange definition doesn't survive a broker
restart. The services recreate it on every start (that's what assert does),
which is tolerable in development. `durable: true` makes the definition
survive restarts. Exchange durability, queue durability and message
persistence are three separate settings, and messages survive a restart only
when all three are right (question 17).

Interview trap:

Every declaration of an exchange has to match. If `facebook_events` exists as
non-durable and one service asserts it with `durable: true`, RabbitMQ refuses
with `PRECONDITION_FAILED` and closes that channel. To change a setting,
change it in all three services and delete the old exchange first.

Strong answer:

> assertExchange is an idempotent declare: create if missing, no-op if
> identical, error if the settings differ. topic means routing keys are matched
> as dot-separated patterns, so a consumer can bind post.* or #. durable: false
> means the exchange doesn't survive a broker restart, which only works here
> because every service re-declares it on boot.

## 14. Server-Named Queues: What Does assertQueue("", { exclusive: true }) Do?

**The empty name** means "RabbitMQ, pick a name for me." The broker generates
a unique one and returns it:

```js
const q = await channel.assertQueue("", { exclusive: true });
console.log(q.queue);
```

```txt
amq.gen-JzTY20BRgKO-HjmUJj0wLg
```

That's why the next line binds `q.queue` instead of a name you typed. The
service doesn't care what its mailbox is called; it only needs one of its own.

**Exclusive** means the queue belongs to the connection that declared it: no
other connection can use it, and RabbitMQ deletes it when that connection
closes, whether the service stops, crashes, or just loses the connection.
Random names plus automatic deletion mean nothing is ever left over to clean
up.

The tradeoff is clearest next to a named, durable queue:

| | `assertQueue("", { exclusive: true })` (this code) | `assertQueue("search.post-events", { durable: true })` |
| --- | --- | --- |
| Name | random, picked by RabbitMQ | fixed, picked by you |
| When the service stops | the queue is deleted | the queue stays |
| Messages published while it's down | lost: no queue is bound, so nothing matches | wait in the queue until the service returns |
| Two replicas running | each replica gets every message | replicas share: each message goes to one |
| Broker restart | the queue is gone | the queue survives, and so do persistent messages |

When to use it:

Server-named exclusive queues suit consumers that only care about live events:
pushing notifications to connected websockets, broadcasting cache
invalidation to every instance, or reply queues for RPC. A search index or a
file cleanup job must not miss events, so it needs a named durable queue.

Strong answer:

> An empty name asks the broker to generate a unique queue name, and exclusive
> ties the queue's life to this connection. That's convenient — no naming, no
> cleanup — but events published while the service is down have nowhere to go,
> and every replica gets its own copy. For search or file cleanup I'd use one
> named durable queue per service, so events wait through restarts.

## 15. Is A Binding A Queue? How Do Exchanges, Bindings, And Queues Relate?

No. They play three different roles:

- The exchange routes and stores nothing.
- A binding is a rule, an arrow from an exchange to a queue: "copy messages
  whose key matches X into queue Y." It stores nothing either.
- The queue is the only thing that holds messages until a consumer takes them.

It looks one-to-one here only because `consumeEvent` creates a fresh queue for
every binding. In general, one queue can have many bindings, and one routing
key can match many queues: `post.deleted` reaches both search and media.

Example:

search-service could use one queue with two bindings, and tell the messages
apart by the key they arrived with:

```js
async function consumeEvents(handlers) {
  // handlers maps each routing key to its handler, e.g.
  // { "post.created": handlePostCreated, "post.deleted": handlePostDeleted }
  const q = await channel.assertQueue("", { exclusive: true });

  // one binding per key, all into the same queue
  for (const key of Object.keys(handlers)) {
    await channel.bindQueue(q.queue, EXCHANGE_NAME, key);
  }

  channel.consume(q.queue, (msg) => {
    if (msg === null) return;
    // the key the message was published with picks the handler
    const handle = handlers[msg.fields.routingKey];
    handle(JSON.parse(msg.content.toString()));
    channel.ack(msg);
  });
}
```

Why this is good:

One queue per service keeps that service's events in publish order, which
closes the created-then-deleted race from question 8, provided the service
also finishes each message before starting the next (question 17 shows
acking after the handler, with a prefetch of 1).

Strong answer:

> Exchanges route, bindings are routing rules, and queues store. A binding just
> says "send keys matching X from this exchange to that queue". One queue can
> have many bindings, and one key can reach many queues. This code creates a
> queue per binding, but one queue per service with several bindings is often
> better, because it keeps that service's events in order.

## 16. What Happens When You Run Two Replicas Of A Consumer?

Who receives a message depends on queues, not on consumers:

- Publish/subscribe: one queue per subscriber. Every bound queue gets its own
  copy.
- Work queue (competing consumers): several consumers on one queue. RabbitMQ
  hands each message to exactly one of them, round-robin, limited by prefetch.

In this code every replica calls `assertQueue("")` and gets its own exclusive
queue, so replicas each subscribe instead of sharing:

```txt
Exclusive queue per replica (this code): every replica gets every event
  facebook_events ─┬─▶ amq.gen-A ──▶ media replica 1
                   └─▶ amq.gen-B ──▶ media replica 2

One named queue per service: replicas share the work
  facebook_events ───▶ media.post-deleted ─┬─▶ media replica 1
                                           └─▶ media replica 2
```

Two media replicas would both handle every `post.deleted` and both try to
delete the same Cloudinary files. Two search replicas would both insert the
same document, and the unique `postId` index would reject one of them. Scaling
out multiplies the work instead of dividing it.

Fix:

Give each service one durable, named queue (`media.post-deleted`) that every
replica declares identically. RabbitMQ then load-balances deliveries between
the replicas, and a prefetch limit stops one slow replica from hoarding
messages.

Interview note:

You usually want both patterns at once: publish/subscribe between services
(media and search each get a copy) and a work queue inside each service (its
replicas share that copy). The queue is the unit of subscription; the
consumers on it are the unit of scaling.

Strong answer:

> Delivery is decided by queues: every bound queue gets a copy, and consumers
> on the same queue compete. Here each replica declares its own exclusive
> queue, so replicas duplicate work, and two media replicas would both delete
> the same files. One named durable queue per service keeps a copy per service
> while that service's replicas share the load.

## 17. How Can This Setup Lose Messages, And How Would You Make It Reliable?

RabbitMQ is reliable only when every layer is configured for it. Here none
is:

| Layer | This code | Effect |
| --- | --- | --- |
| Exchange | `durable: false` | disappears when RabbitMQ restarts |
| Queue | exclusive, server-named | deleted when a consumer disconnects, so events published while search or media is down are dropped |
| Message | not persistent | lost if RabbitMQ restarts before delivery |
| Publisher | no confirms | post-service never learns whether the broker took the message |
| Ack | sent right after starting an un-awaited handler | a failed handler loses the message, and nothing retries |
| Flow control | no prefetch | the broker pushes everything at once, and with immediate acks every message starts a handler concurrently |
| Connection | no reconnect, no `error` listener | a broker restart leaves consumers running but receiving nothing; an abrupt disconnect crashes the process |

The last row comes from how amqplib 0.10.5 handles closes. A broker shutdown
closes the connection with a code the library treats as non-fatal, so the
process keeps running on a dead channel. An unexpected socket close emits
`error`, and an `error` event with no listener crashes Node.

A sturdier consumer declares durable topology, dead-letters failures, and
acks only after the work succeeds:

```js
// Durable exchange, a per-service dead-letter exchange, one named queue.
await channel.assertExchange("facebook_events", "topic", { durable: true });
await channel.assertExchange("search.dlx", "fanout", { durable: true });
await channel.assertQueue("search.dead-letters", { durable: true });
await channel.bindQueue("search.dead-letters", "search.dlx", "");

const queue = "search.post-events";
await channel.assertQueue(queue, {
  durable: true,
  arguments: { "x-dead-letter-exchange": "search.dlx" },
});
await channel.bindQueue(queue, "facebook_events", "post.created");
await channel.bindQueue(queue, "facebook_events", "post.deleted");

// one unacked message at a time keeps events in order
await channel.prefetch(1);
await channel.consume(queue, async (msg) => {
  if (msg === null) return;
  try {
    const event = JSON.parse(msg.content.toString());
    await handlers[msg.fields.routingKey](event);
    channel.ack(msg); // only after the work succeeded
  } catch (err) {
    logger.error("Event handling failed", err);
    // no requeue: the queue dead-letters it for inspection
    channel.nack(msg, false, false);
  }
});
```

And the publisher sends persistent messages on a confirm channel:

```js
const { randomUUID } = require("node:crypto");

// At startup: a channel on which the broker confirms every publish.
const confirmChannel = await connection.createConfirmChannel();

// Per event: the id is assigned once, so a retried publish keeps it.
const event = { id: randomUUID(), postId, userId, content, createdAt };

confirmChannel.publish(
  "facebook_events",
  "post.created",
  Buffer.from(JSON.stringify(event)),
  {
    persistent: true, // written to disk once it lands in a durable queue
    contentType: "application/json",
    messageId: event.id, // lets consumers spot duplicates
  },
);
// rejects if the broker couldn't take the message
await confirmChannel.waitForConfirms();
```

For the connection, attach `error` and `close` listeners and reconnect with
backoff, re-declaring the topology each time, or use a wrapper such as
`amqp-connection-manager` that does both.

Important:

Even with all of that:

- Delivery is at least once. A crash after the work but before the ack
  redelivers the message, so handlers must be idempotent (the upsert from
  question 8).
- The save-then-publish in post-service still needs an outbox (question 5).
- Classic queues live on one node; quorum queues replicate across a cluster.

Tradeoff:

A prefetch of 1 gives strict ordering and the smallest blast radius, at the
cost of throughput. A higher prefetch handles several messages at once, and
ordering then needs another guarantee, such as a version number on each event
so a handler can ignore stale ones.

Strong answer:

> Reliability has to be configured at every hop: a durable exchange and named
> durable queues, so nothing disappears on restarts or consumer downtime;
> persistent messages with publisher confirms, so the producer knows the broker
> has them; manual acks after the handler succeeds, with a prefetch for
> backpressure; nack to a dead-letter queue on failure; reconnects; and
> idempotent handlers, because at-least-once delivery means duplicates. This
> code has none of those, so it loses events in half a dozen ways.

## 18. What Traps Are Hidden In The Consumer Code?

Tricks that make it work:

- `assertQueue("")` lets the broker name the queue, so any number of processes
  can subscribe without name clashes.
- `exclusive: true` makes queues clean themselves up when a service stops.
- `assertExchange` in every service makes start order irrelevant.
- `if (!channel)` connects lazily on first use, which is how post-service
  survives a slow broker.

Traps:

1. **One malformed message crashes the service.** `JSON.parse` throws inside
   the consume callback. amqplib calls that callback synchronously while it
   processes incoming network frames, so the exception is treated as a
   connection failure: the connection emits `error` and is torn down (from
   amqplib 0.10.5's source). No code listens for `error`, so Node treats it as
   an uncaught exception and the process exits. With no restart policy it
   stays down, and its exclusive queues are deleted. An `error` listener would
   keep the process alive but not the connection; the real fix is a try/catch
   in the callback that nacks bad messages to a dead-letter queue. If you
   publish a test message by hand, make it valid JSON.
2. **Ack before the work.** `callback(content)` isn't awaited, so the ack goes
   out immediately. If the handler fails halfway (a Cloudinary timeout,
   MongoDB down), the message is already gone and nothing retries. The
   handlers also catch and only log their own errors, which hides the failure
   further.
3. **No concurrency limit.** Because the acks are immediate, a backlog of 1,000
   messages starts 1,000 handlers at once. A prefetch limits concurrency only
   when you ack after the work finishes.
4. **Swallowed connection errors.** `connectToRabbitMQ` logs and returns,
   `channel` stays `null`, and the next line fails with "Cannot read
   properties of null". In media and search that happens inside
   `startServer`, which then exits the process.
5. **A copy-pasted module.** `rabbitmq.js` exists in three services. A typo in
   `EXCHANGE_NAME` or a routing key raises no error; the messages match
   nothing and vanish. Keep exchange names, routing keys and event shapes in
   one shared package.
6. **Drifting declarations.** Change `durable` or the exchange type in one copy,
   and that service's `assertExchange` fails with `PRECONDITION_FAILED` while
   the others keep working.

Strong answer:

> It works on the happy path, but it acks before the handler finishes, has no
> concurrency limit, and parses without a try/catch. Because amqplib runs the
> callback inside its frame loop, one malformed message takes down the
> connection, and with no error listener the whole service crashes. I'd wrap
> each delivery in a try/catch, await the handler, ack or nack explicitly, set a
> prefetch, and share the topology constants in one module.

## 19. How Do You Inspect Exchanges, Bindings, And Queues On A Running Broker?

Read each call as a sentence:

- `assertExchange("facebook_events", "topic")`: "there's a router called
  facebook_events that matches keys by pattern."
- `bindQueue(Q, "facebook_events", "post.deleted")`: "facebook_events copies
  post.deleted messages into Q." The argument order is destination first:
  queue, then exchange, then pattern.
- `publish("facebook_events", "post.deleted", body)`: "hand this body to
  facebook_events, labelled post.deleted."

To map every route in the code, search for the two helpers:

```bash
grep -rn "publishEvent(" */src   # who sends which key
grep -rn "consumeEvent(" */src   # who listens to which key
```

On a running stack, the management UI is at `http://localhost:15672`
(guest/guest in the `rabbitmq:3-management` image). Open Exchanges →
`facebook_events` → Bindings, or Queues → a queue to see its bindings and
consumers. The same from the command line:

```bash
rmq() { docker compose exec rabbitmq rabbitmqctl "$@"; }

rmq list_exchanges name type durable
rmq list_bindings source_name routing_key destination_name
rmq list_queues name exclusive durable consumers messages
```

`list_bindings` prints one row per binding, something like this (the real
output is tab-separated, and queue names change on every run):

```txt
source_name      routing_key     destination_name
                 amq.gen-4fQ…    amq.gen-4fQ…
                 amq.gen-Zp1…    amq.gen-Zp1…
                 amq.gen-b8K…    amq.gen-b8K…
facebook_events  post.created    amq.gen-4fQ…     ← search
facebook_events  post.deleted    amq.gen-Zp1…     ← search
facebook_events  post.deleted    amq.gen-b8K…     ← media
```

Each row is a binding from an exchange (the source) to a queue (the
destination). The rows with an empty source belong to the default exchange,
which automatically binds every queue under its own name. You didn't create
them, and you can ignore them.

Example:

To test a route without the rest of the app, open Exchanges →
`facebook_events` → Publish message, set the routing key to `post.created`,
and send
`{"postId":"t1","userId":"u1","content":"hello rabbit","createdAt":"2026-09-21T00:00:00Z"}`.
search-service logs `Search post created: t1, …` without post-service taking
part. Keep the payload valid JSON (question 18).

Strong answer:

> I read a binding as "this exchange sends keys matching X to that queue", and
> I check the live topology instead of trusting the code: the management UI, or
> rabbitmqctl list_exchanges, list_bindings and list_queues, show every
> exchange, binding and queue, with consumer counts and backlog. Rows from the
> nameless default exchange are the automatic per-queue bindings and can be
> ignored.

## 20. Can You Use More Than One Exchange, And When Should You?

Yes. Every broker already has several built-in exchanges (`amq.direct`,
`amq.fanout`, `amq.topic`, `amq.headers` and more) next to `facebook_events`.
Any service can declare more, and one queue can be bound to several exchanges:

```js
// identity-service announcing new users on its own exchange
await channel.assertExchange("user_events", "topic", { durable: true });
const body = Buffer.from(JSON.stringify({ userId }));
channel.publish("user_events", "user.registered", body);

// a notification service's queue listening to both exchanges
await channel.bindQueue(q.queue, "facebook_events", "post.*");
await channel.bindQueue(q.queue, "user_events", "user.registered");
```

The rule:

For a system this size, one topic exchange with namespaced keys
(`post.created`, `user.registered`, `media.uploaded`) is usually enough: the
prefix already groups events, and consumers pick what they need with
patterns. Split when the needs genuinely differ:

- durability: durable business events versus transient cache-invalidation
  pings
- permissions: RabbitMQ grants read and write access by exchange and queue
  name, so a separate exchange limits who can publish what
- infrastructure: a dead-letter exchange for failures (question 17), or an
  alternate exchange that catches unroutable messages instead of dropping
  them
- ownership: one exchange per domain (`user_events`, `post_events`) makes
  each event's publisher obvious

Exchange-to-exchange bindings, a RabbitMQ extension exposed in amqplib as
`channel.bindExchange(destination, source, pattern)`, build routing trees,
such as copying everything from `post_events` into an audit exchange.

Strong answer:

> Yes. Exchanges are cheap, a queue can bind to several, and the broker ships
> with built-in ones. For a small system I'd keep one topic exchange with
> namespaced keys, and split when the needs differ: durability, permissions, a
> dead-letter or alternate exchange, or clear ownership per domain.

## 21. Running And Reviewing It Overview

When an interviewer hands you a codebase and asks what you'd change, order
the findings by effect and say how you know each one. The bugs in this system:

| Bug | Where | Effect | Evidence |
| --- | --- | --- | --- |
| `const storedToken` declared twice | identity refresh handler | identity-service never starts | reproduced with `node --check` |
| catch blocks log `error`, not the caught `e` | post handlers, `getAllMedias`, search controller | failures hang requests, or crash search | code reading |
| `.startsWith` on a missing Content-Type | gateway media proxy | `GET /v1/media/get` returns 500 | reproduced with the same proxy config |
| no response when results exist | `getAllMedias` | listing your media hangs | code reading |
| startup race, no restart policy | docker-compose, `startServer` | media and search exit if RabbitMQ isn't ready | code reading |
| cache written under a `null` key | `getPost` | the single-post cache never hits | reproduced with ioredis |
| 429 for an invalid token | gateway `validateToken` | clients retry an authentication failure | code reading |
| media ids never validated | create-post, media delete handler | users can delete other users' files | code reading |

Beyond the bugs sit design gaps: messaging that can lose events (question
17), consumer traps (question 18), and security weaknesses (question 24).

Interview method:

Walk the list in this order: does it start, does it fail loudly, is it
correct, is it secure, and will it survive production? Say which findings you
reproduced and which you only read; "I reproduced it" is a much stronger claim
than "I think".

## 22. Why Can Services Fail To Start Under Docker Compose?

`depends_on` in its short form only orders container starts; it doesn't wait
until RabbitMQ accepts connections. The compose file even defines a
healthcheck for RabbitMQ, but nothing waits on it.

Walkthrough:

When media-service boots before RabbitMQ is ready:

1. `connectToRabbitMQ` fails, logs, and returns, so `channel` stays `null`.
2. `consumeEvent` calls `channel.assertQueue` on `null`, which throws a
   TypeError.
3. `startServer` catches it and calls `process.exit(1)`.
4. Compose has no `restart:` policy, so media and search stay down. Meanwhile
   post-service, which connects lazily, starts, connects on its first publish,
   and publishes into an exchange with no queues bound. Every event is
   dropped.

Fix:

```yaml
services:
  media-service:
    depends_on:
      rabbitmq:
        # wait until the healthcheck passes, not just the start
        condition: service_healthy
    restart: unless-stopped
```

Health checks are coarse, since a broker can pass `ping` a moment before it
accepts connections, so the services should also retry the connection with
backoff instead of exiting on the first failure.

Other reasons `docker compose up` fails as written: MongoDB isn't in compose,
each service reads `MONGODB_URI` from its own `.env`, and the repository has
no `.env` files, so compose refuses to start until you create them.

| Service | Needs in `.env` |
| --- | --- |
| api-gateway | `JWT_SECRET`, `IDENTITY_SERVICE_URL`, `POST_SERVICE_URL`, `MEDIA_SERVICE_URL`, `SEARCH_SERVICE_URL` (for example `http://post-service:3002`) |
| identity-service | `MONGODB_URI`, and `JWT_SECRET` matching the gateway's |
| post-service, search-service | `MONGODB_URI` |
| media-service | `MONGODB_URI`, `cloud_name`, `api_key`, `api_secret` (Cloudinary) |

Compose sets `REDIS_URL` and `RABBITMQ_URL`; a service started with
`npm run dev` needs them in its `.env` as well. And the deploy workflow SSHes
into a server and runs `docker-compose up -d` without `--build`, so after the
first deploy the server keeps running its old images.

Strong answer:

> depends_on only orders container starts; it doesn't wait for readiness. Media
> and search exit if RabbitMQ isn't accepting connections yet, and with no
> restart policy they stay down while post-service publishes events nobody
> receives. I'd gate on a health check with condition: service_healthy, add
> restart policies, and retry the broker connection with backoff in code,
> because health checks are coarse.

## 23. How Does The Error Handling Turn Failures Into Hangs And Crashes?

Most controllers catch the error as `e` and then log a variable named `error`:

```js
const createPost = async (req, res) => {
  try {
    // this `error` is block-scoped: it exists only inside try
    const { error } = validateCreatePost(req.body);
    // ...save, publish, respond
  } catch (e) {
    // ReferenceError: error is not defined
    logger.error("Error creating post", error);
    // never runs
    res.status(500).json({ success: false, message: "Error creating post" });
  }
};
```

The same mistake is in all four post handlers, `getAllMedias`, and the search
controller. What happens next depends on the service:

| Service | Unhandled rejections | Result of any failure |
| --- | --- | --- |
| post, media | `process.on("unhandledRejection")` logs them | the request hangs; no response is ever sent |
| search | no handler | Node's default: the process exits |
| identity | its catch blocks are correct | a 500, as intended |

Why a hang: Express 4 ignores the promise an async handler returns. The
ReferenceError rejects that promise, Express never sees it, and nothing calls
`res`. For example, `GET /v1/posts/abc` (not a valid ObjectId) makes
`findById` throw a cast error, the catch block throws the ReferenceError, and
the client waits until it gives up.

Other response bugs:

- `getAllMedias` responds only when the user has no media; with results, it
  never calls `res.json`.
- Multer errors return `err.stack` to the client, which leaks file paths and
  library versions.

Fix:

- Log the variable you caught. The `no-undef` lint rule, or TypeScript, flags
  this at build time.
- Use Express 5, which passes rejected promises from async handlers to the
  error middleware, or wrap handlers so rejections reach `next(err)`.
- Keep one error middleware that always responds, and make
  `unhandledRejection` log and exit, so the orchestrator restarts a clean
  process instead of leaving requests hanging.

Strong answer:

> The catch blocks reference a variable that doesn't exist, so every error
> becomes a ReferenceError inside the catch. Express 4 doesn't handle rejected
> promises from async handlers, so the services with an unhandledRejection
> logger leave the request hanging, and search, with no handler, crashes. A
> lint rule catches it; Express 5, or an async wrapper plus one error
> middleware, turns failures back into 500s.

## 24. What Security Issues Would You Raise In A Review?

| Issue | Where | Risk | Fix |
| --- | --- | --- | --- |
| Identity header trusted blindly | post, media and search middleware | anyone who reaches a service directly can act as any user | private network, gateway overwrites the header, signed internal token or mTLS (question 3) |
| Media ids never validated | create-post, media delete handler | users can delete other users' files (question 7) | scope deletes by owner; validate on create |
| Infrastructure ports published | docker-compose | Redis (no password) and RabbitMQ (guest/guest) are reachable from outside the host, and Docker-published ports bypass ufw rules on Linux | don't publish them; set credentials |
| One shared HS256 secret | gateway and identity | anything holding `JWT_SECRET` can mint tokens | asymmetric keys, so the gateway can only verify |
| Rate limits keyed by the gateway's IP | identity-service | one abuser throttles login for everyone | limit at the edge, or forward and trust the client IP |
| Different login errors | `loginUser` | reveals which emails are registered | one message and a 401 for both cases |
| Logout keeps access tokens valid | identity and gateway | a stolen token works for up to an hour | short TTL; `jti` denylist in Redis |
| Stack traces in responses | media upload route | leaks internals | log the stack, return a generic message |

Strong answer:

> The biggest issue is the trust model: services accept x-user-id from anyone
> who can reach them, and the media handler trusts ids from an event without
> checking ownership, so a user can delete other users' files. After that:
> infrastructure ports published with default credentials, a shared symmetric
> JWT secret, per-IP limits that only see the gateway's IP, user enumeration on
> login, and no access-token revocation.

## 25. If You Inherited This Codebase, What Would You Fix First?

Priority order:

1. Make it start: delete the duplicate `const storedToken` line in
   identity-service.
2. Make failures loud: fix every catch block, add the lint rule, and move to
   Express 5 or an async wrapper.
3. Unbreak media listing: guard the gateway's Content-Type check, and send the
   result in `getAllMedias`.
4. Close the file-deletion hole: scope deletes by `event.userId`, and validate
   `mediaIds` on create.
5. Make startup deterministic: health-gated `depends_on`, restart policies, and
   connection retry with backoff.
6. Fix the small correctness bugs: the `getPost` cache key, and 401 instead of
   429 for bad tokens.
7. Make messaging reliable: a durable exchange, one named durable queue per
   service, persistent messages with confirms, acks after the handler,
   prefetch, dead-lettering, reconnects, idempotent handlers, and an outbox in
   post-service.
8. Harden the edges: stop publishing the Redis and RabbitMQ ports, move to
   asymmetric JWT signing, and forward a signed identity or use mTLS.
9. Make it operable: rebuild images on deploy, pass a correlation id from the
   gateway through HTTP calls and events, and track queue depth, consumer
   counts and handler failures.

Key reasoning:

Blast radius and cost set the order. First what stops the system from working
at all, then the silent failures (hangs, lost events) that hide other bugs,
then security holes, then durability and operations. Steps 1 to 6 are a few
lines each; steps 7 to 9 are design work that deserves separate changes.

Strong answer:

> First I'd make it run and make failures loud: the identity SyntaxError, the
> catch blocks that turn errors into hangs, the media listing bugs, and
> deterministic startup. Next, the cross-service hole where deleting a post can
> delete someone else's files. Then messaging durability — named durable
> queues, confirms, ack-after-work, dead-lettering, idempotency and an outbox —
> and finally network hardening and observability.

## Sources Used

- The case-study codebase (API gateway plus identity, post, media and search
  services), read in full; findings marked "reproduced" were confirmed by
  running the code or its libraries.
- amqplib 0.10.5 source: `lib/connection.js`, `lib/channel.js`,
  `lib/channel_model.js`
- express-http-proxy 2.1.1 source: `index.js`, `lib/requestOptions.js`
- <https://www.rabbitmq.com/docs/exchanges>
- <https://www.rabbitmq.com/docs/queues>
- <https://www.rabbitmq.com/docs/confirms>
- <https://www.rabbitmq.com/docs/consumer-prefetch>
- <https://www.rabbitmq.com/docs/dlx>
- <https://amqp-node.github.io/amqplib/channel_api.html>
- <https://docs.docker.com/compose/how-tos/startup-order/>
- <https://expressjs.com/en/guide/migrating-5.html>
- <https://www.mongodb.com/docs/manual/core/index-ttl/>
