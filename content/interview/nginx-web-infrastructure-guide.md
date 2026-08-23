# Nginx And Web Infrastructure Interview Guide

Nginx interview guidance covering reverse proxies, routing, TLS termination,
load balancing, static assets, compression, and production web infrastructure.

## 1. What Is Nginx?

Nginx is a high-performance web server and reverse proxy.

It can be used for:

- serving static files
- reverse proxying to app servers
- TLS termination
- load balancing
- compression
- caching
- routing multiple domains

Example:

```txt
Browser -> Nginx -> Node.js app
```

## 2. What Is A Reverse Proxy?

A reverse proxy sits in front of backend services and forwards client requests
to the correct service.

Example:

```nginx
location /api/ {
  proxy_pass http://backend:3000;
}
```

Benefits:

- hides internal services
- centralizes TLS
- handles routing
- can add caching and compression
- supports load balancing

## 3. What Is TLS Termination?

TLS termination means Nginx handles HTTPS encryption and forwards traffic to
internal services.

Example:

```txt
Client HTTPS -> Nginx decrypts -> App receives HTTP inside private network
```

This simplifies app servers because they do not need to manage certificates.

Security note:

> Internal traffic should still be protected if the network is not trusted.

## 4. How Does Nginx Load Balancing Work?

Nginx can distribute traffic across multiple backend servers.

Example:

```nginx
upstream app_servers {
  server app1:3000;
  server app2:3000;
}

server {
  location / {
    proxy_pass http://app_servers;
  }
}
```

Common algorithms:

- round robin
- least connections
- IP hash
- weighted routing

## 5. How Do You Serve Static Assets Efficiently?

Static assets should be cached and compressed.

Use:

- long cache headers for hashed files
- gzip or Brotli compression
- CDN for global delivery
- correct content types

Example:

```nginx
location /assets/ {
  expires 1y;
  add_header Cache-Control "public, immutable";
}
```

Do not use long cache lifetimes for files that can change without a filename
hash.
