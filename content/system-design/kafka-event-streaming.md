# Kafka Event Streaming Interview Guide

Kafka interview guidance covering producers, consumers, topics, partitions,
offsets, consumer groups, delivery guarantees, replication, Spring Kafka,
dead-letter handling, ordering, scaling, and event-driven design.

## 1. What Is Apache Kafka?

Apache Kafka is a distributed event streaming platform. Applications publish
events to Kafka, Kafka stores them durably in topics, and other applications
consume those events independently.

It is commonly used for:

- event-driven microservices
- activity streams
- payment and order pipelines
- log and metric ingestion
- change data capture
- stream processing

Kafka matters because producers and consumers are decoupled. A producer can
write an `OrderCreated` event once, while payment, inventory, analytics, and
notification services consume it at their own pace.

Tradeoff:

Kafka adds operational complexity. You need to design topics, partitions,
consumer groups, schemas, retries, monitoring, and idempotency instead of
treating it like a simple function call.

Strong answer:

> Kafka is a durable distributed event log. Producers append events to topics,
> and consumers read those events independently, which makes Kafka useful for
> scalable event-driven systems.

## 2. Explain Kafka Architecture.

A Kafka cluster is made of brokers, topics, partitions, clients, and a metadata
control plane.

Modern Kafka architecture:

```txt
Producer
  -> broker that leads the target topic-partition
  -> replicated follower brokers

Consumer group
  -> consumers assigned to topic partitions

KRaft controllers
  -> manage cluster metadata and leader election
```

Older Kafka clusters used ZooKeeper for metadata and broker coordination.
Current Kafka 4.x uses KRaft, where Kafka controllers manage metadata through
a Raft quorum, so ZooKeeper-specific configuration is no longer needed.

Why it matters:

- brokers store data
- topics organize events
- partitions provide parallelism
- replicas provide fault tolerance
- leaders handle partition traffic
- consumers scale through consumer groups

Interview phrasing:

> Producers write to partition leaders, brokers replicate partition data,
> consumers read assigned partitions, and the KRaft controller quorum manages
> metadata and leader elections.

## 3. What Is A Topic In Kafka?

A topic is a named stream of related events. It is the logical destination a
producer writes to and a consumer subscribes to.

Example topic names:

```txt
order-created
payment-authorized
inventory-reserved
user-login-events
```

Topics are split into partitions. The topic gives a business name to the
event stream, while partitions decide how that stream is physically distributed
and processed in parallel.

Tradeoff:

Too few topics can mix unrelated events and make consumers complicated. Too
many topics can increase operational overhead, ACL complexity, and monitoring
noise.

## 4. What Is A Partition?

A partition is an ordered append-only log inside a topic. Each event is written
to exactly one partition of the topic.

Partitions matter because they provide:

- parallel writes
- parallel reads
- horizontal scaling across brokers
- ordering within a partition
- fault tolerance when replicated

Example:

```txt
Topic: order-created
Partitions: 0, 1, 2

orderId=1001 -> partition 1
orderId=1002 -> partition 0
orderId=1001 -> partition 1 again
```

Tradeoff:

Kafka only guarantees ordering inside one partition. If a workflow needs all
events for one order in order, those events should use the same key so they
land in the same partition.

## 5. What Is An Offset?

An offset is the position of a record inside a partition. Kafka assigns offsets
sequentially per partition.

Example:

```txt
order-created partition 0
offset 0 -> OrderCreated(1001)
offset 1 -> OrderPaid(1001)
offset 2 -> OrderShipped(1001)
```

Consumers track offsets so they know what they have processed. A committed
offset tells Kafka where the consumer group should resume after a restart.

Important detail:

Offsets are scoped to a partition, not to the whole topic. Offset `10` in
partition `0` is different from offset `10` in partition `1`.

## 6. What Is A Broker?

A broker is a Kafka server. It stores partition data, serves producer writes,
serves consumer reads, replicates data, and participates in the cluster.

A Kafka cluster has one or more brokers:

```txt
Broker 1 -> partitions and replicas
Broker 2 -> partitions and replicas
Broker 3 -> partitions and replicas
```

Each partition has one leader broker and usually multiple follower replicas on
other brokers. If a broker fails, Kafka can move leadership for affected
partitions to another in-sync broker.

Tradeoff:

More brokers increase capacity and availability, but they also require
monitoring, disk planning, network planning, rolling upgrades, and partition
balancing.

## 7. What Is A Consumer Group?

A consumer group is a set of consumers that cooperate to read from a topic.
Kafka assigns each partition to only one consumer in the group at a time.

Example:

```txt
Topic has 3 partitions.
Consumer group has 3 consumers.

Consumer A -> partition 0
Consumer B -> partition 1
Consumer C -> partition 2
```

This lets you scale processing horizontally. If another service needs the same
events independently, it should use a different group ID.

Key interview point:

Consumers in the same group share work. Consumers in different groups each get
their own logical copy of the stream.

## 8. How Does A Kafka Producer Send Messages?

A producer serializes the key and value, chooses a target partition, batches
records, and sends them to the broker that leads that partition.

Partition choice normally follows this order:

1. Use the explicit partition if the producer set one.
2. Use the key hash when a key is present.
3. Use Kafka's default partitioning strategy when no key is present.

Example:

```txt
key = order-1001
value = { "status": "created" }
topic = order-events

Producer hashes order-1001 -> partition 2
Producer sends record to partition 2 leader
```

