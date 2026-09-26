# JavaScript Prototypes And Objects Interview Guide

Prototype and object interview guidance covering object shape, own properties,
prototype links, constructor functions, class syntax, property lookup, method
sharing, inheritance checks, mutation risks, prototype pollution, and output
reasoning.

Core map:

- Object: the actual value holding own properties
- Prototype: another object used as a fallback during property lookup
- Prototype chain: the linked list of prototypes JavaScript checks
- `[[Prototype]]`: the internal prototype link of an object
- `.prototype`: the object constructor functions use for future instances
- Own property: a property directly on the object
- Inherited property: a property found through the prototype chain

## 1. What Is A JavaScript Object?

A JavaScript object is a collection of properties. Each property key is a string
or symbol, and each value can be any JavaScript value.

```js
const user = {
  id: 1,
  name: "Asha",
  role: "admin",
};

console.log(user.name);
console.log(Object.keys(user));
```

Output:

```txt
Asha
[ 'id', 'name', 'role' ]
```

Objects matter because most JavaScript data structures, functions, arrays,
dates, errors, and class instances are object-based. In interviews, object
questions often test property access, copying, mutation, and prototype lookup.

Strong answer:

> An object stores key-value properties. It has its own properties, and most
> objects also have a prototype that JavaScript can search when a property is
> missing from the object itself.

## 2. What Is A Prototype?

A prototype is another object that JavaScript uses as a fallback. If a property
does not exist directly on an object, JavaScript looks at that object's
prototype.

```js
const animal = {
  speak() {
    return `${this.name} makes a sound`;
  },
};

const dog = Object.create(animal);
dog.name = "Milo";

console.log(dog.speak());
console.log(Object.hasOwn(dog, "speak"));
```

Output:

```txt
Milo makes a sound
false
```

`speak` is inherited from `animal`; it is not an own property of `dog`.

Why it matters:

Prototypes allow objects to share behavior without copying the same method onto
every object.

## 3. How Does The Prototype Chain Resolve Properties?

The prototype chain is the lookup path JavaScript follows when reading a
property.

```js
const grandParent = { country: "BD" };
const parent = Object.create(grandParent);
parent.role = "engineer";

const child = Object.create(parent);
child.name = "Asha";

console.log(child.name);
console.log(child.role);
console.log(child.country);
console.log(child.missing);
```

Output:

```txt
Asha
engineer
BD
undefined
```

Lookup order:

1. Check `child`
2. Check `parent`
3. Check `grandParent`
4. Continue until the prototype is `null`
5. Return `undefined` if the property is not found

Interview note:

The chain is used for reads. Writing `child.role = "lead"` creates or updates an
own property on `child`; it does not normally rewrite `parent.role`.

## 4. What Are `[[Prototype]]`, `__proto__`, And `Object.getPrototypeOf()`?

`[[Prototype]]` is the internal prototype link of an object. You cannot access
that internal slot directly, but JavaScript exposes ways to inspect it.

```js
const base = { role: "user" };
const user = Object.create(base);

console.log(Object.getPrototypeOf(user) === base);
console.log(user.__proto__ === base);
```

Output:

```txt
true
true
```

Preferred APIs:

- Use `Object.getPrototypeOf(obj)` to read an object's prototype
- Use `Object.create(proto)` to create an object with a specific prototype
- Avoid `__proto__` in application code
- Avoid `Object.setPrototypeOf()` in hot code because it can hurt engine
  optimization

Strong answer:

> `[[Prototype]]` is the real internal link. `__proto__` is a legacy accessor for
> that link. `Object.getPrototypeOf()` is the clearer modern way to inspect it.

## 5. What Is The Difference Between Object `[[Prototype]]` And Function `.prototype`?

This is one of the most important prototype interview distinctions.

Every normal object has an internal `[[Prototype]]` link. Constructor functions
also have a `.prototype` property. That `.prototype` object becomes the
`[[Prototype]]` of objects created with `new`.

```js
function User(name) {
  this.name = name;
}

User.prototype.sayHi = function () {
  return `Hi ${this.name}`;
};

const user = new User("Asha");

console.log(Object.getPrototypeOf(user) === User.prototype);
console.log(user.__proto__ === User.prototype);
console.log(User.prototype.constructor === User);
```

Output:

```txt
true
true
true
```

Common confusion:

- `user.__proto__` points to `User.prototype`
- `User.prototype` is used for instances created by `new User()`
- `User.__proto__` is different; it points to `Function.prototype`

