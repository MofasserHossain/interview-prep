# HTTP, TLS And Web Protocols Interview Guide

HTTP interview guidance ordered from the basics upward: request and response
anatomy, URL structure and encoding, methods, idempotency, status codes, headers,
HTTPS and the TLS handshake, certificates, HTTP/1.1 versus HTTP/2 versus HTTP/3,
caching, cookies, authentication schemes, CSRF, CORS, compression, chunked
encoding, API style choices, realtime transports, security headers, idempotency
keys, and debugging with `curl`.

Every term is defined on first use. Read the Networking Fundamentals guide alongside
this one — that covers the layers below HTTP.

## 1. What Is HTTP, And What Does A Request Actually Look Like?

**HTTP** (HyperText Transfer Protocol) is a text-based request/response protocol. A
client sends a request, the server sends one response, and that exchange is complete.

```txt
GET /api/users/42 HTTP/1.1          <- request line: method, path, version
Host: api.example.com               <- headers: metadata, one per line
Accept: application/json
Authorization: Bearer eyJhbGci...
                                    <- blank line separates headers from body
```

```txt
HTTP/1.1 200 OK                     <- status line: version, code, reason
Content-Type: application/json      <- headers
Content-Length: 41
Cache-Control: private, max-age=0
                                    <- blank line
{"id":42,"name":"Ada","role":"admin"}   <- body
```

Important:

HTTP is **stateless**. The server keeps no memory of previous requests. Everything
needed to process a request must be in that request — which is exactly why cookies,
tokens, and sessions exist: they re-supply identity on every single call.

Why it matters:

Statelessness is what makes horizontal scaling possible. Any server can handle any
request, so adding capacity is just adding machines. The moment a server remembers
something in local memory, that property is lost.

## 2. What Are The Parts Of A URL, And What Needs Encoding?

```txt
https://user:pass@api.example.com:8443/v1/users?role=admin&sort=name#results
└─┬─┘   └───┬───┘ └──────┬───────┘└┬─┘└───┬───┘└───────┬──────────┘└──┬───┘
scheme   userinfo      host       port   path        query         fragment
```

| Part | Notes |
| --- | --- |
| scheme | `https`, `http`, `ws`, `ftp` — case-insensitive |
| userinfo | legacy, deprecated in browsers for HTTP |
| host | domain or IP — case-insensitive |
| port | omitted means the scheme default: 80 for HTTP, 443 for HTTPS |
| path | **case-sensitive** on most servers |
| query | `?key=value&key2=value2` |
| fragment | `#results` — **never sent to the server** |

Interview trap:

The **fragment never leaves the browser**. It is used purely client-side for anchors
and SPA routing, so you cannot read it server-side and it never appears in server
logs. That is also why putting a token in a fragment (as OAuth implicit flow once did)
keeps it out of server logs — and why it still ends up in browser history.

Percent-encoding: reserved characters must be escaped or they change the URL's
structure.

```js
// Encodes everything unsafe in a VALUE, including / ? & = #
encodeURIComponent("a/b?c=d&e"); // "a%2Fb%3Fc%3Dd%26e"

// Leaves URL structure characters intact — for a WHOLE url, not a value
encodeURI("https://x.com/a b");  // "https://x.com/a%20b"
```

The rule:

`encodeURIComponent` for every individual query value or path segment.
`encodeURI` only when escaping a complete URL you already trust. Using `encodeURI` on
a value is a real bug: a value containing `&` silently becomes two parameters.

```js
// Safest — the API builds a correct query string for you.
const url = new URL("https://api.example.com/search");
url.searchParams.set("q", "a&b=c");   // properly escaped
```

Edge cases:

There is no standard for arrays in query strings. `?tag=a&tag=b`, `?tag[]=a`, and
`?tag=a,b` are all in use, and the server framework decides which it understands —
which is exactly where the Express `query parser` setting matters.

Practical limit: browsers and proxies cap URLs around 2,000 characters. Anything
longer belongs in a POST body.

## 3. What Are The HTTP Methods, And What Does Each Mean?

The method states the *intent* of the request.

| Method | Purpose | Has body | Typical success |
| --- | --- | --- | --- |
| `GET` | retrieve a resource | no | 200 |
| `POST` | create, or a non-idempotent action | yes | 201 / 200 |
| `PUT` | replace a resource entirely | yes | 200 / 204 |
| `PATCH` | partially update a resource | yes | 200 / 204 |
| `DELETE` | remove a resource | rarely | 204 |
| `HEAD` | like GET, headers only, no body | no | 200 |
| `OPTIONS` | ask what is allowed (used by CORS preflight) | no | 204 |

