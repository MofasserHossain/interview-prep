# System Design And Microservices Interview Guide

System design guidance covering scalability, service boundaries, data
ownership, distributed communication, reliability, and tradeoffs.

## 1. How Do You Approach A System Design Interview?

Start by clarifying requirements before drawing architecture.

Good flow:

1. Clarify functional requirements.
2. Clarify non-functional requirements.
3. Estimate scale.
4. Define APIs and data models.
5. Design high-level architecture.
6. Discuss bottlenecks, tradeoffs, and failure cases.

Example:

```txt
Requirement: Design a notification system.

Clarify:
- email, SMS, push, or in-app?
- real-time or delayed?
- user preferences?
- retry rules?
- expected volume?
```

Strong answer:

> I do not start with technology. I first clarify what the system must do,
> expected traffic, consistency needs, latency goals, and failure tolerance.
> Then I design APIs, storage, services, queues, caching, and observability.

## 2. How Do You Decide Service Boundaries In Microservices?

Split services by business capability, not by technical layer.

Good boundaries:

- user service
- billing service
- notification service
- inventory service
- order service

Bad boundaries:

```txt
Controller service
Database service
Validation service
```

Each service should own its data and business rules.

Tradeoff:

> Microservices help independent scaling and team ownership, but they add
> network failure, deployment complexity, distributed tracing, and data
> consistency problems.

## 3. Monolith vs Microservices

A monolith keeps the application in one deployable unit. It is easier to build,
test, debug, and deploy early.

Microservices split a system into independently deployable services.

Use a monolith when:

- the product is early
- the team is small
- domain boundaries are unclear
- deployment independence is not needed

Use microservices when:

- teams need independent ownership
- parts of the system scale differently
- releases must be independent
- domain boundaries are stable

Strong answer:

> I would usually start with a modular monolith and extract services only when
> team ownership, scaling, or deployment independence becomes a real need.

## 4. How Do Services Communicate?

Common communication styles:

- synchronous HTTP or gRPC
- asynchronous queues
- event streaming
- pub/sub

Example:

```txt
Order API
  -> saves order
  -> publishes OrderCreated event
  -> notification worker sends email
  -> inventory worker reserves stock
```

Synchronous calls are simple but can create tight coupling. Asynchronous
events improve resilience but introduce eventual consistency.

## 5. What Is Eventual Consistency?

Eventual consistency means different parts of the system may temporarily show
different data, but they should become consistent later.

Example:

```txt
User updates profile photo.
Region A shows new photo immediately.
Region B shows old photo for a few seconds.
Replication completes.
Both regions show the new photo.
```

Use eventual consistency when availability and latency matter more than
immediate consistency.

Avoid it when correctness must be immediate, such as money movement or
inventory reservations without safeguards.

## 6. How Do You Make Distributed Systems Reliable?

Use defensive patterns:

- timeouts
- retries with exponential backoff
- circuit breakers
- idempotency keys
- queues
- dead-letter queues
- health checks
- graceful degradation
- observability

Example:

```txt
Payment request times out.
Client retries with same idempotency key.
Backend returns same payment result instead of charging twice.
```

Strong answer:

> In distributed systems, failure is normal. I design calls with timeouts,
> retries, idempotency, circuit breakers, monitoring, and fallback behavior.
