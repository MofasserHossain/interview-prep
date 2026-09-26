# System Design Case Studies Interview Guide

Twenty system design practice problems that come up repeatedly in product
company interviews, including Atlassian-style rounds: project management and
ticketing tools, real-time collaboration, notifications, search, API gateways,
authentication, workflow automation, logging, rate limiting, URL shortening,
messaging, chat, job scheduling, plus two object-oriented design warmups
(parking lot and snake game).

Every case study follows the same flow so it can be practised out loud:

1. Clarify functional and non-functional requirements.
2. Estimate scale and pick the numbers that shape the design.
3. Define the API and the core data model.
4. Draw the high-level architecture.
5. Deep dive into the two or three hard parts.
6. Cover failure cases, tradeoffs, and how to evolve the design.

Two pairs of prompts overlap on purpose because interviewers ask both
versions. Question 1 covers Jira as a whole product while question 15 goes
deep on the issue lifecycle. Question 3 covers the multi-channel delivery
pipeline at scale while question 17 covers the in-app inbox and unread state.

## 1. Design A Project Management Tool Like Jira

Jira is a multi-tenant work tracker: teams create projects, projects hold
issues, issues move through workflows, and boards render issues by status.

Clarifying questions:

- Which slice matters most: issue tracking, boards, or reporting?
- Multi-tenant SaaS or single organization?
- Custom fields and custom workflows per project, or fixed?
- Real-time board updates, or refresh on navigation?
- Expected size per tenant: thousands or millions of issues?

Assumed scale:

```txt
10M users, 500k tenants, 2B issues total
Peak 50k reads/s, 3k writes/s
Largest tenant: 5M issues, 20k concurrent users
Read-heavy: about 15 reads per write
```

Core entities:

```txt
Tenant -> Project -> Issue -> Comment
Project -> Workflow -> Status -> Transition
Project -> Board -> Sprint
Issue -> CustomFieldValue (per project field schema)
Issue -> Attachment, Watcher, IssueLink
User, Group, Role, Permission
```

Key API surface:

```txt
POST   /projects/{key}/issues
GET    /issues/{issueKey}
PATCH  /issues/{issueKey}            (fields, assignee)
POST   /issues/{issueKey}/transitions (status change)
GET    /search?jql=project=PAY AND status=Open
GET    /boards/{id}/columns          (issues grouped by status)
```

High-level architecture:

```txt
Web / Mobile clients
  -> API gateway (auth, tenant resolution, rate limits)
  -> Issue service (CRUD, transitions, permissions)
  -> Search service (indexes issues, serves JQL-style queries)
  -> Board service (columns, sprint scope, ordering)
  -> Notification service (watchers, mentions)
  -> Automation service (rules: when X then Y)
  -> Event bus between services
  -> PostgreSQL per shard, Redis cache, Elasticsearch
```

Deep dive: custom fields. Tenants define different fields per project, so
the issue table cannot have a column per field. Two workable options:

| Option | Strength | Weakness |
| --- | --- | --- |
| JSONB column on issue | Simple reads, one row per issue. | Harder to query and index per field. |
| Field-value table (EAV) | Any field is queryable in SQL. | Fan-out joins, slow for large filters. |

A common answer: store custom values in JSONB for reads, and push everything
into the search index for filtering. The database stays the source of truth
while search handles arbitrary queries.

Deep dive: boards. A board is a saved query plus column mapping. Rendering a
board means fetching issues in sprint scope, grouping by status, and ordering
by rank. Rank uses a lexicographic string (LexoRank style) so dragging a card
between two others is a single-row update instead of renumbering the column.

Deep dive: tenant isolation. Shard by tenant so one tenant's data lives on
one database. Small tenants share shards, large tenants get dedicated ones.
Every query carries the tenant id and row-level checks prevent cross-tenant
reads even if a bug omits a filter.

Failure cases and tradeoffs:

- Search index lags the database. Show "indexing" state or read your own
  writes from the primary for the issue you just changed.
- Hot tenants can starve neighbours. Use per-tenant rate limits and move
  noisy tenants to isolated shards.
- Workflow changes must not break in-flight issues. Version workflows and
  migrate statuses explicitly.

Strong answer:

> I would model Jira as tenant-scoped projects with issues that move through
> configurable workflows. PostgreSQL sharded by tenant is the source of truth,
> a search index serves filters and boards, and an event bus drives
> notifications and automation. The hard parts are custom fields, board
> ordering, and tenant isolation, and I would handle those with JSONB plus
> search indexing, lexicographic ranks, and tenant-based sharding.

## 2. Design A Real-Time Collaboration Tool

A real-time collaboration tool lets several people edit the same document at
once, like Confluence pages or Google Docs, with everyone converging on the
same result.

Clarifying questions:

- Rich text documents, whiteboards, or spreadsheets?
- How many concurrent editors per document: 5 or 500?
- Offline editing with later sync, or online only?
- Do we need version history and comments?

The core problem is concurrent edits. Two editors insert text at the same
position at the same time, and both clients must end up with identical text
without one edit being lost.

Two families of algorithms solve this:

| Approach | How it works | Tradeoff |
| --- | --- | --- |
| OT (operational transformation) | Server transforms each op against concurrent ops before applying. | Needs a central server ordering ops; complex transform functions. |
| CRDT | Every character gets a unique id; merges are commutative so any order converges. | Larger metadata per document; tombstones need compaction. |

Architecture:

```txt
Browser editor (local state, optimistic apply)
  -> WebSocket connection
  -> Collaboration gateway (sticky by document id)
  -> Document session service (in-memory doc, op log)
  -> Op log store (append-only), snapshots every N ops
  -> Presence service (cursors, who is online)
  -> Pub/sub to fan out ops to other gateways
```

Session flow:

```txt
1. Client opens doc -> loads latest snapshot + ops since
2. Client applies edit locally and sends op with version
3. Session service orders ops, rebases if needed
4. Broadcasts accepted op to all sessions on that doc
5. Every K ops or T seconds, persist a snapshot
```

Deep dive: sticky routing. All editors of one document should reach the same
session owner so ordering is decided in one place. Use consistent hashing on
document id to pick the owner and route WebSocket traffic there. If the owner
dies, a new owner loads the last snapshot plus the op log and clients resend
unacknowledged ops.

Deep dive: presence. Cursor positions and "who is typing" are high volume and
low value, so send them on a separate channel, throttle to a few updates per
second, and never persist them.

Failure cases and tradeoffs:

- Network partition: clients keep editing locally and replay on reconnect.
  CRDTs handle this naturally; OT needs the client to keep a pending queue.
- Very large documents: split into blocks so a change re-syncs one block, not
  the whole page.
- Op log growth: snapshot and truncate. Keep older snapshots for history.

Strong answer:

> The hard part is convergence under concurrent edits. I would use CRDTs for
> offline-friendly text editing, or OT with a central session owner if the
> product is online-only and needs simpler storage. Documents are routed to
> one session owner with consistent hashing, ops are appended to a log and
> snapshotted, and presence runs on a separate throttled channel.

## 3. Design A Scalable Notification System

A notification platform accepts events from many products and delivers
messages through email, SMS, push, and in-app channels while respecting user
preferences and provider limits.

Clarifying questions:

- Which channels launch first?
- Volume: tens of millions per day or billions?
- Latency target per channel: seconds for push, minutes for email digests?
- Do users control preferences and quiet hours?
- Must delivery be exactly-once from the user's point of view?

Assumed scale:

```txt
100M notifications/day, average 1.2k/s, peak 20k/s
Push must land within 5 seconds
Email can batch and digest
```

Architecture:

```txt
Producers (order service, comments, alerts)
  -> Notification API (validate, enrich, idempotency key)
  -> Ingest queue
  -> Preference & routing worker
       (user settings, quiet hours, channel choice)
  -> Per-channel queues: push, email, sms, in-app
  -> Channel workers with rate limits per provider
  -> Providers: APNs/FCM, SES/SendGrid, Twilio
  -> Delivery status store + webhooks for bounces
```

