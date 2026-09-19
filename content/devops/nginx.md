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

## 6. How Is An Nginx Config File Structured?

Nginx configuration is a tree of **contexts**. A directive is only valid in certain
contexts, and settings are inherited downward unless overridden.

```nginx
# main context — worker processes, user, error log
user  nginx;
worker_processes  auto;

events {                      # connection handling
  worker_connections  1024;
}

http {                        # everything HTTP
  include       mime.types;
  default_type  application/octet-stream;
  sendfile      on;
  keepalive_timeout  65;

  server {                    # one virtual host
    listen       443 ssl;
    server_name  api.example.com;

    location /api/ {          # one URL path rule
      proxy_pass http://backend;
    }
  }
}
```

Mental model:

```viz
type: stack
title: Config contexts, outermost first
main :: process-level — user, worker_processes, pid, error_log
events :: how workers accept connections
http :: all HTTP settings, shared defaults, upstreams
server :: one virtual host — a domain and a port
location :: one URL pattern within that host
```

Important:

Inheritance goes **down** only, and a directive set in a child completely replaces the
parent's value rather than merging with it. That is the source of the `add_header`
trap in question 18.

On most systems the entry point is `/etc/nginx/nginx.conf`, which `include`s
`/etc/nginx/conf.d/*.conf` or `sites-enabled/*`. Put one site per file there rather
than editing the main file.

## 7. How Does Nginx Choose Which server Block Handles A Request?

By `listen` address and port first, then by matching the request's `Host` header
against `server_name`.

```nginx
server {
  listen 80 default_server;      # fallback when nothing else matches
  server_name _;
  return 444;                    # close the connection on unknown hosts
}

server {
  listen 80;
  server_name example.com www.example.com;
}

server {
  listen 80;
  server_name *.example.com;     # wildcard
}
```

Priority order:

```viz
type: queues
title: server_name matching, highest priority first
Exact name :: example.com
Leading wildcard :: *.example.com
Trailing wildcard :: example.*
Regular expression :: ~^(www|api)\.example\.com$
default_server :: the fallback if nothing matched
```

Why it matters:

Without an explicit `default_server` that rejects unknown hosts, the first defined
server block becomes the default — so scanners hitting your IP directly get served
whichever site happens to be first in the config.

Interview trap:

`return 444` is an Nginx-specific non-standard code meaning "close the connection with
no response at all". It is the cheapest way to drop bot traffic aimed at your raw IP.

## 8. How Does location Matching Work?

This is the most-asked Nginx question, because the order is not top-to-bottom.

```nginx
location = /health      { return 200 "ok"; }     # 1. exact
location ^~ /assets/    { root /var/www; }       # 2. prefix, stops regex checking
location ~* \.(jpg|png)$ { expires 30d; }        # 3. regex, case-insensitive
location /api/          { proxy_pass http://backend; }  # 4. longest prefix
location /              { proxy_pass http://frontend; } # fallback
```

The algorithm Nginx actually runs:

```viz
type: flow
title: How a location is selected
Exact match (=) :: if one matches, use it and stop immediately
Find longest prefix :: remember the longest matching prefix location
Prefix had ^~ :: if so, use it and skip regex entirely
Check regexes in order :: FIRST regex that matches wins — file order matters
No regex matched :: fall back to the remembered longest prefix
```

Key reasoning:

Prefix locations are evaluated by **length**, so config order does not matter for
them. Regex locations are evaluated by **file order**, so order matters completely.
Mixing the two without knowing this is why "my rule is being ignored" happens.

Example of the trap:

```nginx
location /assets/ { expires 1y; }        # longest prefix
location ~* \.js$ { add_header X-Debug 1; }  # but this regex wins for /assets/app.js
```

Fix:

```nginx
location ^~ /assets/ { expires 1y; }     # ^~ stops regex evaluation
```

Interview answer:

"Exact, then `^~` prefix, then regex in file order, then longest prefix. The practical
rule is: use `=` for hot single paths like `/health`, and `^~` when a prefix must win
over a regex."

## 9. What Is The proxy_pass Trailing Slash Trap?

One character changes what path the backend receives. This breaks more deployments
than any other Nginx detail.

