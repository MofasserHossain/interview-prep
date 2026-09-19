# Design Patterns Interview Guide

Design patterns are reusable ways to solve common software design problems.
This guide is organized so a developer can quickly understand the problem, see
the bad version of the code, then compare it with a better pattern-based
version.

Every pattern follows this structure:

1. Where it fits.
2. Problem it solves.
3. Bad example.
4. Good example.
5. What changed.
6. Tradeoff.

## 1. Design Pattern Fundamentals

Design patterns are grouped by the kind of design problem they solve.

| Group | Focus | Main Question |
| --- | --- | --- |
| Creational | Object creation | How should objects be created? |
| Structural | Object composition | How should objects be connected? |
| Behavioral | Object communication | How should objects collaborate? |

This matters because the pattern name is only useful after the problem is
clear. For example, Builder is not just a class with chained methods. It solves
the problem of confusing object construction with many optional values.

Strong answer:

> Design patterns are useful when they reduce coupling or make change easier. I
> first identify the problem, then choose a pattern only if the pattern makes
> the design easier to understand or extend.

## 2. Creational Patterns Overview

Creational patterns focus on object creation. Use them when creating objects
directly with `new` makes code hard to change, hard to test, or hard to read.

| Pattern | Use It When | Simple Meaning |
| --- | --- | --- |
| Singleton | The app needs one shared instance | Create once and reuse |
| Factory Method | The client should not choose concrete classes | Let a factory method create the object |
| Abstract Factory | Related objects must come from the same family | Create compatible object families |
| Builder | Object setup has many optional steps | Build step by step |
| Prototype | New objects should start from an existing object | Clone a prepared object |

Interview shortcut:

> Creational patterns help when object creation itself becomes a design problem.

## 3. Singleton Pattern

Singleton ensures only one instance of a class exists.

Use it when:

- the app needs one shared configuration, logger, or connection manager
- multiple instances would create inconsistent state
- setup should happen once

Problem it solves:

Without Singleton, different parts of the app may create separate instances of
something that should be shared.

Bad example:

```ts
class AppConfig {
  apiUrl = "https://api.example.com";
}

const pageConfig = new AppConfig();
const workerConfig = new AppConfig();

console.log(pageConfig === workerConfig); // false
```

Good example:

```ts
class AppConfig {
  private static instance: AppConfig;

  private constructor(public readonly apiUrl: string) {}

  static getInstance() {
    if (!AppConfig.instance) {
      AppConfig.instance = new AppConfig("https://api.example.com");
    }

    return AppConfig.instance;
  }
}

const pageConfig = AppConfig.getInstance();
const workerConfig = AppConfig.getInstance();

console.log(pageConfig === workerConfig); // true
```

What changed:

- object creation is controlled inside the class
- callers cannot create unlimited instances
- all callers share the same object

Tradeoff:

Singleton can become hidden global state. Prefer dependency injection when tests
need easy replacement.

## 4. Factory Method Pattern

Factory Method lets creation logic decide which concrete object to return while
the client works with a shared interface.

Use it when:

- clients should not directly create concrete classes
- object type depends on input or environment
- adding a new type should not spread `new SomeClass()` everywhere

Problem it solves:

Without Factory Method, client code contains creation details and conditionals.

Bad example:

```ts
class EmailNotification {
  send(message: string) {
    console.log(`Email: ${message}`);
  }
}

class SmsNotification {
  send(message: string) {
    console.log(`SMS: ${message}`);
  }
}

function notify(channel: "email" | "sms", message: string) {
  const notification =
    channel === "email" ? new EmailNotification() : new SmsNotification();

  notification.send(message);
}
```

Good example:

```ts
interface Notification {
  send(message: string): void;
}

class EmailNotification implements Notification {
  send(message: string) {
    console.log(`Email: ${message}`);
  }
}

class SmsNotification implements Notification {
  send(message: string) {
    console.log(`SMS: ${message}`);
  }
}

abstract class NotificationCreator {
  abstract create(): Notification;

  notify(message: string) {
    this.create().send(message);
  }
}

class EmailCreator extends NotificationCreator {
  create() {
    return new EmailNotification();
  }
}
```

