# NestJS Auth, Testing And Microservices Interview Guide

Guidance covering JWT authentication and Passport, refresh tokens, password
hashing, role-based access control, sessions versus tokens, rate limiting with
`ThrottlerModule`, a security checklist, microservice transports, request-response
versus event patterns, Kafka and RabbitMQ, hybrid applications, and unit and
end-to-end testing.

## 1. How Do You Implement JWT Authentication?

```ts
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow("JWT_SECRET"),
        signOptions: { expiresIn: "15m" },
      }),
    }),
  ],
})
export class AuthModule {}
```

```ts
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async validate(email: string, password: string) {
    const user = await this.users.findByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return user;
  }

  async login(user: User) {
    const payload = { sub: user.id, email: user.email, roles: user.roles };

    return {
      accessToken: await this.jwt.signAsync(payload, { expiresIn: "15m" }),
      refreshToken: await this.jwt.signAsync(
        { sub: user.id },
        { expiresIn: "7d", secret: process.env.JWT_REFRESH_SECRET },
      ),
    };
  }
}
```

Important:

Return **one generic message** for both an unknown email and a wrong password.
Distinguishing them lets an attacker enumerate registered accounts.

Use `sub` for the user id — it is the registered JWT claim for the subject, and
libraries expect it.

Interview note:

Access and refresh tokens should use **different secrets**. With one secret, a
stolen refresh token can be replayed as an access token if the server does not
check the token type.

## 2. How Does Passport Integrate With Nest?

`@nestjs/passport` wraps a Passport strategy as an injectable guard.

```ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow("JWT_SECRET"),
    });
  }

  // the return value becomes request.user
  async validate(payload: { sub: string; email: string; roles: string[] }) {
    return { id: payload.sub, email: payload.email, roles: payload.roles };
  }
}
```

```ts
@UseGuards(AuthGuard("jwt"))
@Get("profile")
getProfile(@CurrentUser() user: User) {
  return user;
}
```

A named wrapper keeps the string out of every controller:

```ts
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
```

Important:

`validate()` runs **after** the signature and expiry are verified. Whatever it
returns becomes `request.user`, so returning the whole database record leaks it
into anything that serialises `request.user`. Return a minimal object.

`ignoreExpiration: true` is almost always a bug — it accepts expired tokens
indefinitely.

## 3. How Do Refresh Tokens Work?

```ts
@Post("refresh")
async refresh(@Body() dto: RefreshDto) {
  const payload = await this.jwt.verifyAsync(dto.refreshToken, {
    secret: process.env.JWT_REFRESH_SECRET,
  });

  const user = await this.users.findOne(payload.sub);
  const stored = await this.tokens.find(payload.sub, hash(dto.refreshToken));

  if (!stored || stored.revokedAt) {
    await this.tokens.revokeAllFor(payload.sub);  // possible token theft
    throw new UnauthorizedException();
  }

  await this.tokens.revoke(stored.id);            // rotate
  return this.auth.login(user);
}
```

Why the short access token plus a long refresh token:

A JWT cannot be revoked before it expires without a denylist. Keeping the access
token short — 15 minutes — bounds the damage of a leak, while the refresh token
lives server-side where it **can** be revoked.

**Rotation with reuse detection** is the important detail: each refresh issues a new
refresh token and invalidates the old one. If an already-used token is presented
again, that implies theft, so revoke the whole family and force a re-login.

Important:

Store refresh tokens **hashed**, like passwords. A database leak otherwise hands
over every active session.

Where to put them:

An `HttpOnly`, `Secure`, `SameSite=Lax` cookie for a browser client — unreadable
from JavaScript. Never `localStorage`.

## 4. How Do You Hash Passwords?

```ts
import * as bcrypt from "bcrypt";

const passwordHash = await bcrypt.hash(password, 12);
const ok = await bcrypt.compare(password, user.passwordHash);
```

| Algorithm | Notes |
| --- | --- |
| **argon2id** | current recommendation; memory-hard |
| **bcrypt** | well understood, widely available, 72-byte input limit |
| **scrypt** | memory-hard; available in Node's `crypto` |
| MD5, SHA-1, SHA-256 | **never** — far too fast to brute force |