Strong answer:

> An object's `[[Prototype]]` is where it inherits from. A function's
> `.prototype` is the object that future instances inherit from when the
> function is called with `new`.

## 6. What Does `new` Do With Constructor Functions?

When a function is called with `new`, JavaScript performs a constructor call.

```js
function User(name) {
  this.name = name;
}

User.prototype.sayHi = function () {
  return `Hi ${this.name}`;
};

const user = new User("Asha");

console.log(user.name);
console.log(user.sayHi());
console.log(user instanceof User);
```

Output:

```txt
Asha
Hi Asha
true
```

What `new` does:

1. Creates a new empty object
2. Links the new object's prototype to `User.prototype`
3. Calls `User` with `this` set to the new object
4. Returns the new object unless the constructor explicitly returns an object

Tradeoff:

Constructor functions work, but class syntax is usually clearer for modern
application code.

## 7. Why Put Methods On A Prototype?

Prototype methods are shared by instances instead of being recreated per object.

```js
function User(name) {
  this.name = name;
}

User.prototype.sayHi = function () {
  return `Hi ${this.name}`;
};

const a = new User("Asha");
const b = new User("Rafi");

console.log(a.sayHi());
console.log(a.sayHi === b.sayHi);
```

Output:

```txt
Hi Asha
true
```

Benefit over assigning methods inside the constructor:

Every instance shares one method function, which is better for memory and keeps
behavior centralized.

Bad pattern for shared methods:

```js
function User(name) {
  this.name = name;
  this.sayHi = function () {
    return `Hi ${this.name}`;
  };
}
```

This creates a new `sayHi` function for every instance.

## 8. How Do Classes Relate To Prototypes?

JavaScript classes are syntax over prototype-based behavior.

```js
class User {
  constructor(name) {
    this.name = name;
  }

  sayHi() {
    return `Hi ${this.name}`;
  }
}

const user = new User("Asha");

console.log(user.sayHi());
console.log(Object.hasOwn(user, "sayHi"));
console.log(Object.hasOwn(User.prototype, "sayHi"));
```

Output:

```txt
Hi Asha
false
true
```

The method lives on `User.prototype`, not directly on each instance.

Important details:

- Class methods are prototype methods
- Class constructors must be called with `new`
- `extends` connects prototype chains between classes
- Class syntax is not a separate inheritance model

Strong answer:

> `class` is cleaner syntax for constructor and prototype behavior. Instance
> methods still live on the class prototype.

## 9. What Are Own Properties, Inherited Properties, And Shadowing?

An own property belongs directly to the object. An inherited property is found
through the prototype chain. Shadowing happens when an own property has the same
name as an inherited property.

```js
const base = { role: "user" };
const admin = Object.create(base);

admin.role = "admin";

console.log(admin.role);
console.log(base.role);
console.log(Object.hasOwn(admin, "role"));

delete admin.role;

console.log(admin.role);
console.log(Object.hasOwn(admin, "role"));
```

Output:

```txt
admin
user
true
user
false
```

The own `admin.role` shadows the inherited `base.role`. After deleting the own
property, lookup falls back to the prototype again.

Interview note:

This explains many output questions where a value appears to "come back" after
`delete`.

## 10. How Should You Check Properties Safely?

Different property checks answer different questions.

```js
const base = { role: "admin" };
const user = Object.create(base);
user.name = "Asha";

console.log("name" in user);
console.log("role" in user);
console.log(Object.hasOwn(user, "role"));
console.log(Object.hasOwn(user, "name"));
```

Output:

```txt
true
true
false
true
```

Use this mental model:

| Check | Meaning |
| --- | --- |
| `"key" in obj` | Own or inherited property exists |
| `Object.hasOwn(obj, "key")` | Own property exists |
| `obj.hasOwnProperty("key")` | Older own-property check, but can be unsafe if shadowed |
| `Object.keys(obj)` | Own enumerable string keys |

Prefer `Object.hasOwn(obj, key)` when checking data objects.

## 11. How Does `Object.create()` Work?

`Object.create(proto)` creates a new object and directly sets its prototype to
`proto`.

```js
const userMethods = {
  login() {
    return `${this.name} logged in`;
  },
};

const user = Object.create(userMethods);
user.name = "Asha";

console.log(user.login());
console.log(Object.getPrototypeOf(user) === userMethods);
```

Output:

```txt
Asha logged in
true
```

`Object.create(null)` creates an object with no prototype.