```nginx
# NO trailing slash: the full original URI is passed through.
location /api/ {
  proxy_pass http://backend;      # /api/users -> backend receives /api/users
}

# WITH trailing slash: the matched prefix is REPLACED by that URI.
location /api/ {
  proxy_pass http://backend/;     # /api/users -> backend receives /users
}
```

The rule:

If `proxy_pass` contains a URI part (anything after the host, including a bare `/`),
Nginx replaces the matched `location` prefix with it. If it contains no URI, the
request URI is passed unchanged.

```nginx
location /api/ {
  proxy_pass http://backend/v2/;  # /api/users -> backend receives /v2/users
}
```

Symptom:

Every proxied route returns 404 from the application, while Nginx itself reports 200
in the access log for the *proxy*. The app is receiving `/api/users` when its routes
are mounted at `/users`, or the reverse.

Important:

When `location` uses a regex, `proxy_pass` **cannot** contain a URI part — Nginx
refuses to start. Use `rewrite` for that case.

## 10. Which Headers Must You Forward When Proxying?

By default the backend loses the client's identity, protocol, and hostname. Restore
them explicitly.

```nginx
location / {
  proxy_pass http://backend;

  proxy_set_header Host              $host;
  proxy_set_header X-Real-IP         $remote_addr;
  proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Host  $host;
}
```

What each one fixes:

| Header | Without it |
| --- | --- |
| `Host` | the app sees the upstream name; redirects and multi-tenant routing break |
| `X-Real-IP` | every request appears to come from the proxy |
| `X-Forwarded-For` | rate limiting and audit logs record the proxy's IP |
| `X-Forwarded-Proto` | the app thinks it is HTTP; `Secure` cookies are never set |

Why it matters:

This pairs directly with `app.set("trust proxy", 1)` in Express. The proxy must send
the headers **and** the application must be told to trust them — either half alone
does nothing.

Interview trap:

`$proxy_add_x_forwarded_for` appends the client IP to any existing
`X-Forwarded-For`, which means a client can pre-populate the header and inject a fake
IP at the front. If the application takes the first entry, it is trusting attacker
input. Take the entry closest to the proxy, or use `$remote_addr` via `X-Real-IP`.

## 11. How Do You Proxy WebSockets?

WebSockets begin as an HTTP request asking to switch protocols. Nginx will not forward
that upgrade unless you tell it to.

```nginx
# In the http context:
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}

location /socket.io/ {
  proxy_pass http://backend;

  proxy_http_version 1.1;                          # required — 1.0 cannot upgrade
  proxy_set_header Upgrade    $http_upgrade;
  proxy_set_header Connection $connection_upgrade;
  proxy_set_header Host       $host;

  proxy_read_timeout 3600s;                        # idle sockets must not be killed
  proxy_send_timeout 3600s;
}
```

Symptom:

The client connects, then disconnects after exactly 60 seconds, repeatedly. That is
`proxy_read_timeout` (default 60s) closing an idle WebSocket. Either raise it or send
application-level pings.

Important:

The `map` block exists because sending `Connection: upgrade` unconditionally breaks
ordinary HTTP requests through the same block. The map sends `upgrade` only when the
client actually asked for it.

Same applies to SSE:

```nginx
location /events {
  proxy_pass http://backend;
  proxy_buffering off;            # without this, nothing is delivered until flush
  proxy_cache off;
  proxy_read_timeout 3600s;
}
```

## 12. How Do You Configure TLS Properly?

```nginx
server {
  listen 443 ssl;
  http2 on;
  server_name example.com;

  ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

  ssl_protocols       TLSv1.2 TLSv1.3;     # nothing older
  ssl_prefer_server_ciphers off;            # TLS 1.3 clients choose better
  ssl_session_cache   shared:SSL:10m;       # resumption — skips a round trip
  ssl_session_timeout 1d;
  ssl_stapling on;                          # OCSP stapling, faster validation

  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}

# Redirect all plain HTTP to HTTPS.
server {
  listen 80;
  server_name example.com;
  return 301 https://$host$request_uri;
}
```

Important:

`fullchain.pem` — not `cert.pem`. The full chain includes the intermediate
certificate. Serving only the leaf works in browsers that cached the intermediate
elsewhere and fails in `curl`, Java, and mobile clients. This is the single most
common TLS misconfiguration.

Why session cache matters:

`ssl_session_cache` lets returning clients resume without a full handshake, removing
a round trip from every reconnection. On a mobile-heavy site that is a visible latency
win.