What changed:

- client depends on `Notification`
- subclasses decide which notification to create
- creation logic is separated from usage

Tradeoff:

Factory Method adds classes. Use it when creation varies enough to justify the
extra structure.

## 5. Abstract Factory Pattern

Abstract Factory creates families of related objects without exposing concrete
classes.

Use it when:

- objects must be compatible with each other
- the app supports multiple UI kits, platforms, vendors, or themes
- switching one family should switch all related objects

Problem it solves:

Without Abstract Factory, code can accidentally mix incompatible objects.

Bad example:

```ts
class WebButton {
  render() {
    return "web button";
  }
}

class MobileModal {
  render() {
    return "mobile modal";
  }
}

const button = new WebButton();
const modal = new MobileModal(); // mixed UI families
```

Good example:

```ts
interface Button {
  render(): string;
}

interface Modal {
  render(): string;
}

interface UIFactory {
  createButton(): Button;
  createModal(): Modal;
}

class WebButton implements Button {
  render() {
    return "web button";
  }
}

class WebModal implements Modal {
  render() {
    return "web modal";
  }
}

class WebUIFactory implements UIFactory {
  createButton() {
    return new WebButton();
  }

  createModal() {
    return new WebModal();
  }
}

const factory: UIFactory = new WebUIFactory();
const button = factory.createButton();
const modal = factory.createModal();
```

What changed:

- one factory creates the whole compatible family
- client does not know concrete classes
- mismatched product combinations are avoided

Tradeoff:

Abstract Factory can feel heavy if the app only creates one object type.

## 6. Builder Pattern

Builder creates a complex object step by step.

Use it when:

- constructors have too many parameters
- many parameters are optional
- object creation needs readable steps and defaults

Problem it solves:

Without Builder, constructor calls become hard to understand and easy to break.

Bad example:

```ts
class UserProfile {
  constructor(
    public name: string,
    public role: string,
    public emailNotifications: boolean,
    public twoFactorEnabled: boolean,
  ) {}
}

const user = new UserProfile("Asha", "admin", false, true);
```

Good example:

```ts
class UserProfileBuilder {
  private name = "";
  private role = "member";
  private emailNotifications = true;
  private twoFactorEnabled = false;

  withName(name: string) {
    this.name = name;
    return this;
  }

  asAdmin() {
    this.role = "admin";
    return this;
  }

  disableEmailNotifications() {
    this.emailNotifications = false;
    return this;
  }

  enableTwoFactor() {
    this.twoFactorEnabled = true;
    return this;
  }

  build() {
    return {
      name: this.name,
      role: this.role,
      emailNotifications: this.emailNotifications,
      twoFactorEnabled: this.twoFactorEnabled,
    };
  }
}

const user = new UserProfileBuilder()
  .withName("Asha")
  .asAdmin()
  .disableEmailNotifications()
  .enableTwoFactor()
  .build();
```

What changed:

- each setup step is named
- defaults live inside the builder
- caller code explains intent

Tradeoff:

Builder is unnecessary for simple objects with two or three obvious fields.

## 7. Prototype Pattern

Prototype creates new objects by cloning an existing object.

Use it when:

- objects share a prepared starting state
- setup is expensive or repetitive
- users create copies from templates

Problem it solves:

Without Prototype, the same setup is repeated every time an object is created.

Bad example:

```ts
class Dashboard {
  constructor(
    public title: string,
    public widgets: string[],
  ) {}
}

const teamDashboard = new Dashboard("Team", ["summary", "tasks", "activity"]);
const salesDashboard = new Dashboard("Sales", ["summary", "tasks", "activity"]);
```

Good example:

```ts
class Dashboard {
  constructor(
    public title: string,
    public widgets: string[],
  ) {}

  clone(title: string) {
    return new Dashboard(title, [...this.widgets]);
  }
}

const template = new Dashboard("Template", ["summary", "tasks", "activity"]);
const teamDashboard = template.clone("Team");
const salesDashboard = template.clone("Sales");
```