Important:

Use the **async** API. `bcrypt.hashSync` blocks the event loop for the entire cost
factor, which at a factor of 12 is on the order of 200–300ms — every concurrent
login is serialised behind it. The async version uses the thread pool.

A cost factor of 12 is a reasonable default; raise it as hardware improves and
re-hash on next login.

Interview trap:

bcrypt truncates input at **72 bytes**. A very long passphrase is silently cut,
so two different long passwords can match. Pre-hash with SHA-256 if you allow long
inputs, or use argon2id.

## 5. How Do You Implement Role-Based Access Control?

```ts
export const ROLES_KEY = "roles";
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

```ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest();
    return required.some((role) => user?.roles?.includes(role));
  }
}
```

```ts
@Auth(Role.Admin)
@Delete(":id")
remove(@Param("id") id: string) {}
```

Roles answer *what kind of user*; they do not answer *may this user touch this
record*. Ownership belongs in the query:

```ts
await this.prisma.post.update({
  where: { id, authorId: user.id },   // ownership in the WHERE
  data: dto,
});
```

Important:

A guard cannot check ownership, because the record has not been loaded yet. Putting
ownership **in the query** also closes the gap between checking and using — there is
no window in which the row could change hands.

Interview note:

Prefer **permissions** over roles in the check. `@RequirePermission("order:delete")`
survives a role reorganisation; `@Roles("admin")` hard-codes policy into every
controller.

## 6. Sessions Or JWT?

| | Session (server-side) | JWT (stateless) |
| --- | --- | --- |
| State | in a store | in the token |
| Lookup per request | one | none |
| Revocation | **immediate** | only via a denylist |
| Size | a small cookie id | the whole payload, every request |
| Scaling | needs a shared store | trivial |
| Good for | browser apps, admin panels | APIs, mobile, service-to-service |

```ts
// Session-based
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new RedisStore({ client: redis }),
    cookie: { httpOnly: true, secure: true, sameSite: "lax", maxAge: 86_400_000 },
  }),
);
```

Tradeoff:

JWT avoids the lookup and cannot be revoked. Sessions cost a lookup and can be
revoked instantly. The common compromise is a short JWT with a server-side refresh
token — the lookup happens every 15 minutes rather than every request.

Interview note:

"JWTs are stateless, so they scale better" is only half an answer. The moment you
need logout-everywhere or immediate ban, you add a denylist — and you are back to a
lookup, with more complexity than a session would have been.

## 7. How Do You Add Rate Limiting?

```ts
@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: "short", ttl: 1000, limit: 3 },
      { name: "long", ttl: 60_000, limit: 100 },
    ]),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
```

```ts
@Throttle({ short: { ttl: 60_000, limit: 5 } })
@Post("login")
login(@Body() dto: LoginDto) {}

@SkipThrottle()
@Get("health")
health() {}
```

Multiple named tiers let you allow a short burst while capping sustained volume.

For several instances, the counter must be shared:

```ts
ThrottlerModule.forRoot({
  throttlers: [{ ttl: 60_000, limit: 100 }],
  storage: new ThrottlerStorageRedisService(redis),
});
```

Where it matters most:

- login and password reset — brute force and user enumeration
- anything sending email or SMS — cost amplification
- expensive queries and AI calls
- signup — spam accounts

Important:

The default tracker keys on IP, which is weak behind NAT and trivial to rotate.
Key on the **user id** where the request is authenticated, and on IP before
authentication.

```ts
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.id ?? req.ips[0] ?? req.ip;
  }
}
```

## 8. How Do You Secure A Nest API? The Checklist

```ts
app.use(helmet());
app.enableCors({ origin: allowedOrigins, credentials: true });
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
app.use(compression());
```

| Concern | Control |
| --- | --- |
| Input | `ValidationPipe` with `whitelist` — blocks mass assignment |
| Headers | `helmet()` |
| CORS | an explicit origin list, never `*` with credentials |
| Auth | short access tokens, rotating refresh tokens |
| Authorisation | ownership in the query, not only in a guard |
| Brute force | `ThrottlerModule` on auth routes |
| Secrets | `ConfigService` with startup validation |
| Errors | a filter that never leaks internal messages |
| Payload size | body size limits |
| SQL | parameterised queries — never string concatenation |
| Dependencies | `npm audit` in CI |

Important:

`origin: "*"` together with `credentials: true` is a serious misconfiguration — it
lets any site make authenticated requests on the user's behalf. Browsers reject
that combination, but a reflecting `origin: true` achieves the same thing and is
not rejected.

Interview note:

The highest-value control on that list is `whitelist: true`. Without it, a client
can post `{ "isAdmin": true }` and, if the DTO reaches an ORM `save()`, set the
column.

## 9. What Are Nest Microservices?

The same classes serve HTTP and message transports; only the decorator changes.

```ts
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.RMQ,
  options: {
    urls: ["amqp://localhost:5672"],
    queue: "orders_queue",
    queueOptions: { durable: true },
  },
});

