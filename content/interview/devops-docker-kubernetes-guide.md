# DevOps, Docker, And Kubernetes Interview Guide

DevOps interview guidance covering containers, images, orchestration,
deployments, CI/CD, observability, and production operations.

## 1. What Is DevOps?

DevOps is a way of working that connects development and operations so teams
can ship reliable software faster.

It includes:

- CI/CD
- infrastructure automation
- monitoring and alerting
- incident response
- deployment safety
- collaboration between developers and operators

Strong answer:

> DevOps is not just tools. It is a culture and engineering practice for
> building, deploying, monitoring, and improving software continuously.

## 2. What Is Docker?

Docker packages an application with its runtime, dependencies, and environment
configuration into an image. A running instance of that image is a container.

Example Dockerfile:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

Benefits:

- consistent environments
- easier deployment
- isolated dependencies
- repeatable builds

## 3. Image vs Container

An image is a read-only template. A container is a running process created
from an image.

Example:

```txt
Image: interview-prep-app:1.0
Container: running instance on port 3000
```

Interview answer:

> An image is like a packaged application artifact. A container is the running
> instance of that artifact.

## 4. What Is Kubernetes?

Kubernetes is a container orchestration platform. It schedules and manages
containers across a cluster of machines.

It provides:

- deployments
- service discovery
- autoscaling
- rolling updates
- self-healing
- config and secret management

Example:

```txt
Deployment -> creates ReplicaSets -> manages Pods
Service -> stable network endpoint for Pods
Ingress -> routes external traffic
```

## 5. What Is A Rolling Deployment?

A rolling deployment replaces old app instances with new ones gradually.

Example:

```txt
10 old pods running
2 new pods start
2 old pods stop
repeat until all pods are new
```

Benefits:

- avoids full downtime
- allows health checks during rollout
- can stop rollout if new version fails

Tradeoff:

> The old and new app versions may run at the same time, so APIs and database
> migrations must be backward-compatible.

## 6. What Should A CI/CD Pipeline Do?

A healthy CI/CD pipeline should catch problems before production.

Typical flow:

```txt
push code
  -> install dependencies
  -> lint
  -> typecheck
  -> test
  -> build
  -> deploy to staging
  -> smoke test
  -> deploy to production
```

Use secrets through a secret manager or CI environment variables. Do not
commit secrets to the repository.