Core data:

```txt
notification(id, user_id, template_id, payload,
             dedupe_key, created_at)
preference(user_id, channel, category, enabled, quiet_hours)
delivery(notification_id, channel, provider, status,
         attempts, last_error)
device_token(user_id, platform, token, last_seen)
```

Deep dive: dedupe and idempotency. Producers retry, so the API stores a
dedupe key per notification and drops repeats. Channel workers use the
delivery row as a lock so a crashed worker does not send twice after retry.

Deep dive: prioritisation. Security alerts must never sit behind marketing
sends. Use separate queues per priority with dedicated worker pools, so a
marketing burst cannot delay a password reset.

Deep dive: provider failures. Each provider gets a rate limiter and a circuit
breaker. When a provider fails, requeue with exponential backoff; after the
retry budget, write to a dead-letter queue and alert. Where two providers
exist for one channel, fail over automatically.

Failure cases and tradeoffs:

- Fan-out storms, such as one comment notifying 10k watchers, should be
  expanded by a worker in batches, not inside the API request.
- Stale device tokens waste sends; prune tokens on provider feedback.
- Exactly-once delivery is not achievable across external providers, so aim
  for at-least-once with dedupe at the edge and a clear status record.

Strong answer:

> I would separate accepting a notification from delivering it. The API
> validates and dedupes, a router applies preferences and picks channels, and
> per-channel workers deliver under provider rate limits with retries and a
> dead-letter queue. Priority queues keep critical alerts fast, and a delivery
> status table gives us tracking and observability.

## 4. Design A Search System For Knowledge Base Articles

A knowledge base search returns relevant articles for free-text queries,
respects permissions, and updates within seconds of an article change.

Clarifying questions:

- Keyword search only, or semantic search as well?
- How many articles and how often do they change?
- Must results respect per-space or per-user permissions?
- Do we need autocomplete, filters, and highlighting?

Assumed scale:

```txt
50M articles, 200k updates/day
2k queries/s at peak, p95 under 200 ms
Permissions: spaces are restricted to groups
```

Architecture:

```txt
Article service (source of truth, PostgreSQL)
  -> publishes ArticleChanged events
  -> Indexer worker: fetch, clean HTML, tokenize, enrich
  -> Search cluster (inverted index, sharded, replicated)

Client -> Search API
  -> query parsing, permission filter, ranking
  -> results with highlights and facets
```

Deep dive: the inverted index. Each term maps to the documents that contain
it plus positions and frequencies. Ranking uses BM25 or TF-IDF, then boosts
for title matches, recency, views, and helpful votes. Elasticsearch or
OpenSearch provide this out of the box.

Deep dive: permissions. Filtering results after retrieval leaks counts and
can return empty pages. Instead, index each article with the groups allowed
to read it and add a filter clause for the user's groups at query time. When
permissions change for a space, reindex its articles.

Deep dive: freshness. Editors expect to find an article seconds after
publishing. The indexer consumes change events instead of periodic crawls,
and the API can merge in the user's own recent edit from the primary store.

Adding semantic search:

```txt
Article -> chunk -> embedding model -> vector index
Query -> embedding -> nearest neighbours
Hybrid ranking: keyword score + vector score
```

Failure cases and tradeoffs:

- Indexer lag shows stale content. Monitor lag and expose it as a metric.
- Popular queries can be cached briefly, but cache keys must include the
  permission set or users will see restricted results.
- Deep pagination is expensive on sharded indexes; cap page depth or use
  search-after cursors.

Strong answer:

> I would index articles into a sharded inverted index fed by change events,
> filter by allowed groups at query time so permissions are enforced in the
> engine, and rank with BM25 plus product signals. If quality needs it, I
> would add a vector index and combine scores for hybrid search.

## 5. Design An API Gateway For Atlassian Services

An API gateway is the single entry point in front of many backend services.
It handles authentication, routing, rate limiting, and observability so each
service does not reimplement them.

Clarifying questions:

- External developer traffic, internal traffic, or both?
- Do we need protocol translation, such as REST to gRPC?
- Which auth methods: API tokens, OAuth 2.0, session cookies?
- Latency budget for the gateway hop?

Responsibilities:

```txt
1. TLS termination
2. Authentication and token validation
3. Tenant and route resolution
4. Rate limiting and quotas per client
5. Request validation and size limits
6. Routing, load balancing, retries, timeouts
7. Response caching for safe requests
8. Logging, metrics, tracing headers
```

Architecture:

```txt
Clients
  -> Anycast DNS / edge load balancer
  -> Gateway fleet (stateless, horizontally scaled)
       - route table from config service
       - JWT verification with cached public keys
       - rate limiter backed by Redis
  -> Service discovery -> Backend services
```

Deep dive: keep the gateway stateless. Route configuration, keys, and
quotas live in a config service and are pushed to gateway nodes and cached
locally. A node restart pulls the latest config; there is no per-request
dependency on the config store.

Deep dive: resilience per route. Each route defines a timeout, retry policy
for idempotent methods only, and a circuit breaker. When a backend fails, the
gateway returns a fast error or a cached response instead of queueing
requests and falling over itself.

Deep dive: rate limiting at scale. Use a local token bucket for fast
decisions and sync counts to Redis so limits hold across the fleet. Accept
slight over-admission during sync gaps rather than a Redis round trip on
every request. Question 11 covers the algorithms.

Failure cases and tradeoffs:

- The gateway is a single point of failure by design, so it must be the most
  boring, best-monitored service you run. Deploy with canaries.
- Putting business logic into the gateway makes it a distributed monolith.
  Keep it to cross-cutting concerns.
- Config pushes can break routing globally. Validate configs and roll them
  out gradually.

Strong answer:

> I would build the gateway as a stateless fleet that terminates TLS,
> validates tokens, resolves the route and tenant, enforces rate limits with a
> Redis-backed token bucket, and forwards with per-route timeouts, retries,
> and circuit breakers. Configuration is pushed and cached, so the hot path
> never depends on another service.

## 6. Design A Version Control System For Documentation

A documentation version control system keeps every saved version of a page,
lets people compare and restore versions, and supports drafts that are edited
before they are published.

Clarifying questions:

- Rich text pages or Markdown files in a repository?
- Linear history with restore, or branching drafts with merge?
- Typical and maximum page size, including attachments?
- Do published pages need review or approval first?

Assumed scale:

```txt
20M pages, 5M saves/day
Average page 50 KB, p99 2 MB
History kept indefinitely for compliance
```

Data model:

```txt
page(id, space_id, title, path, current_revision_id)
revision(id, page_id, parent_revision_id, author_id,
         content_hash, message, created_at)
blob(content_hash, size, storage_key)
draft(page_id, user_id, base_revision_id, content_hash)
```

Architecture:

```txt
Editor
  -> Page API (save, history, diff, restore, publish)
  -> Revision service (metadata in PostgreSQL)
  -> Blob store (object storage keyed by content hash)
  -> Diff service (computes and caches diffs)
  -> Search indexer (indexes the published revision only)
  -> Event bus (PageRevised, PagePublished)
```

Deep dive: snapshots vs deltas. A full snapshot per revision makes any
version load in one read, but costs storage. Deltas save space but reading
version N means replaying N deltas. A practical hybrid stores compressed
snapshots, and content-addressed blobs mean a revert that reproduces older
content stores nothing new. For most documentation systems, snapshots plus
compression plus dedupe is cheap enough.

Deep dive: concurrent saves without live collaboration. Each save carries the
`base_revision_id` the editor started from. If the page has moved on, the
server returns 409 with the newer revision and the client merges, either with
a three-way text merge or block by block for structured content. If the
product needs true simultaneous editing, use the approach in question 2.