```txt
GET    /api/posts        list posts
GET    /api/posts/42     one post
POST   /api/posts        create — server assigns the id
PUT    /api/posts/42     replace the whole post
PATCH  /api/posts/42     change only the fields sent
DELETE /api/posts/42     remove it
```

Interview trap:

Nothing *forces* a `GET` to be read-only. The method is a convention the server must
honour. A `GET /deleteUser?id=42` endpoint is legal HTTP and a serious bug — browser
prefetchers, crawlers, and link previewers follow GET links, and will delete data by
simply looking at the page.

## 4. What Are Safe And Idempotent Methods?

Two properties that decide whether a request can be retried or cached.

- **Safe** — does not change server state. `GET`, `HEAD`, `OPTIONS`.
- **Idempotent** — running it N times leaves the same state as running it once.

```txt
Safe + idempotent:  GET, HEAD, OPTIONS
Idempotent only:    PUT, DELETE
Neither:            POST, PATCH*
```

```txt
PUT /users/42 {"name":"Ada"}   run 3 times -> name is "Ada"        idempotent
DELETE /users/42               run 3 times -> user 42 is gone      idempotent
                                (2nd and 3rd return 404, but state is the same)
POST /users {"name":"Ada"}     run 3 times -> THREE users created  not idempotent
```

`PATCH` is idempotent only if the patch is absolute (`{"status":"paid"}`) and not if
it is relative (`{"increment":1}`).

Why it matters:

Idempotency is what makes **retries safe**. A load balancer, an HTTP client, or a
queue consumer can retry an idempotent request after a timeout without risk. It
cannot safely retry a `POST` — which is why duplicate orders happen when a payment
request times out and the client retries.

Interview answer:

"Safe means no side effects, idempotent means repeatable without additional effect.
The practical consequence is retry policy: I can auto-retry GET, PUT, and DELETE, but
a POST needs an idempotency key before I retry it."

## 5. What Do The Status Code Families Mean?

The first digit is the category; learn the families, then the individual codes.

```viz
type: stack
title: Status code families
1xx Informational :: rare — 101 Switching Protocols for WebSocket upgrades
2xx Success :: 200 OK, 201 Created, 204 No Content
3xx Redirection :: 301 permanent, 302/307 temporary, 304 Not Modified
4xx Client error :: the request was wrong — do not retry unchanged
5xx Server error :: the server failed — retrying may work
```

The ones that come up in interviews:

| Code | Meaning | Used when |
| --- | --- | --- |
| 200 | OK | successful GET/PUT/PATCH |
| 201 | Created | POST created a resource — include a `Location` header |
| 204 | No Content | successful DELETE, or PUT with nothing to return |
| 301 | Moved Permanently | permanent URL change — browsers cache this aggressively |
| 304 | Not Modified | cache validation succeeded, body omitted |
| 400 | Bad Request | malformed or failed validation |
| 401 | Unauthorized | **not authenticated** — who are you? |
| 403 | Forbidden | **authenticated but not allowed** |
| 404 | Not Found | no such resource |
| 409 | Conflict | version conflict, duplicate unique field |
| 422 | Unprocessable Entity | syntactically valid, semantically wrong |
| 429 | Too Many Requests | rate limited — send `Retry-After` |
| 500 | Internal Server Error | unhandled exception |
| 502/503/504 | gateway errors | see the Networking guide |

Interview trap:

401 versus 403 is asked constantly. **401 = unauthenticated** (the name is
historically wrong), **403 = authenticated but not permitted**. A missing token is
401; a valid token without the admin role is 403.

Important:

301 is cached by browsers essentially forever and is very hard to undo. Use 302 or
307 unless you are certain the move is permanent.

## 6. What Are The Most Important HTTP Headers?

Headers carry metadata about the request or response.

```txt
Request headers
  Host              which virtual host is being addressed (required in HTTP/1.1)
  Authorization     credentials — Bearer token, Basic auth
  Accept            what the client can handle: application/json
  Accept-Encoding   supported compression: gzip, br
  Content-Type      the format of the body being sent
  Cookie            cookies previously set by this origin
  User-Agent        client identification
  If-None-Match     cache validation — "only send if the ETag differs"

Response headers
  Content-Type      format of the body: application/json; charset=utf-8
  Content-Length    body size in bytes
  Cache-Control     caching policy for browsers and CDNs
  ETag              a version fingerprint for this representation
  Set-Cookie        store this cookie
  Location          where to go (redirects, and 201 Created)
  Access-Control-*  CORS permissions
```