```js
const dictionary = Object.create(null);
dictionary.admin = true;

console.log(Object.getPrototypeOf(dictionary));
console.log("toString" in dictionary);
```

Output:

```txt
null
false
```

Use `Object.create(null)` for low-level dictionaries where inherited keys should
not exist. In normal application code, `Map` is often clearer for dynamic
key-value collections.

## 12. What Is The Difference Between Static Methods And Prototype Methods?

Prototype methods are called on instances. Static methods are called on the
class or constructor itself.

```js
class User {
  constructor(name) {
    this.name = name;
  }

  sayHi() {
    return `Hi ${this.name}`;
  }

  static fromName(name) {
    return new User(name);
  }
}

const user = User.fromName("Asha");

console.log(user.sayHi());
console.log(typeof User.fromName);
console.log(typeof user.fromName);
```

Output:

```txt
Hi Asha
function
undefined
```

Use prototype methods for behavior each instance should have. Use static methods
for factory helpers, parsing helpers, validation helpers, or utilities related
to the type itself.

## 13. How Do `instanceof` And `isPrototypeOf()` Work?

`instanceof` checks whether a constructor's `.prototype` appears anywhere in an
object's prototype chain.

```js
function User(name) {
  this.name = name;
}

const user = new User("Asha");

console.log(user instanceof User);
console.log(User.prototype.isPrototypeOf(user));
console.log(Object.prototype.isPrototypeOf(user));
```

Output:

```txt
true
true
true
```

Important limitation:

`instanceof` can be unreliable across different JavaScript realms, such as
iframes, because each realm has its own built-in constructors.

Strong answer:

> `instanceof` does not check the constructor that originally ran. It checks
> whether the constructor's `.prototype` is present in the object's prototype
> chain.

## 14. Why Is Mutating Built-In Or Live Prototypes Risky?

Changing prototypes after objects already exist can make code harder to reason
about and can hurt JavaScript engine optimization.

```js
const user = { name: "Asha" };

Object.setPrototypeOf(user, {
  role: "admin",
});

console.log(user.role);
```

Output:

```txt
admin
```

Why this is risky:

- It changes behavior from outside the object
- It can make property lookup slower
- It can surprise other parts of the app
- Mutating built-in prototypes can affect unrelated code

Avoid this:

```js
Array.prototype.last = function () {
  return this[this.length - 1];
};
```

Adding to built-in prototypes can collide with future language features or
library assumptions.

## 15. What Is Prototype Pollution?

Prototype pollution happens when unsafe input modifies a prototype or changes an
object's prototype chain.

```js
const payload = JSON.parse('{"__proto__":{"isAdmin":true}}');
const user = {};

Object.assign(user, payload);

console.log(user.isAdmin);
console.log(Object.prototype.isAdmin);
```

Output in common runtimes:

```txt
true
undefined
```

In this case, the user's prototype was changed, so `user.isAdmin` is inherited.
Other vulnerable merge patterns can pollute shared prototypes, which is even
more dangerous.

Prevention:

- Reject keys such as `__proto__`, `constructor`, and `prototype`
- Use safe merge libraries
- Use `Object.create(null)` for dictionary objects when appropriate
- Prefer `Map` for untrusted dynamic keys
- Validate untrusted input before merging

Strong answer:

> Prototype pollution is a security issue where attacker-controlled keys change
> prototype behavior. It can make authorization checks, defaults, or object
> lookups return values the application never explicitly set.

## 16. How Do You Solve Prototype Output Questions?

Prototype output questions are usually property lookup questions. Solve them by
walking the object first, then the prototype chain.

```js
const parent = { count: 1 };
const child = Object.create(parent);

child.count += 1;

console.log(child.count);
console.log(parent.count);
console.log(Object.hasOwn(child, "count"));
```

Output:

```txt
2
1
true
```

Reasoning:

1. `child.count += 1` first reads `count`
2. JavaScript does not find `count` on `child`
3. It finds `parent.count`, which is `1`
4. The expression computes `2`
5. Assignment writes an own `count` property to `child`
6. `parent.count` remains unchanged

Interview checklist:

- Identify the object being read from
- Check own properties first
- Walk the prototype chain only for missing properties
- Remember that assignment usually writes to the receiver object
- Watch for shadowing
- Use `Object.hasOwn()` to confirm where a property lives

## Sources Used

- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Inheritance_and_the_prototype_chain>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getPrototypeOf>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/hasOwn>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/setPrototypeOf>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/instanceof>
