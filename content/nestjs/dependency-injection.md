# NestJS Dependency Injection Interview Guide

Dependency injection guidance covering how the container resolves providers,
injection tokens, the four custom provider types, provider scopes and why request
scope is contagious, circular dependencies and `forwardRef`, `ModuleRef`, dynamic
modules with async options, durable providers for multi-tenancy, and swapping
implementations for tests.

## 1. How Does Dependency Injection Work In Nest?

You declare a dependency in the constructor; Nest builds the graph and supplies
it.

```ts
@Injectable()
export class UsersService {
  constructor(private readonly repository: UsersRepository) {}
}
```

At startup Nest reads the **parameter type metadata** that TypeScript emits,
finds a matching provider in the module scope, instantiates it once, and injects
it.

```viz
type: flow
title: How the container resolves a dependency
Read metadata :: emitDecoratorMetadata records the constructor parameter types
Find the token :: the class itself is the token by default
Search scope :: this module's providers, then its imported modules' exports
Instantiate :: dependencies first, depth-first, then the provider itself
Cache :: the instance is reused - providers are singletons by default
Inject :: the same instance is handed to everything that asks
```

The two `tsconfig.json` settings this depends on:

```json
{ "emitDecoratorMetadata": true, "experimentalDecorators": true }
```

Without `emitDecoratorMetadata`, the parameter types are erased and Nest cannot
resolve anything by class token — which is why a misconfigured `tsconfig` produces
resolution errors that look like module mistakes.

Why it matters:

Testing needs no module loader tricks. Substitute the dependency directly:

```ts
const module = await Test.createTestingModule({
  providers: [
    UsersService,
    { provide: UsersRepository, useValue: { findByEmail: jest.fn() } },
  ],
}).compile();
```

## 2. What Is An Injection Token?

A token is the **key** the container looks the provider up by. Using a class as its
own token is shorthand:

```ts
providers: [UsersService]
// is equivalent to
providers: [{ provide: UsersService, useClass: UsersService }]
```

A token can also be a string or a symbol, which is needed when there is no class to
name — a config object, a third-party client, a primitive.

```ts
export const DB_CLIENT = Symbol("DB_CLIENT");

providers: [{ provide: DB_CLIENT, useValue: pool }]
```

```ts
constructor(@Inject(DB_CLIENT) private readonly db: Pool) {}
```

The `@Inject()` decorator is required for non-class tokens, because there is no
type for Nest to infer from.

Important:

Prefer a **symbol or an exported constant** over a bare string. A string token is
not type-checked, so a typo becomes a runtime resolution error rather than a
compile error — and two modules can silently collide on the same string.

Interview note:

An abstract class makes a good token because it is both a type and a value:

```ts
export abstract class PaymentGateway {
  abstract charge(amount: number): Promise<Receipt>;
}

providers: [{ provide: PaymentGateway, useClass: StripeGateway }]
constructor(private readonly gateway: PaymentGateway) {} // no @Inject needed
```

## 3. What Are The Four Custom Provider Types?

```ts
// useClass - swap the implementation behind a token
{
  provide: PaymentGateway,
  useClass: process.env.NODE_ENV === "production" ? StripeGateway : FakeGateway,
}

// useValue - a constant, or a test double
{ provide: "CONFIG", useValue: { retries: 3 } }

// useFactory - computed, possibly async, with its own dependencies
{
  provide: "DATABASE",
  useFactory: async (config: ConfigService) => createPool(config.get("DB_URL")),
  inject: [ConfigService],
}

// useExisting - an alias for an existing provider
{ provide: "LEGACY_LOGGER", useExisting: LoggerService }
```

| Type | Use for |
| --- | --- |
| `useClass` | choosing an implementation at module definition time |
| `useValue` | constants, config objects, test doubles |
| `useFactory` | anything needing async setup or other providers |
| `useExisting` | a second name for one instance, during a rename or migration |

`useExisting` vs `useClass`:

`useExisting` creates an **alias** — both tokens resolve to the same instance.
`useClass` creates a **second instance** of the same class. Using `useClass` where
you meant `useExisting` gives you two connection pools rather than one.

Important:

A `useFactory` may be async, and Nest awaits it before the application starts. That
is the correct place for anything that must connect at boot.

## 4. What Are Provider Scopes?

