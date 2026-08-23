# JavaScript Prototypes And Objects Interview Guide

Prototype and object interview guidance covering the prototype chain,
constructor functions, class syntax, own vs inherited properties, prototype
pollution, and method sharing.

## 1. What is the prototype chain?

Objects can inherit from another object through their prototype. If a property
is not found on the object itself, JavaScript checks the prototype chain.

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

## 2. Why put methods on a prototype?

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

## 3. How does `class` relate to prototypes?

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

## 4. Own properties vs inherited properties

Use `Object.hasOwn()` to check whether a property belongs directly to the
object.

```js
const base = { role: "admin" };
const user = Object.create(base);
user.name = "Asha";

console.log("name" in user);
console.log("role" in user);
console.log(Object.hasOwn(user, "role"));
```

Output:

```txt
true
true
false
```

`in` checks the whole prototype chain. `Object.hasOwn()` checks only the object
itself.

## 5. What is prototype pollution?

Prototype pollution happens when unsafe input modifies shared prototypes such as
`Object.prototype`.

```js
const payload = JSON.parse('{"__proto__":{"isAdmin":true}}');
const user = {};

Object.assign(user, payload);

console.log(user.isAdmin);
```

Output can be dangerous depending on merge behavior and runtime safeguards:

```txt
true
```

Prevention:

- reject keys such as `__proto__`, `constructor`, and `prototype`
- use safe merge libraries
- use `Object.create(null)` for dictionary objects when appropriate
- validate untrusted input before merging

## Sources Used

- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Inheritance_and_the_prototype_chain>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/hasOwn>