Tradeoff:

Keys improve ordering for related events, but a hot key can overload one
partition. For high-cardinality business IDs like order ID or user ID, keys
are usually a good fit.

## 9. What Is The Role Of A Message Key?

The message key controls partitioning and helps preserve ordering for related
events.

If every event for `order-1001` uses the key `order-1001`, Kafka sends those
events to the same partition. Consumers then read those events in partition
order.

Keys are useful for:

- order workflows
- account updates
- user activity
- entity state changes
- log compaction

Tradeoff:

A poor key can create skew. For example, using `country=US` as a key might
send too much traffic to one partition if most users are in the United States.

## 10. What Is acks=0, acks=1, And acks=all?

`acks` controls how many acknowledgements the producer waits for before
considering a write successful.

```txt
acks=0
  Producer does not wait for broker acknowledgement.
  Fastest, but records can be lost silently.

acks=1
  Leader acknowledges after writing locally.
  Better durability, but data can be lost if the leader fails before replicas
  catch up.

acks=all
  Leader waits for in-sync replicas according to topic durability settings.
  Strongest durability, usually used for important events.
```

Production recommendation:

Use `acks=all`, replication factor `3`, and `min.insync.replicas=2` for
business-critical events. This still requires handling producer errors when
the cluster cannot satisfy the durability requirement.

## 11. What Is An Idempotent Producer?

An idempotent producer prevents duplicate records caused by producer retries.
Kafka assigns producer sequence numbers so the broker can detect retried
batches that have already been written.

Why it matters:

Network timeouts are ambiguous. The producer may not know whether the broker
received the record. Retrying without idempotence can append the same record
twice.

Important settings:

```txt
enable.idempotence=true
acks=all
retries > 0
max.in.flight.requests.per.connection <= 5
```

Modern Kafka enables idempotence by default when no conflicting producer
settings are used.

Tradeoff:

Producer idempotence prevents duplicate appends from retries, but it does not
make external side effects like charging a card or updating a database
idempotent. Those operations still need idempotency keys or unique constraints.

## 12. How Do You Avoid Duplicate Messages From The Producer?

Use producer idempotence and design the event with a stable business
identifier.

Common techniques:

- set `enable.idempotence=true`
- use `acks=all`
- keep retries enabled
- use a stable event ID or transaction ID
- avoid generating a new ID for each retry
- use Kafka transactions for consume-process-produce workflows
- make downstream consumers idempotent

Example:

```txt
eventId = payment-1001-authorize-v1
key = order-1001
```

If the producer retries, the same logical event ID lets consumers or sinks
deduplicate safely.

Strong answer:

> I use Kafka idempotent producers for retry duplicates, and I still add a
> business idempotency key because Kafka cannot deduplicate external effects
> outside the log.

## 13. How Does A Kafka Consumer Read Messages?

A consumer subscribes to topics, receives partition assignments, polls records
from the broker, processes records, and commits offsets.

Typical flow:

```txt
consumer.subscribe("order-events")
consumer.poll()
process records
commit offsets
repeat
```

Kafka consumers pull records instead of brokers pushing records. This lets the
consumer control batch size, backpressure, processing rate, and retry behavior.

Tradeoff:

If processing takes too long between polls, the broker may consider the
consumer unhealthy and trigger a rebalance. Long-running processing should be
bounded, parallelized carefully, or moved to a worker model with explicit
pause and resume.

## 14. What Is Auto Offset Commit?

Auto offset commit means the Kafka client periodically commits the consumer's
latest position in the background.

Important settings:

```txt
enable.auto.commit=true
auto.commit.interval.ms=5000
```

It is simple and works for low-risk processing where occasional duplicates or
missed processing are acceptable.

Failure case:

If the consumer auto-commits an offset before the application fully processes
the record, then crashes, the group may resume after that record. The record
will not be processed again by that group.

Interview phrasing:

> Auto commit is convenient, but I avoid it for critical workflows because it
> can commit progress before the side effect is actually safe.

## 15. What Is Manual Offset Commit?

Manual offset commit means the application commits offsets only after it has
successfully processed records.

Example flow:

```txt
poll records
process record
write database update
publish output event
commit offset
```

This gives better control over reliability. If processing fails before commit,
the record can be read again after restart.

Tradeoff:

Manual commits require careful error handling. Committing too early can lose
work. Committing too late can cause duplicates. The usual production strategy
is at-least-once delivery with idempotent processing.

## 16. What Happens If A Consumer Crashes Before Committing The Offset?

When the consumer restarts, the group resumes from the last committed offset.
Any records processed after that commit but before the crash can be processed
again.

Example:

```txt
Committed offset: 10
Consumer processes offsets 11, 12, 13
Consumer crashes before commit
Consumer restarts from offset 11
```

This is at-least-once behavior. It protects against losing records, but it can
produce duplicate side effects unless processing is idempotent.

Production fix:

Store a business event ID in the database with a unique constraint, or make
the state transition naturally idempotent.

## 17. What Is Consumer Lag And How Do You Monitor It?

Consumer lag is the difference between the latest offset in a partition and
the offset a consumer group has processed or committed.

Example:

```txt
Log end offset: 10000
Consumer committed offset: 9400
Lag: 600 records
```

Lag matters because it shows whether consumers are keeping up with producers.
High or growing lag means processing is slower than ingestion.

