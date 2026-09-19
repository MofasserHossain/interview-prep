# NestJS Request Lifecycle Interview Guide

Request lifecycle guidance covering the exact execution order, middleware, guards
and the `Reflector`, pipes and validation, interceptors and RxJS patterns,
exception filters, binding scope, custom and composed decorators, the execution
context across transports, and testing lifecycle components.

## 1. What Is The Exact NestJS Request Lifecycle Order?

This is the most-asked NestJS question, because the order determines what each
layer can see.

```viz
type: queues
title: Execution order, first to last
Middleware :: global, then module-bound - raw Express, no Nest context
Guards :: global, then controller, then route - authn and authz
Interceptors (pre) :: global, controller, route - wrap the handler
Pipes :: global, controller, route, then per-parameter - validate and transform
Route handler :: the controller method, then the service
Interceptors (post) :: route, controller, global - reshape the response
Exception filters :: route, controller, global - only if something threw
```

The consequences that matter:

- **Guards run before pipes**, so a guard sees **raw, unvalidated** input.
- **Middleware runs before guards** and has no access to Nest's execution context —
  it is plain Express middleware.
- **Interceptors wrap pipes and the handler**, so a timing interceptor includes
  validation time.
- **Filters run last** and catch anything thrown at any earlier stage.

Note the asymmetry: guards, interceptors, and pipes run **global → controller →
route**, but interceptors on the way *out* and exception filters run **route →
controller → global**. The outward path is the mirror of the inward one.

## 2. When Do You Use Each Lifecycle Component?

| Need | Use |
| --- | --- |
| Raw request access, third-party Express middleware | **middleware** |
| Authentication and authorisation | **guard** |
| Input validation or type coercion | **pipe** |
| Cross-cutting before/after behaviour | **interceptor** |
| Error shaping | **exception filter** |

The decision rule:

- Does it decide **whether** the request proceeds? → guard
- Does it change **the input**? → pipe
- Does it change **the output**, or wrap timing? → interceptor
- Does it handle **a failure**? → filter
- Does it need the raw request before Nest is involved? → middleware

## 3. What Is Middleware, And When Do You Still Need It?

Middleware is standard Express (or Fastify) middleware, registered on a module.

```ts
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    req.headers["x-request-id"] ??= randomUUID();
    next();
  }
}
```

```ts
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware, helmet())
      .exclude({ path: "health", method: RequestMethod.GET })
      .forRoutes("*");
  }
}
```

When you still need it:

- integrating an existing Express package — `helmet`, `compression`, `morgan`
- work that must happen before anything Nest does, such as raw body capture for a
  webhook signature
- logic that applies to routes Nest does not own, including static assets

Important:

Middleware has **no `ExecutionContext`**, so it cannot read route metadata set by
decorators. Anything that needs to know which handler will run must be a guard or
an interceptor.

Interview note:

Most things people write as middleware belong in a guard or an interceptor. The
test is whether it needs route awareness — if it does, middleware is the wrong
layer.

## 4. What Are Guards?

A guard decides whether a request may proceed. It returns a boolean, and `false`
becomes a 403.

```ts
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const [type, token] = request.headers.authorization?.split(" ") ?? [];

    if (type !== "Bearer" || !token) {
      throw new UnauthorizedException();
    }

    try {
      request.user = await this.jwt.verifyAsync(token);
      return true;
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
  }
}
```

Important:

Throwing `UnauthorizedException` rather than returning `false` produces a **401**
instead of a **403** — the correct distinction between "not authenticated" and
"not permitted". Returning `false` always yields 403.

Guards run **before pipes**, so `request.body` is whatever the client sent,
unvalidated and untransformed. A guard that reads the body must validate it itself.

## 5. How Do You Build A Roles Guard With `Reflector`?

`Reflector` reads metadata that decorators attached to the handler or the class.