What changed:

- shared setup lives in the prototype object
- copies start from a known template
- nested arrays are copied to avoid shared mutation

Tradeoff:

Cloning must handle nested mutable objects carefully. Shallow copies can share
state by accident.

## 8. Structural Patterns Overview

Structural patterns focus on how classes and objects are connected. Use them
when objects need to work together without creating tight coupling.

| Pattern | Use It When | Simple Meaning |
| --- | --- | --- |
| Adapter | Two interfaces do not match | Convert one interface to another |
| Bridge | Abstraction and implementation both change | Separate what from how |
| Composite | Single items and groups need same handling | Treat tree items uniformly |
| Decorator | Behavior should be added dynamically | Wrap an object with extra behavior |
| Facade | A subsystem is too complex for clients | Provide a simple entry point |
| Flyweight | Too many similar objects waste memory | Share repeated state |
| Proxy | Access to an object needs control | Put a controller in front of the real object |

Interview shortcut:

> Structural patterns help when the relationship between objects becomes the
> source of complexity.

## 9. Adapter Pattern

Adapter converts one interface into another interface the client expects.

Use it when:

- a third-party API does not match your app interface
- legacy code has the wrong method names or data shape
- you want to isolate external library details

Problem it solves:

Without Adapter, third-party details leak into app code.

Bad example:

```ts
class OldPaymentService {
  makePayment(amountInCents: number) {
    return `paid ${amountInCents} cents`;
  }
}

function checkout(amount: number) {
  const oldService = new OldPaymentService();
  return oldService.makePayment(amount * 100);
}
```

Good example:

```ts
class OldPaymentService {
  makePayment(amountInCents: number) {
    return `paid ${amountInCents} cents`;
  }
}

interface PaymentGateway {
  pay(amount: number): string;
}

class PaymentAdapter implements PaymentGateway {
  constructor(private oldService: OldPaymentService) {}

  pay(amount: number) {
    return this.oldService.makePayment(amount * 100);
  }
}

function checkout(gateway: PaymentGateway, amount: number) {
  return gateway.pay(amount);
}
```

What changed:

- app code depends on `PaymentGateway`
- adapter translates dollars to cents
- old service details are isolated

Tradeoff:

Adapter should translate clearly. Do not hide important behavior differences.

## 10. Bridge Pattern

Bridge separates an abstraction from its implementation so both can change
independently.

Use it when:

- two dimensions vary, such as notification type and delivery provider
- subclass combinations are multiplying
- high-level logic should not depend on low-level implementation

Problem it solves:

Without Bridge, subclass combinations grow quickly.

Bad example:

```ts
class EmailAlertUsingAws {
  send() {
    console.log("send email alert through AWS");
  }
}

class SmsAlertUsingAws {
  send() {
    console.log("send SMS alert through AWS");
  }
}

class EmailAlertUsingGcp {
  send() {
    console.log("send email alert through GCP");
  }
}
```

Good example:

```ts
interface MessageSender {
  send(to: string, body: string): void;
}

class AwsSender implements MessageSender {
  send(to: string, body: string) {
    console.log(`AWS to ${to}: ${body}`);
  }
}

class Alert {
  constructor(private sender: MessageSender) {}

  sendCriticalAlert(user: string) {
    this.sender.send(user, "critical alert");
  }
}

const alert = new Alert(new AwsSender());
alert.sendCriticalAlert("asha@example.com");
```

What changed:

- `Alert` is the abstraction
- `MessageSender` is the implementation side
- providers can change without subclass explosion

Tradeoff:

Bridge adds structure. Use it when both sides really need to vary.

## 11. Composite Pattern

Composite treats individual objects and groups of objects through the same
interface.

Use it when:

- data is tree-shaped
- callers need the same operation on one item or many items
- group logic has too many special cases

Problem it solves:

Without Composite, code checks whether it has a single item or a group.

Bad example:

```ts
class FileItem {
  constructor(public size: number) {}
}

class Folder {
  constructor(public files: FileItem[]) {}
}

function getTotalSize(item: FileItem | Folder) {
  if (item instanceof FileItem) return item.size;
  return item.files.reduce((total, file) => total + file.size, 0);
}
```