Monitor lag with:

- Kafka consumer group tools
- Kafka client metrics
- Prometheus and Grafana
- managed Kafka dashboards
- alerts on sustained lag growth, not only one short spike

Tradeoff:

Lag must be interpreted with business context. A lag of 10,000 records can be
fine for analytics but unacceptable for payment authorization.

## 18. What Is Consumer Rebalancing?

Consumer rebalancing is the process of redistributing partitions among
members of a consumer group.

It happens so Kafka can maintain the rule that one partition is assigned to
only one consumer in the same group at a time.

Example:

```txt
Before:
Consumer A -> partitions 0, 1
Consumer B -> partition 2

After adding Consumer C:
Consumer A -> partition 0
Consumer B -> partition 1
Consumer C -> partition 2
```

Tradeoff:

Rebalancing helps scaling and failover, but it can pause or move work. Modern
Kafka supports improved incremental rebalance behavior, but applications
still need to handle duplicate processing around ownership changes.

## 19. When Does Rebalancing Occur?

Rebalancing can occur when group membership or topic partition assignments
change.

Common triggers:

- a new consumer joins the group
- a consumer shuts down
- a consumer crashes or misses heartbeats
- topic partitions are added
- subscription patterns match new topics
- assignment protocol or group configuration changes

Operational examples:

Deploying a new version of a service can cause rolling rebalances. Adding
partitions to a hot topic can also cause consumers to receive new assignments.

Production concern:

If consumers restart frequently because of slow processing, memory pressure,
or failed health checks, the group can spend too much time rebalancing instead
of processing records.

## 20. What Happens To Message Processing During Rebalancing?

During a rebalance, partition ownership changes. A consumer may lose some
partitions and another consumer may receive them.

Depending on the rebalance protocol and client behavior, processing may pause
for some partitions while assignment changes complete.

Safe handling:

- finish or stop in-flight work for revoked partitions
- commit offsets for completed work
- do not commit offsets for incomplete work
- make processing idempotent
- handle duplicate records after reassignment

Failure case:

If a consumer processes records asynchronously and commits offsets without
tracking partition ownership, it can commit progress for records that did not
actually finish.

## 21. How Can You Reduce Unnecessary Rebalancing?

Reduce rebalancing by making consumer membership stable and keeping polling
healthy.

Useful techniques:

- use static membership with `group.instance.id`
- tune session timeout and heartbeat settings carefully
- keep processing time below poll interval limits
- avoid frequent deploy restarts
- avoid scaling consumers up and down too aggressively
- use cooperative or newer incremental rebalance protocols when appropriate
- pause partitions instead of blocking polling for long work

Tradeoff:

Longer timeouts reduce unnecessary rebalances during short pauses, but they
also delay failover when a consumer really is dead.

## 22. What Is Replication Factor?

Replication factor is the number of copies of each partition stored across
brokers.

Example:

```txt
Topic: payment-events
Partition 0 replicas: broker 1, broker 2, broker 3
Replication factor: 3
```

Replication provides availability and durability. If one broker fails, another
replica can serve as the new leader if it is eligible and in sync.

Production default:

A replication factor of `3` is common for important production topics. Combine
it with `acks=all` and `min.insync.replicas=2` for stronger write guarantees.

Tradeoff:

Higher replication uses more disk and network bandwidth.

## 23. What Is ISR?

ISR means in-sync replicas. It is the set of replicas that are sufficiently
caught up with the partition leader.

Kafka uses ISR to decide which replicas are safe for acknowledgements and
leader election.

Example:

```txt
Partition replicas: broker 1, broker 2, broker 3
Leader: broker 1
ISR: broker 1, broker 2
Out of sync: broker 3
```

If the producer uses `acks=all`, Kafka waits for the configured in-sync
replica requirement before acknowledging a write.

Interview phrasing:

> ISR is the set of replicas that are up to date enough to safely participate
> in durability guarantees and leader failover.

## 24. What Is At-Most-Once Delivery?

At-most-once delivery means a message is processed zero or one time. It may be
lost, but it should not be processed twice.

How it can happen:

```txt
commit offset first
process record second
consumer crashes during processing
record is skipped after restart
```

Use cases:

- metrics where occasional loss is acceptable
- clickstream data with approximate analytics
- non-critical telemetry

Tradeoff:

At-most-once avoids duplicates by accepting possible data loss. It is usually
not acceptable for payments, inventory, or state transitions.

## 25. What Is At-Least-Once Delivery?

At-least-once delivery means a message should not be lost, but it may be
processed more than once.

How it usually works:

```txt
process record first
commit offset after successful processing
consumer crashes before commit
record is processed again
```

This is the most common production model because it prioritizes correctness
over duplicate avoidance.

Production requirement:

Consumers must be idempotent. Use event IDs, unique constraints, conditional
updates, or deduplication tables so a repeated event does not repeat the
business side effect.

## 26. What Is Exactly-Once Delivery?

Exactly-once delivery means Kafka can ensure a consume-process-produce flow
updates Kafka state once, even when retries or failures happen.

It relies on:

- idempotent producers
- Kafka transactions
- transactional IDs
- committing consumed offsets as part of a Kafka transaction

Example:

```txt
consume order-created
produce payment-requested
commit consumed offset in the same Kafka transaction
```

Important caveat:

Exactly-once semantics in Kafka do not automatically make external systems
exactly once. A payment gateway, email provider, or SQL database still needs
idempotency controls.

Strong answer:

> Kafka exactly-once is strongest for Kafka-to-Kafka workflows. For external
> side effects, I still design idempotency at the business layer.

## 27. Which Delivery Guarantee Have You Used And Why?

In most production business workflows, at-least-once delivery is the practical
default.

Reasoning:

- losing business events is usually worse than processing duplicates
- duplicates can be handled with idempotency keys
- manual offset commits give clear control
- retries and dead-letter topics can isolate failures
- the model works with databases and external APIs

Example interview answer:

> I usually use at-least-once delivery. I commit offsets after successful
> processing and make the consumer idempotent with a unique event ID or
> business transaction key. I use exactly-once Kafka transactions when the
> workflow is Kafka-to-Kafka and the extra complexity is justified.

## 28. How Do You Create A Kafka Producer In Spring Boot?

In Spring Boot, the usual approach is to configure producer properties and use
`KafkaTemplate` to send records.

Example:

```java
@Configuration
class KafkaProducerConfig {
  @Bean
  ProducerFactory<String, Object> producerFactory() {
    Map<String, Object> config = new HashMap<>();
    config.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
    config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
    config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
    config.put(ProducerConfig.ACKS_CONFIG, "all");
    config.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);

    return new DefaultKafkaProducerFactory<>(config);
  }

  @Bean
  KafkaTemplate<String, Object> kafkaTemplate(
    ProducerFactory<String, Object> producerFactory
  ) {
    return new KafkaTemplate<>(producerFactory);
  }
}
```

Usage:

```java
kafkaTemplate.send("order-events", order.id(), orderCreatedEvent);
```

Production concern:

Do not hard-code broker URLs in application code. Use environment-specific
configuration, security settings, retries, timeouts, and observability.

## 29. How Do You Create A Kafka Consumer Using @KafkaListener?

In Spring Kafka, `@KafkaListener` subscribes a method to one or more topics.

Example:

```java
@Component
class OrderEventConsumer {
  private final PaymentService paymentService;

  OrderEventConsumer(PaymentService paymentService) {
    this.paymentService = paymentService;
  }

  @KafkaListener(topics = "order-events", groupId = "payment-service")
  void consume(OrderCreated event, Acknowledgment acknowledgment) {
    paymentService.authorize(event);
    acknowledgment.acknowledge();
  }
}
```

For manual acknowledgement, configure the listener container with manual ack
mode and disable auto commit.

Why it matters:

`@KafkaListener` is concise, but the reliability comes from the surrounding
configuration: deserialization, ack mode, concurrency, retries, error
handlers, and idempotent business logic.

## 30. How Do You Configure JSON Serialization And Deserialization?

Spring Kafka can serialize outgoing objects as JSON and deserialize incoming
JSON into typed objects.

Example YAML:

```yaml
spring:
  kafka:
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
    consumer:
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
      properties:
        spring.json.trusted.packages: com.example.events
```

Use exact trusted packages in production instead of trusting every package.

Tradeoff:

JSON is readable and easy to debug, but it is larger and less schema-strict
than Avro, Protobuf, or JSON Schema with a schema registry.

## 31. How Do You Handle Retries In Spring Kafka?

Use Spring Kafka error handling with a retry backoff and a recoverer that sends
exhausted records to a dead-letter topic.

Example:

```java
@Bean
DefaultErrorHandler kafkaErrorHandler(KafkaTemplate<Object, Object> template) {
  var recoverer = new DeadLetterPublishingRecoverer(template);
  var backOff = new FixedBackOff(1000L, 3L);

  return new DefaultErrorHandler(recoverer, backOff);
}
```

Common strategy:

- retry transient failures, such as a temporary database outage
- do not retry validation errors forever
- send exhausted records to a DLT
- alert on DLT growth
- include enough headers and logs to debug the failure

Tradeoff:

Retries can block partition progress if ordered processing is required. For
high-volume systems, consider retry topics or non-blocking retries, but
understand that they can affect ordering guarantees.

## 32. What Is A Dead Letter Topic?

A dead letter topic, often called a DLT, stores records that could not be
processed after retries or because the error is not recoverable.

Example:

```txt
order-events
  -> consumer retries 3 times
  -> order-events.DLT
```

A DLT helps teams inspect failures without blocking the main topic forever.
It should include enough context to replay or repair the event safely.

Production concern:

A DLT is not a trash can. Monitor it, alert on it, define ownership, and build
a clear replay process. Otherwise failed business events are only hidden, not
handled.

## 33. How Do You Prevent Duplicate Payment Processing Using Kafka?

Use at-least-once Kafka processing plus payment idempotency.

Practical design:

- include a stable `paymentRequestId`
- use the order ID as the Kafka key when ordering by order is required
- store `paymentRequestId` with a unique database constraint
- call the payment provider with the same idempotency key
- commit the Kafka offset only after durable success
- make retries reuse the same IDs
- publish the next event only after the payment result is durable

Example:

```txt
paymentRequestId = order-1001-payment-v1
Kafka key = order-1001
Database unique key = paymentRequestId
Payment provider idempotency key = paymentRequestId
```

Strong answer:

> I do not rely on Kafka offsets alone for payment correctness. I use a stable
> business idempotency key and enforce it in the database and payment provider.

