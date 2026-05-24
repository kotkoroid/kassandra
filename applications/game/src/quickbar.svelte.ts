// Per-class quickbar layout: a flat array of spell IDs (or null for
// empty) where index 0-4 ↔ digit keys 1-5 and index 5-9 ↔ function
// keys F1-F5. One flat array — not two named banks — keeps the drag/
// drop logic uniform: a spell moves between digit and F slots with
// the same `swapSlots(from, to)` call regardless of which row.
//
// Held in a Svelte $state so QuickBar + Scene's key handler react
// instantly to reorders. Persisted to localStorage so layout survives
// reloads — quickbar arrangement is a UI preference, not authoritative
// game state, so we keep it off the wire and off the server.

import type { PlayerClass } from '@kassandra/simulation-domain-library';
import { CLASS_SPELLS } from './classSpells';

export const QUICKBAR_DIGITS = 5;
export const QUICKBAR_FN = 5;
export const QUICKBAR_SLOTS = QUICKBAR_DIGITS + QUICKBAR_FN;

type Layout = Partial<Record<PlayerClass, (string | null)[]>>;

const STORAGE_KEY = 'kassandra.quickbar.layout.v1';

function loadLayout(): Layout {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Layout) : {};
  } catch {
    return {};
  }
}

function persist(layout: Layout): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // quota / unavailable — silently ignore; layout still reactive in-memory
  }
}

export const quickbar = $state<{ layout: Layout }>({ layout: loadLayout() });

// Default: first QUICKBAR_DIGITS class spells fill the digit slots in
// declared order; F-slots default to empty so the player picks what
// goes there. Padded to QUICKBAR_SLOTS so callers can index 0..9
// unconditionally.
function defaultSlots(playerClass: PlayerClass): (string | null)[] {
  const spells = CLASS_SPELLS[playerClass] ?? [];
  const out: (string | null)[] = [];
  for (let i = 0; i < QUICKBAR_DIGITS; i++) out.push(spells[i]?.id ?? null);
  for (let i = 0; i < QUICKBAR_FN; i++) out.push(null);
  return out;
}

export function getSlots(playerClass: PlayerClass): (string | null)[] {
  const stored = quickbar.layout[playerClass];
  // Length check also handles stale localStorage entries from a prior
  // 5-slot world: they get ignored and replaced by the 10-slot default
  // the next time the player drags anything.
  if (stored && stored.length === QUICKBAR_SLOTS) return stored;
  return defaultSlots(playerClass);
}

function commit(playerClass: PlayerClass, slots: (string | null)[]): void {
  quickbar.layout = { ...quickbar.layout, [playerClass]: slots };
  persist(quickbar.layout);
}

// Swap slot contents. Works across the digit/F boundary — slots are
// just indices in a flat array. If either side is empty (`null`) the
// swap still happens (that's how the user empties a slot).
export function swapSlots(playerClass: PlayerClass, from: number, to: number): void {
  if (from === to) return;
  const slots = [...getSlots(playerClass)];
  if (from < 0 || from >= slots.length || to < 0 || to >= slots.length) return;
  [slots[from], slots[to]] = [slots[to]!, slots[from]!];
  commit(playerClass, slots);
}
