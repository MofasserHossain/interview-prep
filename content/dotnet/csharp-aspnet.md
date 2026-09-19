# .NET And C# Interview Guide

.NET and C# interview guidance covering language fundamentals, runtime,
ASP.NET Core, dependency injection, async programming, and backend patterns.

## 1. What Is .NET?

.NET is a cross-platform developer platform for building web apps, APIs,
desktop apps, cloud services, and mobile apps.

Common parts:

- C# language
- .NET runtime
- ASP.NET Core for web APIs
- Entity Framework Core for data access
- NuGet for packages

Strong answer:

> .NET is the platform and runtime. C# is the language commonly used with it.
> ASP.NET Core is the web framework for building APIs and web applications.

## 2. What Is Dependency Injection In ASP.NET Core?

Dependency Injection passes required dependencies into a class instead of
creating them inside the class.

Example:

```csharp
public class UsersController
{
    private readonly IUserService _users;

    public UsersController(IUserService users)
    {
        _users = users;
    }
}
```

Benefits:

- easier testing
- loose coupling
- clearer dependencies
- centralized service configuration

## 3. What Is `async` And `await` In C#?

`async` and `await` make asynchronous code easier to write and read.

Example:

```csharp
public async Task<User> GetUserAsync(int id)
{
    return await _db.Users.FindAsync(id);
}
```

Important:

> `await` does not block the thread while waiting for I/O. It lets the runtime
> continue other work and resume the method when the task completes.

## 4. What Is Middleware In ASP.NET Core?

Middleware is code that runs during the HTTP request pipeline.

Examples:

- authentication
- authorization
- logging
- error handling
- CORS
- routing

Example:

```csharp
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
```

Order matters because each middleware can run before and after the next one.

## 5. What Is Entity Framework Core?

Entity Framework Core is an ORM for .NET. It maps C# objects to database
tables and lets developers query with LINQ.

Example:

```csharp
var users = await _db.Users
    .Where(user => user.IsActive)
    .ToListAsync();
```

Tradeoff:

> EF Core improves productivity, but developers still need to understand SQL,
> indexes, query plans, and N+1 query risks.
