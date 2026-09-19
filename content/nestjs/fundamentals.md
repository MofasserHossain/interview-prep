# NestJS Fundamentals Interview Guide

NestJS fundamentals covering what the framework adds over Express, the layered
architecture, modules and their metadata, dynamic and global modules, controllers
and routing, providers, project structure, lifecycle hooks, graceful shutdown,
configuration, and the Express versus Fastify adapters.

## 1. What Is NestJS, And Why Use It Over Bare Express?

NestJS supplies the architecture Express deliberately leaves to you: modules,
dependency injection, and a defined request lifecycle. It runs on Express by
default and can run on Fastify instead.

```js
// Express: structure is entirely your decision
app.get("/users/:id", async (req, res) => {
  const user = await db.query("SELECT * FROM users WHERE id = ?", [req.params.id]);
  res.json(user);
});
```

```ts
// NestJS: layers and wiring are prescribed
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }
}
```

Benefits:

- one structure across a team, so every service looks alike
- dependency injection makes units testable without monkey-patching modules
- validation, serialisation, and error handling are declarative
- TypeScript throughout, with decorators carrying metadata

When not to use it:

A service with three endpoints. Nest's module and provider ceremony costs more than
it returns until there is real domain complexity, more than one team, or a codebase
that will outlive its authors.

Tradeoff:

You gain consistency and lose directness. The framework decides a lot, and
debugging means understanding Nest's lifecycle rather than reading one handler top
to bottom.

## 2. What Is The Layered Architecture Nest Expects?

```viz
type: flow
title: The intended request path
Controller :: HTTP concerns only - extract, delegate, return
Service :: business rules, orchestration, transactions
Repository :: data access and queries
Database :: the store itself
```

Each layer should know only about the one below it.

```ts
@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto); // no logic here
  }
}
```

```ts
@Injectable()
export class OrdersService {
  constructor(private readonly repo: OrdersRepository) {}

  async create(dto: CreateOrderDto) {
    if (await this.repo.existsFor(dto.idempotencyKey)) {
      throw new ConflictException("Duplicate order");
    }
    return this.repo.save(dto);
  }
}
```

Why it matters:

Keeping HTTP out of the service means the same logic serves an HTTP controller, a
message consumer, and a scheduled job without change. A service that takes a
`Request` object cannot be reused by a Kafka handler.

Interview note:

The most common violation is business logic in the controller — a conditional, a
calculation, a second database call. The test is whether the controller would still
be correct if the transport changed.

## 3. What Is A Module?

A module groups related controllers and providers and declares what it needs from,
and offers to, other modules.

```ts
@Module({
  imports: [TypeOrmModule.forFeature([User])], // what this module consumes
  controllers: [UsersController],              // HTTP entry points
  providers: [UsersService, UsersRepository],  // injectables, module-private
  exports: [UsersService],                     // what other modules may inject
})
export class UsersModule {}
```

| Property | Meaning |
| --- | --- |
| `imports` | other modules whose **exports** become available here |
| `controllers` | classes handling incoming requests |
| `providers` | injectables available **inside this module only** |
| `exports` | the subset of providers other modules may import |

Important:

A provider is **private unless exported**. Importing `UsersModule` does not give you
`UsersRepository` unless `UsersModule` exports it. This is the cause of the most
common Nest error:

```txt
Nest can't resolve dependencies of the OrdersService (?).
Please make sure that the argument UsersService at index [0] is available
in the OrdersModule context.
```

The checklist for that error:

1. Is the provider listed in **some** module's `providers`?
2. Does that module **export** it?
3. Does the consuming module **import** that module?

## 4. What Are Global And Dynamic Modules?

A **global** module skips repeated imports:

```ts
@Global()
@Module({ providers: [ConfigService], exports: [ConfigService] })
export class ConfigModule {}
```

Use it sparingly. It hides dependencies that would otherwise be explicit, which
makes the module graph harder to reason about and modules harder to test in
isolation.

A **dynamic** module is configured at import time by a static factory:

```ts
@Module({})
export class DatabaseModule {
  static forRoot(options: DbOptions): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        { provide: DB_OPTIONS, useValue: options },
        DatabaseService,
      ],
      exports: [DatabaseService],
      global: true,
    };
  }
}
```