| Scope | Instances | Use for |
| --- | --- | --- |
| `DEFAULT` | one, shared | almost everything |
| `REQUEST` | one per request | per-request context such as a tenant |
| `TRANSIENT` | one per injection site | stateful helpers such as a scoped logger |

```ts
@Injectable({ scope: Scope.REQUEST })
export class RequestContextService {
  constructor(@Inject(REQUEST) private readonly request: Request) {}

  get tenantId(): string {
    return this.request.headers["x-tenant-id"] as string;
  }
}
```

```ts
@Injectable({ scope: Scope.TRANSIENT })
export class ContextLogger {
  private context: string;
  setContext(context: string) { this.context = context; }
}
```

`TRANSIENT` means each consumer gets its **own** instance, so two services can each
set a different logging context without interfering.

Important:

The default singleton scope is what makes Nest fast. Every non-default scope costs
instantiation work, and request scope costs it on every request.

## 5. Why Is Request Scope Contagious?

Because a singleton cannot hold a reference to something that changes per request.

```txt
RequestContextService  (REQUEST)
        ↑ injected by
OrdersService          -> becomes REQUEST
        ↑ injected by
OrdersController       -> becomes REQUEST
```

Any provider injecting a request-scoped provider **becomes request-scoped itself**,
and so does anything injecting that — all the way up to the controller. The whole
chain is then instantiated per request.

What it costs:

- a new instance of every provider in the chain, per request
- lost singleton caching for those providers
- measurably higher latency and memory under load

Better alternatives:

**1. `AsyncLocalStorage`** — request context without touching the DI graph:

```ts
@Injectable()
export class RequestContext {
  private readonly als = new AsyncLocalStorage<{ tenantId: string }>();

  run(store: { tenantId: string }, fn: () => void) { this.als.run(store, fn); }
  get tenantId() { return this.als.getStore()?.tenantId; }
}
```

The provider stays a singleton; the storage is per async execution context.

**2. Pass it explicitly.** A service method taking `tenantId` as a parameter is
simpler, more testable, and impossible to get wrong.

When request scope **is** right:

When a third-party library genuinely requires per-request construction, and the
chain it infects is short. Scope it as narrowly as possible.

## 6. How Do You Handle Circular Dependencies?

Two services injecting each other throw at startup, because neither can be
constructed first.

```ts
@Injectable()
export class OrdersService {
  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly users: UsersService,
  ) {}
}
```

Module-level cycles need it on both sides:

```ts
@Module({ imports: [forwardRef(() => UsersModule)] })
export class OrdersModule {}
```

`forwardRef` defers resolving the reference until both classes exist.

Important:

`forwardRef` is a **symptom**, not a solution. A cycle means the boundary is wrong.
Three better fixes, in order:

**1. Extract the shared logic** into a third provider both depend on:

```txt
Before:  OrdersService <-> UsersService
After:   OrdersService -> MembershipService <- UsersService
```

**2. Invert with an event.** If `OrdersService` only needs to *notify*
`UsersService`, emit an event instead of calling it.

```ts
this.events.emit("order.created", { userId, orderId });
```

**3. Move the shared type or constant** out, if the cycle is only about types —
`import type` is erased at compile time and does not create a runtime cycle.

Interview note:

Reaching for `forwardRef` repeatedly is the strongest signal that the module
boundaries follow the database schema rather than the domain.

## 7. What Is `ModuleRef`?

`ModuleRef` resolves providers **at runtime** rather than through the constructor.

```ts
@Injectable()
export class TaskRunner {
  constructor(private readonly moduleRef: ModuleRef) {}

  run(type: string) {
    const handler = this.moduleRef.get<Handler>(HANDLERS[type], { strict: false });
    return handler.execute();
  }
}
```

| Method | Returns |
| --- | --- |
| `get(token)` | an existing singleton instance |
| `resolve(token)` | a **new** instance of a scoped provider |
| `create(Class)` | an instance of a class that is not a provider |

`{ strict: false }` widens the search beyond the current module's scope.

Use cases:

- a strategy chosen at runtime from a map of handlers
- resolving a request-scoped provider from a singleton
- plugin systems where the set of providers is not known at compile time

Tradeoff:

`ModuleRef` is **service location**, not injection. It hides dependencies from the
constructor, so they are invisible to a reader and to a test. Use it only when the
dependency genuinely cannot be known at construction time.

## 8. How Do You Build A Dynamic Module With Async Options?

The pattern every Nest library uses.

```ts
export interface CacheOptions { url: string; ttl: number; }
export const CACHE_OPTIONS = Symbol("CACHE_OPTIONS");

@Module({})
export class CacheModule {
  static forRoot(options: CacheOptions): DynamicModule {
    return {
      module: CacheModule,
      providers: [{ provide: CACHE_OPTIONS, useValue: options }, CacheService],
      exports: [CacheService],
    };
  }

  static forRootAsync(options: {
    imports?: any[];
    inject?: any[];
    useFactory: (...args: any[]) => Promise<CacheOptions> | CacheOptions;
  }): DynamicModule {
    return {
      module: CacheModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: CACHE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        CacheService,
      ],
      exports: [CacheService],
    };
  }
}
```

```ts
CacheModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    url: config.getOrThrow("REDIS_URL"),
    ttl: 60,
  }),
});
```

Why the async variant exists:

Configuration usually comes from another provider. The synchronous `forRoot` would
require reading `process.env` at module-definition time, before `ConfigModule` has
validated anything.

## 9. How Do You Make A Dependency Optional?

```ts
@Injectable()
export class AnalyticsService {
  constructor(
    @Optional() @Inject("TRACKER") private readonly tracker?: Tracker,
  ) {}

  track(event: string) {
    this.tracker?.send(event);   // works whether or not it was provided
  }
}
```

Without `@Optional()`, a missing provider throws at startup.

Use cases:

- a library provider that is only present when a feature is enabled
- an integration that is configured in production but absent locally
- graceful degradation when a dependency is not installed

Important:

Optional dependencies make failures quiet. A tracker that silently does nothing
because a token was misspelled is worse than a startup error. Log once at boot when
an optional dependency is absent, so the absence is visible.

## 10. What Are Durable Providers?

Durable providers solve the cost of request scope in **multi-tenant** applications.
Instead of one instance per request, you get one per **tenant**, reused across
requests.

```ts
export class TenantContextIdStrategy implements ContextIdStrategy {
  attach(contextId: ContextId, request: Request) {
    const tenantId = request.headers["x-tenant-id"] as string;
    if (!tenantId) return () => contextId;

    const tenantSubTreeId = ContextIdFactory.create();
    return (info: HostComponentInfo) =>
      info.isTreeDurable ? tenantSubTreeId : contextId;
  }
}

ContextIdFactory.apply(new TenantContextIdStrategy());
```

```ts
@Injectable({ scope: Scope.REQUEST, durable: true })
export class TenantConnection {
  constructor(@Inject(REQUEST) private readonly request: Request) {}
}
```

With 1,000 requests across 5 tenants, you get **5** instances instead of 1,000.

When to use it:

A genuine multi-tenant application where per-tenant state is expensive to build — a
tenant-specific database connection or a resolved configuration.

Tradeoff:

Durable providers hold state across requests, so anything request-specific stored
on them **leaks between requests of the same tenant**. Only tenant-level state
belongs there.

## 11. How Do You Swap Implementations Per Environment Or Test?

Behind a token, the implementation is a configuration decision.

```ts
export abstract class StorageService {
  abstract put(key: string, body: Buffer): Promise<void>;
}
```

```ts
@Module({
  providers: [
    {
      provide: StorageService,
      useClass: process.env.NODE_ENV === "test" ? InMemoryStorage : S3Storage,
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
```

In a test, override without touching the module:

```ts
const module = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(StorageService)
  .useValue({ put: jest.fn() })
  .compile();
```

`overrideProvider`, `overrideGuard`, `overrideInterceptor`, and `overrideFilter`
let an end-to-end test replace exactly one thing and keep the rest real.

Interview note:

This is the strongest practical argument for DI. Without it, swapping storage means
module mocking, which couples tests to file paths and breaks on every refactor.

## 12. In What Order Does Nest Resolve Providers?

Resolution is **depth-first** through the dependency graph, and scoped by module.

```txt
AppModule
└── OrdersModule
    ├── imports: [UsersModule]
    └── OrdersService
        ├── needs OrdersRepository -> found in OrdersModule.providers
        └── needs UsersService     -> found in UsersModule.exports
```

