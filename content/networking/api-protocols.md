# API Protocols In Depth Interview Guide

How each API protocol actually works on the wire: REST constraints and the Richardson
maturity model, SOAP, GraphQL schemas and resolvers, the N+1 problem and DataLoader,
GraphQL caching and security, Protocol Buffers, gRPC streaming modes and deadlines,
grpc-web, the WebSocket handshake and frame format, WebRTC signalling, tRPC, and how
to evolve a protocol without breaking clients.

The HTTP, TLS & Web Protocols guide covers *which* of these to choose. This one covers
*how each one works* once you have chosen it.

## 1. What Actually Distinguishes One API Protocol From Another?

Strip away the branding and every API protocol answers the same four questions.

```viz
type: stack
title: The four decisions every protocol makes
Transport :: what carries the bytes — HTTP/1.1, HTTP/2, raw TCP, UDP
Encoding :: how data is serialised — JSON, XML, Protobuf, MessagePack
Contract :: how both sides agree on shape — OpenAPI, WSDL, .proto, SDL, or nothing
Interaction :: request/response, streaming, publish/subscribe, peer-to-peer
```

| Protocol | Transport | Encoding | Contract | Interaction |
| --- | --- | --- | --- | --- |
| REST | HTTP | JSON | OpenAPI (optional) | request/response |
| SOAP | HTTP, SMTP | XML | WSDL (mandatory) | request/response |
| GraphQL | HTTP | JSON | SDL (mandatory) | request/response + subscriptions |
| gRPC | HTTP/2 | Protobuf | `.proto` (mandatory) | unary + 3 streaming modes |
| WebSocket | TCP after HTTP upgrade | anything | none | bidirectional messages |
| WebRTC | UDP (SRTP/SCTP) | anything | none | peer-to-peer |

Why it matters:

Most "which protocol" arguments are really arguments about one of these four rows. "We
need a schema" is a contract argument. "JSON is too big" is an encoding argument. Naming
the row turns a preference fight into a decision.

Interview answer:

"I look at what is actually being asked. If the complaint is payload size, that is
encoding and Protobuf helps. If it is client/server drift, that is the contract and any
schema-first option helps. If it is round trips, that is interaction shape — and that is
where GraphQL or streaming earns its keep."

## 2. What Does REST Actually Require?

REST is an architectural style from Roy Fielding's 2000 dissertation, not a
specification. It defines six **constraints**:

```txt
Client-server        separate concerns; they evolve independently
Stateless            every request carries everything needed to process it
Cacheable            responses declare whether they may be cached
Uniform interface    resources, representations, self-descriptive messages, hypermedia
Layered system       a client cannot tell if it is talking to the origin or a proxy
Code on demand       optional — the server may ship executable code
```

Most "REST APIs" satisfy three or four of these. That is fine, and worth saying out loud
in an interview rather than pretending otherwise.

The **Richardson Maturity Model** grades how far an API actually goes:

```viz
type: flow
title: Richardson maturity levels
Level 0 :: one endpoint, RPC over HTTP — POST /api with an action in the body
Level 1 :: resources — /users, /orders, but still POST for everything
Level 2 :: HTTP verbs and status codes used correctly — where most real APIs sit
Level 3 :: HATEOAS — responses carry links describing what you can do next
```

```json
// Level 3: the response tells the client what actions exist.
{
  "id": 42,
  "status": "pending",
  "_links": {
    "self":   { "href": "/orders/42" },
    "cancel": { "href": "/orders/42/cancel", "method": "POST" },
    "pay":    { "href": "/orders/42/payment", "method": "POST" }
  }
}
```

Tradeoff:

HATEOAS lets the server change URLs and available actions without a client release —
genuinely useful for long-lived public APIs. In practice almost nobody implements it,
because typical clients hard-code routes anyway and the extra payload buys them nothing.

Interview answer:

"Level 2 is the honest target: resources as nouns, verbs and status codes used properly,
and caching headers that mean something. I would call an API 'REST-ish' rather than claim
Level 3 I have not built."

## 3. How Do You Design REST Resources And Handle Versioning?

