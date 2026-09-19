# Networking Fundamentals Interview Guide

Networking interview guidance for web and backend developers, ordered from the
basics to production debugging: the network models, IP addresses and ports, TCP and
UDP, the handshake, DNS, NAT, sockets, latency and bandwidth, proxies, load
balancers, CDNs, firewalls, and the command-line tools that tell you which layer
actually broke.

No prior networking background is assumed. Every term is defined the first time it
appears.

## 1. What Is A Network, And What Is A Protocol?

A **network** is two or more machines that can send each other messages. A
**protocol** is the agreed format and rules for those messages — what the bytes mean,
who speaks first, and what a valid reply looks like.

Nothing about networking works without agreement on both sides. Your browser can send
HTTP to a server because both ends implement the same specification.

Mental model:

A protocol is like addressing an envelope. The postal service does not care what the
letter says, but it will only deliver if the address is in the expected place and
format. Each networking layer adds its own envelope around the one above it.

```txt
[ Ethernet frame [ IP packet [ TCP segment [ HTTP request ] ] ] ]
  ^ machine-to-  ^ host-to-   ^ reliable    ^ what your app
    machine        host         ordering      actually wrote
```

Why it matters:

When something breaks, "the site is down" is not a diagnosis. Knowing which envelope
failed — DNS, TCP, TLS, or HTTP — is the difference between a five-minute fix and an
afternoon of guessing.

## 2. What Are The OSI And TCP/IP Models?

Both are layered models describing how a message gets from an application on one
machine to an application on another. Each layer only talks to the layer directly
above and below it.

```viz
type: stack
title: OSI layers, top to bottom
7 Application :: HTTP, DNS, SMTP — what your code writes
6 Presentation :: encoding, compression, TLS encryption
5 Session :: establishing and maintaining a conversation
4 Transport :: TCP and UDP — ports, reliability, ordering
3 Network :: IP — addressing and routing between networks
2 Data link :: Ethernet, Wi-Fi — machine-to-machine on one network segment
1 Physical :: cables, radio, voltage
```

The TCP/IP model is the practical four-layer version that the internet actually runs
on:

| TCP/IP layer | Merges OSI | Examples |
| --- | --- | --- |
| Application | 5, 6, 7 | HTTP, DNS, TLS |
| Transport | 4 | TCP, UDP |
| Internet | 3 | IP, ICMP |
| Link | 1, 2 | Ethernet, Wi-Fi |

Interview answer:

"OSI is the teaching model; TCP/IP is what is implemented. In practice I use the
layer numbers as shorthand — an 'L4 load balancer' forwards TCP connections without
reading them, an 'L7 load balancer' parses HTTP and can route on the path or host."

Interview trap:

Being asked to recite seven layers is common, but the follow-up is what matters:
*which layer does a load balancer work at, and why does that change what it can do?*
Learn the model for the vocabulary, not the recital.

## 3. What Is An IP Address, And What Is The Difference Between IPv4 And IPv6?

An **IP address** identifies a network interface so packets can be routed to it. It
answers "which machine".

```txt
IPv4:  192.168.1.10          32 bits, ~4.3 billion addresses, exhausted
IPv6:  2001:db8::8a2e:370:7334   128 bits, effectively unlimited
```

IPv4 ran out of addresses, which is why NAT (question 6) exists and why IPv6 was
created. IPv6 also removes the need for NAT and simplifies routing, but adoption is
gradual, so most systems run **dual stack** — both at once.

Addresses come in two kinds:

- **Public** — routable on the internet, globally unique, assigned by your provider.
- **Private** — reusable inside a local network, never routed on the internet:

```txt
10.0.0.0/8        10.0.0.0    – 10.255.255.255    (large networks, AWS VPCs)
172.16.0.0/12     172.16.0.0  – 172.31.255.255    (Docker default range)
192.168.0.0/16    192.168.0.0 – 192.168.255.255   (home routers)
127.0.0.0/8       localhost — never leaves the machine
```

The `/8` and `/16` are **CIDR notation**: the number says how many leading bits are
the network part, and the rest identify hosts within it. `/24` means 24 network bits
and 8 host bits, so 256 addresses.

Why it matters:

This is why `localhost` inside a Docker container is not your host machine, why a
service on `10.0.x.x` is unreachable from your laptop without a VPN, and why a
security group allowing `0.0.0.0/0` means "the entire internet".

## 4. What Is A Port, And Why Does A Server Need One?

