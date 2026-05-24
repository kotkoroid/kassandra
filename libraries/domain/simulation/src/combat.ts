// PR-D3e.3: body moved to `pure/combat.ts`. Top-level re-export so
// the existing import path (`from '../combat.ts'` / `from './combat.ts'`)
// stays stable for the 8 callers across systems/ and pure/.
export * from './pure/combat.ts';