Good example:

```ts
interface FileSystemItem {
  getSize(): number;
}

class FileItem implements FileSystemItem {
  constructor(private size: number) {}

  getSize() {
    return this.size;
  }
}

class Folder implements FileSystemItem {
  private items: FileSystemItem[] = [];

  add(item: FileSystemItem) {
    this.items.push(item);
  }

  getSize() {
    return this.items.reduce((total, item) => total + item.getSize(), 0);
  }
}
```

What changed:

- files and folders share one interface
- folders can contain files or other folders
- recursion is handled inside the objects

Tradeoff:

The shared interface must make sense for both single items and groups.

## 12. Decorator Pattern

Decorator adds behavior by wrapping an object with another object that has the
same interface.

Use it when:

- optional behaviors need flexible combinations
- inheritance would create too many subclasses
- behavior should be added without changing the original class

Problem it solves:

Without Decorator, every combination becomes a new class.

Bad example:

```ts
class CoffeeWithMilkAndSugar {
  cost() {
    return 3 + 1 + 0.5;
  }

  description() {
    return "coffee, milk, sugar";
  }
}
```

Good example:

```ts
interface Coffee {
  cost(): number;
  description(): string;
}

class PlainCoffee implements Coffee {
  cost() {
    return 3;
  }

  description() {
    return "coffee";
  }
}

class MilkDecorator implements Coffee {
  constructor(private coffee: Coffee) {}

  cost() {
    return this.coffee.cost() + 1;
  }

  description() {
    return `${this.coffee.description()}, milk`;
  }
}

const coffee = new MilkDecorator(new PlainCoffee());
```

What changed:

- decorators keep the same interface
- each decorator adds one behavior
- decorators can be combined dynamically

Tradeoff:

Many nested decorators can make debugging the call path harder.

## 13. Facade Pattern

Facade provides one simple interface over a complex subsystem.

Use it when:

- callers repeat the same setup steps
- a subsystem has many low-level classes
- most clients need a simple workflow, not every internal detail

Problem it solves:

Without Facade, high-level code knows too much about low-level steps.

Bad example:

```ts
const loader = new VideoLoader();
const compressor = new VideoCompressor();
const uploader = new VideoUploader();

const loaded = loader.load("lesson.mov");
const compressed = compressor.compress(loaded);
uploader.upload(compressed);
```

Good example:

```ts
class VideoPublishingFacade {
  publish(file: string) {
    const loader = new VideoLoader();
    const compressor = new VideoCompressor();
    const uploader = new VideoUploader();

    const loaded = loader.load(file);
    const compressed = compressor.compress(loaded);
    return uploader.upload(compressed);
  }
}

new VideoPublishingFacade().publish("lesson.mov");
```

What changed:

- clients call one simple method
- subsystem steps are hidden behind the facade
- repeated workflow code is centralized

Tradeoff:

Facade should stay focused. If it supports every possible use case, it becomes
another complex subsystem.

## 14. Flyweight Pattern

Flyweight shares common object state to reduce memory usage.

Use it when:

- the app creates many similar objects
- repeated immutable data consumes memory
- unique state can be stored separately

Problem it solves:

Without Flyweight, every object stores the same repeated data.

Bad example:

```ts
class Icon {
  constructor(
    public name: string,
    public svgPath: string,
  ) {}
}

const saveA = new Icon("save", "/icons/save.svg");
const saveB = new Icon("save", "/icons/save.svg");

console.log(saveA === saveB); // false
```

Good example:

```ts
class Icon {
  constructor(
    public readonly name: string,
    public readonly svgPath: string,
  ) {}
}

class IconFactory {
  private icons = new Map<string, Icon>();

  getIcon(name: string) {
    if (!this.icons.has(name)) {
      this.icons.set(name, new Icon(name, `/icons/${name}.svg`));
    }

    return this.icons.get(name)!;
  }
}

const factory = new IconFactory();
const saveA = factory.getIcon("save");
const saveB = factory.getIcon("save");
```