```ts
export const ROLES_KEY = "roles";
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

```ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),   // method-level first
      context.getClass(),     // then controller-level
    ]);

    if (!required?.length) {
      return true; // no roles required
    }

    const { user } = context.switchToHttp().getRequest();
    return required.some((role) => user?.roles?.includes(role));
  }
}
```

```ts
@Roles("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Delete(":id")
remove(@Param("id") id: string) {}
```

| Reflector method | Behaviour |
| --- | --- |
| `get(key, target)` | read from one target |
| `getAllAndOverride(key, targets)` | first match wins — method overrides class |
| `getAllAndMerge(key, targets)` | combines values from all targets |

Use `getAllAndOverride` for roles — a method-level `@Roles` should replace the
controller's, not add to it. Use `getAllAndMerge` for additive metadata such as
tags.

Interview note:

Guard order in `@UseGuards()` matters. `JwtAuthGuard` must run before `RolesGuard`,
because the latter reads `request.user` that the former set.

## 6. What Are Pipes?

A pipe transforms or validates a handler's input before the handler runs.

```ts
@Get(":id")
findOne(@Param("id", ParseIntPipe) id: number) {
  return this.usersService.findOne(id); // id is a real number
}
```

Built-in pipes: `ValidationPipe`, `ParseIntPipe`, `ParseFloatPipe`,
`ParseBoolPipe`, `ParseArrayPipe`, `ParseUUIDPipe`, `ParseEnumPipe`,
`DefaultValuePipe`, `ParseFilePipe`.

A custom pipe:

```ts
@Injectable()
export class TrimPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (typeof value === "string") return value.trim();
    return value;
  }
}
```

`ArgumentMetadata` tells the pipe what it is operating on:

```ts
{ type: "body" | "query" | "param" | "custom", metatype: CreateUserDto, data: "id" }
```

Combining a default with a parse:

```ts
@Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number
```

Order matters — the default must come first, or `ParseIntPipe` receives
`undefined` and throws.

## 7. What Does `ValidationPipe` Do?

It validates and transforms a DTO using `class-validator` and
`class-transformer`.

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,            // strip properties with no decorator
    forbidNonWhitelisted: true, // or reject the request outright
    transform: true,            // coerce to the DTO's declared types
    transformOptions: { enableImplicitConversion: true },
  }),
);
```

```ts
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsInt()
  @Min(18)
  @Type(() => Number)
  age: number;
}
```

An invalid body produces a structured 400 automatically:

```json
{
  "statusCode": 400,
  "message": ["email must be an email", "password must be longer than 8 characters"],
  "error": "Bad Request"
}
```

Important:

`whitelist: true` is a **security control**, not a tidiness one. Without it a
client can post extra fields that reach an ORM `save()` and set columns you never
intended — mass assignment. `forbidNonWhitelisted` turns silent stripping into an
explicit rejection, which is better during development.

Interview trap:

Validation decorators are **runtime metadata**, so a TypeScript `interface` cannot
carry them. DTOs must be **classes**.

## 8. What Are Interceptors?

An interceptor wraps the handler, so it can act before and after, using RxJS.

```ts
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const started = Date.now();

    return next.handle().pipe(
      tap(() => {
        console.log(`${request.method} ${request.url} ${Date.now() - started}ms`);
      }),
    );
  }
}
```

`next.handle()` returns an Observable of the handler's result. Everything before
it runs **pre**-handler; everything in the `pipe()` runs **post**.

Common patterns:

```ts
// Reshape every response
return next.handle().pipe(map((data) => ({ data, timestamp: Date.now() })));

// Timeout
return next.handle().pipe(
  timeout(5000),
  catchError((error) =>
    error instanceof TimeoutError
      ? throwError(() => new RequestTimeoutException())
      : throwError(() => error),
  ),
);

// Cache
const cached = this.cache.get(key);
if (cached) return of(cached);           // skip the handler entirely
return next.handle().pipe(tap((data) => this.cache.set(key, data)));
```

Note the cache case: returning an Observable **without** calling `next.handle()`
short-circuits the handler completely.

Use cases: logging and timing, response envelopes, caching, timeouts, and stripping
sensitive fields with `ClassSerializerInterceptor`.

## 9. What Are Exception Filters?

A filter turns a thrown exception into an HTTP response.

Nest's built-in exceptions map to status codes automatically:

```ts
throw new BadRequestException("Invalid input");   // 400
throw new UnauthorizedException();                // 401
throw new ForbiddenException();                   // 403
throw new NotFoundException("User not found");    // 404
throw new ConflictException("Already exists");    // 409
throw new UnprocessableEntityException();         // 422
throw new InternalServerErrorException();         // 500
```

A catch-all filter for consistent error bodies:

```ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      this.logger.error(exception); // log the real error server-side
    }

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      message:
        exception instanceof HttpException
          ? exception.getResponse()
          : "Internal server error",   // generic for the client
    });
  }
}
```

`@Catch()` with no arguments catches everything; `@Catch(HttpException)` narrows
it.

Important:

**Never leak an internal error message to the client.** Log the full exception
server-side and return something generic for anything that is not an
`HttpException` — database errors disclose schema and infrastructure detail.

## 10. How Do Binding Scopes Work?

