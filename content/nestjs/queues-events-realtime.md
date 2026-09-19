# NestJS Queues, Events And Realtime Interview Guide

NestJS interview guidance for the work that happens outside a normal request:
background jobs with BullMQ, scheduled tasks, in-process events, WebSocket gateways,
scaling realtime across replicas, server-sent events, CQRS, reusable configurable
modules, and the performance traps that only appear under load.

Read the NestJS Fundamentals, Dependency Injection, Request Lifecycle, Data &
Persistence, and Auth & Microservices guides first — this one assumes all of those.

## 1. Why Move Work Off The Request At All?

An HTTP handler should do the smallest amount of work that lets it return a correct
answer. Everything else — email, thumbnails, exports, webhooks, analytics — belongs
somewhere the user is not waiting.

```ts
// Bad: the user waits for work they do not care about.
@Post()
async register(@Body() dto: CreateUserDto) {
  const user = await this.users.create(dto);
  await this.mail.sendWelcome(user);        // 800ms of third-party latency
  await this.analytics.track("signup", user); // 200ms more
  await this.crm.sync(user);                  // and this one is flaky
  return user;                                // ~1.2s, and any failure loses the signup
}
```

```ts
// Better: persist, enqueue, return.
@Post()
async register(@Body() dto: CreateUserDto) {
  const user = await this.users.create(dto);
  await this.queue.add("post-signup", { userId: user.id });
  return user;                                 // ~40ms
}
```

Problem it solves:

Three things at once. The response gets fast, a third-party outage stops being *your*
outage, and retries become possible — a failed email can be retried five times over an
hour without the user ever knowing.

```viz
type: flow
title: Choosing where work belongs
Needed for the response :: do it inline — the user is waiting on the answer
Slow, retryable, not needed :: queue it — email, exports, webhooks, sync
Recurring on a clock :: scheduled task — cleanup, reports, reconciliation
Other modules care :: emit an event — keep the caller from knowing who listens
```

Interview answer:

"I ask whether the caller needs the result to be correct. If not, it goes on a queue.
That keeps p99 latency tied to my own database rather than to somebody else's API."

## 2. How Do You Run Background Jobs With BullMQ?

BullMQ is the standard Nest queue, backed by Redis.

```ts
@Module({
  imports: [
    BullModule.forRoot({ connection: { host: "redis", port: 6379 } }),
    BullModule.registerQueue({ name: "emails" }),
  ],
})
export class EmailsModule {}
```

```ts
// Producer.
@Injectable()
export class UsersService {
  constructor(@InjectQueue("emails") private queue: Queue) {}

  async register(dto: CreateUserDto) {
    const user = await this.repo.create(dto);

    await this.queue.add("welcome", { userId: user.id }, {
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 }, // 1s, 2s, 4s, 8s, 16s
      removeOnComplete: 1000,   // keep only the last 1000 completed jobs
      removeOnFail: 5000,
    });

    return user;
  }
}
```

```ts
// Consumer.
@Processor("emails")
export class EmailsProcessor extends WorkerHost {
  async process(job: Job<{ userId: string }>) {
    switch (job.name) {
      case "welcome":
        return this.mail.sendWelcome(job.data.userId);
    }
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job, err: Error) {
    this.logger.error({ jobId: job.id, attempts: job.attemptsMade, err }, "job failed");
  }
}
```

Important:

Pass an **id**, never a whole entity. Job payloads are serialised to JSON and may sit
in Redis for minutes. A job carrying a snapshot of a user row will act on stale data;
a job carrying `userId` reads the current row when it runs.

Edge cases:

- `removeOnComplete` is not optional in practice. Without it, completed jobs
  accumulate in Redis until it hits its memory limit and starts evicting — which can
  silently drop *pending* jobs too.
- A CPU-heavy processor blocks the event loop of whatever process runs it. Run workers
  as a separate deployment from the API, or use BullMQ's sandboxed processors.

## 3. Why Must Jobs Be Idempotent, And How Do You Make Them So?

`attempts: 5` means the same job can execute five times. A worker can also be killed
*after* doing its work but *before* acknowledging it — so at-least-once delivery is
the guarantee, and exactly-once is not available.

```viz
type: flow
title: How a job runs twice
Worker picks up the job :: sends the welcome email successfully
Pod is terminated :: mid-deploy, before the job is marked complete
Job returns to the queue :: its lock expires and another worker claims it
Email is sent again :: the user receives two — unless the job is idempotent
```