Deep dive: drafts and publishing. A draft is a private chain of revisions
built from a base revision. Publishing points `current_revision_id` at the
draft's head, emits an event, and triggers reindexing. Review flows are a
small state machine on the draft: draft, in review, approved, published.

Diffs are computed on demand with a word-level algorithm such as Myers diff
and cached by revision pair. For large pages, diff block ids first, then text
inside changed blocks.

Failure cases and tradeoffs:

- Restore must not delete history. Restoring creates a new revision whose
  content matches the old one.
- Renames and moves keep the stable page id. Path and title are metadata
  with their own history.
- Deleting a page writes a tombstone so history survives for audits. Legal
  hold can block purges.
- Attachments live in object storage and are referenced by hash so a page
  revision stays small.

Strong answer:

> I would treat every save as an immutable revision that points at a
> content-addressed blob, with page metadata and the revision graph in
> PostgreSQL. Optimistic concurrency on the base revision prevents lost
> updates, drafts are private revision chains that publish by moving a
> pointer, and diffs are computed on demand and cached.

## 7. Design A Real-Time Analytics Platform

A real-time analytics platform ingests a stream of events and answers
aggregate questions, such as active users, funnel counts, or issue
transitions per hour, within seconds of the events happening.

Clarifying questions:

- Freshness target: seconds or minutes?
- Fixed dashboards or ad hoc slicing by arbitrary dimensions?
- Retention for raw events versus aggregates?
- Exact counts, or are approximate uniques acceptable?

Assumed scale:

```txt
500k events/s at peak, 20B events/day
Dashboards refresh every 5 s, p95 query under 1 s
Raw events hot for 30 days, cold for 2 years
```

Architecture:

```txt
SDKs and services
  -> Collector API (auth, schema validation, batching)
  -> Kafka (partitioned by tenant or event key)
  -> Stream processor (Flink or Kafka Streams)
       windowed aggregates, enrichment, sessionization
  -> Hot OLAP store (ClickHouse, Druid, or Pinot)
  -> Cold store (Parquet on object storage) + batch engine
  -> Query API with rollup selection
  -> Dashboards and alerts
```

Deep dive: event time and late data. Events arrive late from offline mobile
clients, so aggregate by event time, not arrival time. Watermarks decide when
a window is "complete enough" to emit. Allow a lateness grace period, then
either update the window in a store that supports upserts or route late
events to a correction path.

Deep dive: rollups vs raw. Pre-aggregate the common dimensions, such as
tenant, event type, and hour, into rollup tables that make dashboards cheap.
Keep raw events for drill-down and new questions. The query layer picks a
rollup when the requested dimensions are a subset of the rollup's dimensions.
Never roll up on high-cardinality fields like user id or full URL, or the
rollup becomes as large as the raw data.

Deep dive: approximate algorithms. Daily unique users across billions of
events is expensive to compute exactly. HyperLogLog sketches count uniques
with about 1 to 2 percent error in a few kilobytes and can be merged across
partitions and time buckets. Percentiles use t-digest sketches the same way.

Consistency and reprocessing:

```txt
Duplicate events -> dedupe by event id with a TTL state
Processor restart -> resume from checkpointed offsets
Bug in a metric -> replay from Kafka or cold storage
                   into the same pipeline (kappa style)
Idempotent sinks -> replays overwrite instead of double count
```

Failure cases and tradeoffs:

- Hot storage is expensive, so tier data: recent in the OLAP store, older
  in object storage queried by a batch engine.
- Schema changes break pipelines. Use a schema registry and land unknown
  fields in a flexible column until they are promoted.
- Multi-tenant isolation: partition by tenant so a large tenant's backfill
  does not delay everyone's dashboards.

Strong answer:

> I would stream events through Kafka into a stream processor that maintains
> event-time windows with watermarks, write rollups and raw data into an OLAP
> store, and keep long-term data in object storage. Uniques and percentiles
> use mergeable sketches, replays go through the same pipeline, and the query
> layer chooses the cheapest rollup that answers the question.

## 8. Design A Scalable User Authentication And Authorization System

Authentication proves who a caller is. Authorization decides what that caller
may do. At the scale of a product suite, one identity spans many products,
enterprises bring their own identity providers, and permissions are
fine-grained down to a project, space, or page.

Clarifying questions:

- Consumer sign-up, enterprise SSO, or both?
- Browser sessions, API tokens, and mobile apps?
- Permission granularity: per project, per issue, per field?
- Compliance needs such as MFA enforcement and audit trails?

Architecture:

```txt
Clients
  -> API gateway (verifies session or token, attaches identity)
  -> Identity service (users, credentials, MFA, SSO)
  -> Token service (issue, refresh, revoke, JWKS)
  -> Authorization service (check and list decisions)
  -> Directory sync (SCIM from the customer's IdP)
  -> Audit log stream

Stores: users in PostgreSQL, sessions in Redis,
        permission tuples in a replicated store
```

Authentication deep dive:

- Passwords are hashed with Argon2id or bcrypt, checked against breach
  lists, and protected by per-account and per-IP rate limits with lockout
  backoff.
- Enterprise SSO uses OIDC or SAML with the customer's identity provider, and
  SCIM provisions and deprovisions users automatically.
- MFA supports TOTP and WebAuthn passkeys, with step-up authentication for
  sensitive actions like changing billing details.

Sessions vs tokens:

| Option | Strength | Weakness |
| --- | --- | --- |
| Server-side session in Redis | Instant revocation, small cookie. | Every request hits the session store. |
| Short-lived JWT + refresh token | Stateless verification at the gateway. | Revocation waits for expiry unless a deny list exists. |

A common hybrid: access tokens live 5 to 15 minutes and are verified with
cached public keys. Refresh tokens are stored server-side, rotated on every
use, and reuse of an old refresh token revokes the whole family because it
signals theft.

Authorization deep dive:

| Model | Fits when | Example |
| --- | --- | --- |
| RBAC | A few roles per project. | Admin, Member, Viewer on project PAY. |
| ABAC | Rules depend on attributes. | Issue security level equals user clearance. |
| ReBAC | Permissions follow relationships. | Viewer of space S because member of group G. |

Large products end up with relationship-based checks, similar to Google's
Zanzibar: store tuples like `space:S#viewer@group:G` and
`group:G#member@user:U`, and answer `check(user, permission, resource)` by
walking the graph. The check path must return in a few milliseconds, so
results are cached per request and effective permissions are materialized and
invalidated by change events. Listing everything a user can see, for example
in search, is solved by indexing allowed groups next to the content, as in
question 4.

Failure cases and tradeoffs:

- JWT revocation gap: keep tokens short and consult a small deny list for
  critical events such as password changes.
- Stale permission caches: define a propagation target in seconds and fail
  closed for sensitive resources.
- Auth is on every request, so it must be multi-region and must not log
  everyone out if one Redis cluster fails. Signed tokens keep reads working
  during a session-store outage.
- Rotate signing keys through JWKS with key ids so old tokens verify during
  the overlap window.

Strong answer:

> I would separate identity, token issuance, and authorization decisions
> into their own services. Authentication uses hashed passwords or SSO with
> MFA, short-lived access tokens with rotating refresh tokens, and gateway
> verification against cached keys. Authorization uses relationship tuples
> with cached checks and event-driven invalidation, and everything writes to
> an audit stream.

## 9. Design A Workflow Automation System

A workflow automation system lets users define rules of the form "when this
happens, if these conditions hold, do these actions", like Jira Automation or
Zapier, and runs them reliably at scale.

Clarifying questions:

- Triggers from internal events only, or also webhooks and schedules?
- Actions inside the product only, or external HTTP calls and chat posts?
- Is a few seconds of delay acceptable?
- Are executions metered per tenant?

Rule model:

```txt
rule(id, tenant_id, name, enabled, version,
     trigger, conditions[], actions[])

trigger:   { type: "issue.transitioned", to: "Done" }
condition: { field: "priority", op: "=", value: "High" }
action:    { type: "slack.post", channel: "#ops" }
```

Architecture:

```txt
Domain events, webhooks, and cron ticks
  -> Event bus
  -> Rule matcher (index: tenant + event type -> rules)
  -> Execution queue (one message per rule firing)
  -> Execution engine (workers run steps durably)
       condition evaluation
       action connectors with retries
       execution and step state in a database
  -> Execution history and audit UI
  -> Scheduler for delayed steps (question 20)
```

Deep dive: matching. Millions of rules exist, but each event only concerns a
few. Index enabled rules by tenant and trigger type in memory or Redis, and
refresh the index on rule changes. A single event then touches tens of rules,
not millions.

Deep dive: durable execution. Every firing creates an execution record with
one row per step. A worker runs a step, records its result, and moves on. If
the worker dies, another worker resumes from the last completed step. Each
step uses an idempotency key made of execution id and step index, and
external calls store the remote id they created so a retry does not create a
second Slack message or a second issue.

Deep dive: loop prevention. A rule that edits an issue emits an event that
can fire another rule, which edits the issue again. Carry a causation chain
in event metadata, stop at a maximum depth, and mark automation-generated
events so rules can opt out of reacting to them.

Deep dive: tenant fairness. One tenant with a runaway rule must not delay
everyone else. Give each tenant an execution quota, shard queues by tenant,
and throttle or pause noisy rules with a notice to the rule owner.

Failure cases and tradeoffs:

- Rules run eventually, usually within seconds. Do not promise synchronous
  behaviour.
- Editing a rule creates a new version. Running executions finish on the
  version they started with.
- Connector credentials live in a secrets vault and templates escape user
  input before rendering.
- Provide a dry-run mode so users can test rules without side effects.

Strong answer:

> I would model rules as trigger, conditions, and actions, index them by
> tenant and event type for fast matching, and run each firing as a durable
> execution with idempotent steps and retries. Causation tracking prevents
> infinite loops, per-tenant quotas protect the platform, and every run is
> visible in an audit history.

## 10. Design A Logging And Monitoring System

A logging and monitoring system collects logs, metrics, and traces from
thousands of services, stores them at a manageable cost, and turns them into
searchable data and alerts.

Clarifying questions:

- Daily volume and retention per signal type?
- Are logs structured JSON or free text?
- Who is on call and how should alerts route?
- One platform team serving many product teams?

Assumed scale:

```txt
5k hosts, 50 TB of logs/day, 20M active metric series
Recent log search in under 3 s
Alert rules evaluated every 15 to 30 s
```

Architecture:

```txt
Services emit structured logs, metrics, and spans
  -> Agents (Fluent Bit, OpenTelemetry Collector)
  -> Kafka buffer (absorbs bursts, decouples storage)
  -> Processors: parse, enrich, redact PII, sample, route
  -> Logs: hot index (Elasticsearch or Loki) for 7 days,
           cold object storage for a year
  -> Metrics: time-series database (Prometheus + Mimir)
  -> Traces: Tempo or Jaeger with tail sampling
  -> Query and dashboard UI, alert manager, on-call paging
```

Deep dive: logs. Index a small set of fields such as service, level, trace
id, and request id, and keep the message as full text. Partition indexes by
time and tenant, and move them through hot, warm, and cold tiers. Correlation
ids link a log line to its trace and to the request that produced it.

Deep dive: metrics. Pull-based scraping is simple to operate for services;
push works for short-lived jobs. The main failure mode is cardinality. A
label like user id multiplies series until the store falls over, so enforce
label limits, pre-compute recording rules, and downsample old data for
long-term storage.

Deep dive: alerting. Alert on symptoms users feel, such as error rate and
latency against an SLO, not on every cause. Burn-rate alerts on SLO budgets
page for fast burns and ticket for slow burns. Require a condition to hold
for a duration to avoid flapping, and group, dedupe, and silence alerts
before they page a human.

Deep dive: traces. Sampling everything is unaffordable. Head sampling
decides at the start of a request; tail sampling keeps a trace after seeing
it was slow or failed, which is more useful but needs buffering.

Back-pressure and cost:

```txt
Burst -> agents spool to disk -> Kafka retention absorbs
Overload -> drop debug logs first, keep errors and audit
Cost    -> sampling, retention tiers, per-team quotas
```

Failure cases and tradeoffs:

- The monitoring system needs its own monitoring. Use a separate alert path
  and a heartbeat alert that fires when the pipeline goes quiet.
- Redaction must happen before storage, because deleting PII from an index
  later is slow and error-prone.
- Vendor platforms trade cost for less operational work. Self-hosting pays
  off only at very large volume with a dedicated team.

Strong answer:

> I would collect structured logs, metrics, and traces through agents into a
> Kafka buffer, process and redact them, and store each signal in a
> purpose-built store with tiered retention. Metrics drive SLO-based
> alerting with grouping and deduplication, traces are tail-sampled, and cost
> is controlled through sampling, cardinality limits, and quotas.

## 11. Design A Rate Limiter

A rate limiter caps how many requests a client can make in a time window and
rejects or delays the rest. It protects backends from abuse, noisy tenants,
and accidental retry storms.

Clarifying questions:

- Limit by user, API key, IP address, tenant, or a combination?
- Allow short bursts, or enforce a smooth rate?
- Enforce in one gateway process or across a fleet?
- On limiter failure, fail open or fail closed?

Algorithms:

| Algorithm | Idea | Strength | Weakness |
| --- | --- | --- | --- |
| Token bucket | Tokens refill at a fixed rate up to a cap. | Allows bursts, O(1) memory. | Two parameters to tune. |
| Leaky bucket | Requests drain from a queue at a fixed rate. | Smooth output. | Adds latency, needs a queue. |
| Fixed window | Counter per window. | Simplest. | Double burst at window edges. |
| Sliding window log | Store each request timestamp. | Exact. | Memory grows with traffic. |
| Sliding window counter | Weighted blend of previous and current window. | Accurate enough, O(1). | Approximate. |

Distributed implementation with Redis:

```lua
-- KEYS[1] = key, ARGV[1] = limit, ARGV[2] = window
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[2])
end
if count > tonumber(ARGV[1]) then
  return 0
end
return 1
```

The script runs atomically, so two gateway nodes cannot both admit the
request that crosses the limit. The key encodes the identity and the window:

```txt
rl:{tenant}:{route}:{window_start}
```

Response contract:

```txt
HTTP 429 Too Many Requests
Retry-After: 12
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 12
```

Deep dive: local plus global. A Redis round trip on every request adds
latency and makes Redis a hot dependency. Each node keeps a local token
bucket and syncs its consumption to Redis every few hundred milliseconds.
The fleet may over-admit slightly between syncs, which is acceptable for
most APIs.

Deep dive: layered limits. Real systems apply several limits at once: per
user, per tenant, per route, and a global safety cap. Expensive endpoints can
cost more than one token so a search query counts more than a health check.

Failure cases and tradeoffs:

- Redis down: fail open keeps the product available but leaves backends
  exposed. Fail closed protects backends but blocks everyone. Choose per
  route and alert loudly either way.
- Clock skew across nodes breaks window maths. Use Redis server time or the
  atomic script for the decision.
- Hot keys, such as one tenant behind one key, concentrate load on a single
  Redis shard. Shard by key and consider local buckets for the hottest.
- Clients should back off with jitter on 429 so they do not synchronize
  their retries.

Strong answer:

> I would use a token bucket for burst-friendly limits or a sliding window
> counter for smoother enforcement, backed by Redis with an atomic script so
> the fleet shares one view. Hot paths use local buckets synced to Redis,
> responses return standard rate-limit headers, and each route decides
> whether to fail open or closed when the limiter is unavailable.