What changed:

- repeated icon data is shared
- callers reuse the same immutable object
- unique state, such as position, can live outside the icon

Tradeoff:

Flyweight is useful only when object count and memory use are real problems.

## 15. Proxy Pattern

Proxy controls access to another object while keeping the same interface.

Use it when:

- access needs authorization
- object creation should be lazy
- calls need caching, logging, or remote access control

Problem it solves:

Without Proxy, access rules are scattered or the real object is exposed
directly.

Bad example:

```ts
class DocumentStore {
  getDocument(id: string) {
    return `document ${id}`;
  }
}

const store = new DocumentStore();
console.log(store.getDocument("42")); // no access control
```

Good example:

```ts
interface DocumentStore {
  getDocument(id: string): string;
}

class RealDocumentStore implements DocumentStore {
  getDocument(id: string) {
    return `document ${id}`;
  }
}

class AuthDocumentProxy implements DocumentStore {
  constructor(private store: DocumentStore, private role: string) {}

  getDocument(id: string) {
    if (this.role !== "admin") {
      throw new Error("forbidden");
    }

    return this.store.getDocument(id);
  }
}
```

What changed:

- proxy has the same interface as the real object
- proxy checks access before forwarding the call
- client code can still depend on `DocumentStore`

Tradeoff:

Proxy can hide expensive remote calls or permission checks if naming is unclear.

## 16. Behavioral Patterns Overview

Behavioral patterns focus on communication and workflows. Use them when
behavior is spread across conditionals, tightly coupled objects, or unclear
execution flows.

| Pattern | Use It When | Simple Meaning |
| --- | --- | --- |
| Chain of Responsibility | Multiple handlers may process a request | Pass through a chain |
| Command | Actions need queueing, logging, retry, or undo | Turn an action into an object |
| Interpreter | Small rules need to be evaluated | Model rules as expressions |
| Iterator | A collection needs standard traversal | Loop without exposing storage |
| Mediator | Objects talk to too many peers | Centralize communication |
| Memento | State needs undo or restore | Save a snapshot |
| Observer | Many objects react to one event | Notify subscribers |
| State | Behavior changes by status | Put behavior in state classes |
| Strategy | Algorithms need to be swapped | Inject the algorithm |
| Template Method | Workflows share the same step order | Define the skeleton once |
| Visitor | New operations are added to stable object types | Move operations into visitors |

Interview shortcut:

> Behavioral patterns help when the flow of responsibility between objects is
> the main source of complexity.

## 17. Chain of Responsibility Pattern

Chain of Responsibility passes a request through handlers until one handles it
or the chain ends.

Use it when:

- multiple checks may handle or block a request
- handler order should be configurable
- one large function has too many validation steps

Problem it solves:

Without Chain of Responsibility, request processing becomes one large function.

Bad example:

```ts
function handleRequest(request: { user?: string; valid: boolean }) {
  if (!request.user) return "blocked by auth";
  if (!request.valid) return "blocked by validation";
  return "request handled";
}
```

Good example:

```ts
type Request = { user?: string; valid: boolean };

abstract class RequestHandler {
  private next?: RequestHandler;

  setNext(handler: RequestHandler) {
    this.next = handler;
    return handler;
  }

  handle(request: Request): string {
    return this.process(request) ?? this.next?.handle(request) ?? "not handled";
  }

  protected abstract process(request: Request): string | undefined;
}

class AuthHandler extends RequestHandler {
  protected process(request: Request) {
    return request.user ? undefined : "blocked by auth";
  }
}

class ValidationHandler extends RequestHandler {
  protected process(request: Request) {
    return request.valid ? undefined : "blocked by validation";
  }
}
```

What changed:

- each handler has one responsibility
- handlers can be reordered
- the sender does not know which handler will process the request

Tradeoff:

Debugging can be harder if it is unclear which handler stopped the chain.

## 18. Command Pattern

Command turns a request into an object.

Use it when:

- actions need queueing, logging, retry, or undo
- a caller should not know receiver details
- an operation should execute later