The search order for a token:

1. the current module's own `providers`
2. the `exports` of every module it `imports`
3. any `@Global()` module

It does **not** search sibling modules, parent modules, or modules that merely
exist. That is the whole model, and it explains almost every resolution error.

Interview note:

Nest builds the graph once at startup and fails fast. A missing provider is a boot
error, not a runtime error — which is a genuine advantage over service-locator
patterns that fail on the first request that needs the dependency.

## 13. How Do You Share One Provider Across Many Modules?

Export it from one module and import that module wherever it is needed.

```ts
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

```ts
@Module({ imports: [PrismaModule], providers: [UsersService] })
export class UsersModule {}
```

Because providers are singletons **per application**, not per importing module, all
of them receive the same instance — one connection pool, however many modules
import it.

The `@Global()` alternative:

```ts
@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

Now every module can inject it without importing. Convenient for genuinely
application-wide infrastructure — the database client, the logger, the config
service — and a mistake for anything domain-specific.

Important:

`@Global()` does not change instancing; it changes **visibility**. A non-global
module imported twenty times still produces one instance.

## 14. What Happens If Two Modules Provide The Same Token?

Each module gets its **own instance**, because resolution is module-scoped.

```ts
@Module({ providers: [CacheService] })  // instance A
export class UsersModule {}

@Module({ providers: [CacheService] })  // instance B - a different object
export class OrdersModule {}
```

This is rarely what people intend. Two caches means a write through one is
invisible to the other.

Fix — provide it once and export it:

```ts
@Module({ providers: [CacheService], exports: [CacheService] })
export class CacheModule {}
```

Interview trap:

The symptom is subtle: a cache that seems to work in one feature and miss in
another, or a counter that resets depending on which endpoint is called. Nothing
errors, because both instances are valid.

## 15. How Do You Inject A Request-Scoped Provider Into A Singleton?

Not through the constructor — that would make the singleton request-scoped. Use
`ModuleRef.resolve()` with the current context id.

```ts
@Injectable()
export class JobProcessor {
  constructor(private readonly moduleRef: ModuleRef) {}

  async handle(request: Request) {
    const contextId = ContextIdFactory.getByRequest(request);
    this.moduleRef.registerRequestByContextId(request, contextId);

    const service = await this.moduleRef.resolve(TenantService, contextId);
    return service.run();
  }
}
```

Better, in most cases:

Do not use request scope. Pass the request-specific value as a method parameter, or
use `AsyncLocalStorage`. Both keep every provider a singleton and are far easier to
test.

## 16. What Are The Common DI Mistakes?

**A provider used but not exported** — the most frequent Nest error by a wide
margin.

**Missing `emitDecoratorMetadata`** — resolution fails with no obvious cause.

**Request scope spreading up the tree** — a whole controller chain instantiated per
request.

**`forwardRef` as a habit** — it hides a boundary problem instead of fixing it.

**The same provider declared in two modules** — two instances, silently.

**String tokens** — not type-checked, and prone to collision.

**`useClass` where `useExisting` was meant** — a duplicate instance of something
that should be shared.

**Connecting in a constructor** — it cannot await; use `onModuleInit`.

**Mutable state on a singleton** — shared across concurrent requests.

**`ModuleRef` used routinely** — hides dependencies from the constructor and from
tests.

**`@Optional()` without logging** — a misconfigured dependency degrades silently.

Strong answer:

> Nest resolves by token, scoped to the module graph: a provider is private unless
> exported, and resolution searches the current module then its imports. Most DI
> problems are really boundary problems — a circular dependency means two modules
> know too much about each other, and `forwardRef` hides that rather than fixing
> it. The other one I watch for is request scope, because it propagates up the
> whole injection chain and quietly removes singleton caching.

## Sources Used

- <https://docs.nestjs.com/providers>
- <https://docs.nestjs.com/fundamentals/custom-providers>
- <https://docs.nestjs.com/fundamentals/injection-scopes>
- <https://docs.nestjs.com/fundamentals/circular-dependency>
- <https://docs.nestjs.com/fundamentals/module-ref>
- <https://docs.nestjs.com/fundamentals/dynamic-modules>
- <https://docs.nestjs.com/fundamentals/testing>