Resources are **nouns**; the method is the verb. An endpoint containing a verb is a sign
you have drifted to RPC.

```txt
Good                              Bad
GET    /users/42/orders           GET  /getUserOrders?id=42
POST   /orders                    POST /createOrder
DELETE /orders/42                 POST /deleteOrder
POST   /orders/42/cancel          POST /orderAction?type=cancel
```

The last "good" example is deliberate: genuine **actions** that are not CRUD are best
modelled as a sub-resource. Trying to force "cancel an order" into `PATCH /orders/42`
with `{"status":"cancelled"}` hides a state machine behind a field assignment.

Pagination, filtering, and sorting belong in the query string:

```txt
GET /orders?status=paid&sort=-createdAt&limit=20&cursor=eyJpZCI6NDJ9
```

Cursor pagination over offset:

```txt
?offset=10000&limit=20   the database must count and discard 10,000 rows
?cursor=<opaque>&limit=20  an indexed seek — constant cost at any depth
```

Versioning options:

| Approach | Example | Notes |
| --- | --- | --- |
| URI | `/v1/users` | visible in logs, traces, proxy rules — the usual default |
| Header | `Accept-Version: 1` | clean URLs, invisible in caches and logs |
| Media type | `Accept: application/vnd.api.v1+json` | most REST-correct, least tooling |

The rule:

Version when you **break** a contract, not when you add to one. Adding an optional field
or a new endpoint is backward compatible; removing a field, renaming one, changing a
type, or tightening validation is not.

Interview trap:

Changing a field's type from `string` to `number` looks harmless and breaks every typed
client. So does making a previously optional request field required. Additive changes are
safe; anything else needs a version.

## 4. What Is SOAP, And Why Does It Still Exist?

**SOAP** (Simple Object Access Protocol) is an XML messaging protocol from the late
1990s. Every message is an Envelope containing an optional Header and a Body.

```xml
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Header>
    <wsse:Security>...</wsse:Security>
  </soap:Header>
  <soap:Body>
    <GetUser xmlns="http://example.com/users">
      <UserId>42</UserId>
    </GetUser>
  </soap:Body>
</soap:Envelope>
```

The contract is a **WSDL** document — machine-readable, and tooling generates a typed
client from it, much like `.proto` does for gRPC.

Why it survives:

- **WS-Security** provides message-level signing and encryption, so a message stays
  signed as it passes through intermediaries. TLS only protects one hop.
- **WS-AtomicTransaction** offers distributed two-phase commit.
- Banking, insurance, telecom, healthcare, and government systems standardised on it and
  have no reason to rewrite working integrations.

Tradeoff:

Verbose, heavyweight, and transport-agnostic in a world that settled on HTTP. A SOAP
payload is several times the size of the equivalent JSON, and debugging it without
tooling is unpleasant.

Interview answer:

"I would not choose SOAP for anything new, but 'legacy' is not the same as 'irrelevant'.
If an integration partner exposes a WSDL, I generate a client from it rather than
hand-rolling XML, and I keep that adapter at the edge of the system so SOAP types never
leak into my domain model."

## 5. How Does GraphQL Actually Work?

GraphQL is a query language plus a runtime. One endpoint accepts a query describing
exactly what the client wants; the server resolves it field by field.

```graphql
# Schema (SDL) — the contract, defined server-side.
type User {
  id: ID!
  email: String!
  orders(first: Int = 10): [Order!]!
}

type Order {
  id: ID!
  total: Int!
}

type Query {
  user(id: ID!): User
}

type Mutation {
  createOrder(input: CreateOrderInput!): Order!
}
```

```graphql
# Query — the client picks the fields and the depth.
query {
  user(id: "42") {
    email
    orders(first: 3) { total }
  }
}
```

```json
{ "data": { "user": { "email": "a@b.com", "orders": [{ "total": 1200 }] } } }
```

The response mirrors the query shape exactly. That is the core promise: no over-fetching
(fields you did not want) and no under-fetching (a second round trip for related data).

**Resolvers** execute per field:

```js
const resolvers = {
  Query: {
    user: (_parent, { id }, ctx) => ctx.db.user.findUnique({ where: { id } }),
  },
  User: {
    // Runs once per User returned by the parent resolver.
    orders: (parent, { first }, ctx) =>
      ctx.db.order.findMany({ where: { userId: parent.id }, take: first }),
  },
};
```

Important:

`!` means non-nullable. If a non-nullable field resolves to `null`, the error propagates
**up** to the nearest nullable parent — potentially nulling an entire branch of the
response. Over-using `!` turns one failed field into a mostly empty response.

Interview trap:

GraphQL almost always runs over `POST /graphql` and returns **200 OK even for errors**.
Failures appear in an `errors` array alongside partial `data`. Clients that only check
the HTTP status silently treat failures as successes.

## 6. What Is The N+1 Problem In GraphQL, And How Does DataLoader Fix It?

Because resolvers run per field per object, a list of N parents triggers N child queries.

```graphql
query { users(first: 100) { email orders { total } } }
```

```txt
1 query   SELECT * FROM users LIMIT 100
100 queries  SELECT * FROM orders WHERE user_id = ?   <- once per user
= 101 queries for one request
```

**DataLoader** batches all calls made within a single tick of the event loop into one
query, and caches per request.

```js
import DataLoader from "dataloader";

const createOrdersLoader = (db) =>
  new DataLoader(async (userIds) => {
    const orders = await db.order.findMany({ where: { userId: { in: userIds } } });

    // MUST return one entry per key, in the same order as the keys.
    return userIds.map((id) => orders.filter((o) => o.userId === id));
  });

// One loader instance PER REQUEST, created in the context factory.
const context = ({ req }) => ({ db, loaders: { orders: createOrdersLoader(db) } });
```

```js
User: {
  orders: (parent, _args, ctx) => ctx.loaders.orders.load(parent.id),
}
```

```txt
1 query   SELECT * FROM users LIMIT 100
1 query   SELECT * FROM orders WHERE user_id IN (...)
= 2 queries
```

Important:

The batch function must return an array of the **same length and order** as the keys it
was given. Returning the raw database rows — which come back in arbitrary order and skip
missing ids — silently maps results to the wrong parents. This is the single most common
DataLoader bug.

Interview trap:

DataLoader instances must be created **per request**, not once per process. A
module-level loader caches across users, so one user's data is served to another — a
data-leak bug that never appears in development with a single test user.

## 7. Why Is GraphQL Hard To Cache, And What Do You Do About It?

Every query is a `POST` to the same URL, and HTTP caching keys on method plus URL. So
browsers, CDNs, and reverse proxies cache nothing.

```viz
type: flow
title: Why the HTTP cache cannot help
Every query is POST /graphql :: same URL for every possible query
POST is not cacheable :: by specification, and the body is not part of the cache key
CDN sees one opaque endpoint :: it cannot distinguish cheap from expensive queries
Result :: every request reaches the origin
```

The fixes, in increasing order of effort:

**Persisted queries** — register queries ahead of time, send a hash instead of the text,
and use `GET` so the URL becomes cacheable:

```txt
GET /graphql?extensions={"persistedQuery":{"sha256Hash":"abc123..."}}&variables={...}
```

That URL is now a stable cache key a CDN understands. It also stops clients sending
arbitrary queries, which is a security win on its own.

**Normalised client cache** — Apollo Client and urql store objects by `__typename` and
`id`, so a user fetched in one query is reused everywhere. This moves caching from HTTP
into the client.

**Server-side response caching with cache hints:**

```graphql
type User @cacheControl(maxAge: 60) {
  id: ID!
  profile: Profile @cacheControl(maxAge: 3600)
  balance: Int @cacheControl(maxAge: 0, scope: PRIVATE)
}
```

Tradeoff:

REST gets HTTP caching free because a resource is a URL. GraphQL trades that away for
query flexibility and has to rebuild caching at a different layer. That is a real cost,
and it is the strongest argument for REST on public, high-traffic, read-heavy APIs.

## 8. How Do You Secure A GraphQL API?

