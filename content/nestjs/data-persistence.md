# NestJS Data And Persistence Interview Guide

Persistence guidance covering TypeORM and Prisma integration, the repository
pattern, transactions, entity relations and the N+1 problem, migrations, why DTOs
and entities stay separate, safe response serialisation, pagination, soft deletes,
caching, connection pooling, and testing against a database.

## 1. How Do You Integrate TypeORM?

```ts
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        url: config.getOrThrow("DATABASE_URL"),
        entities: [User, Order],
        synchronize: false,                   // NEVER true outside development
        migrations: ["dist/migrations/*.js"],
        poolSize: 10,
      }),
    }),
  ],
})
export class AppModule {}
```

```ts
@Module({
  imports: [TypeOrmModule.forFeature([User])], // registers the User repository
  providers: [UsersService],
})
export class UsersModule {}
```

```ts
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  findOne(id: number) {
    return this.users.findOne({ where: { id }, relations: ["orders"] });
  }
}
```

Note the split: `forRoot` configures the connection once; `forFeature` registers
entities **per module**, so each feature module declares only the repositories it
uses.

Important:

`synchronize: true` drops and recreates columns to match entities. It is convenient
locally and **will destroy production data**. Always use migrations outside
development.

## 2. How Do You Integrate Prisma?

Prisma has no official Nest module, so you wrap the client as a provider.

```ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

```ts
@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

```ts
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findOne(id: number) {
    return this.prisma.user.findUnique({ where: { id }, include: { orders: true } });
  }
}
```

| | TypeORM | Prisma |
| --- | --- | --- |
| Schema source | TypeScript entities | `schema.prisma` |
| Type safety | decorator-based, partial | **generated, complete** |
| Nest integration | official module | a hand-written provider |
| Raw SQL escape hatch | query builder | `$queryRaw` |
| Migrations | generated from entities | generated from the schema file |

Interview note:

Prisma's generated client gives end-to-end type safety — a renamed column is a
compile error at every call site. TypeORM's decorator approach keeps the schema in
TypeScript but types relation results loosely, so `user.orders` can be `undefined`
without the compiler objecting.

## 3. Should You Use A Repository Layer Of Your Own?

The ORM's repository is already a repository, so a second one needs justification.

```ts
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findActiveInTenant(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }
}
```

Reasons it earns its place:

- **one place enforces cross-cutting query rules** — tenant scoping, soft-delete
  filters, ownership
- the service reads as domain language rather than query syntax
- swapping the ORM touches one layer
- unit tests stub the repository instead of the ORM's full surface

When to skip it:

A small service where the repository would be a pass-through. An extra layer that
only forwards calls is noise.

Important:

If you have multi-tenancy or soft deletes, the repository is not optional. A
missing `tenantId` in one query is a cross-tenant data leak, and relying on every
call site to remember is not a strategy.

## 4. How Do You Handle Transactions?

TypeORM, with a callback:

```ts
async transfer(fromId: number, toId: number, amount: number) {
  return this.dataSource.transaction(async (manager) => {
    await manager.decrement(Account, { id: fromId }, "balance", amount);
    await manager.increment(Account, { id: toId }, "balance", amount);
  });
}
```

Prisma, interactive:

```ts
async transfer(fromId: number, toId: number, amount: number) {
  return this.prisma.$transaction(async (tx) => {
    await tx.account.update({ where: { id: fromId }, data: { balance: { decrement: amount } } });
    await tx.account.update({ where: { id: toId }, data: { balance: { increment: amount } } });
  });
}
```

Important:

Every query inside the transaction must use the **transactional handle** — `manager`
or `tx` — not the injected repository. A query using the outer client runs on a
different connection, outside the transaction, and is not rolled back.

```ts
// Bad: silently outside the transaction
await this.prisma.$transaction(async (tx) => {
  await tx.order.create({ data });
  await this.prisma.stock.update({ ... }); // WRONG client
});
```

Keep them short:

```ts
// Bad: an HTTP call holds locks for seconds
await this.dataSource.transaction(async (manager) => {
  await manager.update(Order, id, { status: "paid" });
  await this.payments.charge(id);   // external, slow
});
```

Do external work outside the transaction and make the operation idempotent so a
retry is safe.

Interview note:

Passing the transaction handle through service layers is awkward, which is why
teams reach for `AsyncLocalStorage`-based transaction propagation. Naming that
tradeoff — explicit and verbose, versus implicit and magical — is a good senior
answer.

## 5. How Do You Model Relations, And Where Does N+1 Come From?

