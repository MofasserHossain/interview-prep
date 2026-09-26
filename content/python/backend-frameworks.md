# Python Backend Frameworks Interview Guide

Python backend interview guidance covering language fundamentals, FastAPI,
Django, Flask, async behavior, typing, and API design.

## 1. Why Use Python For Backend Development?

Python is popular for backend development because it is readable, productive,
and has a large ecosystem.

Common uses:

- REST APIs
- data processing
- automation
- AI and ML services
- internal tools

Popular frameworks:

- Django
- FastAPI
- Flask

## 2. Django vs FastAPI vs Flask

Django is a full-featured framework with ORM, admin, authentication, forms,
and many batteries included.

FastAPI is modern, type-driven, and strong for high-performance APIs.

Flask is minimal and flexible.

Interview answer:

> I would use Django for a full product with admin and built-in conventions,
> FastAPI for typed API services and async workloads, and Flask for small
> services or highly customized apps.

## 3. What Is FastAPI?

FastAPI is a Python framework for building APIs with type hints and automatic
OpenAPI documentation.

Example:

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/users/{user_id}")
def get_user(user_id: int):
    return {"id": user_id}
```

Benefits:

- request validation
- automatic docs
- type-driven development
- async support

## 4. What Is Django ORM?

Django ORM maps Python classes to database tables.

Example:

```python
class User(models.Model):
    email = models.EmailField(unique=True)
    is_active = models.BooleanField(default=True)
```

Query:

```python
users = User.objects.filter(is_active=True)
```

Tradeoff:

> The ORM is productive, but developers must still understand SQL performance,
> indexes, transactions, and query count.

## 5. What Is The GIL In Python?

The Global Interpreter Lock allows only one thread to execute Python bytecode
at a time in the standard CPython runtime.

Impact:

- threads are useful for I/O-bound work
- CPU-bound Python code may not scale across cores with threads
- multiprocessing or external workers can help CPU-heavy tasks

Strong answer:

> The GIL matters for CPU-bound workloads. For web APIs that mostly wait on
> network or database I/O, async or threaded workers can still be effective.