## 34. What Happens If There Are 6 Partitions And 8 Consumers In One Group?

Only six consumers can actively receive records because a partition can be
assigned to only one consumer in a group at a time.

Example:

```txt
Partitions: 6
Consumers in same group: 8

6 consumers get one partition each.
2 consumers stay idle.
```

Adding more consumers than partitions does not increase throughput for that
topic within the same group.

Tradeoff:

Extra idle consumers can be useful as warm standby capacity, but they also use
resources. To scale beyond six active consumers, increase partition count or
split work by topic, but plan partition changes carefully.

## 35. How Do You Maintain Ordering For All Events Of The Same Order ID?

Use the order ID as the Kafka message key so all events for that order go to
the same partition.

Example:

```txt
key = order-1001

OrderCreated -> partition 2
PaymentAuthorized -> partition 2
InventoryReserved -> partition 2
OrderShipped -> partition 2
```

Kafka preserves order within a partition, so a single consumer assigned to
that partition reads those events in the order they were written.

Production concern:

Do not break ordering inside the consumer by processing records for the same
partition concurrently without sequencing. Also avoid changing partition count
without understanding how key-to-partition mapping may change for future
records.

## 36. How Do You Handle Poison Messages?

A poison message is a record that repeatedly fails processing because the data
or code path is bad.

Handling strategy:

- retry only when the error might be transient
- classify non-retryable exceptions
- send exhausted records to a DLT
- log the topic, partition, offset, key, exception, and correlation ID
- alert the owning team
- build a manual repair or replay path

Example:

```txt
Invalid schema version -> do not retry forever
Database temporarily unavailable -> retry with backoff
```

Tradeoff:

Skipping a poison message can preserve throughput, but it can also violate
business completeness. The DLT and replay process are part of the reliability
design, not an afterthought.

## 37. How Do You Scale Kafka Consumers For High Traffic?

Scale Kafka consumers by increasing parallelism and reducing per-record
processing cost.

Useful techniques:

- increase topic partitions when needed
- run more consumers in the same group up to the partition count
- use listener concurrency in Spring Kafka
- batch database writes where safe
- optimize slow downstream calls
- pause and resume partitions for backpressure
- separate high-priority and low-priority topics
- monitor lag, processing time, error rate, and rebalance frequency

Important limit:

Consumer group parallelism for a topic is bounded by partition count. If a
topic has four partitions, only four consumers in one group can actively read
that topic.

## 38. What Happens When A Broker Goes Down During Message Processing?

If a broker fails, the impact depends on whether it hosted partition leaders,
followers, or both.

Typical behavior:

- the controller detects the failed broker
- partitions led by that broker need new leaders
- eligible in-sync replicas can become leaders
- producers and consumers refresh metadata
- clients retry retriable requests
- processing may pause briefly

If the failed broker only had follower replicas, clients may see little direct
impact. If it had leaders, writes and reads for those partitions pause until
leadership changes.

Durability concern:

If a record was acknowledged with strong settings and replicated to the
required in-sync replicas, it should remain available. If weak acknowledgements
were used, recent writes may be lost.

## 39. How Would You Design An Order To Payment To Inventory Flow Using Kafka?

Use topics to represent facts between services and keep each service owning
its own data.

Example flow:

```txt
Order Service
  -> writes order to order database
  -> publishes OrderCreated to order-events

Payment Service
  -> consumes OrderCreated
  -> authorizes payment idempotently
  -> publishes PaymentAuthorized or PaymentFailed to payment-events

Inventory Service
  -> consumes PaymentAuthorized
  -> reserves stock idempotently
  -> publishes InventoryReserved or InventoryRejected
```

Design rules:

- use `orderId` as the key for per-order ordering
- include event IDs and schema versions
- make every consumer idempotent
- use retries and DLTs
- monitor lag and failure topics
- use a saga-style workflow for compensation

Tradeoff:

This design improves service decoupling, but it introduces eventual
consistency. The UI and APIs must represent pending, failed, and compensated
states clearly.

## 40. What Is The Difference Between Leader And Follower?

Each partition has one leader replica and one or more follower replicas.

The leader is responsible for client traffic for that partition. Producers
write to the leader, and consumers normally read from the leader. Followers
replicate data from the leader and can be promoted if the leader fails.

Example:

```txt
Partition 0
Leader: broker 1
Followers: broker 2, broker 3
```

Why it matters:

Leader distribution affects load. If too many partition leaders sit on one
broker, that broker can become hot even when replicas are spread across the
cluster.

## 41. What Happens If The Leader Broker Fails?

If the broker leading a partition fails, Kafka elects a new leader from
eligible replicas, usually from the in-sync replica set.

Typical sequence:

```txt
leader broker fails
controller detects failure
new leader is elected
producers and consumers refresh metadata
traffic resumes on new leader
```

During the transition, clients may see retriable errors or short pauses.
Well-configured producers and consumers handle this with retries and metadata
refresh.

Data safety depends on replication settings. `acks=all`,
`min.insync.replicas`, and replication factor determine how much data Kafka
can safely acknowledge before a leader failure.

## 42. How Does Kafka Ensure Fault Tolerance?

Kafka uses replication, leader election, committed offsets, durable logs, and
client retry behavior to tolerate failures.

Important mechanisms:

- partition replicas across brokers
- in-sync replica tracking
- leader election after broker failure
- durable append-only logs on disk
- producer acknowledgements
- consumer offset commits
- client metadata refresh and retries

