# AWS SaaS And Observability Interview Guide

Job-focused AWS, SaaS, deployment, Docker/Kubernetes, CI/CD, monitoring,
alerting, SLI/SLO, and production troubleshooting guide.

## 1. What AWS architecture should you understand for this role?

A practical AWS-hosted SaaS architecture:

```txt
Users
  -> Route 53
  -> CloudFront
  -> S3 frontend assets or ALB
  -> ECS/EKS application services
  -> RDS MySQL/PostgreSQL
  -> ElastiCache Redis
  -> SQS/SNS or broker layer
  -> CloudWatch logs, metrics, alarms
  -> Secrets Manager / Parameter Store
```

What each part does:

| Area | Example service | Purpose |
| --- | --- | --- |
| DNS/CDN | Route 53, CloudFront | Routing, TLS, caching static assets. |
| Compute | ECS/Fargate, EKS, Lambda | Runs APIs and workers. |
| Database | RDS | Managed relational database. |
| Cache | ElastiCache Redis | Cache, sessions, rate limits, queues. |
| Async | SQS/SNS/MSK or broker | Background work and event processing. |
| Operations | CloudWatch | Logs, metrics, alarms, dashboards. |
| Secrets | Secrets Manager | Credentials and sensitive config. |

Strong answer:

> I think about AWS as managed building blocks: compute, data, network,
> security, deployment, and observability. The design should match the product
> scale and operational maturity.

## 2. ECS, EKS, or Lambda: how do you choose?

| Option | Best for | Tradeoff |
| --- | --- | --- |
| ECS/Fargate | Containerized services with simpler operations than Kubernetes. | Less Kubernetes ecosystem control. |
| EKS | Teams already invested in Kubernetes and platform tooling. | More operational complexity. |
| Lambda | Event-driven or bursty functions with short execution. | Cold starts, runtime limits, and state constraints. |

For the job posts:

```txt
React frontend
  -> API services on ECS/EKS
  -> worker services for queue consumers
  -> RDS MySQL/PostgreSQL
  -> Redis for cache/sessions/rate limits
```

Strong answer:

> If the team already runs Kubernetes, I can work within that model. If choosing
> from scratch for a SaaS API, ECS/Fargate may be simpler unless we need the
> Kubernetes ecosystem.

## 3. How do Docker and Kubernetes fit into AWS SaaS deployment?

Docker creates the deployable artifact.

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
CMD ["node", "dist/server.js"]
```

Kubernetes or ECS runs that artifact.

Runtime expectations:

| Concern | Practice |
| --- | --- |
| Health | `/health` and readiness checks. |
| Config | Environment variables and secrets. |
| Scaling | CPU/memory/custom metrics. |
| Rollout | Rolling update and rollback. |
| Shutdown | Graceful stop for HTTP and workers. |
| Logs | Write structured logs to stdout/stderr. |

Strong answer:

> Containers make builds repeatable. Orchestration makes runtime behavior
> manageable: scaling, service discovery, health checks, rollout, and recovery.

## 4. What should a CI/CD pipeline do for this role?

A healthy pipeline protects production.

```txt
pull request
  -> install
  -> format/lint
  -> typecheck
  -> unit tests
  -> integration tests
  -> build Docker image
  -> scan image/dependencies
  -> deploy staging
  -> run smoke tests
  -> deploy production