An IP address identifies a machine. A **port** identifies which program on that
machine should receive the message. One server runs many services; the port says
which one.

```txt
https://api.example.com:443/users
        └─── host ────┘ └┬┘
                      the port
```

Common ports worth knowing:

```txt
20/21  FTP        80    HTTP        443   HTTPS       22   SSH
25     SMTP       53    DNS         3306  MySQL       5432 PostgreSQL
6379   Redis      27017 MongoDB     3000  (Node dev convention)
```

Ports 0–1023 are **privileged**: binding one requires root. That is why a Node process
usually listens on 3000 and a reverse proxy on 443 forwards to it — you do not want
your application running as root.

A connection is identified by a **four-tuple**, which is why thousands of clients can
all connect to port 443:

```txt
(source IP, source port, destination IP, destination port)
 203.0.113.5:51234    ->   198.51.100.8:443     unique
 203.0.113.5:51235    ->   198.51.100.8:443     also unique — different source port
```

Symptom:

`EADDRINUSE: address already in use :::3000` means another process already holds that
port. Find it with `lsof -i :3000` and kill it, or choose another port.

## 5. What Is The Difference Between TCP And UDP?

Both are transport protocols — they carry your data between ports. They differ in what
guarantees they make.

**TCP** (Transmission Control Protocol) is connection-oriented and reliable. It
establishes a connection, numbers every byte, retransmits what is lost, reassembles
in order, and controls its sending rate to avoid overwhelming the network.

**UDP** (User Datagram Protocol) just sends. No connection, no ordering, no
retransmission, no congestion control. A datagram either arrives or it does not.

| | TCP | UDP |
| --- | --- | --- |
| Connection | handshake required | none, send immediately |
| Reliability | retransmits lost data | none |
| Ordering | guaranteed | none |
| Speed | slower — setup and acknowledgements | faster, lower overhead |
| Header | 20+ bytes | 8 bytes |
| Used by | HTTP/1.1, HTTP/2, SSH, database clients | DNS, video calls, gaming, HTTP/3 |

When to use it:

TCP when every byte must arrive and order matters — an API response, a file, a
database query. UDP when late data is worthless anyway: in a video call, a
re-sent frame from two seconds ago is useless, so dropping it beats delaying
everything behind it.

Interview trap:

"UDP is unreliable" does not mean "UDP is bad". HTTP/3 runs over UDP and is faster
than HTTP/2 — because QUIC rebuilds reliability *per stream* in userspace, avoiding
the head-of-line blocking that TCP forces on all streams at once.

## 6. What Is The TCP Three-Way Handshake?

Before TCP sends data, both sides agree they are ready and exchange starting sequence
numbers.

```viz
type: flow
title: Opening a TCP connection
Client sends SYN :: "I want to connect, my sequence number is x"
Server sends SYN-ACK :: "Acknowledged. I am ready, my sequence number is y"
Client sends ACK :: "Acknowledged." — the connection is now established
Data flows :: only now can the HTTP request be sent
```

Closing takes four steps, because each direction closes independently:

```txt
FIN  ->    "I have no more data"
   <- ACK  "Acknowledged"
   <- FIN  "Neither do I"
ACK  ->    "Acknowledged"  (then TIME_WAIT, ~2 minutes)
```

Why it matters:

The handshake costs one full **round trip** before any application data moves. If the
server is 100 ms away, you have spent 100 ms before the request is even sent — and
HTTPS adds more round trips for TLS on top.

```txt
Cold HTTPS request to a server 100ms away:
  DNS lookup        ~50ms  (if not cached)
  TCP handshake     100ms  (1 RTT)
  TLS handshake     100ms  (1 RTT with TLS 1.3, 2 with TLS 1.2)
  HTTP request      100ms  (1 RTT)
  ----------------------
  ~350ms before a single byte of HTML arrives
```

This is the entire reason for **keep-alive** (reusing a connection for many requests),
connection pooling in database clients, and CDNs (moving the server closer so each RTT
is smaller).

Symptom:

Sockets stuck in `TIME_WAIT` after load testing are normal — the closing side holds
the tuple to catch stray packets. Thousands of them can exhaust ephemeral ports,
which is why connection reuse matters more than raising limits.

## 7. What Is A Socket?

A **socket** is the programming interface to a connection: the object your code reads
from and writes to. In Node, `net.Socket` is that object, and an HTTP request/response
pair rides on one.