The flexibility that makes GraphQL pleasant also makes it easy to attack. A single
request can be arbitrarily expensive.

```graphql
# Depth attack: one small request, catastrophic cost.
query {
  user(id: "1") { orders { user { orders { user { orders { id } } } } } }
}
```

The defences:

```txt
Depth limiting        reject queries nested beyond N levels
Complexity analysis   assign each field a cost; reject above a budget
Pagination limits     cap `first`/`limit` server-side, never trust the argument
Query allowlisting    persisted queries only — the strongest option
Timeouts              a hard ceiling on resolver execution
Rate limit by COST    not by request count
```

```js
const server = new ApolloServer({
  schema,
  validationRules: [depthLimit(7), createComplexityLimitRule(1000)],
});
```

Interview trap:

**Aliases defeat naive rate limiting.** One request can invoke the same expensive field
hundreds of times under different names, so it counts as a single request:

```graphql
query {
  a: expensiveReport(year: 2024) { total }
  b: expensiveReport(year: 2023) { total }
  c: expensiveReport(year: 2022) { total }
  # ... repeated 500 times
}
```

This is why cost-based limiting matters — request counting sees one request.

Important:

Authorisation belongs in resolvers or the data layer, never in the gateway. Any field can
be reached from multiple query paths, so a check on one entry point is not a check on the
field. The safest shape is authorising inside the data-access layer that every resolver
shares.

Edge cases:

Introspection exposes your entire schema. Disabling it in production is mild obscurity
rather than real security — the schema is inferable from client bundles — but it does
raise the effort for casual scanning. Persisted queries are the substantive control.

## 9. What Are Protocol Buffers, And How Do They Differ From JSON?

**Protobuf** is a binary serialisation format with a schema. Fields are identified by
**numbers**, not names, which is what makes the encoding compact.

```proto
syntax = "proto3";
package users.v1;

message User {
  string id = 1;              // 1, 2, 4 are FIELD NUMBERS — the wire identity
  string email = 2;
  reserved 3;                 // `phone` used to live here — never reuse the number
  repeated string roles = 4;
  optional int32 age = 5;
}
```

```txt
JSON      {"id":"42","email":"a@b.com"}        29 bytes, field names on the wire
Protobuf  0A 02 34 32 12 07 61 40 62 2E ...    ~15 bytes, numbers instead of names
```

| | JSON | Protobuf |
| --- | --- | --- |
| Human readable | yes | no — needs the schema to decode |
| Size | larger | typically 30–50% smaller for the same data |
| Parse speed | slower | faster, generated code |
| Schema | optional | mandatory |
| Debugging | `curl` and read it | needs `grpcurl` or a decoder |

The rule for evolving a `.proto` safely:

```txt
SAFE            add a new field with a NEW number
SAFE            mark a removed field `reserved` so it is never reused
BREAKS CLIENTS  change an existing field's number
BREAKS CLIENTS  change an existing field's type
BREAKS CLIENTS  reuse a number that used to mean something else
```

Interview trap:

Reusing a field number is the classic Protobuf disaster. An old client sending field `3`
as a phone-number string is decoded by a new server that believes field `3` is an
integer. There is no error — just corrupted data, because the wire format carries no
names to cross-check against.

Important:

In proto3 every scalar field has a default (`""`, `0`, `false`) and unset fields are
indistinguishable from fields explicitly set to that default. Use `optional` (restored in
proto 3.15) when "absent" and "zero" must be different — for example a `discount` of 0
versus no discount specified.

## 10. How Does gRPC Work, And What Are Its Four Call Types?

gRPC is RPC over HTTP/2 with Protobuf payloads. You define a service; tooling generates
a typed client and server stub in every supported language.

```proto
service UserService {
  rpc GetUser (GetUserRequest) returns (User);                        // unary
  rpc ListUsers (ListRequest) returns (stream User);                  // server stream
  rpc UploadEvents (stream Event) returns (UploadSummary);            // client stream
  rpc Chat (stream Message) returns (stream Message);                 // bidirectional
}
```