Important:

Header **names** are case-insensitive. `Content-Type`, `content-type`, and
`CONTENT-TYPE` are the same header. In Node, `req.headers` keys are always lowercased
— which is why `req.headers["Authorization"]` is always `undefined` and
`req.get("authorization")` is the safe accessor in Express.

Interview trap:

`Content-Type` on a request describes what the **client is sending**; `Accept`
describes what it **wants back**. Confusing them is why a request sometimes gets a
415 Unsupported Media Type instead of a 406 Not Acceptable.

## 7. What Is The Difference Between HTTP And HTTPS?

HTTPS is HTTP carried inside a **TLS** (Transport Layer Security) tunnel. Same
protocol, encrypted transport.

TLS provides three guarantees:

```viz
type: stack
title: What TLS actually guarantees
Confidentiality :: nobody on the path can read the traffic
Integrity :: nobody can modify it undetected
Authentication :: the server is who the certificate says it is
```

Without HTTPS, anyone between the client and server — a router, a Wi-Fi access point,
an ISP — can read passwords and session cookies in plain text, and inject content into
responses.

Important:

TLS does **not** hide everything. The destination IP, the port, and (unless Encrypted
Client Hello is in use) the hostname in the TLS SNI field are all visible to observers.
Encryption protects the content, not the fact of the connection.

Interview trap:

"SSL" and "TLS" are used interchangeably in conversation, but every SSL version is
deprecated and insecure. The live versions are **TLS 1.2** and **TLS 1.3**. Saying
"SSL certificate" is accepted usage; configuring SSLv3 is a vulnerability.

## 8. How Does The TLS Handshake Work?

The handshake establishes a shared secret over an untrusted network, then switches to
fast symmetric encryption.

First, the two kinds of cryptography involved:

- **Asymmetric** (public/private key pair) — anyone can encrypt with the public key,
  only the private key decrypts. Secure but computationally expensive.
- **Symmetric** (one shared key) — fast, but both sides need the same key, and you
  cannot send a key over a channel that is not yet secure.

TLS uses asymmetric cryptography to agree a symmetric key, then uses the symmetric key
for the actual data. Best of both.

```viz
type: flow
title: TLS 1.3 handshake (1 round trip)
ClientHello :: supported versions and ciphers, plus a key share
ServerHello :: chosen cipher, its key share, and the certificate
Both derive the key :: each side computes the same shared secret independently
Finished :: verify the handshake was not tampered with
Encrypted data :: the HTTP request finally goes, symmetrically encrypted
```

Why it matters:

TLS 1.3 completes in **one** round trip; TLS 1.2 needed two. On a 100 ms link that is
100 ms saved on every new connection. TLS 1.3 also supports 0-RTT resumption, sending
data on the first packet of a repeat connection.

Tradeoff:

0-RTT data is **replayable** by an attacker who captures it, so it must only carry
idempotent requests. Sending a `POST /transfer` over 0-RTT is a real vulnerability.

Interview answer:

"Asymmetric crypto to establish a shared secret, symmetric crypto for the session
because it is far cheaper. TLS 1.3 cut it to one round trip and removed the legacy
cipher suites that caused most TLS vulnerabilities."

## 9. How Does Certificate Trust Work?

A **certificate** binds a public key to a hostname, signed by a **Certificate
Authority** (CA) that browsers already trust.

```viz
type: stack
title: The chain of trust
Root CA :: pre-installed in the OS/browser trust store, self-signed
Intermediate CA :: signed by the root — the root stays offline for safety
Leaf certificate :: your server's cert, signed by the intermediate
```

The browser verifies, in order:

1. The signature chain reaches a root it already trusts.
2. The hostname matches the certificate's Common Name or Subject Alternative Names.
3. The current date is within the validity window.
4. The certificate has not been revoked.

Symptom → cause:

| Browser error | Cause |
| --- | --- |
| `ERR_CERT_AUTHORITY_INVALID` | self-signed, or the intermediate was not served |
| `ERR_CERT_COMMON_NAME_INVALID` | cert is for `example.com`, you requested `www.example.com` |
| `ERR_CERT_DATE_INVALID` | expired — or the client's clock is wrong |

Interview trap:

The most common production TLS failure is a **missing intermediate certificate**. It
works in browsers that cached the intermediate from another site and fails in `curl`,
Java clients, and mobile apps. Always serve the full chain:

```bash
openssl s_client -connect example.com:443 -servername example.com | head -20
```

Important:

Certificates expire — Let's Encrypt issues 90-day certificates specifically to force
automation. A manual renewal process is an outage with a scheduled date.

## 10. What Changed Between HTTP/1.1, HTTP/2, And HTTP/3?

Each version solved the previous one's bottleneck.

**HTTP/1.1** (1997) added persistent connections (`keep-alive`) and the required
`Host` header, which is what made virtual hosting — many domains on one IP — possible.

Its limitation is **head-of-line blocking**: one connection carries one request at a
time, so a slow response blocks everything queued behind it. Browsers worked around
this by opening ~6 connections per domain, which is why "domain sharding" and sprite
sheets were once best practice.

**HTTP/2** (2015) made the protocol binary and added **multiplexing**: many concurrent
streams over one TCP connection.

```viz
type: flow
title: HTTP/1.1 versus HTTP/2 on one connection
HTTP/1.1 :: request A, wait, response A, request B, wait, response B
HTTP/2 :: A, B, C sent at once — responses interleave as they become ready
Header compression :: HPACK removes repeated headers across requests
Result :: sharding and concatenation become counterproductive
```

**HTTP/3** (2022) moves to **QUIC**, which runs over UDP.

Why that helps: HTTP/2 removed head-of-line blocking at the HTTP layer, but TCP still
has it at the transport layer — one lost packet stalls *every* multiplexed stream
until it is retransmitted. QUIC tracks loss per stream, so only the affected stream
waits.

| | HTTP/1.1 | HTTP/2 | HTTP/3 |
| --- | --- | --- | --- |
| Transport | TCP | TCP | QUIC over UDP |
| Format | text | binary | binary |
| Multiplexing | no | yes | yes |
| HOL blocking | HTTP + TCP | TCP only | none |
| TLS | optional | effectively required | built in |
| Setup RTTs | 1 + TLS | 1 + TLS | 1 (0 on resume) |

Interview trap:

HTTP/2 **server push** is effectively dead — Chrome removed it, because it usually
wasted bandwidth pushing resources the client already had. `rel=preload` and `103
Early Hints` replaced it. Citing server push as an HTTP/2 benefit dates your
knowledge.

Important:

QUIC's other real win is **connection migration**. A connection is identified by a
connection ID rather than the four-tuple, so moving from Wi-Fi to cellular keeps the
session alive instead of dropping it.

## 11. How Does HTTP Caching Work?

Two mechanisms: **expiration** (do not ask again yet) and **validation** (ask, but
skip the body if unchanged).

```txt
Cache-Control: public, max-age=31536000, immutable   expiration: 1 year, never revalidate
Cache-Control: no-cache                              validate every time before using
Cache-Control: no-store                              never write to any cache
Cache-Control: private, max-age=600                  browser only, not shared caches
Cache-Control: public, max-age=0, s-maxage=300       browser revalidates, CDN caches 5min
```

Validation with `ETag` avoids re-sending an unchanged body:

```viz
type: flow
title: Cache validation round trip
First response :: 200 OK with ETag: "v3" and the full body
Later request :: If-None-Match: "v3"
Unchanged :: 304 Not Modified — headers only, no body, no bandwidth
Changed :: 200 OK with the new ETag and the new body
```

The directives that confuse people:

- `no-cache` does **not** mean "do not cache". It means "cache it, but revalidate
  before every use". `no-store` is the one that means do not store.
- `private` means browsers may cache but CDNs and proxies may not.
- `immutable` tells the browser not to revalidate even on reload.

The rule:

Fingerprint your asset filenames (`app.4f2b.js`) and cache them for a year with
`immutable`. Serve HTML with `no-cache` or a short `s-maxage`. Never cache
personalised responses publicly.

Interview trap:

Sending `Cache-Control: public` on an authenticated response lets a shared CDN cache
serve one user's data to another. Always `private` or `no-store` for anything
user-specific, and use `Vary: Authorization` if a shared cache is unavoidable.

## 12. How Do Cookies Work, And What Do Their Attributes Do?

A cookie is a key/value pair the server asks the browser to store and send back
automatically on subsequent requests to that origin.

```txt
Set-Cookie: sessionId=abc123; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400
```