```js
import { createServer } from "node:net";

// A raw TCP echo server — no HTTP involved.
createServer((socket) => {
  console.log("connected:", socket.remoteAddress, socket.remotePort);

  socket.on("data", (chunk) => socket.write(chunk)); // echo it back
  socket.on("end", () => console.log("client disconnected"));
}).listen(4000);
```

Test it without writing a client:

```bash
nc localhost 4000     # type anything, it comes back
```

Important:

A socket is a **stream of bytes**, not a stream of messages. TCP can split one
`write()` across two `data` events, or merge two writes into one. Any protocol on top
of TCP therefore needs framing — a length prefix, or a delimiter. HTTP uses
`Content-Length` and blank lines for exactly this reason.

Interview trap:

This is why a naive TCP protocol that assumes "one write equals one message" works in
development and corrupts under load. The bug is not in your code's logic; it is the
missing framing.

## 8. What Happens When You Type A URL And Press Enter?

The most-asked networking question in interviews, because it touches every layer.

```viz
type: flow
title: URL to rendered page
URL parsing :: scheme, host, port, path — browser checks HSTS and cache
DNS resolution :: hostname to IP address (cache, then recursive lookup)
TCP handshake :: SYN, SYN-ACK, ACK to the server IP on port 443
TLS handshake :: certificate check, key exchange, encryption established
HTTP request :: GET / with headers, cookies, Accept-Encoding
Server processing :: proxy routes it, app builds a response, maybe hits a database
HTTP response :: status line, headers, body — possibly compressed
Browser rendering :: parse HTML, fetch subresources, build the page
```

Say it layer by layer, and name what can fail at each step:

| Step | Failure looks like |
| --- | --- |
| DNS | `ENOTFOUND`, `DNS_PROBE_FINISHED_NXDOMAIN` |
| TCP | `ECONNREFUSED` (nothing listening) or timeout (firewall drop) |
| TLS | certificate expired, hostname mismatch, protocol version |
| HTTP | 4xx (your request) or 5xx (their server) |

Interview answer:

"I would walk it as: resolve, connect, secure, request, respond, render — and at each
step name the cache that might short-circuit it. Most of the perceived speed of the
web comes from those caches: HSTS, DNS TTL, TCP keep-alive, TLS session resumption,
and the HTTP cache."

Strong answer:

The detail that impresses is naming what is **skipped** on a warm request: DNS is
cached, the connection is reused via keep-alive, TLS resumes with a session ticket,
and the response may come from the browser cache without a network trip at all.

## 9. How Does DNS Resolution Actually Work?

**DNS** (Domain Name System) translates a hostname into an IP address. Humans use
names; routers need numbers.

```viz
type: flow
title: Resolving api.example.com
Browser cache :: already resolved recently? done
OS cache / hosts file :: /etc/hosts wins over everything
Recursive resolver :: your ISP's or 8.8.8.8 — does the work below on your behalf
Root nameserver :: "I don't know, but .com is handled by these servers"
TLD nameserver :: ".com says example.com is handled by these nameservers"
Authoritative nameserver :: "api.example.com is 198.51.100.8"
Answer cached :: stored for the TTL, so the next lookup is instant
```

Record types you will be asked about:

```txt
A      hostname -> IPv4 address
AAAA   hostname -> IPv6 address
CNAME  hostname -> another hostname (an alias)
MX     where to deliver mail for this domain
TXT    arbitrary text — SPF, DKIM, domain verification
NS     which nameservers are authoritative for this zone
```

Inspect it yourself:

```bash
dig api.example.com            # full answer with TTL
dig +short api.example.com     # just the address
dig example.com MX             # a specific record type
dig @8.8.8.8 example.com       # ask a specific resolver, bypassing local cache
```

Important:

**TTL** (time to live) is how long a resolver may cache the answer. It is the reason
DNS changes are not instant. Before a planned migration, lower the TTL to 60 seconds
a day in advance; afterwards, raise it again.

Interview trap:

A CNAME cannot coexist with other records at the same name, which is why you cannot
put a CNAME at the apex (`example.com` itself) — the apex must hold NS and SOA
records. Providers solve this with `ALIAS`/`ANAME` records, which are non-standard
server-side flattening.

Symptom:

"It works on my machine" after a DNS change usually means a stale cache somewhere.
`dig` against `8.8.8.8` directly to see the published truth, then flush locally:

```bash
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder   # macOS
```