Interview trap:

`add_header` directives need `always` to be sent on error responses too. Without it,
your HSTS and security headers vanish on exactly the 4xx and 5xx responses where an
attacker is probing.

## 13. How Do You Serve A SPA Or A Next.js App?

A single-page app needs every unknown path to return `index.html`, so client-side
routing can take over.

```nginx
server {
  root /var/www/app;

  # Hashed assets: cache hard.
  location ^~ /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # The shell: never cache, or users get a stale app after deploy.
  location = /index.html {
    add_header Cache-Control "no-cache";
  }

  location / {
    try_files $uri $uri/ /index.html;   # file, then directory, then the shell
  }
}
```

For a Node or Next.js server, proxy the dynamic routes and let Nginx serve the static
output directly:

```nginx
server {
  location /_next/static/ {
    alias /var/www/app/.next/static/;
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Why this is good:

Static files are served by Nginx with `sendfile`, never waking the Node process. That
removes the majority of requests from your application's event loop.

Interview trap:

Caching `index.html` for a year pins every returning user to the old bundle until the
cache expires — and because the old HTML references deleted hashed assets, the app
breaks outright. Hash the assets, never the shell.

## 14. How Does Nginx Caching Work?

Nginx can cache upstream responses and serve them without touching the backend.

```nginx
# http context — define the cache store once.
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=app:10m
                 max_size=1g inactive=60m use_temp_path=off;

location /api/products {
  proxy_pass http://backend;

  proxy_cache app;
  proxy_cache_key "$scheme$request_method$host$request_uri";
  proxy_cache_valid 200 10m;
  proxy_cache_valid 404 1m;

  proxy_cache_lock on;                # one request refills; others wait
  proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
  proxy_cache_background_update on;

  add_header X-Cache-Status $upstream_cache_status;  # HIT / MISS / EXPIRED / STALE
}
```

The two directives that matter most in an incident:

- `proxy_cache_lock` prevents a **cache stampede** — when a popular key expires,
  without it every concurrent request goes to the backend at once.
- `proxy_cache_use_stale` serves expired content when the backend is failing, which
  turns an outage into slightly stale data.

Important:

Never cache authenticated responses by URL alone. Nginx skips caching when the
response has a `Set-Cookie` header, but a response that merely *depends* on a request
cookie will still be cached and served to everyone:

```nginx
proxy_no_cache     $http_authorization $cookie_session;
proxy_cache_bypass $http_authorization $cookie_session;
```

Interview method:

`add_header X-Cache-Status $upstream_cache_status;` is how you prove caching works.
Without it you are guessing; with it, `curl -I` tells you HIT or MISS directly.

## 15. How Do You Configure Compression?

```nginx
gzip on;
gzip_vary on;                  # adds Vary: Accept-Encoding for correct caching
gzip_min_length 1024;          # below this, compression costs more than it saves
gzip_comp_level 5;             # 1-9; above ~6 costs CPU for little gain
gzip_proxied any;
gzip_types
  text/plain text/css text/xml
  application/json application/javascript
  application/xml+rss image/svg+xml;
```

Important:

`text/html` is always compressed and cannot be listed — adding it is harmless but
redundant. And never add image or video types: JPEG, PNG, and MP4 are already
compressed, so gzip grows them slightly while burning CPU.

Brotli compresses text roughly 15–20% smaller than gzip but needs a module:

```nginx
brotli on;
brotli_comp_level 5;
brotli_types text/css application/javascript application/json image/svg+xml;
```

Tradeoff:

Compressing on the fly costs CPU per response. Pre-compressing build output and
serving it with `gzip_static on;` moves that cost to build time — the best option for
assets that never change.

## 16. How Do You Rate Limit With Nginx?

Rate limiting at the proxy protects the application before a request ever reaches it.

```nginx
# http context — define zones.
limit_req_zone  $binary_remote_addr zone=api:10m   rate=10r/s;
limit_req_zone  $binary_remote_addr zone=login:10m rate=5r/m;
limit_conn_zone $binary_remote_addr zone=conns:10m;

location /api/ {
  limit_req  zone=api burst=20 nodelay;
  limit_conn conns 10;
  limit_req_status 429;
  proxy_pass http://backend;
}