```ts
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToMany(() => Order, (order) => order.user)
  orders: Order[];
}

@Entity()
export class Order {
  @ManyToOne(() => User, (user) => user.orders)
  user: User;
}
```

The N+1 problem:

```ts
// 1 query for users, then 1 per user for orders = 101 queries
const users = await this.users.find();
for (const user of users) {
  user.orders = await this.orders.find({ where: { userId: user.id } });
}
```

Fixes:

```ts
// TypeORM: one query with a join
const users = await this.users.find({ relations: { orders: true } });

// Prisma: include
const users = await this.prisma.user.findMany({ include: { orders: true } });

// Or two queries and group in memory - often faster than a wide join
const users = await this.prisma.user.findMany();
const orders = await this.prisma.order.findMany({
  where: { userId: { in: users.map((u) => u.id) } },
});
const byUser = Map.groupBy(orders, (o) => o.userId);
```

When two queries beat a join:

A one-to-many join repeats every parent column per child row. A user with 50 orders
returns the user's columns 50 times. Two queries transfer far less data and are
frequently faster despite the extra round trip.

Important:

`eager: true` on a relation causes N+1 **silently and everywhere**, because the
relation loads on every find whether or not it is used. Load relations explicitly
per query.

Study path:

Diagnosing the resulting slowness with `EXPLAIN` is covered in the SQL Query
Optimization guide.

## 6. How Do Migrations Work In Production?

```bash
# TypeORM
npx typeorm migration:generate -d dist/data-source.js src/migrations/AddUserRole
npx typeorm migration:run -d dist/data-source.js

# Prisma
npx prisma migrate dev --name add_user_role     # development
npx prisma migrate deploy                        # production
```

The rule for a zero-downtime deploy: **every intermediate state must work**.

```viz
type: flow
title: Expand and contract
Expand :: add the new column, nullable - old code still works
Deploy dual-write :: application writes both old and new columns
Backfill :: copy data in batches, with a pause between them
Deploy read-new :: application reads the new column
Contract :: stop writing the old column, then drop it days later
```

Important:

A migration and the code that needs it **deploy separately**. Renaming a column in
one step breaks every instance still running the old build during a rolling
deploy.

Run migrations as a separate step — a job or an init container — not from
application startup. Several replicas starting at once would otherwise run the same
migration concurrently.

Interview note:

Adding a `NOT NULL` column without a default to a large table locks it. Add it
nullable, backfill in batches, then add the constraint.

## 7. Why Keep DTOs And Entities Separate?

They answer different questions and change for different reasons.

| | Entity | DTO |
| --- | --- | --- |
| Represents | a database row | the API contract |
| Owned by | the persistence layer | the transport layer |
| Changes when | the schema changes | the API changes |
| Contains | every column, including secrets | only what the client sends or sees |

```ts
// Bad: the entity is the API contract
@Post()
create(@Body() user: User) {}   // a client can set id, isAdmin, passwordHash
```

```ts
// Good: an explicit input contract
export class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
}
```

Why it matters:

Accepting an entity is **mass assignment** — the client controls every column,
including `isAdmin`. Returning an entity leaks every column, including
`passwordHash`, into the response.

Interview note:

The strongest reason is coupling: if the entity is the contract, a schema change is
automatically a breaking API change. The DTO is the seam that lets the database
evolve without breaking clients.

## 8. How Do You Serialise Responses Safely?

`class-transformer` plus `ClassSerializerInterceptor` strips fields declaratively.

```ts
export class User {
  id: number;
  email: string;

  @Exclude()
  passwordHash: string;

  @Expose()
  get displayName(): string {
    return this.email.split("@")[0];
  }
}
```

```ts
app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
```

Role-based exposure:

```ts
export class User {
  @Expose({ groups: ["admin"] })
  internalNotes: string;
}
```

```ts
@SerializeOptions({ groups: ["admin"] })
@Get(":id")
findOne() {}
```

Important:

`ClassSerializerInterceptor` only works on **class instances**. A plain object — for
example, the result of a Prisma query — is returned untouched and `@Exclude()` does
nothing.

```ts
// Prisma returns a plain object; decorators are ignored
return this.prisma.user.findUnique({ where: { id } });   // passwordHash leaks

// Fix: select explicitly, or map into a class
return this.prisma.user.findUnique({
  where: { id },
  select: { id: true, email: true },
});
```

The safest pattern is **explicit selection at the query**, so sensitive columns are
never loaded in the first place. Serialisation is a second line of defence, not the
first.

## 9. How Do You Implement Pagination?

Offset pagination is simple and degrades at depth:

```ts
export class PaginationDto {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  page = 1;

  @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number)
  limit = 20;
}
```