```

Good senior details:

| Practice | Why it matters |
| --- | --- |
| Immutable image tags | Know exactly what is deployed. |
| Database migration gate | Avoid breaking old/new app versions. |
| Rollback plan | Reduce incident duration. |
| Secrets outside repo | Prevent credential leaks. |
| Smoke tests | Catch failed deployments quickly. |

Strong answer:

> CI/CD is not only automation. It is a safety system that catches defects,
> builds repeatable artifacts, and makes deployments observable and reversible.

## 5. What are logs, metrics, and traces?

Observability needs all three.

| Signal | Example | Use |
| --- | --- | --- |
| Logs | `requestId`, user ID, error stack | Debug a specific event. |
| Metrics | request count, p95 latency, error rate | Track health over time. |
| Traces | API -> service -> database spans | Find where latency happens. |

Structured log example:

```json
{
  "level": "error",
  "requestId": "req_123",
  "route": "POST /work-orders",
  "userId": "user_42",
  "message": "Failed to create work order",
  "durationMs": 1840
}
```

Strong answer:

> Logs explain individual events, metrics show trends, and traces connect work
> across services. For microservices, traces and correlation IDs become
> especially important.

## 6. What are SLI, SLO, SLA, and error budget?

| Term | Meaning |
| --- | --- |
| SLI | Actual measurement of service behavior. |
| SLO | Target for that measurement. |
| SLA | External/customer agreement, often with business consequences. |
| Error budget | Allowed unreliability before the SLO is violated. |

Example:

```txt
SLI: successful valid API requests / total valid API requests
SLO: 99.9% success over 30 days
Error budget: 0.1% failed valid requests over 30 days
```

Another SLI:

```txt
SLI: p95 latency for GET /work-orders
SLO: p95 below 300ms for 99% of 10-minute windows
```

Strong answer:

> SLOs make reliability measurable. They help decide whether to focus on new
> features, reliability work, or incident response based on user impact.

## 7. How should alerts be designed?

Avoid alerting on every noisy metric.

Good alerts:

- are actionable
- represent user impact
- include runbook links
- include service, route, environment, and recent change context
- avoid waking people for symptoms that recover automatically

Alert examples:

| Alert | Quality |
| --- | --- |
| CPU > 80% for 5 minutes | Useful signal, but may not be user impact. |
| API 5xx error budget burn too high | Better user-impact alert. |
| Queue age > 10 minutes | Good for async workflow health. |
| p95 latency above SLO | Good if tied to route/user impact. |

Strong answer:

> I want alerts that point to a meaningful action. Dashboards can show many
> metrics, but pages should be tied to user impact and SLO burn.

## 8. How do you troubleshoot an AWS production issue?

Use a timeline and narrow the blast radius.

```txt
1. What changed recently?
2. Which users/routes/services are affected?
3. Is it error rate, latency, saturation, or data correctness?
4. Check dashboards and logs by requestId/correlationId.
5. Compare current deployment to previous known-good version.
6. Roll back or mitigate if user impact is high.
7. Write follow-up actions after the incident.
```

Example investigation:

```txt
Symptom: POST /work-orders p95 latency increased.
Check:
  - API route metrics
  - RDS CPU and slow query log
  - Redis hit ratio
  - external API timings
  - queue backlog
  - pod restarts
```

Strong answer:

> During an incident, I separate mitigation from root cause analysis. First
> reduce customer impact, then investigate deeply and add prevention.

## 9. How do you make a SaaS backend secure on AWS?

Security should be layered.

| Layer | Practice |
| --- | --- |
| IAM | Least privilege roles for services. |
| Secrets | Store credentials in a secret manager. |
| Network | Private subnets for databases where possible. |
| API | Auth, authorization, validation, rate limits. |
| Data | Encryption at rest and in transit. |
| Audit | Log sensitive administrative/business actions. |
| CI/CD | Scan dependencies and images. |

Example:

```txt
API task role can read one secret and write logs.
API cannot directly access unrelated buckets or admin-only resources.
Database is not public.
```

Strong answer:

> Security is not one middleware. It includes IAM, network boundaries, secrets,
> API authorization, database permissions, audit logs, and deployment hygiene.

## 10. What should you know about SaaS multi-tenancy?

Multi-tenancy means one platform serves multiple customer organizations.

Common models:

| Model | Description | Tradeoff |
| --- | --- | --- |
| Shared database, tenant column | Every tenant row has `tenant_id`. | Cost-effective but requires careful isolation. |
| Separate schema | Tenant data separated by schema. | More isolation, more operational work. |
| Separate database | Stronger isolation for enterprise tenants. | Higher cost and complexity. |

Important controls:

- tenant ID on every tenant-owned row
- authorization always scoped by tenant
- unique constraints include tenant where needed
- audit logs include tenant/user/action
- background jobs preserve tenant context

Example:

```sql
CREATE UNIQUE INDEX idx_users_tenant_email
ON users (tenant_id, email);
```

Strong answer:

> In SaaS, tenant isolation is a correctness and security requirement. I make
> tenant scope explicit in API authorization, database queries, unique
> constraints, logs, and background jobs.

## Sources Used

- <https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/welcome.html>
- <https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/operational-excellence.html>
- <https://aws.amazon.com/architecture/well-architected/>
- <https://sre.google/sre-book/service-level-objectives/>
- <https://sre.google/workbook/implementing-slos/>
- <https://sre.google/workbook/alerting-on-slos/>