## 10. What Are NAT, DHCP, And ARP?

Three protocols that make a local network function. You rarely configure them, but
they explain a lot of confusing behaviour.

**NAT** (Network Address Translation) lets many private addresses share one public
address. Your router rewrites the source address and port on the way out, remembers
the mapping, and rewrites replies on the way back.

```txt
192.168.1.10:51234  ->  [router]  ->  203.0.113.7:61000  ->  internet
192.168.1.11:51234  ->  [router]  ->  203.0.113.7:61001  ->  internet
        same port, different hosts — the router keeps them apart
```

Why it matters:

NAT is why inbound connections to a home machine do not work without port forwarding,
and why peer-to-peer applications need STUN/TURN servers to negotiate a path.

**DHCP** (Dynamic Host Configuration Protocol) hands a device its IP address, subnet
mask, gateway, and DNS servers when it joins a network — which is why connecting to
Wi-Fi requires no manual setup.

**ARP** (Address Resolution Protocol) maps an IP address to a hardware (MAC) address
on the local segment. IP routing gets a packet to the right network; ARP gets it to
the right physical machine on that network.

Interview answer:

"DHCP gives you an address, ARP finds the machine that holds it locally, NAT lets the
whole private network share one public address. All three are invisible until
something is misconfigured, and then they explain the symptom exactly."

## 11. What Is The Difference Between Latency, Bandwidth, And Throughput?

They are routinely confused, and the distinction drives every performance decision.

- **Latency** — delay for one message to travel, measured in milliseconds (RTT is the
  round trip).
- **Bandwidth** — maximum capacity of the link, measured in bits per second.
- **Throughput** — what you actually achieve, always at or below bandwidth.

Mental model:

A pipe. Bandwidth is the pipe's width. Latency is its length. Widening a pipe does not
shorten it — which is why a faster connection does not make a distant server feel
close.

```txt
Physical floor: light in fibre travels ~200,000 km/s.
London -> Sydney is ~17,000 km, so one round trip is ~170ms minimum.
No amount of bandwidth reduces that number.
```

Why it matters:

A page making 10 sequential requests to a server 100 ms away spends 1 second purely
waiting, regardless of connection speed. The fixes are architectural, not
infrastructural:

```viz
type: queues
title: Reducing latency cost, most effective first
Fewer round trips :: batch requests, inline critical data, avoid waterfalls
Move closer :: CDN or regional deployment shrinks every RTT
Reuse connections :: keep-alive removes repeated handshakes
Parallelise :: HTTP/2 multiplexing, Promise.all instead of sequential await
Compress :: smaller payloads matter most on slow links, not on latency
```

Interview trap:

"Make it faster, buy more bandwidth" is wrong for most web workloads. Small API
responses are latency-bound, not bandwidth-bound. Bandwidth matters for video, large
downloads, and backups.

## 12. What Is The Difference Between A Proxy And A Reverse Proxy?

Both sit between client and server. The difference is which side they represent.

A **forward proxy** acts for the client. The client knows about it; the server does
not. Used for corporate egress control, caching, and anonymity.

A **reverse proxy** acts for the server. The client thinks it *is* the server. Used
for TLS termination, load balancing, caching, and routing.

```viz
type: flow
title: Reverse proxy in front of an application
Client :: connects to https://api.example.com — sees only the proxy
Reverse proxy :: terminates TLS, adds X-Forwarded-* headers, picks a backend
App server :: receives plain HTTP on an internal port, never exposed publicly
```

What a reverse proxy buys you:

- **TLS termination** — certificates live in one place, not in every service.
- **Load balancing** — spread traffic, remove unhealthy backends.
- **Static files and caching** — served without waking the application.
- **Security** — the application port is never reachable from the internet.
- **Zero-downtime deploys** — drain one backend while others serve.

Important:

Behind a reverse proxy, the application sees the *proxy's* IP as the client IP. The
proxy must forward the original via `X-Forwarded-For`, and the application must be
configured to trust it — in Express, `app.set("trust proxy", 1)`. Get this wrong and
rate limiting, geolocation, and audit logs all record the proxy.

## 13. How Does Load Balancing Work, And What Is L4 Versus L7?

A **load balancer** distributes requests across several backend servers so no single
one is overwhelmed, and so one failure does not take down the service.

The layer determines what it can see:

| | L4 (transport) | L7 (application) |
| --- | --- | --- |
| Sees | IP addresses and ports | full HTTP — path, headers, cookies |
| Can route on | connection only | `/api/*` to one pool, `/img/*` to another |
| TLS | passes through encrypted | usually terminates it |
| Speed | faster, less processing | slower, far more capable |
| Examples | AWS NLB, HAProxy TCP mode | Nginx, AWS ALB, Envoy |

Common algorithms:

```txt
round robin        each backend in turn — the default
least connections  the backend with fewest active connections — good for uneven work
IP hash            same client IP always hits the same backend — crude stickiness
weighted           send more traffic to larger machines
```

Health checks are what make it fault tolerant: the balancer polls each backend and
stops sending traffic to one that fails, without anyone being paged.

Interview trap:

**Sticky sessions** (pinning a user to one backend) is a workaround for storing
session state in process memory. It undermines load balancing — a restarted backend
logs out its users, and traffic distributes unevenly. The fix is stateless servers
with session state in Redis or a signed cookie.

Strong answer:

"L4 when I need raw throughput or a non-HTTP protocol. L7 when I need routing by path
or host, header-based canary releases, or TLS termination in one place. In practice
most web stacks are L7, because the routing flexibility is the point."

## 14. What Is A CDN, And When Does It Help?

A **CDN** (Content Delivery Network) is a globally distributed set of caching servers.
A request goes to the nearest edge location; if it has the content, it answers without
touching your origin server.

Why it matters:

It attacks latency at the only level that works — distance. An edge 20 ms away
instead of an origin 200 ms away improves every round trip for that request.

```viz
type: flow
title: CDN request path
User request :: DNS returns the nearest edge server's IP
Edge cache HIT :: served immediately, origin never contacted
Edge cache MISS :: edge fetches from origin, stores it, then serves
Subsequent users :: served from the edge for the cache lifetime
```

What belongs on a CDN:

- Static assets — JS, CSS, images, fonts, video.
- Cacheable API responses — public, non-personalised data.
- Full HTML pages for anonymous visitors.

Control it with cache headers:

```txt
Cache-Control: public, max-age=31536000, immutable   # fingerprinted asset
Cache-Control: public, max-age=0, s-maxage=60        # HTML: browser revalidates,
                                                     # CDN caches for 60s
Cache-Control: private, no-store                     # personalised — never cache
```

Interview trap:

`private` means "browser may cache, shared caches may not". Sending a user-specific
response with `public` lets the CDN serve one user's data to another — a real and
recurring production incident, not a theoretical one.

Important:

Cache invalidation is the hard part. Content-hashed filenames (`app.4f2b.js`) avoid
it entirely: a new build has a new URL, so nothing needs purging.

## 15. What Are Firewalls, Security Groups, And VPNs?

A **firewall** allows or blocks traffic by rule — source, destination, port, protocol.
The safe default is deny-all inbound, then open only what is needed.

In cloud environments the same idea appears as **security groups**:

```txt
Load balancer SG:  allow 443 from 0.0.0.0/0      (the internet)
App server SG:     allow 3000 from the LB's SG   (only the balancer)
Database SG:       allow 5432 from the app SG    (only the app)
```

Why this is good:

Each tier only accepts traffic from the tier in front of it. An attacker who
compromises the load balancer still cannot reach the database directly. This is
**defence in depth** — no single rule failure exposes everything.

A **VPN** (Virtual Private Network) creates an encrypted tunnel so a remote machine
behaves as if it were inside the private network. That is how you reach an internal
database on `10.0.x.x` from a laptop without exposing it publicly.

Symptom:

A connection that **hangs and times out** rather than being refused usually means a
firewall is dropping packets silently. `ECONNREFUSED` means the packet arrived and
nothing was listening — the port is reachable, the service is not running. That
distinction narrows the search immediately.

## 16. Which Command-Line Tools Diagnose Which Layer?

Interviewers ask "the API is timing out — what do you check?" The answer is a
top-to-bottom sweep, and each tool isolates one layer.

```viz
type: flow
title: Debugging sweep, in order
ping :: is the host reachable at all? (ICMP, layer 3)
dig :: does the name resolve, and to the right address? (DNS)
traceroute :: where in the path does it stop? (routing)
nc / telnet :: is the port open and accepting? (TCP, layer 4)
curl -v :: does TLS complete and what does HTTP say? (layers 6-7)
ss / netstat :: is anything listening locally, and how many connections?
tcpdump :: what is actually on the wire, when everything else looks fine
```