```ts
async findAll({ page, limit }: PaginationDto) {
  const [items, total] = await this.users.findAndCount({
    skip: (page - 1) * limit,
    take: limit,
    order: { createdAt: "DESC" },
  });

  return { items, total, page, pages: Math.ceil(total / limit) };
}
```

Cursor pagination is constant-cost and correct on changing data:

```ts
async findAll({ cursor, limit }: { cursor?: string; limit: number }) {
  const items = await this.prisma.user.findMany({
    take: limit + 1,                                    // one extra to detect more
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    orderBy: { id: "desc" },
  });

  const hasMore = items.length > limit;
  return { items: items.slice(0, limit), nextCursor: hasMore ? items[limit - 1].id : null };
}
```

The `@Max(100)` on `limit` is not cosmetic — without it, a client requesting
`?limit=1000000` is a denial-of-service vector.

Important:

Offset pagination on a **changing** dataset duplicates and skips rows, because new
inserts shift the offsets between requests. Feeds need cursors.

## 10. How Do You Handle Soft Deletes?

```ts
@Entity()
export class User {
  @DeleteDateColumn()
  deletedAt?: Date;
}
```

```ts
await this.users.softDelete(id);
await this.users.restore(id);

await this.users.find();                        // excludes soft-deleted
await this.users.find({ withDeleted: true });   // includes them
```

Prisma has no built-in support, so it is a convention enforced in the repository:

```ts
findMany(where: Prisma.UserWhereInput = {}) {
  return this.prisma.user.findMany({ where: { ...where, deletedAt: null } });
}
```

Consequences worth raising in an interview:

- **unique constraints break** — a soft-deleted `a@b.com` still occupies the
  unique index, so the address cannot be reused. Use a partial unique index on
  `deletedAt IS NULL`.
- **indexes must include `deletedAt`**, or every query still reads dead rows
- **foreign keys still point at deleted parents**
- **the table grows forever** — archive rather than accumulate

The rule:

Soft delete because someone needs to **restore or audit** it, not by default. Most
tables do not need it, and it complicates every query that touches them.

## 11. How Do You Add Caching?

```ts
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        store: redisStore,
        url: config.getOrThrow("REDIS_URL"),
        ttl: 60_000,
      }),
    }),
  ],
})
export class AppModule {}
```

```ts
@Injectable()
export class ProductsService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async findOne(id: string) {
    const key = `product:${id}`;
    const cached = await this.cache.get<Product>(key);
    if (cached) return cached;

    const product = await this.repo.findOne(id);
    await this.cache.set(key, product, 300_000);
    return product;
  }
}
```

Route-level caching with the interceptor:

```ts
@UseInterceptors(CacheInterceptor)
@CacheKey("products")
@CacheTTL(300_000)
@Get()
findAll() {}
```

Important:

`CacheInterceptor` caches **GET routes only**, and keys by URL by default — so it
ignores the authenticated user. Caching a personalised endpoint that way serves one
user's data to another. Override `trackBy` to include the user, or do not use it
for per-user data.

Invalidation belongs with the write:

```ts
async update(id: string, dto: UpdateProductDto) {
  const updated = await this.repo.update(id, dto);
  await this.cache.del(`product:${id}`);
  return updated;
}
```

Tradeoff:

An in-memory cache is per instance, so replicas disagree. Redis makes the cache
shared and adds a network hop and a dependency.

## 12. How Do You Configure Connection Pooling?

```ts
TypeOrmModule.forRootAsync({
  useFactory: (config: ConfigService) => ({
    type: "postgres",
    url: config.getOrThrow("DATABASE_URL"),
    poolSize: 10,
    extra: { connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000 },
  }),
});
```

```txt
DATABASE_URL="postgresql://...?connection_limit=10&pool_timeout=10"
```

The arithmetic that matters:

```txt
total connections = pool size x number of application instances
```

Ten replicas with a pool of 100 is 1,000 connections, which exhausts most
PostgreSQL defaults long before it helps.

Important:

A bigger pool is not faster. Past the point where the database can execute queries
in parallel, more connections add contention. A small pool per instance — often 5
to 20 — tuned by measurement is right.

Always set an acquisition timeout so a saturated pool **fails fast** rather than
queueing requests until they time out at the client.

Interview note:

In serverless, each invocation may create its own pool. A connection proxy such as
PgBouncer or Prisma Accelerate exists specifically for that shape.

## 13. How Do You Handle Database Errors?

Translate driver errors into domain exceptions at the boundary.