| Attribute | Effect | Why it matters |
| --- | --- | --- |
| `HttpOnly` | JavaScript cannot read it | an XSS payload cannot steal the session |
| `Secure` | only sent over HTTPS | prevents interception on plain HTTP |
| `SameSite` | controls cross-site sending | the primary CSRF defence |
| `Path` / `Domain` | which URLs receive it | limits exposure |
| `Max-Age` / `Expires` | lifetime | session cookie if omitted |

`SameSite` has three values:

```txt
Strict  never sent on any cross-site request — safest, breaks inbound links
Lax     sent on top-level GET navigations only — the modern browser default
None    always sent; REQUIRES Secure — needed for genuine cross-site use
```

Why it matters:

`SameSite=Lax` being the default is what neutralised most classic CSRF attacks: a
malicious site's form POST to your bank no longer carries the session cookie.

Interview trap:

`SameSite=None` without `Secure` is **rejected outright** by modern browsers — the
cookie is silently not set. This is the usual cause of "third-party embed login works
locally, fails in production".

Interview answer:

"For a session cookie: `HttpOnly` so XSS cannot read it, `Secure` so it never crosses
plain HTTP, `SameSite=Lax` for CSRF protection, a scoped `Path`, and a sensible
`Max-Age`. That combination removes the three common session-theft routes."

## 13. What Are The HTTP Authentication Schemes?

Authentication rides on the `Authorization` header, with a scheme name in front of
the credentials.

```txt
Authorization: Basic  dXNlcjpwYXNzd29yZA==
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Authorization: Digest username="...", nonce="...", response="..."
```

| Scheme | Credential | Notes |
| --- | --- | --- |
| **Basic** | `base64(user:password)` | **encoding, not encryption** — useless without TLS |
| **Bearer** | a token (usually a JWT) | "whoever holds it, wields it" |
| **Digest** | hashed challenge/response | legacy, avoids sending the password |
| **API key** | opaque string | usually a custom header like `X-API-Key` |
| **mTLS** | a client certificate | strongest; used service-to-service |

The 401 challenge flow:

```viz
type: flow
title: How a server asks for credentials
Client requests a protected resource :: no Authorization header
Server responds 401 :: WWW-Authenticate: Basic realm="api"
Client retries :: now with Authorization: Basic ...
Server responds 200 :: or 403 if authenticated but not permitted
```

Interview trap:

Base64 is **not** encryption. `dXNlcjpwYXNzd29yZA==` decodes to `user:password` with
one command. Basic auth over plain HTTP hands the password to anyone on the path.

```bash
echo "dXNlcjpwYXNzd29yZA==" | base64 -d   # user:password
```

Important:

Never put an API key in the **query string**. URLs are written to server access logs,
proxy logs, browser history, and `Referer` headers — so a key in a query string leaks
into at least four places you do not control. Use a header.

Interview answer:

"Bearer tokens for user-facing APIs, with short expiry and a refresh token. API keys
in a header — never a query parameter — for server-to-server where a full auth flow is
overkill. mTLS when both ends are mine and I want the transport itself to prove
identity. Basic auth only behind TLS, and really only for internal tools."

## 14. What Is CSRF, And How Do You Defend Against It?

**CSRF** (Cross-Site Request Forgery) exploits the fact that browsers attach cookies
automatically to *any* request to a domain — including requests triggered by a
completely different site.

```html
<!-- On evil.com. The victim is logged into bank.com in another tab. -->
<form action="https://bank.com/transfer" method="POST" id="f">
  <input name="to" value="attacker">
  <input name="amount" value="10000">
</form>
<script>document.getElementById("f").submit();</script>
```

```viz
type: flow
title: Why the attack works
Victim logs into bank.com :: receives a session cookie
Victim visits evil.com :: in another tab, still logged in
evil.com auto-submits a form :: targeting bank.com
Browser attaches the cookie :: it always does, regardless of who triggered the request
bank.com sees a valid session :: and performs the transfer
```

Key reasoning:

The root cause is **ambient authority** — the credential is sent automatically without
the application deciding to send it. This is why CSRF affects cookie-based sessions
and **does not** affect tokens in an `Authorization` header: JavaScript must
deliberately attach those, and an attacker's page cannot read your token to attach it.

The defences, strongest first:

```txt
SameSite=Lax/Strict  the browser refuses to send the cookie cross-site (default now)
CSRF token           a per-session random value in a hidden field or header,
                     which evil.com cannot read due to the same-origin policy
Double-submit cookie a token sent in BOTH a cookie and a header; the server compares
Origin/Referer check reject state-changing requests from unexpected origins
Re-authentication    require the password again for high-value actions
```