```viz
type: stack
title: The four interaction modes
Unary :: one request, one response — an ordinary function call
Server streaming :: one request, a stream of responses — feeds, large result sets
Client streaming :: a stream of requests, one response — uploads, batch ingestion
Bidirectional :: both stream independently — chat, live sync, long-lived sessions
```

Why HTTP/2 matters here: multiplexing means many concurrent calls share one connection
without head-of-line blocking, and streaming is native to the protocol rather than
layered on top.

```js
// The generated client looks like a local method call.
const user = await client.getUser({ id: "42" }, { deadline: Date.now() + 2000 });
```

Benefits:

- Generated clients mean no hand-written HTTP plumbing and no drift between languages.
- Binary framing plus Protobuf gives materially lower latency and bandwidth.
- Streaming is first-class rather than bolted on with SSE or WebSockets.

When not to use it:

Public APIs. Third-party developers expect to `curl` an endpoint and read JSON. Handing
them a `.proto` file and a codegen step is a significant adoption cost.

## 11. What Are gRPC Deadlines And Status Codes?

A **deadline** is an absolute point in time by which the call must complete, and it
**propagates across service hops**.

```viz
type: flow
title: Why deadlines beat timeouts
Client sets deadline :: now + 2s, sent as an absolute time in the request
Service A receives it :: 1.2s already spent — only 0.8s remains
Service A calls B :: passes the SAME deadline, not a fresh 2s timeout
Service B sees 0.8s :: and gives up in time instead of working on a dead request
```

With per-hop timeouts instead, a three-hop chain of "2 second timeouts" can take six
seconds while the original caller gave up after two — every service burning CPU on work
nobody will read.

gRPC replaces HTTP status codes with its own set:

| Code | Meaning | HTTP analogue |
| --- | --- | --- |
| `OK` (0) | success | 200 |
| `INVALID_ARGUMENT` (3) | bad request data | 400 |
| `DEADLINE_EXCEEDED` (4) | ran out of time | 504 |
| `NOT_FOUND` (5) | no such entity | 404 |
| `ALREADY_EXISTS` (6) | duplicate | 409 |
| `PERMISSION_DENIED` (7) | authenticated, not allowed | 403 |
| `RESOURCE_EXHAUSTED` (8) | quota or rate limit | 429 |
| `FAILED_PRECONDITION` (9) | wrong state for this operation | 400/409 |
| `UNAVAILABLE` (14) | transient — safe to retry | 503 |
| `UNAUTHENTICATED` (16) | no valid credentials | 401 |

Important:

The distinction between `UNAVAILABLE` and `FAILED_PRECONDITION` drives retry behaviour.
`UNAVAILABLE` means "try again, it may work". `FAILED_PRECONDITION` means "do not retry
until you change something". Returning the wrong one causes either retry storms against a
broken service, or giving up on a transient blip.

Interview answer:

"Deadlines over timeouts, because they propagate and represent the caller's real budget.
And I map errors onto the standard codes carefully, since `UNAVAILABLE` versus
`FAILED_PRECONDITION` is what tells every client library whether retrying is sane."

## 12. Why Can't A Browser Call gRPC Directly?

Browsers expose `fetch` and `XMLHttpRequest`, neither of which gives JavaScript control
over HTTP/2 frames. gRPC needs trailers and frame-level access that browser APIs do not
provide.

**grpc-web** is the workaround: a browser-compatible wire format plus a proxy that
translates to real gRPC.

```viz
type: flow
title: grpc-web request path
Browser :: sends grpc-web over HTTP/1.1 or HTTP/2
Proxy (Envoy) :: translates grpc-web to native gRPC
Backend service :: receives ordinary gRPC and never knows the difference
```

The limitations are significant:

```txt
Supported      unary calls, server streaming
NOT supported  client streaming, bidirectional streaming
Required       a proxy — Envoy, or grpc-gateway
```

Tradeoff:

If browsers are a first-class client, gRPC costs you a proxy hop plus two unavailable
call types. A common pattern is gRPC between internal services and a thin REST or GraphQL
gateway for browsers — keeping binary efficiency inside the cluster and web-native
ergonomics at the edge.

Debugging note:

You cannot `curl` a gRPC endpoint. Use `grpcurl`, which reads the schema via server
reflection:

```bash
grpcurl -plaintext localhost:50051 list
grpcurl -plaintext -d '{"id":"42"}' localhost:50051 users.v1.UserService/GetUser
```

## 13. How Does The WebSocket Protocol Actually Work?

A WebSocket starts as an HTTP request asking to change protocols, then abandons HTTP
entirely.

```txt
GET /chat HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
Origin: https://app.example.com
```

```txt
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

The server computes `Sec-WebSocket-Accept` as
`base64(SHA1(client_key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))`. That fixed GUID
comes from RFC 6455, and its only purpose is proving the server actually understood the
upgrade rather than blindly echoing a 101 — it is a handshake check, not security.

After the 101, data moves in **frames**:

```txt
Opcode  0x0  continuation      0x1  text        0x2  binary
        0x8  close             0x9  ping        0xA  pong

FIN bit    is this the final frame of a message?
MASK bit   client -> server frames MUST be masked with a random key
Length     7 bits, or 16, or 64 depending on size
```

Important:

Client-to-server masking exists to defeat **cache poisoning of intermediaries**. An
unmasked, attacker-controlled payload could be crafted to look like a valid HTTP request
to a naive proxy sitting in the path. Masking randomises the bytes so that is not
possible. Browsers do it automatically.

Interview trap:

**WebSockets are not subject to the same-origin policy.** Any website can open a
WebSocket to your server, and the browser will attach cookies to the handshake. This is
cross-site WebSocket hijacking, and CORS does not protect you. You must validate the
`Origin` header yourself at the handshake:

```js
wss.on("headers", (_headers, req) => { /* check req.headers.origin */ });

// Or reject during the upgrade.
server.on("upgrade", (req, socket) => {
  if (!allowedOrigins.includes(req.headers.origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
  }
});
```

Close codes worth knowing:

```txt
1000  normal closure
1001  going away — server shutting down, or browser navigating away
1006  abnormal — connection dropped with NO close frame (the one you see in outages)
1011  server encountered an unexpected condition
```

Edge cases:

Ping/pong frames (`0x9`/`0xA`) are protocol-level keepalives, not application messages.
Without them, idle connections are silently killed by NAT gateways and proxies — the
client believes it is connected until its next send fails.

## 14. What Is WebRTC, And When Do You Need It?

**WebRTC** establishes direct peer-to-peer connections between browsers for audio, video,
and arbitrary data — without relaying everything through your server.

The hard part is that both peers are usually behind NAT, so neither has a directly
reachable address.

```viz
type: flow
title: Establishing a WebRTC connection
Signalling :: peers exchange SDP offer/answer through YOUR server (usually WebSocket)
STUN :: each peer asks a STUN server "what is my public IP and port?"
ICE candidates :: peers exchange every possible address pair and test them
Direct connection :: if a path works, media flows peer-to-peer — your server is out
TURN relay :: if NAT is too restrictive (~10-20% of cases), traffic relays through TURN
```

Important:

**WebRTC does not define signalling.** You build it. The specification covers the media
and data transport; getting the SDP offer, the answer, and the ICE candidates between two
peers is your problem, and almost everyone solves it with a WebSocket.

```js
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "turn:turn.example.com", username: "u", credential: "p" },
  ],
});

// Arbitrary data, not just media — and it can be unreliable/unordered by choice.
const channel = pc.createDataChannel("game-state", {
  ordered: false,
  maxRetransmits: 0,   // behaves like UDP — drop late packets rather than delay
});
```

When to use it:

Video and voice calls, screen sharing, and latency-critical realtime data such as
multiplayer game state, where a server round trip is too slow and stale data is worthless.

Tradeoff:

TURN relay servers are expensive — they carry the full media bandwidth for every call
that cannot connect directly, typically 10–20% of them. Budget for that before choosing
peer-to-peer, and be aware that peer-to-peer also exposes participants' IP addresses to
each other.

## 15. Where Does tRPC Fit?

**tRPC** gives you end-to-end type safety with no schema language and no code generation.
The client's types are *inferred* directly from the server's TypeScript.

```ts
// server
export const appRouter = router({
  getUser: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input, ctx }) => ctx.db.user.findUnique({ where: { id: input.id } })),
});