await app.listen();
```

```ts
@Controller()
export class OrdersController {
  @MessagePattern({ cmd: "get_order" })     // request/response
  getOrder(@Payload() id: number) {
    return this.orders.findOne(id);
  }

  @EventPattern("order_created")            // fire and forget
  async handleOrderCreated(@Payload() data: OrderCreatedEvent) {
    await this.notifications.send(data);
  }
}
```

Supported transports: TCP, Redis, NATS, MQTT, RabbitMQ, Kafka, and gRPC.

Why it is attractive:

The service, the DTOs, and the validation are identical. Only the entry decorator
differs, so the same domain logic serves HTTP, a queue consumer, and a scheduled
job.

## 10. `@MessagePattern` vs `@EventPattern`

| | `@MessagePattern` | `@EventPattern` |
| --- | --- | --- |
| Semantics | request/response | fire and forget |
| Caller waits | **yes** | no |
| Return value | sent back | ignored |
| Failure | surfaces to the caller | handled by the consumer |
| Coupling | tighter | looser |

```ts
// Caller side
const order = await firstValueFrom(
  this.client.send<Order>({ cmd: "get_order" }, orderId),   // waits for a reply
);

this.client.emit("order_created", payload);                  // does not wait
```

The rule:

Use `emit` for notifications — something happened, others may care. Use `send` only
when the caller genuinely needs the result to continue.

Important:

Using request/response for a notification creates needless coupling **and** a
timeout you must handle. If the notification service is down, the order should
still be placed.

Interview note:

`send()` returns a **cold Observable** — nothing is sent until it is subscribed.
Calling `this.client.send(...)` without subscribing or awaiting does nothing at
all, silently. This is a frequent bug for people new to RxJS.

## 11. How Do You Use Kafka From Nest?

```ts
@Module({
  imports: [
    ClientsModule.register([
      {
        name: "KAFKA_SERVICE",
        transport: Transport.KAFKA,
        options: {
          client: { clientId: "orders", brokers: ["localhost:9092"] },
          consumer: { groupId: "orders-consumer" },
        },
      },
    ]),
  ],
})
export class OrdersModule {}
```

```ts
@Injectable()
export class OrdersService implements OnModuleInit {
  constructor(@Inject("KAFKA_SERVICE") private readonly kafka: ClientKafka) {}

  async onModuleInit() {
    // required for request/response only - subscribes to the reply topics
    this.kafka.subscribeToResponseOf("get_order");
    await this.kafka.connect();
  }