```ts
async create(dto: CreateUserDto) {
  try {
    return await this.prisma.user.create({ data: dto });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        throw new ConflictException("Email already registered");
      }
      if (error.code === "P2025") {
        throw new NotFoundException("Record not found");
      }
    }
    throw error; // unknown - let the filter produce a 500
  }
}
```

| Prisma | TypeORM / Postgres | Meaning |
| --- | --- | --- |
| `P2002` | `23505` | unique constraint violation |
| `P2003` | `23503` | foreign key violation |
| `P2025` | — | record not found |

Important:

Never surface the raw driver message. It contains table names, column names, and
sometimes the conflicting value — schema disclosure at best, data disclosure at
worst.

Interview note:

Catching the unique violation is also more **correct** than checking first.
A check-then-insert has a race between the two statements; letting the constraint
fail and translating the error is atomic.

## 14. How Do You Test Code That Touches The Database?

**Unit tests** replace the repository entirely:

```ts
const module = await Test.createTestingModule({
  providers: [
    UsersService,
    { provide: UsersRepository, useValue: { findByEmail: jest.fn(), save: jest.fn() } },
  ],
}).compile();
```

**Integration tests** run against a real database, usually in a container:

```ts
beforeAll(async () => {
  container = await new PostgreSqlContainer().start();
  process.env.DATABASE_URL = container.getConnectionUri();

  module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.init();
});

afterEach(async () => {
  await prisma.$executeRaw`TRUNCATE users, orders RESTART IDENTITY CASCADE`;
});

afterAll(async () => {
  await app.close();
  await container.stop();
});
```

Important:

Isolate tests by **truncating between them**, not by relying on ordering. Tests that
depend on data left by a previous test fail the moment someone runs one in
isolation.

Apply the same global pipes the real application applies, or validation behaves
differently in tests than in production.

Tradeoff:

A real database catches constraint violations, migration errors, and query bugs
that a mock never will. It is slower, so the usual split is many unit tests and a
focused set of integration tests over the critical paths.

## 15. How Do You Find And Fix A Slow Query From Nest?

Turn on query logging first:

```ts
TypeOrmModule.forRoot({ logging: ["query", "error"], maxQueryExecutionTime: 200 });
```

```ts
new PrismaClient({ log: [{ emit: "event", level: "query" }] })
  .$on("query", (e) => {
    if (e.duration > 200) console.warn({ query: e.query, ms: e.duration });
  });
```

`maxQueryExecutionTime` logs only queries slower than the threshold, which keeps
the signal readable.

Then work through the usual causes:

| Symptom | Likely cause |
| --- | --- |
| Many similar queries per request | N+1 — use `include` or batch |
| One slow query | missing index — `EXPLAIN` it |
| Slow only under load | connection pool saturation |
| Slow `COUNT` on pagination | counting a huge table — approximate or cap it |
| Growing latency over time | table growth without an index, or dead rows |

Important:

Nest and the ORM are rarely the bottleneck. The query and the index are. Get the
generated SQL from the log and take it to `EXPLAIN` — reasoning about the ORM's
API instead of the SQL it produced is how people optimise the wrong thing.

## 16. What Are The Common Data And Persistence Gotchas?

**`synchronize: true`** outside development — it destroys data.

**Accepting an entity as the request body** — mass assignment.

**Returning an entity or a raw Prisma object** — `@Exclude()` does not apply to
plain objects.

**`eager: true` relations** — silent N+1 everywhere.

**Using the outer client inside a transaction** — the query runs outside it.

**External calls inside a transaction** — locks held for seconds.

**No `@Max()` on a pagination limit** — a denial-of-service vector.

**Offset pagination on a live feed** — duplicates and skips.

**Soft deletes without a partial unique index** — the address can never be reused.

**`CacheInterceptor` on a personalised route** — one user's data served to another.

**Migrations run from application startup** — replicas race each other.

**Pool size multiplied by replica count** — connection exhaustion.

Strong answer:

> I keep the entity and the API contract separate, because otherwise a schema
> change is automatically a breaking API change and the client controls every
> column. For performance the two things I check first are N+1 — usually an eager
> relation or a loop — and whether the generated SQL has an index, which means
> reading the query log and running `EXPLAIN` rather than reasoning about the ORM's
> API.

## Sources Used

- <https://docs.nestjs.com/techniques/database>
- <https://docs.nestjs.com/recipes/prisma>
- <https://docs.nestjs.com/techniques/serialization>
- <https://docs.nestjs.com/techniques/caching>
- <https://docs.nestjs.com/techniques/validation>
- <https://typeorm.io/transactions>
- <https://www.prisma.io/docs/orm/prisma-client/queries/transactions>
- <https://docs.nestjs.com/fundamentals/testing>