```bash
ping api.example.com                  # reachability + rough RTT
dig +short api.example.com            # resolved address
traceroute api.example.com            # hop-by-hop path
nc -zv api.example.com 443            # is the port open?
curl -v https://api.example.com/health # full request with TLS details
ss -tlnp                              # what is listening on this machine
ss -s                                 # socket summary — spot TIME_WAIT buildup
sudo tcpdump -i any port 443 -nn      # raw packets
```

The single most useful one:

```bash
curl -w "dns:%{time_namelookup}s connect:%{time_connect}s \
tls:%{time_appconnect}s ttfb:%{time_starttransfer}s total:%{time_total}s\n" \
  -o /dev/null -s https://api.example.com/health
```

That prints exactly which phase is slow. If `time_namelookup` dominates, it is DNS.
If `time_connect` does, it is the network or a saturated backend. If `ttfb` does, the
application is slow and the network is fine.

Interview answer:

"I work up the stack. Resolve, connect, TLS, HTTP — the first step that fails tells me
which team and which system to look at, and `curl -w` gives me all four timings in one
command."

## 17. What Do 502, 503, And 504 Actually Tell You?

All three come from a proxy or load balancer, not from your application — which is
itself the most useful fact about them.

| Status | Meaning | Usual cause |
| --- | --- | --- |
| **502** Bad Gateway | the proxy got an invalid or no response | backend crashed, closed the connection, or returned garbage |
| **503** Service Unavailable | no healthy backend to send to | all instances failing health checks, or deliberate maintenance |
| **504** Gateway Timeout | backend accepted but did not answer in time | slow query, deadlock, blocked event loop, missing outbound timeout |

```viz
type: flow
title: Reading the three by where they break
502 :: connection was made, response was broken — check backend logs for a crash
503 :: no connection attempted — check health checks and instance count
504 :: connection held open, no reply in time — check slow queries and timeouts
```

Important:

A 502 that appears intermittently under load, with no error in the application log, is
the classic **keep-alive timeout mismatch**: the backend closes an idle pooled
connection just as the proxy sends a request into it. The fix is making the backend's
keep-alive timeout *longer* than the proxy's idle timeout.

```js
server.keepAliveTimeout = 65_000; // must exceed the proxy/ALB idle timeout (60s)
server.headersTimeout = 66_000;   // must exceed keepAliveTimeout
```

Interview answer:

"The number tells me who to ask. 503 is a capacity or health-check problem, 504 is a
slow backend, and 502 is a broken or prematurely closed response — and if it is
intermittent under load with clean application logs, I check the keep-alive timeouts
first."

## 18. How Do You Design A Network For A Typical Production Web App?

Everything above, assembled. This is the diagram interviewers expect you to be able
to draw.

```viz
type: flow
title: Request path, edge to database
DNS :: api.example.com resolves to the CDN or load balancer
CDN edge :: serves cached static assets; forwards the rest
Load balancer :: public subnet, holds the TLS certificate, health-checks backends
App servers :: private subnet, plain HTTP, reachable only from the balancer
Cache / queue :: private subnet, Redis and brokers, no public route
Database :: private subnet, reachable only from the app tier, with replicas
```

The principles behind it:

- **Public and private subnets.** Only the load balancer is internet-facing.
- **TLS at the edge, plain HTTP inside** the trusted network (or mTLS if the threat
  model demands it).
- **Stateless app servers** so any instance can serve any request and scaling is just
  adding replicas.
- **Health checks everywhere** so failure removes an instance instead of degrading
  everyone.
- **Timeouts at every hop**, shorter as you go deeper, so a slow database cannot hold
  every connection in the stack open.

Interview answer:

"One public entry point, everything else private, state pushed out of the application
tier, and a timeout plus a health check on every hop. That shape scales horizontally
and fails in a contained way — and it is the same design whether it is three EC2
instances or a Kubernetes cluster."

## Sources Used

- <https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview>
- <https://developer.mozilla.org/en-US/docs/Glossary/TCP>
- <https://www.cloudflare.com/learning/dns/what-is-dns/>
- <https://www.cloudflare.com/learning/cdn/what-is-a-cdn/>
- <https://www.rfc-editor.org/rfc/rfc9293.html>
- <https://www.rfc-editor.org/rfc/rfc1035>
- <https://nodejs.org/api/net.html>
- <https://curl.se/docs/manpage.html>