location /api/auth/login {
  limit_req zone=login burst=3;    # brute-force protection, deliberately strict
  proxy_pass http://backend;
}
```

Understanding `burst` and `nodelay`:

```viz
type: flow
title: rate=10r/s burst=20
Steady state :: 10 requests per second pass through
Short spike :: up to 20 extra requests are queued rather than rejected
With nodelay :: those 20 are served immediately, then the rate resumes
Without nodelay :: they are released at 10r/s, smoothing the spike
Beyond burst :: 429 Too Many Requests
```

Why this is good:

`$binary_remote_addr` stores the IP in 4 or 16 bytes instead of a string, so a 10 MB
zone tracks roughly 160,000 addresses. Rate limiting here costs microseconds and no
application resources at all.

Interview trap:

Behind a CDN or another load balancer, `$remote_addr` is that proxy's IP — so one
shared counter throttles everyone. Use `$http_x_forwarded_for` only if you control and
trust every hop, and configure `set_real_ip_from` for the proxy's range:

```nginx
set_real_ip_from 10.0.0.0/8;
real_ip_header X-Forwarded-For;
real_ip_recursive on;
```

## 17. How Do You Configure Upstreams And Failover?

```nginx
upstream backend {
  least_conn;                            # send to the least busy server

  server app1:3000 weight=3 max_fails=3 fail_timeout=30s;
  server app2:3000              max_fails=3 fail_timeout=30s;
  server app3:3000 backup;               # only used if all others are down

  keepalive 32;                          # reuse connections to the backend
}

location / {
  proxy_pass http://backend;
  proxy_http_version 1.1;                # required for upstream keepalive
  proxy_set_header Connection "";        # required — clears "close"
  proxy_next_upstream error timeout http_502 http_503;
}
```

Important:

`keepalive 32` is the highest-value line in most Nginx configs and the most often
omitted. Without it, Nginx opens a **new TCP connection to your backend for every
single request** — a full handshake per request, plus ephemeral port churn under load.

The two accompanying directives are mandatory: HTTP/1.0 (the default for upstreams)
cannot keep connections alive, and the default `Connection: close` header would close
them anyway.

How failure detection works:

`max_fails=3 fail_timeout=30s` means "after 3 failures within 30 seconds, stop sending
traffic here for 30 seconds, then retry". Open-source Nginx has only this passive
checking — active health checks are a commercial feature, which is why many teams put
Kubernetes or a cloud load balancer in front for that.

Interview trap:

`proxy_next_upstream` retrying a **non-idempotent POST** on another backend can
duplicate an operation. By default Nginx does not retry non-idempotent requests, and
adding `non_idempotent` to that list is how duplicate orders appear.

## 18. How Do You Harden An Nginx Deployment?

```nginx
server_tokens off;                      # stop reporting the exact version

client_max_body_size 10m;               # default is 1m -> 413 on larger uploads
client_body_timeout  10s;
client_header_timeout 10s;

add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

location ~ /\.(?!well-known) { deny all; }   # block .git, .env, dotfiles