```ts
@Module({ imports: [DatabaseModule.forRoot({ url: process.env.DB_URL })] })
export class AppModule {}
```

The naming conventions matter, and interviewers check them:

| Method | Meaning |
| --- | --- |
| `forRoot()` | configure once, application-wide |
| `forRootAsync()` | same, but options resolved asynchronously via a factory |
| `forFeature()` | per-module configuration — for example, which entities |
| `register()` / `registerAsync()` | configure per import, not application-wide |

`forRootAsync` exists because configuration usually depends on another provider:

```ts
TypeOrmModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: "postgres",
    url: config.getOrThrow("DATABASE_URL"),
  }),
});
```

## 5. What Are Controllers, And How Does Routing Work?

Controllers map routes to handlers and should contain no business logic.

```ts
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Query() query: ListUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.usersService.remove(id);
  }
}
```

Parameter decorators:

| Decorator | Reads |
| --- | --- |
| `@Param()` | route parameters |
| `@Query()` | the query string |
| `@Body()` | the request body |
| `@Headers()` | request headers |
| `@Ip()`, `@HostParam()` | connection details |
| `@Req()` / `@Res()` | the raw request or response |

Important:

Injecting `@Res()` switches the handler into **manual mode** — Nest stops handling
the response, so interceptors and serialisation no longer apply. Use
`@Res({ passthrough: true })` when you only need to set a header or a cookie.

Interview trap:

Route order matters. A static route declared **after** a parameterised one is
shadowed:

```ts
@Get(":id")   // matches "me" first
findOne() {}

@Get("me")    // unreachable
findMe() {}
```

Declare specific routes before parameterised ones.

## 6. How Do You Version An API In Nest?

```ts
app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
```

```ts
@Controller({ path: "users", version: "1" })
export class UsersV1Controller {}

@Controller({ path: "users", version: "2" })
export class UsersV2Controller {}
```

Four strategies are supported: `URI` (`/v1/users`), `HEADER`, `MEDIA_TYPE`, and
`CUSTOM`.

A handler can also serve several versions:

```ts
@Version(["1", "2"])
@Get()
findAll() {}
```

Tradeoff:

URI versioning is the most visible and the easiest to cache and debug. Header
versioning keeps URLs stable but makes a version-specific bug harder to reproduce
from a log line.

## 7. What Are Providers?

A provider is any class Nest can instantiate and inject. A service is the usual
kind.

```ts
@Injectable()
export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly mailer: MailerService,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    if (await this.repository.findByEmail(dto.email)) {
      throw new ConflictException("Email already registered");
    }

    const user = await this.repository.save(dto);
    await this.mailer.sendWelcome(user.email);
    return user;
  }
}
```

`@Injectable()` marks the class as manageable by the container, so Nest can read
its constructor parameter types and resolve them.

Providers are **singletons by default** — one instance shared across the whole
application.

Important:

Because they are singletons, instance state on a provider is shared across every
request. A field used as a per-request scratchpad is a concurrency bug that appears
only under load.

```ts
// Bad: shared mutable state on a singleton
@Injectable()
export class ReportService {
  private currentUserId: string;  // overwritten by concurrent requests
}
```

## 8. How Do You Structure A Large Nest Application?

Organise by **feature**, not by technical layer.

```txt
src/
├── main.ts
├── app.module.ts
├── common/                 cross-cutting: guards, filters, decorators, pipes
│   ├── decorators/
│   ├── filters/
│   └── interceptors/
├── config/                 configuration and validation
├── modules/
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   ├── users.repository.ts
│   │   ├── dto/
│   │   └── entities/
│   └── orders/
│       └── ...
└── database/               migrations, seeds
```

Why feature-first:

A change to "orders" touches one directory. Layer-first structure —
`controllers/`, `services/`, `dto/` — means every change touches four directories
and merge conflicts follow team boundaries badly.

Rules worth stating:

- a feature module owns its controller, service, repository, DTOs, and entities
- shared infrastructure lives in `common/`, and contains no business logic
- a module exports the **minimum** other modules need, usually just the service
- avoid a `shared` module that everything imports; it becomes a dependency magnet

## 9. What Are Lifecycle Hooks?

Nest calls hooks on modules and providers at defined points.

