# MQTT IoT Messaging Interview Guide

MQTT interview guidance covering brokers, clients, topics, QoS, retained
messages, last will, persistent sessions, shared subscriptions, flow control,
security, observability, and IoT-to-backend architecture.

Use this guide for frontend, backend, IoT, platform, and AI-software-engineering
interviews where real-time device messaging or telemetry pipelines appear.

## 1. What Is MQTT?

MQTT is a lightweight publish-subscribe messaging protocol. Clients publish
messages to topics on an MQTT broker, and subscribed clients receive messages
that match their topic filters.

It is commonly used for:

- IoT telemetry
- mobile and unreliable networks
- device command and control
- sensor state updates
- industrial systems
- lightweight real-time messaging

Why it matters:

MQTT is designed for constrained devices and unreliable networks. It gives
devices a simple way to send and receive messages without knowing about each
other directly.

Tradeoff:

MQTT is a protocol, not a full analytics event platform. For replay, large
stream processing, and long-term event history, teams often bridge MQTT data
into Kafka or a database.

Strong answer:

> MQTT is a lightweight pub-sub protocol used heavily in IoT. Devices connect to
> a broker, publish to topics, subscribe to topic filters, and use QoS, sessions,
> retained messages, and last-will messages for reliability on unreliable
> networks.

## 2. Explain MQTT Architecture.

MQTT architecture has clients and a broker.

```txt
sensor client
  -> publishes telemetry
  -> MQTT broker
  -> routes by topic
  -> dashboard, rules engine, backend consumer
```

Important parts:

- client: publisher, subscriber, or both
- broker: accepts connections and routes messages
- topic: hierarchical message address
- subscription: topic filter a client wants to receive
- QoS: delivery agreement between sender and receiver
- session: broker-side state for subscriptions and queued messages

Why it matters:

MQTT decouples devices from backend systems. A sensor publishes
`factory/line-1/temp`, and multiple subscribers can receive the update without
the sensor knowing who they are.

## 3. What Are MQTT Topics And Topic Filters?

An MQTT topic is a hierarchical string used to route messages.

Examples:

```txt
devices/thermostat-7/temperature
factory/line-1/motor-3/vibration
tenant/acme/site/dhaka/sensor/42/status
```

A topic filter is what a subscriber uses to match topics.

Wildcards:

- `+` matches one level
- `#` matches multiple levels at the end of the filter

Examples:

```txt
devices/+/temperature
factory/line-1/#
```

Tradeoff:

Wildcards are useful, but broad subscriptions can overload subscribers or leak
data across tenants if ACLs are not strict.

## 4. What Are MQTT QoS Levels?

MQTT has three quality-of-service levels.

| QoS | Meaning | Typical use |
| --- | --- | --- |
| 0 | at most once | frequent telemetry where loss is acceptable |
| 1 | at least once | important events where duplicates are acceptable |
| 2 | exactly once between MQTT peers | critical commands with higher overhead |

Important point:

QoS is negotiated per message flow between MQTT peers. It does not magically
make downstream databases, APIs, or business side effects exactly once.

Tradeoff:

QoS 0 is fastest and cheapest. QoS 1 is a common production default for
important telemetry. QoS 2 has more protocol overhead and is used selectively.

Strong answer:

> I choose QoS based on business risk. QoS 0 is fire-and-forget, QoS 1 allows
> duplicates, and QoS 2 gives stronger protocol-level delivery but still needs
> idempotent application logic.

## 5. How Does MQTT QoS 1 Work?

QoS 1 means at-least-once delivery between MQTT peers.

Simplified flow:

```txt
publisher sends PUBLISH
receiver processes packet
receiver sends PUBACK
publisher retries if PUBACK is not received
```

Why duplicates happen:

If the receiver processes the message but the acknowledgement is lost, the
sender can retry. The receiver may see the same message again.

How to handle it:

- include message ids or business ids
- deduplicate at the application layer
- make commands idempotent
- track last sequence number per device when ordering matters

Tradeoff:

QoS 1 is usually a practical balance for IoT, but every consumer must tolerate
duplicates.

