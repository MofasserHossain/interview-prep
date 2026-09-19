# AI Frontend Engineering Interview Guide

AI frontend interview guidance covering chat UX, streaming responses, race
conditions, agent tool state, RAG source experiences, security, testing, and
production debugging.

Use this guide for frontend roles where the product includes LLMs, chat,
agents, retrieval, or model-powered workflows. Strong answers should show
React skill, product judgment, security awareness, and the ability to debug
distributed UI behavior.

## 1. What Is AI Frontend Engineering?

AI frontend engineering is the frontend work required to make AI-powered
features usable, reliable, secure, and observable. It includes normal frontend
skills, such as React state, rendering, forms, accessibility, and performance,
plus AI-specific concerns like streaming responses, tool execution state, RAG
citations, model latency, safety boundaries, and unpredictable output.

It matters because AI products are rarely simple request-response forms. The UI
often needs to show partial answers, pending model work, source evidence,
failed tool calls, retries, cancellation, and user trust signals.

Practical example:

A normal search page can show a spinner and then results. An AI research page
may need to show:

- the user's prompt
- retrieval progress
- streaming answer text
- citations
- tool calls
- partial failure states
- retry and stop controls
- feedback capture

Tradeoff:

AI frontend work can become overcomplicated if every internal model step is
shown to users. Good product design exposes enough state to build trust without
turning the interface into a noisy debug console.

Strong answer:

> AI frontend engineering is about building the user-facing layer around
> probabilistic backend behavior. I need to handle latency, streaming, stale
> responses, citations, errors, security, and measurement instead of assuming
> every request returns one clean JSON payload.

## 2. How Would You Design A Reliable AI Chat UI?

A reliable AI chat UI should model the conversation as structured state, not as
one growing text string.

Core state:

```ts
type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  status: "queued" | "streaming" | "complete" | "error" | "cancelled";
  content: string;
  requestId?: string;
  createdAt: number;
  error?: string;
};
```

Important UI behaviors:

- append the user message immediately
- create a placeholder assistant message
- stream updates into that placeholder
- allow stop and retry
- preserve failed messages instead of deleting them
- keep scroll behavior predictable
- make keyboard and screen-reader behavior usable

Why it matters:

Users need to understand whether the assistant is thinking, streaming,
blocked, done, or failed. A generic spinner is not enough for long AI tasks.

Tradeoff:

Showing too much internal state can distract users. For a consumer chat, keep
states simple. For an agent or developer tool, expose more detailed execution
steps.

Strong answer:

> I would store each message with an id, role, status, content, request id, and
> timestamps. The UI should render the latest known state, support cancellation
> and retry, and never replace newer conversation state with stale responses.

## 3. How Would You Fix A Chat UI That Gets Slow After A Long Conversation?

First identify whether the slowness comes from rendering, streaming updates,
network payload size, markdown rendering, syntax highlighting, layout, or
backend latency.

Debugging checklist:

- record React Profiler data during a long conversation
- capture Chrome Performance traces for long tasks
- measure message count and DOM node count
- inspect whether every token triggers a full conversation re-render
- check expensive markdown parsing on every stream chunk
- measure payload size sent with each request
- compare first-token latency and full-response latency

Frontend fixes:

- virtualize the message list when message count is high
- memoize individual message rows with stable props
- batch streaming updates instead of rendering every token
- parse markdown after a block or response completes when possible
- keep expensive transforms outside render
- avoid sending the full raw conversation when a summarized context is enough

Example batching shape:

```ts
let pendingText = "";
let frame = 0;

function onToken(token: string) {
  pendingText += token;

  if (frame) return;

  frame = window.requestAnimationFrame(() => {
    appendAssistantText(pendingText);
    pendingText = "";
    frame = 0;
  });
}
```

Tradeoff:

Virtualization improves performance for thousands of messages, but it can make
auto-scroll, dynamic row heights, search-in-page, and accessibility more
complex. Use it when measurement shows the DOM size is a real bottleneck.

Strong answer:

> I would measure before optimizing. If rendering is the bottleneck, I would
> virtualize long lists, memoize message rows, and batch streaming updates. If
> the request is slow because we resend too much context, I would work with the
> backend on summarization or windowing.

## 4. How Would You Optimize Streaming AI Responses In React?

Streaming responses can make an AI app feel faster, but naive streaming can
cause too many renders.

Good streaming design:

- create one assistant message before the stream starts
- update only that message while it streams
- buffer small chunks and flush on animation frames or short intervals
- use `AbortController` for stop/cancel
- handle malformed chunks and network disconnects
- mark the final state explicitly as complete or error

Example:

```ts
async function streamAssistantResponse(request: Request, signal: AbortSignal) {
  const response = await fetch("/api/chat", { method: "POST", body: request.body, signal });
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) throw new Error("Missing response stream");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    queueAssistantChunk(decoder.decode(value, { stream: true }));
  }
}
```