export type AppRouter = typeof appRouter;
```

```ts
// client — fully typed, autocompleted, and checked at compile time
const user = await trpc.getUser.query({ id: "42" });
//    ^? User | null — inferred from the server, no codegen step
```

| | tRPC | gRPC | GraphQL |
| --- | --- | --- | --- |
| Schema artifact | none — TypeScript is the schema | `.proto` | SDL |
| Codegen step | none | required | optional |
| Languages | TypeScript only | many | many |
| Wire format | JSON over HTTP | Protobuf over HTTP/2 | JSON over HTTP |

When to use it:

A TypeScript monorepo where client and server ship together. The type safety is excellent
and the setup cost is near zero.

When not to use it:

Anything consumed by a client you do not control, or by a non-TypeScript service. There
is no language-neutral contract to hand out — the "schema" only exists as TypeScript
types in your repository.

Interview answer:

"tRPC is the right answer for a full-stack TypeScript app in one repo, and the wrong
answer for a public API. It trades a language-neutral contract for zero ceremony, which
is a great trade right up until a second language appears."

## 16. How Do You Evolve An API Without Breaking Clients?

Every protocol above has the same underlying rule: **additive changes are safe,
subtractive and type changes are not.**

```txt
SAFE
  add a new optional field to a response
  add a new endpoint, method, or RPC
  add a new enum value  (if clients handle unknowns — see the trap)
  relax validation

BREAKING
  remove or rename a field
  change a field's type
  make an optional request field required
  tighten validation
  change the meaning of an existing field
  reuse a Protobuf field number
```

The deprecation path that works:

```viz
type: flow
title: Retiring a field without an outage
Add the replacement :: both old and new fields ship together
Mark the old one deprecated :: in the schema, the docs, and response headers
Measure actual usage :: log reads of the deprecated field per client
Notify the remaining callers :: with real numbers, not a blanket announcement
Remove only at zero usage :: or at a version boundary you announced
```

Protocol-specific tooling for this:

```graphql
field: String @deprecated(reason: "Use `newField`. Removal after 2026-06-01.")
```

```proto
string old_field = 3 [deprecated = true];
```

```txt
Deprecation: Wed, 01 Jun 2026 00:00:00 GMT
Sunset: Wed, 01 Dec 2026 00:00:00 GMT
```

Interview trap:

Adding an **enum value** is only safe if clients handle unknown values. A client with an
exhaustive `switch` and no default crashes the first time your new `status: "refunded"`
arrives. Treat enums as a closed contract unless you designed for extension from day one.

Important:

Contract testing is what makes this enforceable rather than aspirational. Check the
schema into version control and fail CI on a breaking diff:

```bash
buf breaking --against '.git#branch=main'      # Protobuf
graphql-inspector diff schema.graphql main     # GraphQL
oasdiff breaking base.yaml revision.yaml       # OpenAPI
```

Interview answer:

"I make breaking changes impossible to merge by accident. The schema is a checked-in
artifact, CI diffs it against main, and a breaking change fails the build unless it is
paired with a version bump. Then deprecation is a measured process — instrument usage,
chase the remaining callers with real numbers, and remove only at zero."

## Sources Used

- <https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm>
- <https://martinfowler.com/articles/richardsonMaturityModel.html>
- <https://graphql.org/learn/>
- <https://github.com/graphql/dataloader>
- <https://www.apollographql.com/docs/apollo-server/performance/caching/>
- <https://protobuf.dev/programming-guides/proto3/>
- <https://grpc.io/docs/what-is-grpc/core-concepts/>
- <https://grpc.io/docs/guides/deadlines/>
- <https://github.com/grpc/grpc-web>
- <https://www.rfc-editor.org/rfc/rfc6455>
- <https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API>
- <https://trpc.io/docs/concepts>
- <https://www.rfc-editor.org/rfc/rfc8594>