```ts
// Idempotent: check state before acting, and record the effect.
async process(job: Job<{ userId: string }>) {
  const user = await this.users.findOne(job.data.userId);

  if (user.welcomeEmailSentAt) return;          // already done — exit quietly

  await this.mail.sendWelcome(user);
  await this.users.update(user.id, { welcomeEmailSentAt: new Date() });
}
```

Deduplicate at enqueue time with a deterministic id:

```ts
// The same logical job can only ever exist once.
await this.queue.add("welcome", { userId }, { jobId: `welcome:${userId}` });
```

Interview trap:

Marking the job complete *before* the side effect is worse than marking it after. A
crash between the two turns a retry into a silent no-op that reports success —
the email is never sent and nothing logs an error. Always act first, record second,
and make the action itself safe to repeat.

Strong answer:

"At-least-once delivery means idempotency is a requirement, not a refinement. I use a
deterministic `jobId` to stop duplicates being queued, and a state check inside the
processor so a retry that does get through is a no-op."

## 4. How Do You Schedule Recurring Tasks?

`@nestjs/schedule` provides cron jobs, intervals, and timeouts as decorators.

```ts
@Injectable()
export class ReportsTask {
  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: "daily-report", timeZone: "UTC" })
  async generateDailyReport() {
    await this.reports.generateFor(subDays(new Date(), 1));
  }

  @Interval(60_000)
  async pollExternalStatus() { /* ... */ }

  @Timeout(5000)
  async warmCacheOnBoot() { /* runs once, 5s after startup */ }
}
```

Interview trap:

This is the single biggest production mistake with Nest scheduling. **Every replica
runs the decorator.** Three pods means the daily report generates three times, and a
"send invoices" job charges every customer three times.

```viz
type: flow
title: Why scheduled tasks duplicate
Deployment scales to 3 pods :: each one loads ScheduleModule
2am arrives :: all three fire the same @Cron independently
Result :: three reports, three emails, three charges
```

Fix:

Take a distributed lock, so only one replica proceeds:

```ts
@Cron(CronExpression.EVERY_DAY_AT_2AM)
async generateDailyReport() {
  const acquired = await this.redis.set("lock:daily-report", "1", "EX", 300, "NX");
  if (!acquired) return;                 // another replica already has it

  await this.reports.generateFor(subDays(new Date(), 1));
}
```

Better still:

Use a **repeatable BullMQ job** instead. The queue guarantees a single delivery to one
worker, and you inherit retries, backoff, and observability that a bare `@Cron` does
not have:

```ts
await this.queue.add("daily-report", {}, {
  repeat: { pattern: "0 2 * * *" },
  jobId: "daily-report",                 // one schedule, however many replicas enqueue it
});
```

When `@Cron` is still fine:

A single-replica internal service, or a genuinely idempotent cleanup task where a
double run is harmless.

## 5. How Do You Decouple Modules With Events?

`@nestjs/event-emitter` lets a module announce that something happened without knowing
who reacts.

```ts
// Publisher: knows nothing about email, analytics, or CRM.
@Injectable()
export class OrdersService {
  constructor(private events: EventEmitter2) {}

  async create(dto: CreateOrderDto) {
    const order = await this.repo.save(dto);
    this.events.emit("order.created", new OrderCreatedEvent(order.id, order.userId));
    return order;
  }
}
```

```ts
// Subscribers: added and removed without touching OrdersService.
@Injectable()
export class OrderNotifications {
  @OnEvent("order.created", { async: true })
  async handle(event: OrderCreatedEvent) {
    await this.queue.add("order-confirmation", { orderId: event.orderId });
  }
}
```

Benefits:

This is the cleanest way to break a circular dependency between two feature modules.
Instead of `OrdersService` importing `UsersService` and vice versa, both emit and
listen — and the `forwardRef` disappears.

Tradeoff:

`EventEmitter2` is **in-process and in-memory**. It is not a message broker:

```txt
Not durable    a crash between emit and handle loses the event entirely
Not delivered  across replicas — only listeners in THIS process run
Not retried    a throwing listener just logs; nothing re-delivers it
```

The rule:

In-process events for decoupling code you own inside one deployable. A queue or broker
for anything that must survive a restart or reach another service. A common and
correct pattern is to use the event only to *enqueue*, as above — the emitter stays
decoupled and the queue provides the durability.

Interview trap:

Without `{ async: true }`, listeners run synchronously inside the emitting call, so a
slow listener adds its latency to the request that triggered it — and a throwing
listener can fail the original operation.

## 6. How Do WebSocket Gateways Work?

A gateway is a provider decorated with `@WebSocketGateway()`. Guards, pipes,
interceptors, and filters apply much as they do in controllers.