| Hook | When |
| --- | --- |
| `onModuleInit` | after the host module's dependencies are resolved |
| `onApplicationBootstrap` | after **all** modules are initialised |
| `onModuleDestroy` | after a termination signal, before teardown |
| `beforeApplicationShutdown` | after all `onModuleDestroy` handlers complete |
| `onApplicationShutdown` | connections are closed |

```ts
@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private consumer: Consumer;

  async onModuleInit() {
    this.consumer = kafka.consumer({ groupId: "orders" });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: "orders" });
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }
}
```

Important:

Do the connecting in `onModuleInit`, **not in the constructor**. A constructor
cannot be async, so awaiting there is impossible and the provider ends up in use
before it is ready.

`onApplicationBootstrap` is the hook for work that needs **other** modules to be
ready — warming a cache from the database, or registering routes discovered at
runtime.

## 10. How Do You Shut Down A Nest Application Gracefully?

Shutdown hooks are **off by default** and must be enabled:

```ts
const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
await app.listen(3000);
```

```ts
@Injectable()
export class AppShutdown implements OnApplicationShutdown {
  constructor(private readonly dataSource: DataSource) {}

  async onApplicationShutdown(signal?: string) {
    console.log(`Shutting down: ${signal}`);
    await this.dataSource.destroy();
  }
}
```

Why it matters:

`SIGTERM` is what Kubernetes and Docker send on stop. Without `enableShutdownHooks`
the process exits immediately, dropping in-flight requests and leaving database
connections and broker consumers unclosed.

Important:

`enableShutdownHooks` adds signal listeners, which has a small performance cost, so
Nest makes it opt-in. Enable it in any containerised deployment.

Edge case:

A long-lived connection — a WebSocket or an SSE stream — keeps the process alive
past `server.close()`. Add a forced-exit timeout so a stuck connection cannot block
a deploy indefinitely.

## 11. How Do You Handle Configuration?

`@nestjs/config` loads environment variables and, importantly, **validates them at
startup**.

```ts
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid("development", "production", "test"),
        PORT: Joi.number().default(3000),
        DATABASE_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().min(32).required(),
      }),
    }),
  ],
})
export class AppModule {}
```

```ts
@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  private get secret(): string {
    return this.config.getOrThrow<string>("JWT_SECRET");
  }
}
```

Why validation matters:

A missing or malformed variable fails at **boot**, with a clear message, rather
than at 3am when the first request needing it arrives.

Namespaced config keeps related values together and typed:

```ts
export default registerAs("database", () => ({
  url: process.env.DATABASE_URL,
  poolSize: Number(process.env.DB_POOL_SIZE ?? 10),
}));
```

```ts
constructor(@Inject(databaseConfig.KEY) private readonly db: ConfigType<typeof databaseConfig>) {}
```

Important:

Inject `ConfigService` rather than reading `process.env` directly. It keeps
configuration testable and gives one place where defaults and validation live.

## 12. Express Or Fastify?

Nest runs on either through a platform adapter.

```ts
// default
const app = await NestFactory.create(AppModule);

// Fastify
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter(),
);
```

| | Express | Fastify |
| --- | --- | --- |
| Throughput | lower | roughly 2x on JSON workloads |
| Ecosystem | very large | smaller |
| Middleware compatibility | anything Express | Fastify plugins |
| Default in Nest | yes | no |

When to switch:

When you are genuinely throughput-bound on HTTP handling and have measured it.
Most applications are bound by the database, not by the HTTP layer, so the change
buys nothing.

Important:

Switching adapters changes the underlying request and response objects. Any code
using `@Req()` or `@Res()` with Express-specific APIs breaks — which is another
argument for keeping raw request access out of services.

## 13. What Does The Nest CLI Give You?

```bash
npm i -g @nestjs/cli

nest new my-app
nest generate module users        # or: nest g mo users
nest generate controller users    # nest g co users
nest generate service users       # nest g s users
nest generate resource users      # module + controller + service + DTOs + tests
```

`nest g resource` is the one worth knowing — it scaffolds a complete CRUD feature,
asks whether you want REST, GraphQL, or a microservice, and **registers the module
in `app.module.ts` automatically**.

```bash
nest build
nest start --watch
```

Interview note:

The CLI also wires the generated module into its parent, which is why generated
code works immediately while hand-written modules often produce the "can't resolve
dependencies" error — the module was created but never imported.

