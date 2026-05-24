// Pattern: Logger / observability (Effect.fn + structured logs)
// ----------------------------------------------------------------------
//
// When to use:
//   Every Effect that does meaningful work. `Effect.fn(name)` gives
//   free stack traces and tracing spans — strictly better than bare
//   `Effect.gen` for any non-trivial generator. `Effect.annotateLogs`
//   attaches structured context to every log record.
//
// What it replaces in Kassandra:
//   - applications/game/src/realm.svelte.ts:40,43,61,69 — scattered
//     `console.log('[realm] …')` strings → `Effect.logDebug/Info/Warn`
//     with `{ partyId, playerId }` annotations.
//   - applications/game/src/consoleBridge.ts entirely — the
//     console.* monkey-patch becomes a custom Effect Logger that
//     pushes structured records into the chat (PR-C).
//
// Levels:
//   logTrace / logDebug / logInfo / logWarning / logError / logFatal.
//   Effect filters by `References.CurrentLogLevel` (4.0 replaces
//   v3's `FiberRef.currentLogLevel`).
//
// 4.0 details:
//   - `Effect.fn(name)` accepts a name plus a generator factory; tail
//     `.pipe(...)` operators apply to every invocation. The name shows
//     up verbatim in stack frames and tracing spans.
//   - `Effect.catchCause` replaces v3's `catchAllCause`.
//   - `Effect.annotateLogs` is an OPERATOR (`.pipe(annotateLogs(...))`),
//     not a yieldable; for scope-bound annotation use
//     `Effect.annotateLogsScoped` inside an `Effect.scoped` block.

import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';

// Reference shape: a handler that does some work, annotates the log
// records with structured context, and recovers from any failure with
// a single tail combinator. Annotations are applied via `.pipe` after
// the generator — they decorate every log call inside.
export const handleMessage = Effect.fn('patterns/Logger/handleMessage')(
  function* (sessionId: string, partyId: string) {
    yield* Effect.logDebug('inbound');
    // ... business logic would yield here ...
    yield* Effect.logInfo('processed');
    void sessionId;
    void partyId;
  },
  // Apply annotations as an operator. Every log record emitted by this
  // fn carries `{ sessionId, partyId }` — cheap, structured, no string
  // formatting at the call sites.
  (eff, sessionId, partyId) => eff.pipe(Effect.annotateLogs({ sessionId, partyId })),
  // Tail combinator: catch any cause, log it, swallow. The name in
  // Effect.fn shows up in the cause's stack so the operator knows which
  // handler failed without us having to repeat the string.
  Effect.catchCause((cause: Cause.Cause<never>) =>
    Effect.logError('handler failed', cause),
  ),
);

// Reference usage.
export const _exampleProgram = handleMessage('s-1', 'p-42');