Example production setup:

```txt
replication.factor=3
min.insync.replicas=2
producer acks=all
```

Tradeoff:

Stronger durability can reduce availability during partial outages. If too
few replicas are in sync, Kafka should reject writes instead of pretending the
write is safe.

## 43. Kafka vs RabbitMQ?

Kafka and RabbitMQ solve different messaging problems.

| Feature | Kafka | RabbitMQ |
| --- | --- | --- |
| Core model | Distributed event log | Message broker with queues |
| Retention | Stores events after consumption | Usually removes messages after ack |
| Throughput | Very high with batching and partitions | Strong for routing and work queues |
| Ordering | Within a partition | Within a queue |
| Replay | Natural through offsets | Not the default workflow |
| Routing | Topic and partition based | Rich exchange and routing patterns |
| Common use | Event streaming, logs, data pipelines | Task queues, request buffering, routing |

Interview phrasing:

> I choose Kafka when I need durable event streams, replay, high throughput,
> and multiple independent consumers. I choose RabbitMQ when I need traditional
> queue semantics, flexible routing, and per-message work distribution.

## 44. Kafka vs REST API?

REST and Kafka are communication styles for different needs.

REST is synchronous request-response:

```txt
Client -> API -> immediate response
```

Kafka is asynchronous event streaming:

```txt
Producer -> topic -> consumers process later
```

Use REST when:

- the caller needs an immediate answer
- the workflow is simple and synchronous
- the operation must be validated before returning

Use Kafka when:

- producers and consumers should be decoupled
- processing can happen asynchronously
- multiple services need the same event
- replay and auditability matter
- traffic spikes should be buffered

Tradeoff:

Kafka does not replace REST. Many systems use REST for commands and queries,
then publish Kafka events for downstream processing.

## 45. Why Is Kafka Faster Than Traditional Messaging Systems?

Kafka is optimized for high-throughput streaming workloads, but it is not
universally faster for every messaging use case.

Reasons Kafka can achieve high throughput:

- append-only partition logs
- sequential disk I/O
- OS page cache usage
- producer batching
- compression
- zero-copy transfer paths
- partition-level parallelism
- consumer pull model

Example:

Instead of sending one network request for every event, a producer can batch
many records for the same partition and send them together.

Tradeoff:

Low-latency command workflows, complex routing, and per-message priority queues
may fit a traditional broker or direct API better.

## 46. What Is Log Compaction?

Log compaction is a Kafka cleanup policy that keeps the latest record for each
key instead of only deleting records by age or size.

Example:

```txt
key=user-1 value=email=a@example.com
key=user-1 value=email=b@example.com
key=user-2 value=email=c@example.com

After compaction, Kafka can retain:
key=user-1 value=email=b@example.com
key=user-2 value=email=c@example.com
```

It is useful for state-like topics, such as account profile snapshots,
configuration, changelogs, or compacted Kafka Streams state topics.

Important detail:

A null value is a tombstone. It marks a key for deletion during compaction.

## 47. What Is The Difference Between Retention Policy And Log Compaction?

Retention policy decides how long or how much data Kafka keeps. Log compaction
decides which records to keep by key.

| Policy | Keeps | Removes | Best for |
| --- | --- | --- | --- |
| Delete retention | Records within time or size limits | Old segments | Event history |
| Log compaction | Latest value for each key | Older values for same key | Current state |

Example:

Use delete retention for `click-events` because every click is a historical
fact. Use compaction for `user-profile-updated` if consumers mostly need the
latest profile state per user.

Tradeoff:

Compaction does not guarantee only one record per key at every instant. It is
a background cleanup process.

## 48. What Is The Difference Between Topic And Partition?

A topic is the logical stream name. A partition is a physical ordered shard of
that topic.

| Concept | Topic | Partition |
| --- | --- | --- |
| Meaning | Named event stream | Ordered log shard |
| Scope | Business or application level | Storage and parallelism level |
| Identified by | Topic name | Topic name plus partition number |
| Ordering | Not global across all partitions | Guaranteed within the partition |
| Scaling role | Organizes events | Enables parallel reads and writes |

Example:

```txt
Topic: order-events
Partitions: order-events-0, order-events-1, order-events-2
```

Strong answer:

> A topic is what producers and consumers talk about. A partition is how Kafka
> splits that topic for ordering, storage, and scale.

## 49. How Does Kafka Guarantee Message Ordering?

Kafka guarantees ordering only within a single partition. Consumers of the
same partition read records in the order Kafka appended them.

To preserve ordering for related records:

- use the same message key
- keep related events in the same topic when appropriate
- process records sequentially per partition
- avoid unordered async side effects inside the consumer
- keep producer idempotence enabled when using retries

Example:

```txt
key=order-1001 -> partition 2

offset 10: OrderCreated
offset 11: PaymentAuthorized
offset 12: InventoryReserved
```

Tradeoff:

Global ordering across a large topic requires one partition, which limits
parallelism. Most systems choose per-entity ordering instead.

## 50. Why Are Partitions Used?

Partitions are used to scale Kafka storage and processing while preserving
ordering within each shard.

They provide:

- horizontal writes across brokers
- horizontal reads across consumers
- larger topic capacity
- fault tolerance through replicated partition copies
- per-key ordering when keys are chosen well
- independent retention and offset progress per partition