## 14. How Do You Enable CORS, Compression, And Security Headers?

```ts
const app = await NestFactory.create(AppModule);

app.enableCors({
  origin: ["https://app.example.com"],
  credentials: true,
});

app.use(helmet());
app.use(compression());
app.setGlobalPrefix("api");

await app.listen(process.env.PORT ?? 3000);
```

Important:

`origin: true` or `origin: "*"` reflects any origin. Combined with
`credentials: true` that is a serious misconfiguration — it lets any site make
authenticated requests on the user's behalf. List origins explicitly.

`setGlobalPrefix` applies to every route, which is usually what you want behind a
reverse proxy. Exclude health checks so the orchestrator can reach them:

```ts
app.setGlobalPrefix("api", { exclude: ["health"] });
```

## 15. How Do You Expose Health Checks?

```ts
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.db.pingCheck("database")]);
  }
}
```

Two endpoints are worth separating:

| Endpoint | Answers | If it fails |
| --- | --- | --- |
| **liveness** | is the process alive? | restart the container |
| **readiness** | can it serve traffic? | remove from the load balancer |

Important:

A liveness probe that checks the database is a mistake. A brief database blip then
causes every replica to be killed and restarted, turning a recoverable incident
into an outage. Liveness should check only the process; readiness checks
dependencies.

## 16. How Do You Document The API?

```ts
const config = new DocumentBuilder()
  .setTitle("Orders API")
  .setVersion("1.0")
  .addBearerAuth()
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup("docs", app, document);
```

```ts
export class CreateUserDto {
  @ApiProperty({ example: "a@b.com" })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ minimum: 18 })
  @IsOptional()
  @IsInt()
  age?: number;
}
```

The CLI plugin removes most of the annotation burden by inferring from types:

```json
{ "compilerOptions": { "plugins": ["@nestjs/swagger"] } }
```

Benefits:

Because the schema is generated from the same DTOs that validate requests,
documentation cannot drift from behaviour — which is the usual failure of
hand-written API docs.

## 17. What Belongs In `main.ts`?

`main.ts` is the composition root: everything global is applied in one visible
place.

```ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.enableShutdownHooks();
  app.setGlobalPrefix("api", { exclude: ["health"] });

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
```

Important:

Globals registered here with `new` **cannot inject dependencies**. To inject into a
global pipe or filter, register it as a provider instead:

```ts
@Module({
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
```

The `APP_PIPE`, `APP_GUARD`, `APP_FILTER`, and `APP_INTERCEPTOR` tokens are the
injectable way to register globals, and this distinction is a frequent interview
question.

## 18. What Are The Common Structural Mistakes?

**A provider used but not exported** — the "can't resolve dependencies" error.

**Business logic in the controller** — it cannot be reused by a consumer or a job.

**Mutable instance state on a singleton provider** — a concurrency bug under load.

**`@Global()` everywhere** — hides the dependency graph and breaks isolated testing.

**Connecting in a constructor** instead of `onModuleInit` — the constructor cannot
await.

**`enableShutdownHooks()` forgotten** — in-flight requests are dropped on deploy.

**A parameterised route declared before a static one** — the static route is
unreachable.

**`@Res()` without `passthrough`** — interceptors and serialisation silently stop
applying.

**A global pipe registered with `new`** when it needs injection — use `APP_PIPE`.

**A liveness probe that checks the database** — a blip restarts every replica.

Strong answer:

> Nest's value is the enforced structure: modules define boundaries, DI makes
> everything testable, and the request lifecycle is the same in every service. The
> mistakes I watch for are logic leaking into controllers, state on singleton
> providers, and `@Global()` used to avoid thinking about module boundaries —
> because each one removes the benefit the framework was chosen for.

## Sources Used

- <https://docs.nestjs.com/modules>
- <https://docs.nestjs.com/controllers>
- <https://docs.nestjs.com/providers>
- <https://docs.nestjs.com/fundamentals/dynamic-modules>
- <https://docs.nestjs.com/fundamentals/lifecycle-events>
- <https://docs.nestjs.com/techniques/configuration>
- <https://docs.nestjs.com/techniques/versioning>
- <https://docs.nestjs.com/openapi/introduction>
- <https://docs.nestjs.com/recipes/terminus>