## 6. How Does MQTT QoS 2 Work?

QoS 2 is MQTT's strongest delivery level. It uses a multi-step handshake so a
message is delivered exactly once between MQTT peers.

Simplified flow:

```txt
PUBLISH
PUBREC
PUBREL
PUBCOMP
```

Why it matters:

QoS 2 can help for critical commands where duplicate delivery to a client is
unacceptable.

Tradeoff:

QoS 2 costs more round trips and broker/client state. It still does not remove
the need for idempotency when the message triggers external side effects.

## 7. What Is A Retained Message?

A retained message is the last retained value stored by the broker for a topic.
When a new subscriber matches that topic, the broker can immediately send that
stored value.

Example:

```txt
topic: devices/pump-9/status
retained message: online

new dashboard subscribes
dashboard immediately sees online
```

Use retained messages for:

- current device state
- latest configuration version
- last known sensor status
- discovery metadata

Tradeoff:

Retained messages can become stale. Use message expiry, timestamps, and clear
ownership rules so users do not mistake old retained state for fresh telemetry.

## 8. What Is Last Will And Testament In MQTT?

Last Will and Testament lets a client register a message that the broker
publishes if the client disconnects unexpectedly.

Example:

```txt
device connects with will:
topic: devices/pump-9/availability
payload: offline
retain: true

device connection drops unexpectedly
broker publishes offline
```

Why it matters:

It gives subscribers a broker-driven signal when a device disappears without a
clean disconnect.

Tradeoff:

Network blips can trigger false offline signals. Many systems use a short
debounce window or MQTT 5 will delay before showing a device as offline.

## 9. What Are Clean Start And Session Expiry?

Clean Start controls whether a client starts with a fresh session when it
connects. Session Expiry controls how long the broker keeps session state after
disconnect.

Session state can include:

- subscriptions
- queued QoS 1 and QoS 2 messages
- in-flight delivery state

Use a persistent session when:

- devices disconnect often
- the device needs queued messages after reconnect
- subscriptions should survive reconnects

Tradeoff:

Persistent sessions consume broker resources. Use session expiry so abandoned
devices do not leave broker state forever.

## 10. What Is Message Expiry In MQTT 5?

Message expiry sets how long a published message remains useful. If the message
cannot be delivered before expiry, the broker should not deliver it later.

Useful for:

- temporary commands
- short-lived alerts
- stale telemetry prevention
- retained messages that should expire

Example:

```txt
command: unlock-door
message expiry: 30 seconds
```

Tradeoff:

Expiry protects users from stale actions, but an expiry that is too short can
drop valid messages during normal network outages.

## 11. What Are Shared Subscriptions?

Shared subscriptions let multiple MQTT clients share the processing of matching
messages.

Format:

```txt
$share/{groupName}/{topicFilter}
```

Example:

```txt
$share/telemetry-workers/devices/+/telemetry
```

If three workers subscribe to the same shared subscription, each matching
message is sent to one worker in the group instead of all workers.

Why it matters:

Shared subscriptions make MQTT consumers more scalable for backend processing.

Tradeoff:

Shared subscriptions are not the same as Kafka consumer groups. Broker
selection behavior and ordering guarantees depend on MQTT broker behavior and
session state.

## 12. What Is Receive Maximum In MQTT 5?

Receive Maximum is MQTT 5 flow control for QoS 1 and QoS 2 messages. It limits
how many unacknowledged PUBLISH packets can be in flight on a connection.

Why it matters:

Small devices can tell the broker not to send more in-flight messages than they
can handle.

Example:

```txt
Receive Maximum = 5

broker can send up to 5 unacknowledged QoS 1 or QoS 2 publishes
broker waits for acknowledgements before sending more
```

Tradeoff:

Low values protect devices but reduce throughput. High values improve
throughput but can overwhelm weak clients.

## 13. What Is Topic Alias In MQTT 5?

Topic Alias lets a client and broker replace a repeated topic name with a small
numeric alias after the mapping is known.

Why it matters:

IoT topics can be long. Topic aliases reduce repeated packet overhead for high
frequency messages.

Example:

```txt
first publish:
topic = tenant/acme/site/dhaka/device/42/telemetry
alias = 3

later publish:
topic omitted
alias = 3
```

Tradeoff:

Topic aliases save bandwidth but add connection-local state. They are most
useful when the same connection publishes frequently to the same long topics.

## 14. What Are Response Topic And Correlation Data?

MQTT 5 supports request-response patterns using response topics and correlation
data.

Example:

```txt
command topic: devices/pump-9/commands
response topic: replies/controller-1
correlation data: request-123
```

The device processes the command and publishes a response to the response
topic with the same correlation data.

Tradeoff:

MQTT request-response is useful, but it should not turn every device operation
into a synchronous RPC dependency. For unreliable networks, asynchronous state
updates are often more robust.

## 15. How Do You Secure MQTT?

MQTT security should include transport, identity, authorization, and tenant
isolation.

Important controls:

- TLS for broker connections
- unique client credentials or certificates
- topic-level ACLs
- tenant prefixes in topic design
- least-privilege publish and subscribe permissions
- short-lived credentials where possible
- broker-side rate limits and quotas

Why it matters:

If a device can subscribe to `tenant/+/+/commands`, one compromised credential
can observe or control other tenants.

Tradeoff:

Strict topic ACLs require careful topic naming. Poor naming makes authorization
fragile.

## 16. MQTT Over WebSockets vs Native MQTT?

Native MQTT usually runs over TCP. MQTT over WebSockets lets browser clients
connect through a WebSocket-compatible broker endpoint.

Use MQTT over WebSockets when:

- a browser dashboard needs live device updates
- network infrastructure allows WebSockets more easily than raw MQTT TCP
- you want one protocol from devices to frontend subscriptions

Tradeoff:

Browser MQTT clients still need authentication and authorization. Do not expose
broad broker credentials in frontend code.

Strong answer:

> MQTT over WebSockets is useful for browser dashboards, but the browser should
> receive scoped credentials and only subscribe to authorized topics.

## 17. How Does MQTT Handle Offline Devices?

MQTT supports offline devices through persistent sessions, queued QoS messages,
retained messages, and last-will availability signals.

Design example:

```txt
device connects with persistent session
device subscribes to commands with QoS 1
device disconnects
broker queues allowed QoS 1 messages
device reconnects before session expiry
broker delivers queued commands
```

Tradeoff:

Queuing every offline command is dangerous. Commands should have expiry,
idempotency, and sometimes replacement behavior so a device does not execute
stale actions after reconnecting.

## 18. How Does MQTT Ordering Work?

MQTT can preserve order for messages on a connection under protocol rules, but
application-level ordering can still be tricky.

Ordering problems happen when:

- multiple clients publish related events
- devices reconnect and resend
- QoS retries create duplicates
- backend workers use shared subscriptions
- bridges forward messages into another system

Fixes:

- include device timestamp
- include monotonic sequence number per device
- deduplicate by message id
- process commands per device key
- avoid assuming global ordering across devices

Tradeoff:

Strict ordering reduces parallelism. Most IoT systems use per-device ordering
instead of global ordering.

## 19. MQTT vs Kafka?

MQTT and Kafka are often used together, but they are different tools.

| Dimension | MQTT | Kafka |
| --- | --- | --- |
| Best fit | device messaging | event streaming and replay |
| Clients | constrained devices, browsers, apps | backend services and stream processors |
| Routing | topics and subscriptions | topics and partitions |
| Retention | broker and session dependent | core time or size retention |
| Replay | not the main model | core capability |
| Ordering | connection and topic-flow focused | partition focused |

Common architecture:

```txt
IoT devices
  -> MQTT broker
  -> bridge/rules engine
  -> Kafka topic
  -> analytics, ML, storage, alerting
```

## 20. MQTT vs RabbitMQ?

MQTT is a protocol optimized for lightweight pub-sub clients. RabbitMQ is a
broker platform often used for backend queues and AMQP routing.