## 12. Design A Parking Lot

A parking lot design is an object-oriented design question. The interviewer
wants clear entities, sensible responsibilities, and a core flow that works,
then extensions such as new vehicle types or payment rules.

Requirements to confirm:

- Multiple levels, each with spots of different sizes.
- Vehicle types: motorcycle, car, bus. A vehicle fits a spot at least its
  size.
- Entry issues a ticket, exit computes a fee.
- A display shows free spots per level.
- Extensions: electric charging spots, reserved spots, accessible spots.

Class overview:

```txt
ParkingLot   levels, park(vehicle), unpark(ticket)
Level        spots, findSpot(vehicle), freeCount(size)
ParkingSpot  id, size, vehicle | null
Vehicle      plate, size
Ticket       id, spotId, vehicle, enteredAt
FeeStrategy  calculate(ticket, exitedAt)
```

Core code:

```ts
enum SpotSize {
  Small,
  Medium,
  Large,
}

interface Vehicle {
  plate: string;
  size: SpotSize;
}

class ParkingSpot {
  vehicle: Vehicle | null = null;

  constructor(
    readonly id: string,
    readonly size: SpotSize,
  ) {}

  fits(vehicle: Vehicle) {
    return !this.vehicle && vehicle.size <= this.size;
  }
}

class Level {
  constructor(readonly spots: ParkingSpot[]) {}

  findSpot(vehicle: Vehicle) {
    return this.spots.find((spot) => spot.fits(vehicle));
  }
}

class Ticket {
  readonly id = crypto.randomUUID();
  readonly enteredAt = Date.now();

  constructor(
    readonly spotId: string,
    readonly vehicle: Vehicle,
  ) {}
}

interface FeeStrategy {
  calculate(ticket: Ticket, exitedAt: number): number;
}

class ParkingLot {
  private tickets = new Map<string, Ticket>();

  constructor(
    private levels: Level[],
    private fee: FeeStrategy,
  ) {}

  park(vehicle: Vehicle): Ticket | null {
    for (const level of this.levels) {
      const spot = level.findSpot(vehicle);
      if (!spot) continue;

      spot.vehicle = vehicle;
      const ticket = new Ticket(spot.id, vehicle);
      this.tickets.set(ticket.id, ticket);
      return ticket;
    }

    return null;
  }
}
```

Design points worth saying out loud:

- Spots are sorted so a motorcycle takes the smallest free spot that fits.
  Otherwise motorcycles fill the large spots and buses get turned away.
- `FeeStrategy` is a Strategy pattern. Hourly, flat, and daily pricing are
  separate classes, and a new pricing rule does not touch `ParkingLot`.
- Free-spot counts per size are maintained as counters when a spot is
  taken or freed, so the display board is O(1) instead of scanning spots.
- Vehicle size is data, not a class hierarchy, so adding a van is a new enum
  value and a size, not a new subclass.

Concurrency: two entry gates can pick the same free spot at the same time.
In a single process, lock per level while assigning. In a real deployment,
spot assignment is a conditional update in the database, such as "set
vehicle where spot id equals X and vehicle is null", and the gate that loses
retries with the next candidate.

Extensions:

```txt
Electric spot   -> ParkingSpot subtype with a charger flag
Reservation     -> spot held until an expiry time
Accessible spot -> requires a permit on the vehicle
Multiple lots   -> a Garage that owns lots and a shared
                   payment service
```

Strong answer:

> I would start from the entities the requirements name: lot, level, spot,
> vehicle, ticket, and fee policy. The core flow is find a fitting spot,
> occupy it, issue a ticket, and compute a fee on exit. I would keep pricing
> behind a strategy interface, keep vehicle size as data, and make spot
> assignment atomic so concurrent gates never double-book a spot.

## 13. Database Design

Database design in a system design interview means turning requirements into
a schema and a storage choice that stays correct and fast as data grows. The
interviewer is checking whether you design for real access patterns instead
of drawing tables from nouns.

Method:

1. List entities and relationships with their cardinality.
2. Write down the top read and write patterns. Design for those queries.
3. Choose the storage engine for each pattern.
4. Normalize to third normal form, then denormalize only for measured hot
   reads.
5. Pick keys: bigint identity for internal ids, UUIDv7 when ids are
   generated by clients or across shards.
6. Add indexes from the query list, and remember each index slows writes.
7. Enforce invariants with constraints where the database can do it.
8. Decide on multi-tenancy, partitioning, and retention before the tables
   are huge.

Storage choice:

| Need | Good fit | Why |
| --- | --- | --- |
| Transactions, joins, constraints | PostgreSQL, MySQL | Strong consistency and rich queries. |
| Flexible nested documents | MongoDB, DynamoDB | Schema per document, simple reads. |
| Huge write volume, time-ordered | Cassandra, ScyllaDB | Partitioned append-heavy storage. |
| Caching, counters, sessions | Redis | In-memory speed with TTLs. |
| Full-text and faceted search | Elasticsearch | Inverted index and ranking. |

Worked example: the issue table for a Jira-like tracker (questions 1 and
15).

```sql
CREATE TABLE issues (
  id            BIGINT PRIMARY KEY,
  tenant_id     BIGINT NOT NULL,
  project_id    BIGINT NOT NULL,
  issue_key     TEXT NOT NULL,
  status_id     INT NOT NULL,
  assignee_id   BIGINT,
  priority      SMALLINT NOT NULL,
  custom_fields JSONB NOT NULL DEFAULT '{}',
  version       INT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, issue_key)
);

CREATE INDEX issues_board_idx
  ON issues (project_id, status_id, updated_at DESC);

CREATE INDEX issues_assignee_idx
  ON issues (tenant_id, assignee_id)
  WHERE assignee_id IS NOT NULL;

CREATE INDEX issues_custom_fields_idx
  ON issues USING GIN (custom_fields);
```

Why each choice was made:

- The `issue_key` column is unique per tenant, not globally, so the unique
  constraint includes `tenant_id`.
- The board query filters by project and status and sorts by recency, so
  the composite index matches that column order.
- The partial index skips unassigned issues, which keeps it small.
- Custom fields vary per project, so they live in JSONB with a GIN index
  for containment queries. Heavy filtering still belongs in a search index.
- The `version` column supports optimistic locking so two editors cannot
  silently overwrite each other.

Multi-tenancy options:

| Option | Strength | Weakness |
| --- | --- | --- |
| Shared tables with tenant_id | Cheapest, simple migrations. | One missed filter leaks data; use row-level security. |
| Schema per tenant | Logical isolation. | Thousands of schemas slow migrations. |
| Database per tenant | Strong isolation, easy export. | Highest cost and operational load. |

Failure cases and tradeoffs:

- Entity-attribute-value tables make every read a join explosion. Prefer
  JSONB plus a search index for flexible fields.
- Random UUIDv4 primary keys fragment B-tree indexes under heavy inserts.
  UUIDv7 or bigint keeps inserts sequential.
- Sharding too early adds complexity for no benefit. Start with a single
  primary, add read replicas, then partition by tenant when one database
  cannot hold the largest tenants.
- Schema migrations on large tables must be expand and contract: add the
  new column, backfill in batches, switch reads, then drop the old column.

Strong answer:

> I design the schema from the access patterns, not from the nouns. I
> normalize first, pick indexes that match the real queries, enforce
> invariants with constraints, and denormalize only where measurements show
> a hot read. I choose the storage engine per workload and plan
> multi-tenancy and partitioning before the tables become too large to
> change cheaply.

## 14. Design Snake Game

Snake is a low-level design question about a game loop, a grid, and a data
structure that moves efficiently. The interviewer checks whether you separate
game rules from rendering and whether each tick is O(1).

Requirements to confirm:

- A grid of width by height cells.
- The snake moves one cell per tick in its current direction.
- Eating food grows the snake by one and increases the score.
- The game ends when the head hits a wall or the snake's body.
- Direction input cannot reverse the snake onto itself.
- Pause, resume, and restart.

Class overview:

```txt
Game       state: ready | running | paused | over
           board, snake, food, score, direction
           tick(), turn(direction), spawnFood()
Board      width, height, contains(point)
Snake      body (head first), occupied set
           head, tail, contains(point), move(next, grow)
Renderer   draws game state, owns no rules
```

Core code:

```ts
type Point = { x: number; y: number };
type Direction = "up" | "down" | "left" | "right";

const key = (p: Point) => `${p.x},${p.y}`;

const deltas: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function step(head: Point, dir: Direction): Point {
  const delta = deltas[dir];
  return { x: head.x + delta.x, y: head.y + delta.y };
}

class Snake {
  private body: Point[];
  private occupied: Set<string>;

  constructor(start: Point) {
    this.body = [start];
    this.occupied = new Set([key(start)]);
  }

  get head() {
    return this.body[0];
  }

  get tail() {
    return this.body[this.body.length - 1];
  }

  contains(p: Point) {
    return this.occupied.has(key(p));
  }

  move(next: Point, grow: boolean) {
    this.body.unshift(next);
    this.occupied.add(key(next));
    if (!grow) {
      const tail = this.body.pop()!;
      this.occupied.delete(key(tail));
    }
  }
}
```

The tick:

```ts
tick() {
  if (this.state !== "running") return;

  const next = step(this.snake.head, this.direction);
  const eats = key(next) === key(this.food);
  const tailKey = key(this.snake.tail);
  const intoTail = !eats && key(next) === tailKey;
  const hitsSelf = this.snake.contains(next) && !intoTail;

  if (!this.board.contains(next) || hitsSelf) {
    this.state = "over";
    return;
  }

  this.snake.move(next, eats);

  if (eats) {
    this.score += 1;
    this.food = this.spawnFood();
  }
}
```

Design points worth saying out loud:

- The body is a deque: add at the head, remove at the tail. The occupied
  set makes collision checks O(1) instead of scanning the body.
- Moving into the current tail cell is legal when the snake is not growing,
  because the tail vacates that cell in the same tick. The `intoTail` check
  handles that edge case.
- Direction changes are validated in `turn()`: ignore the opposite of the
  current direction. Queue at most one pending turn per tick so two quick
  key presses both register.
- Food spawns on a random free cell. With a nearly full board, pick from a
  list of free cells instead of retrying random points forever.
- Speed increases by shortening the tick interval as the score grows. The
  loop uses a timer or a frame accumulator, and the game logic never knows
  how it is drawn.

Extensions:

```txt
Wrap-around walls  -> Board maps out-of-range to the other edge
Obstacles          -> another occupied set checked in tick
Replays            -> seeded random generator + input log
Two players        -> two snakes, shared board, tie rules
```

Strong answer:

> I would keep the rules in a `Game` class with a deterministic `tick`, a
> `Snake` backed by a deque plus a set of occupied cells for O(1) moves and
> collision checks, and a separate renderer. The tricky details are the
> tail-vacating edge case, rejecting reverse turns, and spawning food only on
> free cells.

## 15. Design A Ticketing System Like Jira

A ticketing system tracks issues through a configurable lifecycle. Where
question 1 covers the whole product, this question goes deep on the issue
itself: workflows as state machines, atomic transitions, history, SLAs, and
concurrent editing.

Clarifying questions:

- Software project tracking or a service desk with SLAs and customers?
- Custom workflows per project or a fixed set of statuses?
- Many agents editing the same ticket at once?
- Audit requirements for who changed what and when?

Workflow as a state machine:

```txt
Statuses:    Open, In Progress, In Review, Done
Transitions:
  Start    Open -> In Progress
           guard: assignee is set
  Review   In Progress -> In Review
  Approve  In Review -> Done
           validator: resolution is required
           post-action: notify reporter
  Reopen   Done -> Open
```

Data model:

```txt
workflow(id, project_id, version)
status(id, workflow_id, name, category)
transition(id, workflow_id, from_status_id, to_status_id,
           name, guards[], validators[], post_actions[])
issue(id, project_id, status_id, assignee_id, version, ...)
issue_event(id, issue_id, type, actor_id, before, after, at)
comment(id, issue_id, author_id, body, created_at)
sla_timer(issue_id, policy_id, started_at, paused_at,
          breach_at)
```

Transition request and algorithm:

```txt
POST /issues/PAY-42/transitions
{ "transitionId": 12, "expectedVersion": 7,
  "fields": { "resolution": "Fixed" } }

1. Load the issue; if version != 7, return 409
2. Load the workflow version bound to the project
3. Check the transition exists from the current status
4. Evaluate guards: permissions and conditions
5. Run validators on the submitted fields
6. In one transaction: update status and fields, bump
   version, append an issue_event, write an outbox row
7. Outbox publishes IssueTransitioned to notifications,
   automation, search indexing, and the SLA engine
```

Deep dive: concurrency. The `version` column implements optimistic locking.
Two agents load version 7; the first save wins and moves to 8; the second
receives 409 and the client shows the fresh state before retrying. An
idempotency key on the request means a retried network call does not apply
the transition twice.

Deep dive: history. The append-only event log is the source of the activity
feed, the "time in status" report, and the audit trail. The issue row is a
snapshot for fast reads, and it can be rebuilt from events if needed.

Deep dive: SLAs. A policy defines when a timer starts, pauses, and stops, for
example pause while waiting for the customer, and whether it counts business
hours only. Timers store the projected breach time, and a scheduler
(question 20) fires warnings and escalations before the breach.

Deep dive: assignment. Queues are saved filters over unassigned tickets.
Auto-assignment uses round robin or lowest load, and claiming a ticket is a
conditional update, "set assignee where assignee is null", so two agents
cannot both take it.

Failure cases and tradeoffs:

- Changing a workflow while issues are in flight requires a status mapping
  and a bulk migration with audit entries. Version workflows instead of
  editing them in place.
- Bulk operations run asynchronously with per-issue results, because one
  failing validator must not roll back the other 999 tickets.
- A hot ticket with thousands of watchers turns every comment into a fan-out
  storm. Expand watchers in a worker, as in question 3.
- Strong consistency for the transition itself, eventual consistency for
  search, notifications, and reports.

Strong answer:

> I would model the workflow as a versioned state machine with guards,
> validators, and post-actions, and make each transition a single
> transaction that updates the snapshot, bumps a version for optimistic
> locking, appends an event, and writes an outbox record. Downstream systems
> such as notifications, automation, search, and SLA timers react to the
> events, which keeps the core transition fast and consistent.

## 16. Design A URL Shortening Service

A URL shortener maps a long URL to a short key and redirects visitors from
the short link to the original. It is small in features but touches key
generation, caching, and a redirect path that must never be slow.

Clarifying questions:

- Custom aliases and expiry dates?
- Click analytics?
- Permanent or temporary redirects?
- Expected writes and reads per second?

Back-of-the-envelope estimates:

```txt
100M new URLs/month  -> about 40 writes/s
Read to write 100:1  -> 4k redirects/s, peak 40k/s
Keep 5 years         -> 6B keys
7 chars in base62    -> 62^7 = 3.5 trillion keys
6B rows x 500 bytes  -> about 3 TB
```

API:

```txt
POST /api/urls
  { "url": "https://example.com/...", "alias": "launch" }
  -> 201 { "short": "https://sho.rt/launch" }

GET /aZ3kQ9x
  -> 302 Location: https://example.com/...
```

Data model:

```txt
url(short_key PK, long_url, owner_id, created_at, expires_at)
click(short_key, clicked_at, referrer, country)
```

Key generation options:

| Approach | How | Strength | Weakness |
| --- | --- | --- | --- |
| Hash and truncate | Hash the URL, take 7 base62 chars. | Same URL gives the same key. | Collisions need retries. |
| Counter to base62 | Encode a global counter. | Short, unique, no collisions. | Predictable, counter is a hot spot. |
| Pre-generated keys | A key service fills a pool of random unique keys. | Fast writes, unpredictable. | Another service to run. |
| Random with check | Draw 7 random chars, check the store. | Simple. | Retries increase as the space fills. |

A practical choice is counter ranges: each API instance leases a block of a
million ids from a coordinator, encodes them in base62, and applies a
bijective scramble so consecutive links do not look sequential.

```ts
const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyz" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function toBase62(id: number) {
  let out = "";
  while (id > 0) {
    out = ALPHABET[id % 62] + out;
    id = Math.floor(id / 62);
  }
  return out.padStart(7, "0");
}

console.log(toBase62(125));
```

```txt
0000021
```

Architecture:

```txt
Clients -> CDN or edge -> Redirect service (stateless)
  -> Redis cache (hot keys serve most traffic)
  -> Key-value store (DynamoDB or Cassandra), replicated

Write path -> API -> key allocator -> store -> warm cache
Clicks -> async event -> Kafka -> analytics (question 7)
```

Deep dive: 301 vs 302. A 301 tells browsers to cache the redirect, so repeat
visits never reach the service. That saves traffic but hides analytics and
makes the destination impossible to change. A 302 or 307 sends every click
through the service, which is what most products want.

Deep dive: the read path. Redirects dominate, so the redirect service reads
from cache first, falls back to a replicated key-value store, and caches
misses briefly so a flood of requests for a bad key does not hit storage.
Read replicas in several regions keep latency low worldwide. The write path
can be slower and can even be unavailable without affecting redirects.

Failure cases and tradeoffs:

- Expired links are removed lazily on read and by a background sweeper.
- Custom aliases need a uniqueness check and a reserved-word list.
- Shorteners attract phishing and malware. Scan destinations against
  blocklists, rate limit creation, and show an interstitial for suspicious
  targets.
- Storing billions of rows is fine in a partitioned key-value store, since
  every lookup is by exact key.

Strong answer:

> I would generate keys from leased counter ranges encoded in base62, store
> key to URL in a replicated key-value store with a Redis cache in front,
> and serve 302 redirects so clicks can be tracked. The read path is
> isolated from the write path, click events go to an async analytics
> pipeline, and abuse controls protect the service from being used for
> phishing.

## 17. Design A Notification System

This version of the question is about the notification inbox users see in
the product: the bell icon, the unread badge, a list that updates in real
time, and read state that syncs across devices. Question 3 covers the
multi-channel delivery pipeline behind it.

Clarifying questions:

- Should the bell update without a page refresh?
- Group similar items, such as "Alice and 3 others commented"?
- How long are notifications kept?
- Must read state sync across devices?

Data model:

```txt
inbox_item(user_id, item_id, type, actor_ids[], entity_ref,
           group_key, read_at, seen_at, created_at)
read_watermark(user_id, read_before)
unread_count(user_id) in Redis
```

Partition inbox items by user id and order by a time-sortable item id such as
a ULID. Every query is per user: latest N items, unread count, mark as read.

Architecture:

```txt
Domain events -> notification router (question 3)
  -> In-app channel worker
       group by group_key within a time window
       write inbox_item per recipient
       increment unread counter
       publish to the recipient's real-time channel
  -> Real-time gateway (WebSocket or SSE) pushes to devices
  -> Inbox API: list with cursor, mark read, mark all read
  -> Push or email fallback when the user is offline
```

Deep dive: fan-out on write vs read. A comment that notifies ten watchers is
written to ten inboxes. A tenant-wide announcement to 100k users is stored
once and merged into each user's list when they open the inbox, or
materialized lazily on first open. Mixing both keeps writes bounded and reads
simple.

Deep dive: grouping. The group key combines entity, notification type, and a
time bucket. A second comment on the same page within the window updates the
existing item, appends the actor, and moves it to the top instead of creating
a new row. The unread counter increments once per group.

Deep dive: read state. "Mark all read" should not update thousands of rows.
Store a per-user watermark: anything created before it counts as read. Single
items still carry their own `read_at`. The Redis unread counter is a cache;
reconcile it from the store periodically or when the client reports a
mismatch.

Deep dive: real time. The gateway keeps a map of user id to open connections
and subscribes to a per-user channel. On reconnect, the client sends the last
item id it has, and the inbox API returns everything newer, so nothing is
lost while the socket was down.

Failure cases and tradeoffs:

- Counters drift under retries. Derive the item id from event id and user id
  so a retried write is an upsert, not a duplicate.
- Grouping trades precise history for a cleaner list. Keep the individual
  events elsewhere if audit needs them.
- Retention removes old items by TTL. Offer an archive if users want older
  history.

Strong answer:

> I would store per-user inbox items ordered by a time-sortable id, group
> related events by key, and keep the unread count in Redis backed by a read
> watermark so "mark all read" is one write. A real-time gateway pushes new
> items to connected devices, and cursor-based sync on reconnect makes the
> list consistent across devices.

## 18. Design A Distributed Messaging System

A distributed messaging system lets producers publish messages that many
consumers read reliably, in order, and at high throughput, even when brokers
fail. This answer designs a log-based system in the style of Kafka. The
Kafka and RabbitMQ guides in this track go deeper on each product.

Clarifying questions:

- Queue semantics, where each message goes to one consumer and is deleted,
  or log semantics with retention and replay?
- Ordering scope: global, per key, or none?
- Delivery guarantee: at most once, at least once, or exactly once?
- Throughput and retention?

Assumed scale:

```txt
1M messages/s, 1 KB average -> 1 GB/s ingress
7 days retention, 3 replicas -> about 1.8 PB on disk
```

Core concepts:

```txt
Topic      -> many partitions
Partition  -> append-only log on disk, messages have offsets
Producer   -> chooses a partition by key hash
Consumer   -> reads a partition sequentially by offset
Group      -> each partition is owned by one consumer
Broker     -> stores partitions, leads some, follows others
Controller -> metadata and leader election via Raft
```

Architecture:

```txt
Producers
  -> Broker cluster
       sequential disk writes, OS page cache, zero copy
       leader replicates to in-sync followers
       acks=all waits for the in-sync set
  -> Consumers pull by offset and commit progress
Controller quorum tracks partitions, leaders, and replicas
```

Deep dive: ordering. Order is guaranteed only within a partition, so the
partition key decides what stays ordered. Key by issue id or tenant id and
all events for that entity arrive in order. More partitions mean more
parallelism but also more metadata and more open files.

Deep dive: durability. Each partition has a leader and followers. A write is
acknowledged after the configured number of in-sync replicas has it. With
acknowledgement from all in-sync replicas and a minimum in-sync count of two,
a single broker loss never loses acknowledged data. Allowing an out-of-sync
replica to become leader restores availability faster at the cost of data.

Deep dive: delivery guarantees.

| Guarantee | How | Consumer duty |
| --- | --- | --- |
| At most once | Commit offset before processing. | Accept gaps. |
| At least once | Process, then commit. | Be idempotent. |
| Exactly once inside the system | Idempotent producers plus transactional offset commits. | Side effects outside still need idempotency. |

Deep dive: consumer groups. Partitions are divided among the consumers in a
group. When a consumer joins or leaves, partitions are reassigned.
Cooperative rebalancing moves only the affected partitions instead of
stopping the whole group. Consumer lag per partition is the most important
health metric.

Storage and retention:

```txt
Partition -> segment files + sparse offset index
Retention -> by time or size, oldest segments deleted
Compaction -> keep the latest message per key
Large payload -> store in object storage, send a reference
```

Failure cases and tradeoffs:

- A broker crash triggers leader election from the in-sync set. Producers
  retry, and idempotent producers stop retries from creating duplicates.
- Consumers restart from their last committed offset, so a crash mid-batch
  produces duplicates. Consumers must be idempotent.
- Adding partitions changes key to partition mapping and breaks per-key
  ordering during the change. Size partitions generously up front.
- Hot partitions come from skewed keys. Salt hot keys or pick a different
  key.

Compared with a queue broker like RabbitMQ: queues acknowledge and delete
per message, support flexible routing, and suit task distribution. A log
retains messages, supports replay and many independent consumer groups, and
suits event streaming.

Strong answer:

> I would build a partitioned, replicated commit log. Producers write to a
> partition leader chosen by key, followers replicate, and acknowledgement
> levels trade latency for durability. Consumers pull by offset in groups,
> which gives per-partition ordering, replay, and horizontal scaling.
> Duplicates are handled by idempotent producers and consumers rather than
> by pretending exactly-once exists across external systems.

## 19. Design A Scalable Chat Application

A chat application delivers messages between people and groups in real time,
stores history, tracks delivery and read state, and shows presence, across
many devices per user.

Clarifying questions:

- One-to-one and group chat? Maximum group size?
- Delivery and read receipts?
- Presence and typing indicators?
- Media attachments? End-to-end encryption?

Assumed scale:

```txt
50M daily users, 40 messages each -> 2B messages/day
About 23k messages/s on average, 100k/s at peak
10M concurrent connections
```

Architecture:

```txt
Mobile and web clients
  -> Layer 4 load balancer
  -> Chat gateways (WebSocket, many connections each)
  -> Session registry (Redis): user_id -> gateway ids
  -> Message service: validate, assign id, persist, fan out
  -> Message store partitioned by conversation_id,
     ordered by message_id (Cassandra or ScyllaDB)
  -> Pub/sub between message service and gateways
  -> Presence service, push notifications (question 3)
  -> Media service with presigned uploads to object storage
```

Message flow:

```txt
1. A sends a message with a client_msg_id over WebSocket
2. Gateway forwards to the message service
3. Service assigns a time-ordered message_id, persists it,
   deduplicating on (conversation, client_msg_id)
4. Sender receives "sent"
5. Service looks up recipients' gateways, publishes to them
6. Recipient device acks -> "delivered"; opening -> "read"
7. Offline recipients get a push; they sync on reconnect
```

Deep dive: ordering. Messages in a conversation carry ids from a time-ordered
generator, and all writes for one conversation are handled by the same
partition owner, so the id order is the conversation order. Clients render
by server id, not local time.

Deep dive: group fan-out. For small groups, the service pushes to every
member's gateways and records per-recipient delivery state. For very large
channels, per-recipient state is replaced by aggregate counts, and gateways
subscribe to the channel topic so a message is published once and delivered
to whoever is connected.

Deep dive: history and sync. Each client stores the last message id it has
per conversation. On reconnect it asks for everything newer, which makes
multi-device sync a cursor query. A per-user conversation list stores the
latest message per conversation so the home screen loads with one read.

Deep dive: presence. Clients heartbeat every 30 seconds to a Redis key with a
TTL. Presence changes are published to contacts with debouncing so a flaky
connection does not spam updates. Typing indicators are ephemeral and never
stored.

Failure cases and tradeoffs:

- Gateway deploys drop connections. Drain gracefully and have clients
  reconnect with jitter to avoid a thundering herd.
- Cassandra partitions for huge groups become hot. Bucket by conversation
  and time period.
- Exactly-once delivery is not possible; client message ids and client-side
  dedupe make duplicates invisible.
- End-to-end encryption blocks server-side search and complicates
  multi-device key management. Decide early because it shapes everything.
- Media uploads go straight to object storage through presigned URLs, and
  the message carries a reference plus thumbnail metadata.

Strong answer:

> I would terminate WebSockets on a stateless gateway fleet with a Redis
> registry of where each user is connected, run message handling through a
> service that assigns ordered ids and persists into a conversation-
> partitioned store, and fan out through pub/sub. Small groups get
> per-recipient receipts, large channels use topic subscription, and offline
> users are covered by push plus cursor-based sync on reconnect.

## 20. Design A Job Scheduler

A job scheduler runs work at a chosen time: recurring cron-style schedules
and one-off delayed jobs. It must fire on time, never lose a job, and avoid
running the same job twice when machines fail.

Clarifying questions:

- Recurring schedules, one-off delays, or both?
- How many schedules and runs per minute?
- Precision: within a second or within a minute?
- Long-running jobs? Dependencies between jobs?
- Is at-least-once execution acceptable if handlers are idempotent?

Assumed scale:

```txt
10M active schedules
50k job runs/min at peak
Fire within 1 s of the scheduled time
```

Data model:

```txt
job(id, tenant_id, type, payload, schedule, timezone,
    next_run_at, status, max_retries, timeout_s)
run(id, job_id, scheduled_for, started_at, finished_at,
    status, attempt, worker_id, lease_until, error)
```

Architecture:

```txt
Clients
  -> Scheduler API (create, update, pause, cancel)
  -> Job store (PostgreSQL, index on status + next_run_at)
  -> Dispatchers: claim due jobs, create runs, enqueue
  -> Execution queue (Kafka, SQS, or Redis Streams)
  -> Workers: lease a run, execute, heartbeat, report
  -> Run history, metrics, lateness alerts
```

Claiming due jobs safely with several dispatchers:

```sql
WITH due AS (
  SELECT id FROM jobs
  WHERE status = 'active'
    AND next_run_at <= now()
  ORDER BY next_run_at
  LIMIT 500
  FOR UPDATE SKIP LOCKED
)
UPDATE jobs
SET next_run_at = compute_next(schedule, now())
FROM due
WHERE jobs.id = due.id
RETURNING jobs.id, jobs.payload;
```

`SKIP LOCKED` lets many dispatchers poll the same table without claiming the
same rows. The update advances `next_run_at` in the same statement, and the
run id is derived from job id plus scheduled time so an enqueue retry is a
no-op.

Alternatives to database polling:

| Option | Strength | Weakness |
| --- | --- | --- |
| Redis sorted set by due time | Sub-second precision, cheap. | Durability depends on Redis persistence. |
| In-memory min-heap per shard | Very fast dispatch. | Needs leader election and reload on restart. |
| Queue with delayed delivery | No scheduler to run. | Limited max delay, no cron. |

Deep dive: leases and heartbeats. A worker leases a run for a bounded time
and extends the lease while working. If the worker dies, the lease expires
and the run is retried elsewhere. This makes execution at least once, so job
handlers must be idempotent, for example by checking whether the report for
this date already exists.

Deep dive: misfires. If the scheduler is down for ten minutes, a job that
should have fired every minute has ten missed runs. Each job declares a
policy: fire once and catch up, run every missed occurrence, or skip to the
next one.

Deep dive: time zones. Store the time zone with the job and compute the next
run in that zone using a cron library. Daylight saving changes create times
that do not exist or exist twice; the library and the policy decide, and the
decision is tested.

Failure cases and tradeoffs:

- Retries use exponential backoff with jitter and a maximum attempt count;
  exhausted runs go to a dead-letter list with an alert.
- Per-tenant concurrency limits and priority queues keep one tenant's
  million jobs from starving another's daily report.
- Job dependencies turn the scheduler into a DAG engine like Airflow. Store
  edges and trigger downstream runs on upstream success.
- The key metric is lateness: started time minus scheduled time. Alert on
  it before users notice.

Strong answer:

> I would keep jobs in a durable store indexed by next run time, have a
> fleet of dispatchers claim due jobs with `SKIP LOCKED` and enqueue runs
> with deterministic ids, and have workers execute under leases with
> heartbeats. Execution is at least once with idempotent handlers, misfire
> policies are explicit per job, and lateness is the primary alert.