location /admin/ {
  allow 10.0.0.0/8;
  deny  all;
  proxy_pass http://backend;
}
```

Interview trap — the `add_header` inheritance rule:

`add_header` directives are **not merged**. If a child block defines even one
`add_header`, it discards *every* header inherited from the parent.

```nginx
server {
  add_header X-Frame-Options "DENY" always;

  location /api/ {
    add_header X-Api-Version "2" always;   # X-Frame-Options is now GONE here
    proxy_pass http://backend;
  }
}
```

Fix:

Repeat the headers in the child block, or define them in a snippet and `include` it
everywhere:

```nginx
# /etc/nginx/snippets/security-headers.conf, included in every location that adds any
```

Important:

`client_max_body_size` defaults to 1 MB. An upload larger than that gets a 413 from
Nginx and never reaches your application — so your carefully written multer error
handling never runs.

## 19. What Is A Zero-Downtime Reload, And How Does Nginx Achieve It?

```bash
nginx -t              # ALWAYS test first — a syntax error would kill the reload
nginx -s reload       # apply the new config with no dropped connections
```

```viz
type: flow
title: What happens during a reload
Master validates config :: on failure, nothing changes and the old config keeps serving
New workers start :: they begin accepting new connections with the new config
Old workers stop accepting :: but keep serving requests already in flight
Old workers exit :: once their last request completes
```

Why this works:

The **master process** owns the listening sockets and never restarts. Only workers are
replaced, and the socket stays bound throughout — so not a single connection is
refused.

Important:

`nginx -t` before every reload is non-negotiable. A config with a typo makes
`nginx -s reload` fail, and if the process was fully restarted instead, the site is
down until someone fixes the typo.

Interview trap:

`nginx -s reload` does **not** pick up changes that require re-binding, such as a new
`listen` port in some setups, and it does not reload a certificate that was replaced
at the same path in older versions. When in doubt about certs, reload is usually
enough — a full restart drops connections.

## 20. How Does Nginx Handle Concurrency, And Why Is It Fast?

Nginx uses a small number of single-threaded, event-driven worker processes rather
than a thread or process per connection.

```nginx
worker_processes auto;        # one per CPU core
events {
  worker_connections 1024;    # concurrent connections PER worker
  use epoll;                  # Linux event mechanism (kqueue on BSD/macOS)
  multi_accept on;
}
```

```viz
type: stack
title: Process model
Master process :: runs as root, reads config, binds ports, manages workers
Worker processes :: run unprivileged, each handles thousands of connections
Event loop per worker :: epoll/kqueue — never one thread per connection
Cache manager/loader :: separate helper processes for the disk cache
```

Why it matters:

A thread-per-connection server (classic Apache prefork) spends memory and context
switches per idle connection, so 10,000 idle keep-alive connections are expensive.
Nginx holds them as file descriptors in an event loop, which is why it handles high
concurrency with flat memory.

This is the **same architecture as Node.js** — a single-threaded event loop with
non-blocking I/O — which is why the same rule applies to both: never do blocking work
in the loop.

Capacity math:

```txt
max connections = worker_processes x worker_connections

Proxying halves it: each client connection also needs one upstream connection.
4 workers x 1024 = 4096 total, so ~2048 proxied clients.
```

Interview answer:

"Event-driven workers instead of thread-per-connection. That is why idle connections
are nearly free, why keep-alive is cheap, and why the limiting resource is file
descriptors rather than memory."

## 21. What Are The Important Timeout And Buffer Settings?

```nginx
# Client side
client_body_timeout   12s;
client_header_timeout 12s;
send_timeout          10s;
keepalive_timeout     65s;    # must EXCEED the backend's keepAliveTimeout

# Upstream side
proxy_connect_timeout 5s;     # TCP connect to the backend (max 75s)
proxy_send_timeout    60s;
proxy_read_timeout    60s;    # idle time between response bytes -> 504 if exceeded

# Buffers
proxy_buffering       on;
proxy_buffer_size     8k;     # the response HEADERS must fit here
proxy_buffers         8 8k;
```

Symptom → setting:

| Symptom | Cause |
| --- | --- |
| 504 after exactly 60s | `proxy_read_timeout` — the backend is too slow |
| 413 Request Entity Too Large | `client_max_body_size` |
| `upstream sent too big header` 502 | `proxy_buffer_size` too small for large cookies or headers |
| SSE/streaming delivers nothing | `proxy_buffering on` holding the response |
| Intermittent 502 under load | `keepalive_timeout` shorter than the backend's |

Important:

The keep-alive relationship is a chain, and every link must be longer than the one in
front of it:

```txt
Cloud load balancer idle timeout  60s
        <  Nginx keepalive_timeout    65s
                <  Node server.keepAliveTimeout  70s
```

If the backend closes first, the proxy sends a request into a socket that is already
closing, and the client gets a 502 that appears in no application log.

## 22. How Do You Get Useful Logs Out Of Nginx?

The default log format omits the two things you most need: upstream timing and a
request id.

```nginx
log_format main escape=json
  '{"time":"$time_iso8601",'
  '"request_id":"$request_id",'
  '"remote_addr":"$remote_addr",'
  '"method":"$request_method",'
  '"uri":"$request_uri",'
  '"status":$status,'
  '"bytes":$body_bytes_sent,'
  '"request_time":$request_time,'
  '"upstream_time":"$upstream_response_time",'
  '"upstream_status":"$upstream_status",'
  '"cache":"$upstream_cache_status"}';

access_log /var/log/nginx/access.log main;
error_log  /var/log/nginx/error.log warn;