```js
// Express: token check as middleware on state-changing routes.
app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  if (req.get("x-csrf-token") !== req.session.csrfToken) {
    return next(new HttpError(403, "Invalid CSRF token"));
  }

  next();
});
```

Interview trap:

`SameSite=Lax` (the modern default) blocks the attack above, but it still sends the
cookie on **top-level GET navigations**. So a `GET` endpoint that changes state
remains vulnerable even with `Lax` — another reason `GET` must always be safe.

Interview answer:

"CSRF is an ambient-authority problem, so the fix is either removing the ambience —
`SameSite` cookies, or tokens in a header — or proving intent with a CSRF token the
attacker's origin cannot read. A pure Bearer-token SPA is structurally immune; a
cookie-session app needs both `SameSite` and tokens on state-changing routes."

## 15. What Is CORS, And What Triggers A Preflight?

Browsers enforce the **same-origin policy**: a page on origin A cannot read a response
from origin B. An origin is scheme + host + port — all three must match.

**CORS** (Cross-Origin Resource Sharing) is how a server opts in to being read by
another origin.

```txt
Request:   Origin: https://app.example.com
Response:  Access-Control-Allow-Origin: https://app.example.com
```

Some requests trigger a **preflight** — an automatic `OPTIONS` request asking
permission before the real one is sent.

```viz
type: flow
title: Preflighted cross-origin request
OPTIONS sent first :: Access-Control-Request-Method: PUT, -Headers: authorization
Server replies :: Allow-Origin, Allow-Methods, Allow-Headers, Max-Age
Browser checks :: if the real request is not covered, it is blocked here
Real PUT sent :: only after the preflight approved it
```

A request is **simple** (no preflight) only if it is `GET`, `HEAD`, or `POST`, uses
only safe-listed headers, and its `Content-Type` is one of
`application/x-www-form-urlencoded`, `multipart/form-data`, or `text/plain`.

Interview trap:

`Content-Type: application/json` is *not* on that list — which is why nearly every
JSON API call from a browser is preflighted, and why "my GET works but my POST is
blocked" is such a common report.

Important:

With `credentials: "include"`, `Access-Control-Allow-Origin: *` is rejected. You must
echo the specific origin and send `Access-Control-Allow-Credentials: true`.

```js
// Reduce preflight cost by letting the browser cache the result.
res.setHeader("Access-Control-Max-Age", "86400");
```

Key reasoning:

CORS is enforced **by the browser**, and it protects the *user*, not the server.
`curl`, Postman, and any server-side client ignore it entirely. It is not
authorisation — every request still needs its own auth check.

## 16. How Does Compression Work Over HTTP?

The client advertises what it can decode; the server picks one and says which it used.

```txt
Request:   Accept-Encoding: gzip, deflate, br
Response:  Content-Encoding: br
```

| Algorithm | Notes |
| --- | --- |
| `gzip` | universal, fast, good ratio |
| `br` (Brotli) | ~15–20% smaller than gzip for text, HTTPS-only in practice |
| `zstd` | newer, fast, growing support |

Tradeoff:

Compression trades CPU for bandwidth. It is a large win for text — HTML, JSON, CSS,
JS — and useless or harmful for already-compressed formats: JPEG, PNG, MP4, ZIP. Those
grow slightly and waste CPU.

Important:

Compress at the reverse proxy or CDN, not in Node. Compressing in the application
burns event-loop CPU on every response; Nginx does it with a tuned native
implementation and can cache the compressed result.

Interview trap:

Compressing a response that contains both secrets and attacker-controlled input over
TLS enables **BREACH**-style attacks, because compressed size leaks information about
content. The practical mitigations are CSRF tokens that vary per request, and not
reflecting user input next to secrets.

## 17. How Does A Server Send A Response Of Unknown Length?

Every HTTP/1.1 response must tell the client where the body ends. There are exactly
two ways.

```txt
Content-Length: 1024                 the body is exactly 1024 bytes
Transfer-Encoding: chunked           the body arrives in self-describing chunks
```

Chunked encoding sends each piece with its size in hex, then a zero-length chunk to
signal the end:

```txt
HTTP/1.1 200 OK
Transfer-Encoding: chunked

1a
{"status":"generating..."}
12
{"progress":50}
0

```

When to use it:

When the length is unknown at the time headers are sent — a streamed database export,
a generated report, a proxied response, or LLM tokens produced as they are computed.
The alternative is buffering the whole response in memory just to count the bytes.

```js
// Node sets Transfer-Encoding: chunked automatically when you write
// without having set Content-Length.
res.writeHead(200, { "Content-Type": "application/json" });
res.write('{"progress":10}');   // sent immediately
res.write('{"progress":50}');
res.end();
```

Tradeoff:

Chunked responses cannot report download progress, because the total size is unknown —
the browser shows an indeterminate spinner rather than a percentage. Buffering gives
you a progress bar at the cost of memory and time to first byte.

Interview trap:

**HTTP/2 and HTTP/3 have no chunked encoding.** Their binary framing already delimits
messages, so `Transfer-Encoding: chunked` is forbidden there. Streaming still works —
it is just handled by the protocol's own DATA frames.

Important:

Sending **both** `Content-Length` and `Transfer-Encoding` is the basis of **HTTP
request smuggling**: a front-end proxy and a back-end server disagree about which
header wins, so the back end sees a request boundary in a different place and an
attacker can prepend a request to the next user's connection. Modern servers reject
requests carrying both, which is why you should never hand-roll the framing.

## 18. REST, GraphQL, Or gRPC — How Do You Choose?

```viz
type: stack
title: What each optimises for
REST :: resources over HTTP verbs — universal tooling, caches for free
GraphQL :: one endpoint, client picks the fields — kills over- and under-fetching
gRPC :: binary over HTTP/2 with generated clients — fastest service-to-service
tRPC :: end-to-end TypeScript types with no schema language — single-repo full stack
```

| | REST | GraphQL | gRPC |
| --- | --- | --- | --- |
| Transport | HTTP/1.1+ | HTTP POST | HTTP/2 |
| Payload | JSON | JSON | Protobuf (binary) |
| HTTP caching | native | hard — one POST endpoint | no |
| Browser support | native | native | needs a proxy |
| Schema | OpenAPI (optional) | mandatory | mandatory `.proto` |
| Best for | public APIs, CRUD | varied clients, mobile | internal microservices |

When to use it:

- **REST** — a public API, or anything that benefits from HTTP caching and CDN
  support. The default, and rightly so.
- **GraphQL** — several clients needing different shapes of the same data, especially
  mobile where round trips are expensive. Cost: caching, rate limiting, and query-depth
  abuse all become your problem.
- **gRPC** — internal service-to-service where latency and payload size matter and
  both ends are yours. Not directly callable from a browser without grpc-web.

Interview answer:

"REST unless there is a specific reason. GraphQL when client data needs genuinely
diverge and the mobile round-trip cost is real. gRPC inside the cluster where I
control both ends and want generated clients and binary framing."

## 19. Polling, Long Polling, SSE, Or WebSockets?

Four ways to get server updates to a client, in increasing capability.

```viz
type: flow
title: Realtime transports, simplest first
Short polling :: client asks every N seconds — simple, wasteful, laggy
Long polling :: server holds the request open until there is news — fewer requests
SSE :: one long-lived HTTP response streaming events — server to client only
WebSocket :: a persistent bidirectional connection after an HTTP upgrade
```

| | SSE | WebSocket |
| --- | --- | --- |
| Direction | server → client | bidirectional |
| Protocol | plain HTTP | `ws://` after a 101 upgrade |
| Data | UTF-8 text only | text and binary |
| Reconnect | automatic, built in | you implement it |
| Proxy friendliness | high — it is just HTTP | needs explicit upgrade config |
| HTTP/2 multiplexing | yes | no |

When to use it:

- **SSE** — notifications, live dashboards, streaming LLM tokens, progress bars. If
  the client only listens, SSE is less machinery and reconnects for free.
- **WebSocket** — chat, collaborative editing, multiplayer, anything where the client
  sends frequently.
- **Long polling** — a fallback where corporate proxies block the others.

Interview trap:

SSE over HTTP/1.1 is limited by the browser's ~6 connections per domain, and each SSE
stream holds one permanently. Six open tabs can exhaust the budget for that origin.
Over HTTP/2 this disappears, since streams are multiplexed.

Important:

Both need proxy configuration. Nginx buffers proxied responses by default, which
breaks SSE silently — it works locally and delivers nothing in production until the
buffer fills.

## 20. Which Security Headers Should Every Response Have?