  emitOrderCreated(order: Order) {
    this.kafka.emit("order.created", { key: order.id, value: order });
  }
}
```

Two Kafka-specific details interviewers probe:

**1. `subscribeToResponseOf`** must be called in `onModuleInit` for every
request/response pattern. Nest creates a `<topic>.reply` topic, and without the
subscription the reply never arrives — the call hangs until it times out.

**2. The message key determines the partition.** Using the order id as the key
guarantees every event for one order lands on one partition, which is what
preserves ordering. Omitting the key round-robins and destroys per-entity
ordering.

Important:

Kafka gives **at-least-once** delivery, so a consumer must be idempotent. Dedupe on
an event id, or make the operation naturally idempotent.

Study path:

Partitions, consumer groups, offsets, and retention are covered in the Kafka Event
Streaming guide.

## 12. How Do You Use RabbitMQ From Nest?

```ts
ClientsModule.register([
  {
    name: "RMQ_SERVICE",
    transport: Transport.RMQ,
    options: {
      urls: ["amqp://localhost:5672"],
      queue: "orders_queue",
      queueOptions: { durable: true },
      noAck: false,          // manual acknowledgement
      prefetchCount: 10,
    },
  },
]);
```

```ts
@EventPattern("order_created")
async handle(@Payload() data: OrderCreatedEvent, @Ctx() context: RmqContext) {
  const channel = context.getChannelRef();
  const message = context.getMessage();

  try {
    await this.process(data);
    channel.ack(message);
  } catch (error) {
    channel.nack(message, false, false);   // do not requeue - send to the DLQ
  }
}
```

The settings that matter:

| Option | Why |
| --- | --- |
| `noAck: false` | the broker keeps the message until you acknowledge |
| `prefetchCount` | bounds how many unacknowledged messages one consumer holds |
| `durable: true` | the queue survives a broker restart |

Important:

`nack(message, false, true)` **requeues**, which for a poison message produces an
infinite loop — the consumer fails, requeues, fails again, forever. Requeue only for
transient failures, and route permanent failures to a dead-letter queue.

`prefetchCount` is the backpressure control. Without it, one consumer can take
thousands of messages it cannot process while others sit idle.

## 13. What Is A Hybrid Application?

One process that serves HTTP **and** consumes messages.

```ts
const app = await NestFactory.create(AppModule);

app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.KAFKA,
  options: { client: { brokers: ["localhost:9092"] } },
});

await app.startAllMicroservices();
await app.listen(3000);
```

Both entry points share the same providers, configuration, and database
connections.

When to use it:

A service that exposes an API **and** reacts to events about its own domain — an
orders service with REST endpoints that also consumes `payment.completed`.

Tradeoff:

They scale together. If message volume needs ten replicas but HTTP needs two, you
run ten of both. Splitting them into separate deployments of the same codebase is
the usual answer at that point.

Important:

Global pipes, filters, and interceptors registered for HTTP do **not** automatically
apply to the microservice transport. Register them for both, or validation silently
does not run on consumed messages.

## 14. How Do You Handle Errors Across Microservices?

Throw `RpcException` from a microservice handler:

```ts
@MessagePattern({ cmd: "get_order" })
async getOrder(@Payload() id: string) {
  const order = await this.orders.findOne(id);
  if (!order) throw new RpcException({ status: 404, message: "Order not found" });
  return order;
}
```

Translate it back to HTTP at the gateway:

```ts
@Catch(RpcException)
export class RpcExceptionFilter implements ExceptionFilter {
  catch(exception: RpcException, host: ArgumentsHost) {
    const error = exception.getError() as { status?: number; message?: string };
    const response = host.switchToHttp().getResponse();

    response.status(error.status ?? 500).json({
      statusCode: error.status ?? 500,
      message: error.message ?? "Internal error",
    });
  }
}
```

Resilience patterns worth naming:

```ts
const order = await firstValueFrom(
  this.client.send({ cmd: "get_order" }, id).pipe(
    timeout(3000),
    retry({ count: 2, delay: 500 }),
    catchError(() => of(null)),   // degrade rather than fail the page
  ),
);
```

Important:

A synchronous call between services makes the caller's availability the **product**
of both. Three services chained at 99.9% each gives 99.7%. Timeouts, retries with
backoff, and a fallback are what keep one slow dependency from taking down the
caller.

## 15. How Do You Unit Test A Nest Service?

```ts
describe("UsersService", () => {
  let service: UsersService;
  let repository: jest.Mocked<UsersRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: { findByEmail: jest.fn(), save: jest.fn() } },
        { provide: MailerService, useValue: { sendWelcome: jest.fn() } },
      ],
    }).compile();

    service = module.get(UsersService);
    repository = module.get(UsersRepository);
  });

  it("rejects a duplicate email", async () => {
    repository.findByEmail.mockResolvedValue({ id: 1 } as User);

    await expect(service.create({ email: "a@b.com" } as CreateUserDto))
      .rejects.toThrow(ConflictException);
  });
});
```

Because dependencies come through the constructor, substituting them needs no
module mocking — which is the practical payoff of DI.

Interview note:

Assert on the **exception type**, not the message. `ConflictException` is the
contract that produces a 409; the wording is not.

## 16. How Do You Write End-To-End Tests?

```ts
describe("Users (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService)
      .useValue({ sendWelcome: jest.fn() })      // do not send real email
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));  // match main.ts
    await app.init();
  });

  afterAll(() => app.close());

  it("rejects an invalid email", () =>
    request(app.getHttpServer())
      .post("/users")
      .send({ email: "not-an-email", password: "longenough" })
      .expect(400));

  it("rejects an unauthenticated delete", () =>
    request(app.getHttpServer()).delete("/users/1").expect(401));
});
```

Important:

Apply the **same global pipes, filters, and interceptors** that `main.ts` applies.
Forgetting this is why validation passes in production and appears broken in
tests — or worse, the reverse.

The second test above is the one worth insisting on. Testing that a protected route
rejects an unauthenticated request verifies the guard is actually wired, which a
happy-path test never does.

Override selectively:

`overrideProvider`, `overrideGuard`, `overrideInterceptor`, and `overrideFilter`
let a test replace exactly one thing and keep everything else real.

## 17. How Do You Test Microservice Handlers?

A handler is a plain method, so call it directly:

```ts
it("processes an order event", async () => {
  const context = {
    getChannelRef: () => ({ ack: jest.fn(), nack: jest.fn() }),
    getMessage: () => ({}),
  } as unknown as RmqContext;

  await controller.handle({ orderId: "1" }, context);

  expect(notifications.send).toHaveBeenCalledWith({ orderId: "1" });
});
```

For a true integration test, start the microservice and send a real message:

```ts
const app = module.createNestMicroservice({ transport: Transport.TCP });
await app.listen();