Problem it solves:

Without Command, the invoker directly knows what object performs the action.

Bad example:

```ts
class Light {
  turnOn() {
    console.log("light on");
  }
}

class Button {
  constructor(private light: Light) {}

  press() {
    this.light.turnOn();
  }
}
```

Good example:

```ts
interface Command {
  execute(): void;
}

class Light {
  turnOn() {
    console.log("light on");
  }
}

class TurnOnLightCommand implements Command {
  constructor(private light: Light) {}

  execute() {
    this.light.turnOn();
  }
}

class Button {
  constructor(private command: Command) {}

  press() {
    this.command.execute();
  }
}
```

What changed:

- the action is an object
- `Button` does not know about `Light`
- commands can be queued, logged, retried, or undone

Tradeoff:

Command creates extra objects. It is most useful when actions need a lifecycle.

## 19. Interpreter Pattern

Interpreter represents and evaluates a small language or grammar.

Use it when:

- the app needs simple configurable rules
- rules are repeated in many conditionals
- the rule language is small and stable

Problem it solves:

Without Interpreter, business rules become hard-coded conditionals.

Bad example:

```ts
function isEligible(order: { country: string; total: number }) {
  return order.country === "SG" && order.total >= 100;
}
```

Good example:

```ts
type Context = { country: string; total: number };

interface Expression {
  interpret(context: Context): boolean;
}

class CountryExpression implements Expression {
  constructor(private country: string) {}

  interpret(context: Context) {
    return context.country === this.country;
  }
}

class MinimumTotalExpression implements Expression {
  constructor(private minimum: number) {}

  interpret(context: Context) {
    return context.total >= this.minimum;
  }
}

class AndExpression implements Expression {
  constructor(
    private left: Expression,
    private right: Expression,
  ) {}

  interpret(context: Context) {
    return this.left.interpret(context) && this.right.interpret(context);
  }
}
```

What changed:

- rules are objects
- rules can be composed
- rule evaluation is consistent

Tradeoff:

Interpreter becomes difficult when the language grows large. Then use a parser
or rules engine.

## 20. Iterator Pattern

Iterator traverses a collection without exposing its internal storage.

Use it when:

- clients need to loop through a custom collection
- collection internals should stay private
- traversal order may change

Problem it solves:

Without Iterator, callers know too much about internal arrays, maps, or pages.

Bad example:

```ts
class UserCollection {
  constructor(public users: string[]) {}
}

const collection = new UserCollection(["Asha", "Ben"]);
for (let index = 0; index < collection.users.length; index += 1) {
  console.log(collection.users[index]);
}
```

Good example:

```ts
class UserCollection implements Iterable<string> {
  constructor(private users: string[]) {}

  [Symbol.iterator]() {
    let index = 0;
    const users = this.users;

    return {
      next() {
        if (index < users.length) {
          return { value: users[index++], done: false };
        }

        return { value: undefined, done: true };
      },
    };
  }
}

for (const user of new UserCollection(["Asha", "Ben"])) {
  console.log(user);
}
```

What changed:

- storage remains private
- caller uses normal iteration
- traversal can change without caller changes

Tradeoff:

Do not hide expensive database or network calls behind iteration unless callers
understand the cost.

## 21. Mediator Pattern

Mediator centralizes communication between objects so they do not directly
depend on each other.

Use it when:

- many objects communicate with many other objects
- relationships are becoming hard to track
- a workflow needs a coordinator

Problem it solves:

Without Mediator, objects become tightly coupled to many peers.

Bad example:

```ts
class User {
  peers: User[] = [];

  send(message: string) {
    this.peers.forEach((peer) => peer.receive(message));
  }

  receive(message: string) {
    console.log(message);
  }
}
```

Good example:

```ts
class ChatRoom {
  private users: ChatUser[] = [];

  join(user: ChatUser) {
    this.users.push(user);
  }

  send(from: ChatUser, message: string) {
    this.users
      .filter((user) => user !== from)
      .forEach((user) => user.receive(from.name, message));
  }
}

class ChatUser {
  constructor(
    public readonly name: string,
    private room: ChatRoom,
  ) {
    this.room.join(this);
  }

  send(message: string) {
    this.room.send(this, message);
  }

  receive(from: string, message: string) {
    console.log(`${this.name} received from ${from}: ${message}`);
  }
}
```

