// Bridge `console.error` / `console.warn` and uncaught runtime errors
// into the in-game chat log so the player notices them without
// opening devtools. Each diagnostic lands as a one-line System
// message in `world.chat.messages` — multiline stack traces are
// squashed and oversized payloads are truncated with an ellipsis.
//
// Originals are still called so the browser console keeps its
// usual stack traces and grouping. The bridge installs at module
// load (imported from main.ts) so it captures errors from the
// very first frame.

import type { ChatMessage } from './sim/types';
import { genId, world } from './sim/world.svelte';

// Hard cap on a single chat line. Long enough to keep most error
// messages readable; short enough that a stack trace doesn't push
// the rest of the chat off-screen.
const MAX_LINE_LENGTH = 160;

// Reentrance guard. Pushing into the chat triggers Svelte
// reactivity; if some downstream subscriber throws (and the runtime
// routes that back through console.error) we'd loop forever
// otherwise.
let inFlight = false;

function summarizeArg(arg: unknown): string {
  if (arg instanceof Error) {
    return arg.message || arg.name || 'Error';
  }
  if (typeof arg === 'string') return arg;
  if (arg === undefined) return 'undefined';
  if (arg === null) return 'null';
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function flatten(args: readonly unknown[]): string {
  const joined = args.map(summarizeArg).join(' ');
  // Collapse runs of any whitespace (newlines in stack traces,
  // padding from Error.toString, tabs) into single spaces so the
  // chat line stays on one row.
  const oneLine = joined.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= MAX_LINE_LENGTH) return oneLine;
  return `${oneLine.slice(0, MAX_LINE_LENGTH - 1)}…`;
}

function push(author: string, args: readonly unknown[]) {
  if (inFlight) return;
  inFlight = true;
  try {
    const text = flatten(args);
    if (!text) return;
    const msg: ChatMessage = {
      id: genId(world, 'm'),
      author,
      text,
      channel: 'Normal',
    };
    world.chat.messages.push(msg);
  } catch {
    // Swallow — the bridge must never throw, or the host page's
    // error reporting eats itself.
  } finally {
    inFlight = false;
  }
}

const originalError = console.error.bind(console);
const originalWarn = console.warn.bind(console);

console.error = (...args: unknown[]) => {
  originalError(...args);
  push('Error', args);
};

console.warn = (...args: unknown[]) => {
  originalWarn(...args);
  push('Warning', args);
};

// Uncaught synchronous errors. Bubble up here instead of through
// console.error so we have to hook them separately. `event.error`
// is usually the thrown value; `event.message` is the formatted
// fallback for cross-origin scripts where the value is hidden.
window.addEventListener('error', (event) => {
  const value =
    event.error !== undefined && event.error !== null
      ? event.error
      : event.message;
  push('Error', [value]);
});

// Promise rejections that nothing awaited or `.catch`-ed.
window.addEventListener('unhandledrejection', (event) => {
  push('Error', [event.reason]);
});