Example:

```txt
One partition -> one active consumer in a group
Twelve partitions -> up to twelve active consumers in a group
```

Tradeoff:

More partitions are not free. They increase file handles, metadata, recovery
work, leader election work, and operational planning. Pick enough partitions
for expected throughput and future growth, but avoid creating excessive
partitions without a reason.

## 51. How Does KRaft Change Kafka Operations?

KRaft is Kafka's built-in metadata quorum. It replaces the older ZooKeeper-based
metadata model with Kafka controllers that manage metadata and leader election.

What changes operationally:

- no separate ZooKeeper ensemble
- controllers manage cluster metadata
- metadata is replicated through a quorum
- broker and controller roles must be planned
- controller quorum health becomes critical

Why it matters:

Older Kafka interview answers often assume ZooKeeper. Modern Kafka operations
should explain KRaft because it changes setup, upgrades, failure recovery, and
how cluster metadata is managed.

Tradeoff:

KRaft reduces the number of distributed systems you operate, but controller
quorum design still matters. Losing metadata quorum can affect cluster
availability.

Strong answer:

> KRaft removes the ZooKeeper dependency. Kafka controllers now manage metadata
> through a quorum, so I monitor controller health, broker leadership, metadata
> propagation, and quorum availability as part of production operations.

## 52. What Are Kafka Transactions?

Kafka transactions let a producer write multiple records, and optionally
consumer offsets, atomically.

They are useful for consume-process-produce pipelines:

```txt
read input records
start producer transaction
produce output records
send consumed offsets to transaction
commit transaction
```

Why it matters:

Without transactions, a processor can produce output and crash before committing
input offsets, or commit offsets and crash before producing output.

Tradeoff:

Kafka transactions improve correctness for Kafka-to-Kafka workflows, but they
add coordination, latency, producer fencing rules, and operational complexity.
They do not automatically make external databases or APIs exactly once.

## 53. What Is `read_committed` In Kafka?

`read_committed` is a consumer isolation level. It hides records from aborted
transactions and waits for transactional outcome where needed.

Use it when:

- consuming from topics written by transactional producers
- building exactly-once Kafka processing
- avoiding aborted records in downstream processors

Tradeoff:

`read_committed` can add latency because consumers must respect transaction
boundaries. For non-transactional topics, it may not add value.

Strong answer:

> If producers use Kafka transactions, downstream consumers that need committed
> results should use `read_committed`; otherwise they may observe records from
> aborted transactions.

## 54. How Would You Build Exactly-Once Processing With Kafka?

For Kafka-to-Kafka processing, exactly-once behavior requires cooperation
between the consumer, producer, transactions, and offset commits.

Design shape:

```txt
consumer reads records from input topic
producer begins transaction
processor writes output records
producer sends consumed offsets into the transaction
producer commits transaction
consumer continues
```

Important details:

- use a stable `transactional.id`
- use idempotent producer behavior
- use `read_committed` for downstream consumers
- keep processing bounded inside transaction timeout
- use one transactional producer per processing task or consumer instance
- handle producer fencing correctly

Tradeoff:

Kafka can make Kafka input offsets and Kafka output records atomic. If the
processor also writes to a database or calls an external API, that external
side effect still needs idempotency or a separate transaction strategy.

## 55. What Is Kafka Connect?

Kafka Connect is Kafka's framework for moving data between Kafka and external
systems using source and sink connectors.

Examples:

- database changes into Kafka
- Kafka events into object storage
- Kafka events into search indexes
- SaaS data into Kafka
- Kafka events into analytics systems

Why it matters:

Connect standardizes connector workers, configuration, offsets, status,
scaling, and error handling instead of every team writing custom ingestion
services.

Tradeoff:

Connect reduces integration boilerplate, but connector quality matters.
Exactly-once behavior depends on connector support and the external system.

## 56. What Is CDC With Kafka?

Change data capture streams database changes into Kafka. Instead of an
application publishing every event manually, a CDC connector reads database log
changes and emits events.

Example:

```txt
orders table update
  -> database transaction log
  -> CDC connector
  -> Kafka topic: db.orders
```

Why it matters:

CDC is useful for analytics, search indexing, cache updates, and migrating from
monoliths to event-driven systems.

Tradeoff:

CDC events reflect database changes, not always business intent. A row update
does not necessarily say why the business event happened.

## 57. What Is The Outbox Pattern With Kafka?

The outbox pattern stores business changes and outgoing events in the same
database transaction. A publisher or CDC connector later moves those outbox
events to Kafka.

Flow:

```txt
API transaction:
  update order status
  insert outbox event OrderPaid

publisher:
  read outbox event
  publish to Kafka
  mark sent or rely on CDC offset
```

Why it matters:

It prevents the common failure where the database update succeeds but the Kafka
publish fails.

Tradeoff:

The outbox adds schema, publishing, cleanup, and deduplication work, but it is a
practical way to bridge database transactions with Kafka events.

## 58. What Is Kafka Streams?

Kafka Streams is a client library for building stream processing applications
on top of Kafka.

It supports:

- stateless transformations
- joins
- aggregations
- windowing
- state stores
- changelog topics
- exactly-once processing options

Why it matters:

Kafka Streams lets applications process events continuously without deploying a
separate stream processing cluster.

Tradeoff:

Kafka Streams is powerful for Kafka-native processing, but it still requires
careful partitioning, state store sizing, rebalance handling, and operational
monitoring.

## 59. What Is Stream-Table Duality?

Stream-table duality means a stream of changes can be viewed as a table, and a
table can be represented as a stream of changes.

Example:

```txt
customer-updates stream:
  customer-1 -> name changed
  customer-2 -> address changed
  customer-1 -> plan changed

latest customer table:
  customer-1 -> latest state
  customer-2 -> latest state
```

Why it matters:

Kafka log compaction and Kafka Streams state stores rely on this idea. A
compacted topic can keep the latest value per key, which acts like a durable
table changelog.

Tradeoff:

Not every topic should be compacted. Event history and latest-state topics have
different retention and audit requirements.

## 60. How Do You Handle Schema Evolution In Kafka?

Schema evolution is how producers and consumers change event contracts without
breaking each other.

Good rules:

- use explicit event names and versions
- add optional fields before making fields required
- avoid changing field meaning silently
- avoid removing fields until consumers are migrated
- test backward and forward compatibility
- keep event contracts documented

Why it matters:

Kafka decouples producers and consumers in time. A consumer may process events
written by an older producer or read old retained events during replay.

Tradeoff:

Strict schema governance slows casual changes, but it prevents production
consumers from breaking during independent service deployments.

## 61. What Is Tiered Storage In Kafka?

Tiered storage moves older completed log segments from broker-local disks to
remote storage such as object storage.

Why it matters:

Kafka data is usually read from the tail. Older data is often read only for
backfills, reprocessing, or recovery. Tiered storage can reduce local disk
pressure while preserving longer retention.

Tradeoff:

Tiered storage changes the read path for older data. You must plan remote
storage reliability, permissions, cost, latency, and operational monitoring.

## 62. How Do You Secure Kafka?

Kafka security usually includes encryption, authentication, authorization, and
operational boundaries.

Important controls:

- TLS for network encryption
- SASL or mutual TLS for authentication
- ACLs for topic, group, transactional id, and cluster operations
- network isolation
- quotas for multi-tenant protection
- secret rotation
- audit logs and broker monitoring

Tradeoff:

Security adds configuration complexity, especially across brokers, clients,
Connect, Streams, and monitoring tools. Production Kafka should not rely on a
trusted network alone.

## 63. What Kafka Metrics Matter In Production?

Kafka monitoring should cover brokers, topics, producers, consumers, and
controllers.

Useful signals:

- consumer lag
- under-replicated partitions
- offline partitions
- ISR shrink and expand rate
- leader election rate
- request latency
- produce and fetch throughput
- broker disk usage
- controller quorum health
- rebalance frequency
- failed produce or consume requests

Debugging examples:

| Symptom | Likely cause |
| --- | --- |
| rising consumer lag | slow consumers, hot partitions, downstream bottleneck |
| under-replicated partitions | broker failure, disk pressure, network issue |
| frequent rebalances | unstable consumers, timeouts, bad deploy pattern |
| hot partition | poor key choice or skewed workload |

## 64. How Would You Design Multi-Tenant Kafka?

Multi-tenant Kafka requires boundaries around naming, permissions, quotas, and
observability.

Design checklist:

- topic naming per tenant or domain
- ACLs for producers and consumers
- consumer group naming rules
- quotas for producers and consumers
- limits for partitions and retention
- schema ownership
- monitoring by tenant or service
- incident playbooks for noisy neighbors

Tradeoff:

One shared Kafka cluster can reduce operational cost, but noisy tenants can
affect each other. Strong quotas and ownership rules are required.

## 65. Kafka vs RabbitMQ vs MQTT?

Kafka, RabbitMQ, and MQTT are related, but they optimize for different
problems.

| Tool | Best fit | Core model |
| --- | --- | --- |
| Kafka | replayable event streams and analytics | distributed append log |
| RabbitMQ | task queues and flexible routing | exchanges, queues, bindings |
| MQTT | lightweight device messaging | brokered pub-sub protocol |

Use Kafka when you need retention, replay, high-throughput streams, and many
independent consumers.

Use RabbitMQ when you need work queues, routing, retries, and per-message
acknowledgement.

Use MQTT when you need lightweight messaging for devices, mobile clients,
unreliable networks, retained state, and last-will presence.

Strong answer:

> I do not treat all brokers as interchangeable. Kafka is an event log,
> RabbitMQ is a work-queue and routing broker, and MQTT is a lightweight pub-sub
> protocol for connected devices.

## Sources Used

- <https://kafka.apache.org/43/getting-started/introduction/>
- <https://kafka.apache.org/43/getting-started/zk2kraft/>
- <https://kafka.apache.org/43/configuration/producer-configs/>
- <https://kafka.apache.org/43/configuration/consumer-configs/>
- <https://kafka.apache.org/43/operations/consumer-rebalance-protocol/>
- <https://kafka.apache.org/43/configuration/topic-configs/>
- <https://kafka.apache.org/43/design/design/>
- <https://kafka.apache.org/43/operations/tiered-storage/>
- <https://kafka.apache.org/43/kafka-connect/>
- <https://kafka.apache.org/43/streams/>
- <https://kafka.apache.org/43/security/>
- <https://docs.spring.io/spring-kafka/reference/kafka/annotation-error-handling.html>
- <https://docs.spring.io/spring-kafka/reference/kafka/transactions.html>