Use MQTT for:

- device telemetry
- low bandwidth
- unreliable networks
- retained device state
- last-will presence

Use RabbitMQ for:

- backend task queues
- business workflow routing
- per-message acknowledgement
- retry queues and DLX
- AMQP-based integrations

Tradeoff:

Some brokers support both MQTT and AMQP, but the application model is still
different. Device telemetry and backend job processing have different failure
modes.

## 21. How Would You Bridge MQTT To Kafka?

A common production pattern is MQTT at the edge and Kafka in the backend.

Flow:

```txt
devices publish telemetry to MQTT
MQTT broker authenticates and authorizes devices
bridge subscribes to allowed topics
bridge validates and normalizes messages
bridge publishes to Kafka by device id key
Kafka stores replayable event history
```

Important design choices:

- map MQTT topic names to Kafka topics carefully
- use device id as Kafka key for per-device ordering
- deduplicate QoS 1 duplicates
- validate schema before publishing to Kafka
- preserve original MQTT metadata when useful
- define dead-letter handling for invalid messages

Tradeoff:

The bridge becomes a critical boundary. It must be observable, horizontally
scalable, idempotent, and backpressure-aware.

## 22. How Would You Design MQTT Topic Names?

Good topic names support routing, authorization, observability, and long-term
maintenance.

Example:

```txt
tenants/{tenantId}/sites/{siteId}/devices/{deviceId}/telemetry
tenants/{tenantId}/sites/{siteId}/devices/{deviceId}/commands
tenants/{tenantId}/sites/{siteId}/devices/{deviceId}/status
```

Rules:

- include tenant or ownership boundary
- keep device identity stable
- separate telemetry, commands, and status
- avoid personally identifiable data in topic names
- avoid unbounded cardinality where broker metrics become noisy
- document wildcard subscription expectations

Tradeoff:

Very detailed topics make ACLs and routing easy but increase packet size.
MQTT 5 topic aliases can reduce repeated topic overhead.

## 23. How Do You Monitor MQTT In Production?

Monitor broker health, device behavior, and message flow.

Useful metrics:

- connected clients
- connection churn
- authentication failures
- publish and subscribe rate
- dropped messages
- queued session messages
- retained message count
- QoS retry rate
- broker CPU, memory, and network
- bridge lag into Kafka or storage

Debugging examples:

| Symptom | Likely cause |
| --- | --- |
| high reconnect rate | bad network, keepalive too low, client crash |
| many queued messages | offline devices or slow subscribers |
| duplicate events | QoS 1 retry or bridge retry |
| stale dashboard state | retained message or expiry issue |

## 24. What Are Common MQTT Interview Failure Cases?

Interviewers often test whether you understand protocol guarantees and
production tradeoffs.

Common traps:

- saying QoS 2 makes the whole business workflow exactly once
- storing broad broker credentials in frontend code
- forgetting retained messages can be stale
- treating last-will messages as perfect presence
- using broad wildcard subscriptions without tenant ACLs
- ignoring duplicate QoS 1 deliveries
- assuming global ordering across devices
- queuing commands forever for offline devices

Strong answer:

> MQTT gives useful reliability features, but I still design for stale data,
> duplicates, reconnects, authorization, and downstream idempotency.

## 25. What Advanced MQTT Concepts Should You Know For Senior Interviews?

Senior MQTT questions usually focus on reliability across unreliable networks.

Know these concepts:

- QoS 0, QoS 1, and QoS 2 tradeoffs
- retained messages and stale state
- last will and will delay
- Clean Start and Session Expiry
- message expiry
- shared subscriptions
- Receive Maximum flow control
- topic alias bandwidth optimization
- request-response with response topic and correlation data
- topic-level ACLs
- MQTT over WebSockets
- MQTT-to-Kafka bridging

Strong answer:

> Advanced MQTT design is about choosing the right protocol guarantees, keeping
> broker state bounded, securing topic access, tolerating duplicates, and
> bridging device messages into backend systems cleanly.

## Sources Used

- <https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html>
- <https://mqtt.org/>