Every lifecycle component binds at three levels, narrowest last.

```ts
// Global - in main.ts
app.useGlobalGuards(new JwtAuthGuard());
app.useGlobalPipes(new ValidationPipe());
app.useGlobalInterceptors(new LoggingInterceptor());
app.useGlobalFilters(new AllExceptionsFilter());

// Controller
@UseGuards(RolesGuard)
@Controller("users")
export class UsersController {}

// Method
@UseGuards(OwnerGuard)
@Delete(":id")
remove() {}
```

Important:

Globals registered with `new` in `main.ts` **cannot inject dependencies**. To
inject, register them as providers:

```ts
@Module({
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_PIPE, useClass: ValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
```

This is a frequent interview question. The `APP_*` tokens are the injectable way to
register globals, and they participate in the DI graph normally.

Opting out of a global guard needs a metadata escape hatch:

```ts
export const Public = () => SetMetadata("isPublic", true);
```

```ts
canActivate(context: ExecutionContext) {
  const isPublic = this.reflector.getAllAndOverride<boolean>("isPublic", [
    context.getHandler(),
    context.getClass(),
  ]);
  if (isPublic) return true;
  // ...
}
```

## 11. How Do You Create Custom Decorators?

A **param decorator** removes repetitive extraction:

```ts
export const CurrentUser = createParamDecorator(
  (data: keyof User | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    return data ? request.user?.[data] : request.user;
  },
);
```

```ts
@Get("me")
getProfile(@CurrentUser() user: User, @CurrentUser("id") userId: string) {
  return this.usersService.findOne(userId);
}
```

A **composed decorator** bundles things that always travel together:

```ts
export function Auth(...roles: string[]) {
  return applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: "Unauthorized" }),
  );
}
```

```ts
@Auth("admin")
@Delete(":id")
remove(@Param("id") id: string) {}
```

Benefits:

One decorator instead of four on every protected route, and no way to apply the
metadata while forgetting the guard — which is a real class of security bug.

Important:

A param decorator can be combined with pipes:

```ts
@CurrentUser("id", ParseUUIDPipe) userId: string
```

## 12. How Do Guards And Interceptors Differ?

Both are cross-cutting and both see the `ExecutionContext`, so the boundary is
worth stating clearly.

| | Guard | Interceptor |
| --- | --- | --- |
| Runs | before pipes | wraps pipes **and** the handler |
| Returns | boolean (or throws) | an Observable |
| Can block the request | **yes** | yes, by not calling `next.handle()` |
| Can modify the response | no | **yes** |
| Sees the return value | no | **yes** |

The rule:

If the answer is "should this request run at all", it is a guard. If it is
"something should happen around this request", it is an interceptor.

Interview trap:

A guard cannot read the handler's result, so "reject the response if the record
belongs to another user" cannot be a guard — the record is not loaded yet. Either
check ownership **in the query**, or use an interceptor.

## 13. What Is `ExecutionContext`, And Why Does It Matter?

`ExecutionContext` abstracts over transports, so the same guard works for HTTP,
microservices, and WebSockets.

```ts
canActivate(context: ExecutionContext) {
  switch (context.getType()) {
    case "http": {
      const request = context.switchToHttp().getRequest();
      return Boolean(request.headers.authorization);
    }
    case "rpc": {
      const data = context.switchToRpc().getData();
      return Boolean(data.token);
    }
    case "ws": {
      const client = context.switchToWs().getClient();
      return Boolean(client.handshake.auth.token);
    }
    default:
      return false;
  }
}
```

It also exposes what is about to run:

```ts
context.getHandler();  // the method - for method-level metadata
context.getClass();    // the controller - for class-level metadata
```

Why it matters:

This is what makes guards and interceptors reusable across transports. A guard
written against the raw Express request only works over HTTP, which defeats the
purpose in a service that also consumes Kafka messages.

## 14. How Do You Build A Response Envelope Without Breaking Errors?

A transform interceptor wraps successful responses, but must not swallow errors.

```ts
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Envelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
```

Errors bypass `map()` entirely — they travel down the Observable's error channel to
the exception filter, which formats them separately.

That split is the point: the interceptor owns the success shape, the filter owns
the error shape. They must agree on a contract:

```ts
// success (interceptor)
{ "success": true, "data": {...}, "timestamp": "..." }

// error (filter)
{ "success": false, "error": { "message": "...", "statusCode": 400 } }
```

Important:

Skip the envelope for streamed or file responses, which must not be wrapped:

```ts
if (context.getHandler().name === "download") return next.handle();
```

## 15. How Do You Handle File Uploads Through The Lifecycle?

```ts
@Post("avatar")
@UseInterceptors(FileInterceptor("file"))
upload(
  @UploadedFile(
    new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
        new FileTypeValidator({ fileType: /image\/(png|jpeg)/ }),
      ],
    }),
  )
  file: Express.Multer.File,
) {
  return this.storage.save(file);
}
```

`FileInterceptor` is an interceptor because it must run **before** the handler to
parse the multipart body; `ParseFilePipe` is a pipe because it validates the parsed
result. The layering follows the lifecycle exactly.

Important:

`FileTypeValidator` checks the **declared** MIME type, which a client controls.
For anything security-relevant, verify the file's magic bytes server-side after
upload.

## 16. How Do You Test Lifecycle Components?

A guard is a plain class, so it can be tested directly:

```ts
describe("RolesGuard", () => {
  it("allows a matching role", () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(["admin"]) };
    const guard = new RolesGuard(reflector as unknown as Reflector);

    const context = {
      switchToHttp: () => ({ getRequest: () => ({ user: { roles: ["admin"] } }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });
});
```

In an end-to-end test, override the real guard:

```ts
const module = await Test.createTestingModule({ imports: [AppModule] })
  .overrideGuard(JwtAuthGuard)
  .useValue({ canActivate: () => true })
  .compile();
```

Important:

Apply the **same global pipes** in the test that `main.ts` applies, or validation
will pass in the test and fail in production:

```ts
app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
await app.init();
```

Forgetting this is why end-to-end tests sometimes accept payloads the real API
rejects.

## 17. How Do You Add Request-Scoped Logging Without Request Scope?

Use `AsyncLocalStorage` set in middleware, read anywhere — no scoped providers.

```ts
@Injectable()
export class ContextStore {
  private readonly als = new AsyncLocalStorage<{ requestId: string }>();

  run(store: { requestId: string }, fn: () => void) { this.als.run(store, fn); }
  get requestId() { return this.als.getStore()?.requestId; }
}
```

```ts
@Injectable()
export class ContextMiddleware implements NestMiddleware {
  constructor(private readonly store: ContextStore) {}

  use(req: Request, _res: Response, next: NextFunction) {
    this.store.run({ requestId: randomUUID() }, () => next());
  }
}
```

```ts
@Injectable()
export class OrdersService {
  constructor(private readonly store: ContextStore) {}   // still a singleton

  create() {
    this.logger.log({ requestId: this.store.requestId, event: "order.create" });
  }
}
```

Why this is better than `Scope.REQUEST`:

Every provider stays a singleton, so there is no per-request instantiation and no
scope propagating up the injection chain — while the correlation id is still
available at any depth.

## 18. What Are The Common Lifecycle Gotchas?

**Expecting a guard to see validated input** — guards run before pipes.

**Middleware that needs route metadata** — it has no `ExecutionContext`.

**Guard order in `@UseGuards()`** — an auth guard must precede a roles guard.

**Returning `false` when you meant 401** — that produces 403; throw
`UnauthorizedException` instead.

**A global pipe registered with `new`** when it needs injection — use `APP_PIPE`.

**`ValidationPipe` without `whitelist`** — mass assignment.

**A DTO declared as an `interface`** — decorators need a class at runtime.

**`DefaultValuePipe` after `ParseIntPipe`** — the parse receives `undefined`.

**A transform interceptor wrapping file downloads** — it corrupts the response.

**Leaking internal messages from the exception filter.**

**Missing global pipes in end-to-end tests** — validation behaves differently than
in production.

Strong answer:

> The order is middleware, guards, interceptors, pipes, handler, interceptors
> again, then filters. The detail that trips people up is that guards run before
> pipes, so a guard sees the raw body — which means ownership checks that depend on
> a validated DTO belong in the service or in the query, not in a guard. The other
> one is that globals registered with `new` cannot inject, which is what the
> `APP_GUARD` and `APP_PIPE` tokens exist for.

## Sources Used

- <https://docs.nestjs.com/faq/request-lifecycle>
- <https://docs.nestjs.com/middleware>
- <https://docs.nestjs.com/guards>
- <https://docs.nestjs.com/pipes>
- <https://docs.nestjs.com/techniques/validation>
- <https://docs.nestjs.com/interceptors>
- <https://docs.nestjs.com/exception-filters>
- <https://docs.nestjs.com/custom-decorators>
- <https://docs.nestjs.com/fundamentals/execution-context>