```ts
@WebSocketGateway({ namespace: "chat", cors: { origin: "https://app.example.com" } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  async handleConnection(client: Socket) {
    try {
      const user = await this.auth.verify(client.handshake.auth.token);
      client.data.user = user;
      await client.join(`user:${user.id}`);   // a room per user, for targeted pushes
    } catch {
      client.disconnect(true);                 // reject unauthenticated sockets early
    }
  }

  handleDisconnect(client: Socket) {
    this.presence.markOffline(client.data.user?.id);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("message")
  async onMessage(@MessageBody() dto: MessageDto, @ConnectedSocket() client: Socket) {
    const saved = await this.messages.create(dto, client.data.user.id);
    this.server.to(`room:${dto.roomId}`).emit("message", saved);
  }
}
```

Interview trap:

Guards run **per message**, not per connection. Authenticating only in
`handleConnection` means a token that expires mid-session keeps working until the
socket drops — potentially hours. Authenticate at connect for a fast rejection, and
re-verify on privileged messages.

Important:

Gateway exceptions must be `WsException`, not `HttpException`. An `HttpException`
thrown inside a gateway does not produce a usable client error, because there is no
HTTP response to attach a status to.

Edge cases:

Global HTTP pipes are not always applied to gateways. Bind validation explicitly if
you rely on it:

```ts
@UsePipes(new ValidationPipe({ whitelist: true }))
@SubscribeMessage("message")
```

## 7. How Do You Scale WebSockets Across Multiple Replicas?

`this.server.emit()` only reaches sockets connected to **this process**. With three
replicas, roughly two thirds of your users never receive the message.

```viz
type: flow
title: Why messages go missing at scale
User A connects :: load balancer routes them to pod 1
User B connects :: routed to pod 2 — same chat room, different process
A sends a message :: pod 1 emits to its own sockets only
B receives nothing :: pod 2 never heard about it
```

Fix — a Redis adapter, so emits propagate between processes:

```ts
// redis-io.adapter.ts
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  async connectToRedis() {
    const pubClient = createClient({ url: "redis://redis:6379" });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
```

```ts
// main.ts
const adapter = new RedisIoAdapter(app);
await adapter.connectToRedis();
app.useWebSocketAdapter(adapter);
```

Important:

Sticky sessions are also required when Socket.IO falls back to HTTP long polling,
because the handshake spans several requests that must reach the same process. With
`transports: ["websocket"]` only, stickiness is unnecessary — but you lose the
fallback for clients behind restrictive proxies.

Interview answer:

"A gateway is stateful by nature — the connection lives in one process. Scaling it
means a pub/sub adapter so any pod can reach any socket, plus sticky sessions if
polling fallback is enabled. That is the part people forget until the second replica
appears."

## 8. How Do You Stream Server-Sent Events From Nest?

For one-way updates, SSE is far less machinery than WebSockets — and Nest has
first-class support.

```ts
@Controller("notifications")
export class NotificationsController {
  constructor(private events: EventEmitter2) {}

  @Sse("stream")
  stream(@CurrentUser() user: User): Observable<MessageEvent> {
    return fromEvent(this.events, `notification.${user.id}`).pipe(
      map((data) => ({ data }) as MessageEvent),
      takeUntil(this.shutdown$),          // end cleanly on shutdown
    );
  }
}
```

The `@Sse()` decorator expects an `Observable`; Nest handles the
`text/event-stream` headers and framing.

When to use it:

Notifications, progress bars, live dashboards, streaming LLM tokens — anything where
the client only listens. SSE reconnects automatically, works over plain HTTP, and
passes through proxies that block WebSocket upgrades.

Interview trap:

Nginx buffers proxied responses by default, so SSE works locally and delivers nothing
in production until the buffer fills. Disable buffering for that route:

```nginx
location /notifications/stream {
  proxy_pass http://backend;
  proxy_buffering off;
  proxy_read_timeout 3600s;
}
```

Important:

Every open stream holds a connection and an RxJS subscription for its lifetime. Always
terminate the observable — on client disconnect and on application shutdown — or
memory grows until restart.

## 9. What Is The CQRS Module For?

CQRS (Command Query Responsibility Segregation) separates the write path from the read
path, with events between them.

```ts
export class CreateOrderCommand {
  constructor(readonly userId: string, readonly items: Item[]) {}
}

@CommandHandler(CreateOrderCommand)
export class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
  constructor(private repo: OrdersRepository, private bus: EventBus) {}

  async execute(command: CreateOrderCommand) {
    const order = await this.repo.save(command);
    this.bus.publish(new OrderCreatedEvent(order.id));
    return order.id;
  }
}
```