What changed:

- users do not store all peer references
- communication rules live in the mediator
- adding users does not require rewiring every user

Tradeoff:

Mediator can become too large if unrelated logic is added to it.

## 22. Memento Pattern

Memento captures and restores an object's state without exposing all internals.

Use it when:

- users need undo or restore
- object state should stay private
- snapshots should be passed around safely

Problem it solves:

Without Memento, external code may directly read and write private state.

Bad example:

```ts
class TextEditor {
  content = "";
}

const editor = new TextEditor();
editor.content = "Hello";
const snapshot = editor.content;
editor.content = "Hello world";
editor.content = snapshot;
```

Good example:

```ts
class EditorMemento {
  constructor(private readonly content: string) {}

  getContent() {
    return this.content;
  }
}

class TextEditor {
  constructor(private content = "") {}

  type(value: string) {
    this.content += value;
  }

  save() {
    return new EditorMemento(this.content);
  }

  restore(memento: EditorMemento) {
    this.content = memento.getContent();
  }
}
```

What changed:

- editor controls how state is saved
- snapshot is represented by a memento object
- internal fields are not directly exposed

Tradeoff:

Snapshots can use a lot of memory when state is large.

## 23. Observer Pattern

Observer notifies many subscribers when one object changes.

Use it when:

- many objects should react to one event
- publisher should not know every subscriber type
- reactions should be added without editing the publisher

Problem it solves:

Without Observer, the publisher directly calls every receiver.

Bad example:

```ts
class NewsPublisher {
  publish(message: string) {
    new EmailService().send(message);
    new SmsService().send(message);
    new AnalyticsService().track(message);
  }
}
```

Good example:

```ts
interface Subscriber {
  update(message: string): void;
}

class EmailSubscriber implements Subscriber {
  update(message: string) {
    console.log(`email: ${message}`);
  }
}

class NewsPublisher {
  private subscribers: Subscriber[] = [];

  subscribe(subscriber: Subscriber) {
    this.subscribers.push(subscriber);
  }

  publish(message: string) {
    this.subscribers.forEach((subscriber) => subscriber.update(message));
  }
}
```

What changed:

- publisher stores subscribers through an interface
- new subscriber types can be added without changing publisher logic
- event fan-out is explicit

Tradeoff:

Observer can make flow harder to trace. Provide unsubscribe behavior for
long-lived objects.

## 24. State Pattern

State changes an object's behavior when its internal state changes.

Use it when:

- behavior depends heavily on status
- valid transitions need to be controlled
- status conditionals are spreading through one class

Problem it solves:

Without State, one class contains many status-based branches.

Bad example:

```ts
class Order {
  status: "pending" | "paid" = "pending";

  ship() {
    if (this.status === "pending") {
      console.log("cannot ship before payment");
      return;
    }

    console.log("order shipped");
  }
}
```

Good example:

```ts
interface OrderState {
  pay(order: Order): void;
  ship(order: Order): void;
}

class PendingState implements OrderState {
  pay(order: Order) {
    console.log("payment accepted");
    order.setState(new PaidState());
  }

  ship() {
    console.log("cannot ship before payment");
  }
}

class PaidState implements OrderState {
  pay() {
    console.log("already paid");
  }

  ship() {
    console.log("order shipped");
  }
}

class Order {
  constructor(private state: OrderState = new PendingState()) {}

  setState(state: OrderState) {
    this.state = state;
  }

  pay() {
    this.state.pay(this);
  }

  ship() {
    this.state.ship(this);
  }
}
```

What changed:

- state-specific behavior moved into state classes
- `Order` delegates to the current state
- transitions become explicit

Tradeoff:

For a tiny state machine, a simple `switch` may be easier to read.

## 25. Strategy Pattern

Strategy makes algorithms interchangeable through a shared interface.

Use it when:

- one class has many branches for different algorithms
- behavior should be selected at runtime
- new algorithms should be added without editing existing logic

Problem it solves:

Without Strategy, algorithm choices become repeated conditionals.

Bad example:

```ts
class Checkout {
  total(price: number, discountType: "none" | "holiday") {
    if (discountType === "holiday") return price * 0.8;
    return price;
  }
}
```

Good example:

```ts
interface DiscountStrategy {
  apply(price: number): number;
}

class NoDiscount implements DiscountStrategy {
  apply(price: number) {
    return price;
  }
}

class HolidayDiscount implements DiscountStrategy {
  apply(price: number) {
    return price * 0.8;
  }
}

class Checkout {
  constructor(private discount: DiscountStrategy) {}

  total(price: number) {
    return this.discount.apply(price);
  }
}
```

What changed:

- each algorithm is separate
- checkout depends on an interface
- new discount strategies can be added without editing checkout

Tradeoff:

For one or two simple branches that rarely change, Strategy may be unnecessary.

## 26. Template Method Pattern

Template Method defines the skeleton of an algorithm in a base class and lets
subclasses customize selected steps.

Use it when:

- workflows share the same step order
- each workflow customizes only a few steps
- duplicated workflow structure appears across classes

Problem it solves:

Without Template Method, the same algorithm order is copied into many classes.

Bad example:

```ts
class CsvImporter {
  import() {
    const rows = [" Asha ", " Ben "];
    const cleaned = rows.map((row) => row.trim());
    console.log(cleaned);
  }
}

class JsonImporter {
  import() {
    const rows = [" Chen ", " Devi "];
    const cleaned = rows.map((row) => row.trim());
    console.log(cleaned);
  }
}
```

Good example:

```ts
abstract class DataImporter {
  import() {
    const rows = this.read();
    const cleanedRows = this.clean(rows);
    this.save(cleanedRows);
  }

  protected abstract read(): string[];

  protected clean(rows: string[]) {
    return rows.map((row) => row.trim());
  }

  protected abstract save(rows: string[]): void;
}

class CsvImporter extends DataImporter {
  protected read() {
    return [" Asha ", " Ben "];
  }

  protected save(rows: string[]) {
    console.log(rows);
  }
}
```

What changed:

- base class owns the algorithm order
- subclasses fill in specific steps
- duplicated workflow structure is removed

Tradeoff:

Template Method relies on inheritance. Strategy or composition may be more
flexible when steps need many combinations.

## 27. Visitor Pattern

Visitor adds new operations to stable object types without putting every
operation inside those object classes.

Use it when:

- object structure is stable
- new operations are added often
- domain classes should not contain unrelated operations

Problem it solves:

Without Visitor, every object class fills up with many unrelated methods.

Bad example:

```ts
class HeadingNode {
  constructor(public text: string) {}

  wordCount() {
    return this.text.split(/\s+/).length;
  }

  exportHtml() {
    return `<h1>${this.text}</h1>`;
  }
}
```

Good example:

```ts
interface DocumentNode {
  accept(visitor: DocumentVisitor): void;
}

interface DocumentVisitor {
  visitHeading(node: HeadingNode): void;
  visitParagraph(node: ParagraphNode): void;
}

class HeadingNode implements DocumentNode {
  constructor(public readonly text: string) {}

  accept(visitor: DocumentVisitor) {
    visitor.visitHeading(this);
  }
}

class ParagraphNode implements DocumentNode {
  constructor(public readonly text: string) {}

  accept(visitor: DocumentVisitor) {
    visitor.visitParagraph(this);
  }
}

class WordCountVisitor implements DocumentVisitor {
  count = 0;

  visitHeading(node: HeadingNode) {
    this.count += node.text.split(/\s+/).length;
  }

  visitParagraph(node: ParagraphNode) {
    this.count += node.text.split(/\s+/).length;
  }
}
```

What changed:

- document nodes keep only structure
- operations move into visitor classes
- new operations can be added as new visitors

Tradeoff:

Visitor is awkward when new object types are added often because every visitor
must be updated.
