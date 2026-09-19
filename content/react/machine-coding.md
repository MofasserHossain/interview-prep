# Machine Coding Interview Guide

Machine coding practice questions with state design, implementation guidance, examples, and edge cases.


## 1. Build A Todo App With Local Storage

Requirements:

- add todo
- delete todo
- persist in localStorage
- prevent empty input
- keep state centralized

Core logic:

```js
let todos = JSON.parse(localStorage.getItem("todos") || "[]");

function saveTodos() {
  localStorage.setItem("todos", JSON.stringify(todos));
}

function addTodo(text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  todos.push({
    id: Date.now(),
    text: trimmed,
    completed: false,
  });

  saveTodos();
}

function deleteTodo(id) {
  todos = todos.filter((todo) => todo.id !== id);
  saveTodos();
}
```

Discuss:

- empty input
- duplicate text if required
- localStorage JSON parse failure
- accessibility
- clear rendering logic

## 2. Stopwatch In React

```tsx
function Stopwatch() {
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef<number | null>(null);

  const start = () => {
    if (intervalRef.current !== null) return;

    intervalRef.current = window.setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
  };

  const stop = () => {
    if (intervalRef.current === null) return;

    clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  const reset = () => {
    stop();
    setSeconds(0);
  };

  return (
    <div>
      <h1>{seconds}s</h1>
      <button onClick={start}>Start</button>
      <button onClick={stop}>Stop</button>
      <button onClick={reset}>Reset</button>
    </div>
  );
}
```

Key point:

`useState` stores displayed time. `useRef` stores interval ID because changing it should not re-render.

## 3. Circle Click Machine Coding Challenge

Requirement:

- when user clicks screen, draw a circle at click position
- random radius
- keep maximum two circles
- on third click, clear old circles and start again
- detect whether two circles intersect

State shape:

```js
const circles = [
  { x: 120, y: 80, radius: 30 },
  { x: 160, y: 100, radius: 40 },
];
```

Intersection logic:

```js
function doCirclesIntersect(a, b) {
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  return distance <= a.radius + b.radius;
}
```

Click logic:

```js
function handleClick(event) {
  const radius = Math.floor(Math.random() * 40) + 10;

  const circle = {
    x: event.clientX,
    y: event.clientY,
    radius,
  };

  setCircles((prev) => {
    if (prev.length >= 2) return [circle];
    return [...prev, circle];
  });
}
```

Discuss:

- viewport boundaries
- circle positioning with CSS transform
- clearing behavior
- intersection feedback
- accessibility if required

---