const client = ClientProxyFactory.create({ transport: Transport.TCP });
const result = await firstValueFrom(client.send({ cmd: "get_order" }, "1"));
```

Interview note:

The acknowledgement path is what integration tests should cover. A handler that
processes correctly but never `ack`s looks fine in a unit test and redelivers
forever in production.

## 18. What Are The Common Auth And Microservice Gotchas?

**Distinguishing "unknown email" from "wrong password"** — account enumeration.

**One secret for access and refresh tokens** — a refresh token replayed as an
access token.

**Refresh tokens stored in plaintext** — a database leak hands over every session.

**`ignoreExpiration: true`** — expired tokens accepted forever.

**`bcrypt.hashSync`** — blocks the event loop for hundreds of milliseconds.

**Returning the whole user from `validate()`** — it leaks through `request.user`.

**Roles instead of ownership** — a guard cannot know whose record it is.

**Rate limiting keyed only on IP** — useless behind NAT.

**In-memory throttler storage across replicas** — the limit multiplies by instance
count.

**`this.client.send()` without subscribing** — a cold Observable does nothing.

**Missing `subscribeToResponseOf`** for Kafka request/response — the call hangs.

**Kafka messages without a key** — per-entity ordering is lost.

**`nack` with requeue on a poison message** — an infinite redelivery loop.

**Global pipes not registered on the microservice** — messages are never validated.

**End-to-end tests without the real global pipes** — tests and production disagree.

Strong answer:

> For auth I keep access tokens short and refresh tokens revocable, rotate refresh
> tokens with reuse detection, and put ownership in the query rather than relying
> on a guard — because a guard runs before the record is loaded. For microservices
> the decision I care about is `emit` versus `send`: request/response makes my
> availability the product of both services, so I use it only when the caller
> genuinely needs the result, and everything else is an event.

## Sources Used

- <https://docs.nestjs.com/security/authentication>
- <https://docs.nestjs.com/security/authorization>
- <https://docs.nestjs.com/security/rate-limiting>
- <https://docs.nestjs.com/security/helmet>
- <https://docs.nestjs.com/microservices/basics>
- <https://docs.nestjs.com/microservices/kafka>
- <https://docs.nestjs.com/microservices/rabbitmq>
- <https://docs.nestjs.com/microservices/exception-filters>
- <https://docs.nestjs.com/fundamentals/testing>