Why it matters:

Rendering every tiny token can block the main thread, especially if each update
re-renders markdown, citations, sidebars, and message controls.

Tradeoff:

Aggressive batching reduces render cost but may make the stream feel less
instant. A good UI usually flushes often enough to feel live while still
avoiding one render per token.

Strong answer:

> I treat streaming as a UI performance problem. I update only the active
> assistant message, buffer chunks, flush at a controlled cadence, support
> abort, and move expensive formatting away from every token update.

## 5. How Would You Prevent Stale AI Responses From Overwriting Newer UI State?

Use request identity and state ownership. Every prompt should create a unique
request id, and every response chunk should be applied only if it still belongs
to the active request for that message or conversation turn.

Example:

```ts
type ActiveRequest = {
  messageId: string;
  requestId: string;
};

let activeRequest: ActiveRequest | null = null;

function startPrompt(messageId: string) {
  const requestId = crypto.randomUUID();
  activeRequest = { messageId, requestId };
  return requestId;
}

function applyChunk(requestId: string, chunk: string) {
  if (activeRequest?.requestId !== requestId) return;

  updateAssistantMessage(activeRequest.messageId, chunk);
}
```

What can go wrong:

- prompt A starts
- prompt B starts
- prompt B finishes first
- prompt A finishes later
- prompt A overwrites the visible answer

Fixes:

- store responses by message id, not by one global `answer` field
- include request ids in client state and backend events
- abort superseded requests when the product allows it
- ignore stale events that do not match the active request
- make reducer transitions idempotent

Tradeoff:

Some products should allow concurrent responses, such as comparing two models.
In that case, do not globally cancel old requests. Store each response under
its own message, panel, or run id.

Strong answer:

> I would not let a response update anonymous global state. Each request gets an
> id, each assistant message has an owner, and late chunks are ignored unless
> they match the current request or the specific run they belong to.

## 6. How Would You Model AI Agent Tool Execution State?

An agent UI should use an explicit state machine for the overall run and for
each tool call. Do not infer success from the last rendered text.

Example:

```ts
type ToolCallState =
  | { status: "pending"; toolName: string; callId: string }
  | { status: "running"; toolName: string; callId: string; startedAt: number }
  | { status: "succeeded"; toolName: string; callId: string; outputSummary: string }
  | { status: "failed"; toolName: string; callId: string; error: string; retryable: boolean }
  | { status: "cancelled"; toolName: string; callId: string };

type AgentRunStatus = "queued" | "running" | "needs_input" | "succeeded" | "failed" | "cancelled";
```

Why it matters:

If tool number three fails but the UI shows "Task Completed", the state model is
wrong. A completed text stream is not the same thing as a successful agent run.

UI expectations:

- show each tool call with pending, running, success, failure, or skipped state
- distinguish retryable and non-retryable failures
- show partial output when it is useful
- require user confirmation for risky tool actions
- prevent duplicate execution with stable call ids
- handle delayed or out-of-order events

Tradeoff:

For a simple assistant, tool details can stay collapsed. For a developer or
operations workflow, users often need detailed tool state for trust and audit.

Strong answer:

> I would model the agent run and each tool call separately. The final run state
> should be derived from validated events, not from the presence of assistant
> text. Partial failure must remain visible and retry behavior should be
> explicit.

## 7. How Would You Handle Partial Failures In An AI Agent UI?

Partial failure means the agent completed some work but not all of it. The UI
must avoid pretending the full task succeeded.

Good behavior:

- show a clear overall status such as "Needs attention" or "Partially failed"
- identify which tool failed
- keep successful tool outputs visible
- explain whether retry is safe
- preserve run history for debugging
- avoid rerunning successful non-idempotent tool calls

Example:

```txt
Run: failed

1. Search docs: succeeded
2. Read selected files: succeeded
3. Create pull request: failed
4. Notify channel: skipped
```

Why it matters:

AI agents often call tools that affect real systems. Retrying a failed run can
duplicate tickets, payments, comments, emails, or database writes if the UI and
backend do not track idempotency.

Tradeoff:

Automatically retrying transient failures improves UX, but only for safe and
idempotent operations. For destructive or external side effects, require user
review.

Strong answer:

> I would represent partial failure as a first-class state. The user should see
> what succeeded, what failed, what was skipped, and whether retry will resume
> safely or rerun side effects.

## 8. How Would You Debug A RAG UI When The Sources Look Irrelevant?

Separate retrieval failure from generation failure.

Retrieval failure means the system fetched the wrong context. Generation
failure means the model had useful context but ignored, distorted, or
overgeneralized it.

Frontend debug data to expose in an internal view:

- query text sent to retrieval
- filters and metadata applied
- retrieved document titles
- chunk text previews
- similarity scores or rank
- reranker scores when available
- selected chunks passed to the model
- final citations used in the answer

Questions to ask:

- did the frontend send the right user query?
- did filters remove the correct documents?
- are document ids and metadata displayed correctly?
- are citation links pointing to the right source?
- did the model cite chunks that were actually retrieved?

Tradeoff:

End users should see clean citations and source previews. Developers and
support staff need a deeper debug view with scores, chunk ids, and metadata.

Strong answer:

> I would first determine whether retrieval returned bad context or the model
> ignored good context. The frontend should expose retrieved chunks, scores,
> metadata filters, and final citations in an internal debug view.

## 9. How Should The Frontend Display RAG Citations?

Citations should help users verify the answer. They should not be decorative
numbers with no useful path back to evidence.

Good citation UX:

- show citation markers near the specific claim
- link markers to source cards or source pages
- include document title, owner, date, and relevant snippet when available
- distinguish high-confidence evidence from weak supporting context
- handle missing or unavailable sources honestly
- preserve source order and ids from the backend

Example shape:

```ts
type Citation = {
  id: string;
  documentTitle: string;
  chunkId: string;
  snippet: string;
  url?: string;
  score?: number;
};
```

Why it matters:

Users trust AI answers more when they can inspect the evidence. Citations also
help debug whether the product is using the correct internal knowledge.

Tradeoff:

Too many citations make the answer hard to read. Show the most relevant
sources in the main UI and let users expand for more evidence.

Strong answer:

> I would tie citations to specific claims, preserve source ids, show useful
> metadata and snippets, and provide a debug path for support. A citation should
> let the user verify the answer, not just decorate it.

## 10. Why Should AI API Keys Not Live In The Browser?

API keys should not live in frontend code because browser code is public to the
user. Anything shipped to the browser can be inspected, copied, and abused.

Correct architecture:

```txt
Browser
  -> your backend route with user auth, validation, rate limits, logging
  -> AI provider using server-side secret
```

The backend should handle:

- provider API keys
- user authentication and authorization
- rate limits and quotas
- request validation
- prompt construction
- policy checks
- audit logging
- cost controls

Why it matters:

If a provider key is exposed in the browser, attackers can use it outside your
app, generate cost, bypass your product rules, or access provider features you
did not intend to expose.

Tradeoff:

Calling an AI provider directly from the browser may look simpler for a demo,
but production apps need a backend boundary for secrets, abuse prevention, and
business rules.

Strong answer:

> A frontend should never contain provider secrets. The browser calls our
> backend with user auth, and the backend calls the AI provider with protected
> keys, rate limits, validation, logging, and cost controls.

## 11. How Can Prompt Injection Become A Frontend Security Problem?

Prompt injection is not only a model problem. It becomes a frontend security
problem when untrusted model output is treated as trusted UI instructions,
HTML, links, commands, or tool input.

Frontend risks:

- rendering model output as raw HTML
- opening untrusted links without clear display
- accepting model-suggested tool actions without confirmation
- leaking hidden prompts or internal metadata in the UI
- allowing retrieved documents to influence privileged UI actions
- showing unsafe markdown, scripts, or file paths

Defenses:

- render markdown with safe defaults
- sanitize or block raw HTML
- keep tool permissions on the server
- require confirmation for sensitive actions
- separate untrusted model text from trusted app state
- log and review suspicious prompts or outputs
- use allowlists for commands, domains, and file types

Tradeoff:

Overblocking output can hurt legitimate workflows. The key is to treat model
content as untrusted input and gate sensitive actions through typed, validated
application logic.

Strong answer:

> I would not let model output become executable UI behavior. The frontend
> should render output safely, validate links and actions, and require server
> authorization for tools or data access.

## 12. How Would You Test And Observe An AI Frontend?

AI frontend testing should cover deterministic UI behavior around
nondeterministic backend output.

Test areas:

- message rendering for queued, streaming, complete, error, and cancelled states
- race conditions from out-of-order responses
- retry behavior after partial failures
- citation display and missing-source states
- streaming cancellation with `AbortController`
- long conversation performance
- accessibility of chat, status updates, and keyboard flow
- security behavior for markdown, links, and file uploads

Useful observability metrics:

- prompt-to-first-token latency
- full-response latency
- stream disconnect rate
- error rate by provider/model
- retry rate
- cancellation rate
- frontend render time during streaming
- message count and DOM node count
- citation click-through and feedback

Tradeoff:

Snapshot tests are weak for AI interfaces because text changes often. Better
tests assert states, events, accessibility, and contracts around mocked
streams.

Strong answer:

> I would mock model streams and assert UI state transitions. In production I
> would measure first-token latency, full latency, cancellation, errors, retry
> rate, render cost, and feedback so we can separate frontend problems from
> model or retrieval problems.