```ts
@Controller("orders")
export class OrdersController {
  constructor(private commands: CommandBus, private queries: QueryBus) {}

  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: User) {
    return this.commands.execute(new CreateOrderCommand(user.id, dto.items));
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.queries.execute(new GetOrderQuery(id));
  }
}
```

When to use it:

- Reads and writes have genuinely different shapes or scaling needs — for example a
  normalised write model and a denormalised read projection.
- One write triggers several independent side effects you want decoupled from the
  handler.
- An audit trail or event-sourced history is an actual requirement.

When not to use it:

A CRUD module. CQRS turns one service method into a command class, a handler, a bus
registration, and an event — four files where one method would do. It pays for itself
only when the decoupling carries real weight.

Interview answer:

"CQRS is a structural answer to a structural problem. If the read and write models are
the same shape, it is ceremony. I would reach for it when projections diverge from the
write model, or when event sourcing is already a requirement."

## 10. How Do You Build A Reusable Configurable Module?

Shared infrastructure modules — a mail client, an S3 wrapper, a feature-flag service —
need configuration from the consuming app. Hand-writing `forRootAsync` means
implementing `useFactory`, `useClass`, and `useExisting` yourself.
`ConfigurableModuleBuilder` generates all of it.

```ts
// mail.module-definition.ts
export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<MailOptions>()
    .setClassMethodName("forRoot")      // generates forRoot AND forRootAsync
    .setExtras({ isGlobal: false }, (definition, extras) => ({
      ...definition,
      global: extras.isGlobal,
    }))
    .build();
```

```ts
// mail.module.ts
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule extends ConfigurableModuleClass {}
```

```ts
// Both call styles now exist, with no extra code.
MailModule.forRoot({ apiKey: "..." });

MailModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({ apiKey: config.getOrThrow("MAIL_KEY") }),
});
```

```ts
// Consume the generated token.
@Injectable()
export class MailService {
  constructor(@Inject(MODULE_OPTIONS_TOKEN) private options: MailOptions) {}
}
```

Why this is good:

The async variants are exactly what people get wrong by hand — forgetting
`useExisting`, or dropping the `imports` array so the factory cannot resolve
`ConfigService`. Generating them removes a whole class of module-wiring bugs.

When to use it:

Any module intended to be imported by more than one application, or published to a
registry. For a module used once inside a single app, a plain `@Module` reading
`ConfigService` directly is simpler and fine.

## 11. What Are The Performance Traps In Async And Realtime Nest Code?

```viz
type: queues
title: Ranked by how often they cause a real incident
Scheduled task per replica :: duplicated work, duplicated side effects
Gateway without a pub/sub adapter :: messages reach only one pod's sockets
CPU work inside a processor :: blocks the event loop for every other job
Unbounded queue growth :: producers outpace workers, Redis fills, jobs are evicted
Leaked SSE/WS subscriptions :: memory climbs until restart
```

Find slow work rather than guessing at it:

```ts
@Injectable()
export class TimingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const start = process.hrtime.bigint();
    const label = `${context.getClass().name}.${context.getHandler().name}`;

    return next.handle().pipe(
      tap(() => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        if (ms > 200) this.logger.warn({ label, ms }, "slow handler");
      }),
    );
  }
}
```

Watch queue depth, not just error rate:

```ts
const counts = await this.queue.getJobCounts("waiting", "active", "failed", "delayed");
// waiting climbing steadily means workers cannot keep up — scale them, or the
// queue becomes an unbounded buffer that hides the real bottleneck.
```

Important:

A growing `waiting` count is the earliest warning that a background system is failing,
and it appears long before users notice. Alert on queue depth and on oldest-job age —
error rate alone stays flat while everything silently falls behind.

Interview answer:

"I instrument queue depth and job age, because those degrade before anything visible
does. For the API itself I add a timing interceptor and look at the slow handlers —
in practice it is almost always the ORM or an accidental request-scoped provider,
not Nest."

## Sources Used

- <https://docs.nestjs.com/techniques/queues>
- <https://docs.nestjs.com/techniques/task-scheduling>
- <https://docs.nestjs.com/techniques/events>
- <https://docs.nestjs.com/websockets/gateways>
- <https://docs.nestjs.com/websockets/adapter>
- <https://docs.nestjs.com/techniques/server-sent-events>
- <https://docs.nestjs.com/recipes/cqrs>
- <https://docs.nestjs.com/fundamentals/dynamic-modules>
- <https://docs.bullmq.io/>