```txt
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{random}'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

What each one stops:

| Header | Attack it blocks |
| --- | --- |
| `Strict-Transport-Security` (HSTS) | protocol downgrade and SSL-stripping — the browser refuses plain HTTP for this domain |
| `Content-Security-Policy` (CSP) | XSS — restricts which scripts may execute |
| `X-Content-Type-Options: nosniff` | MIME confusion — stops a `.txt` upload being run as JavaScript |
| `Referrer-Policy` | leaking full URLs (with tokens) in the `Referer` header |
| `Permissions-Policy` | third-party frames silently using camera, mic, or location |

Important:

CSP is the only real defence-in-depth against XSS, and `unsafe-inline` in `script-src`
disables most of its value. Use a per-request **nonce** instead:

```txt
Content-Security-Policy: script-src 'self' 'nonce-r4nd0m'
<script nonce="r4nd0m">/* allowed */</script>
```

Interview trap:

`X-Frame-Options: DENY` is the legacy clickjacking defence; the modern replacement is
`Content-Security-Policy: frame-ancestors 'none'`. Send both while older browsers are
still in scope.

Edge cases:

HSTS with `preload` is effectively irreversible — the domain ships in browser binaries
and removal takes months. Never add `preload` until every subdomain is confirmed
HTTPS-only.

## 21. How Do You Make Retries Safe With Idempotency Keys?

A `POST` is not idempotent, but real networks time out — and the client cannot tell a
lost request from a lost response.

```viz
type: flow
title: The duplicate-charge problem
Client sends POST /payments :: charge $100
Server processes it :: the charge succeeds
Response is lost :: network timeout — the client sees only a failure
Client retries :: the customer is charged twice
```

The fix is a client-generated key that the server uses to deduplicate:

```txt
POST /payments
Idempotency-Key: 7f3c1e6a-9b2d-4e1f-8a77-6f2b0c5d1a34
{"amount": 10000, "currency": "usd"}
```

```js
async function createPayment(key, body) {
  const existing = await store.get(key);
  if (existing) return existing;          // replay the original response

  const result = await charge(body);
  await store.set(key, result, { ttl: 86_400 }); // keep for 24h
  return result;
}
```

Important:

Store the key **and the response** together, in the same transaction as the side
effect. If you record the key before the charge completes, a crash between them turns
a retry into a silent no-op that reports success without charging.

Interview answer:

"The client generates a UUID per logical operation and reuses it across retries. The
server stores key plus response atomically and replays the stored response on a
repeat. That converts an unsafe POST into something a client, a proxy, or a queue
consumer can retry freely."

## 22. How Do You Debug HTTP Problems With curl?

`curl` is the fastest way to separate a client problem from a server problem.

```bash
# Full exchange: DNS, TLS, request and response headers
curl -v https://api.example.com/users

# Response headers only
curl -I https://api.example.com/users

# Where is the time going?
curl -w "dns:%{time_namelookup} tls:%{time_appconnect} ttfb:%{time_starttransfer} \
total:%{time_total}\n" -o /dev/null -s https://api.example.com/health

# Follow redirects and show each hop
curl -IL https://example.com

# Send JSON with auth
curl -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"a@b.com"}'

# Reproduce a CORS preflight exactly as the browser sends it
curl -X OPTIONS https://api.example.com/users \
  -H "Origin: https://app.example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,authorization" -i

# Test a specific HTTP version
curl --http1.1 -I https://example.com
curl --http3  -I https://example.com

# Bypass DNS to test a specific backend directly
curl --resolve api.example.com:443:10.0.1.42 https://api.example.com/health
```

Interview method:

`--resolve` is the one worth memorising. It sends the correct `Host` header and TLS
SNI while connecting to an IP you choose — so you can test one backend behind a load
balancer and determine whether a fault is in a single instance or the whole pool.

Strong answer:

"If `curl` succeeds and the browser fails, it is CORS, a cookie attribute, or caching
— all browser-enforced. If `curl` fails too, it is DNS, TLS, or the server. That one
comparison eliminates half the search space immediately."

## Sources Used

- <https://developer.mozilla.org/en-US/docs/Web/HTTP>
- <https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers>
- <https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS>
- <https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies>
- <https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching>
- <https://www.rfc-editor.org/rfc/rfc9110.html>
- <https://www.rfc-editor.org/rfc/rfc9114.html>
- <https://www.rfc-editor.org/rfc/rfc8446>
- <https://web.dev/articles/content-security-policy>
- <https://curl.se/docs/manpage.html>
