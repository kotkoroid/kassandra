// PR-D3e.3: body moved to `pure/spells.ts`. Top-level re-export to
// keep the existing import path stable for `services/Spells.ts` and
// `services/Tick.ts`.
export * from './pure/spells.ts';