# Pass the id to the app so its logs can be joined to these.
proxy_set_header X-Request-ID $request_id;
add_header       X-Request-ID $request_id always;
```

Key reasoning:

`$request_time` is total time as the **client** experienced it.
`$upstream_response_time` is how long the **backend** took. The difference is network
plus Nginx overhead.

```txt
request_time 5.2  upstream_time 5.1   -> the application is slow
request_time 5.2  upstream_time 0.05  -> a slow client, or a huge response body
```

Why it matters:

`$request_id` is generated by Nginx per request. Forwarding it to the application and
returning it to the client means one identifier links the proxy log, the application
log, and the user's bug report.

Interview method:

Find your slowest endpoints straight from the log:

```bash
awk '{print $NF, $7}' /var/log/nginx/access.log | sort -rn | head -20
```

## 23. How Do You Debug A 502 Or 504 In Nginx?

Work from the error log outward — Nginx always records why.

```bash
tail -f /var/log/nginx/error.log
```

| Error log message | Meaning | Fix |
| --- | --- | --- |
| `connect() failed (111: Connection refused)` | nothing listening upstream | backend crashed, or wrong port |
| `upstream prematurely closed connection` | backend died mid-response, or keep-alive mismatch | check app logs; align timeouts |
| `upstream timed out (110)` | backend too slow → **504** | raise `proxy_read_timeout`, fix the query |
| `upstream sent too big header` | headers exceed `proxy_buffer_size` | raise buffer; check oversized cookies |
| `no live upstreams` | all backends marked failed | check `max_fails`, health of the pool |

Diagnostic order:

```viz
type: flow
title: 502/504 triage
Read the Nginx error log :: it names the exact failure — start nowhere else
Can Nginx reach the backend :: curl the upstream directly from the Nginx host
Is the backend healthy :: check its own logs and health endpoint
Is it timing or capacity :: compare $request_time with $upstream_response_time
Check keep-alive alignment :: intermittent 502s with clean app logs mean this
```

```bash
# From the Nginx host, bypass Nginx entirely:
curl -v http://127.0.0.1:3000/health
```

Interview answer:

"The error log tells you which of the five it is, and 'connection refused' versus
'timed out' versus 'prematurely closed' point at three completely different teams —
process down, slow query, and timeout misconfiguration respectively."

## 24. Nginx, Apache, Caddy, Or Traefik — When Would You Use Each?

```viz
type: stack
title: What each one optimises for
Nginx :: throughput, static files, reverse proxying — the default choice
Apache :: .htaccess, per-directory config, mod_php, huge module ecosystem
Caddy :: automatic HTTPS with zero config — smallest operational surface
Traefik :: service discovery — reads Docker/Kubernetes labels, configures itself
```

| | Nginx | Apache | Caddy | Traefik |
| --- | --- | --- | --- | --- |
| Concurrency model | event loop | process/thread (event MPM available) | event loop (Go) | event loop (Go) |
| TLS certificates | manual or certbot | manual or certbot | automatic | automatic |
| Config style | declarative file | file + `.htaccess` | minimal file | labels/CRDs |
| Dynamic backends | reload needed | reload needed | reload/API | automatic |

When to use it:

- **Nginx** — a VM or container stack with a known set of backends. Best raw
  performance, largest body of operational knowledge, and what interviewers expect.
- **Caddy** — small services and internal tools where automatic certificate management
  saves more time than tuning saves resources.
- **Traefik** — containerised environments where backends appear and disappear; it
  discovers them instead of requiring a reload.
- **Apache** — legacy PHP hosting, or where `.htaccess` per-directory overrides are a
  hard requirement.

Interview answer:

"Nginx by default, because it is fast, predictable, and universally understood. Caddy
when certificate automation matters more than tuning. Traefik when backends are
dynamic enough that editing a config file and reloading is the wrong model — that is
really a service-discovery decision, not a proxy one."

## Sources Used

- <https://nginx.org/en/docs/beginners_guide.html>
- <https://nginx.org/en/docs/http/ngx_http_core_module.html>
- <https://nginx.org/en/docs/http/ngx_http_proxy_module.html>
- <https://nginx.org/en/docs/http/ngx_http_upstream_module.html>
- <https://nginx.org/en/docs/http/ngx_http_limit_req_module.html>
- <https://nginx.org/en/docs/http/ngx_http_log_module.html>
- <https://nginx.org/en/docs/control.html>
- <https://ssl-config.mozilla.org/>
