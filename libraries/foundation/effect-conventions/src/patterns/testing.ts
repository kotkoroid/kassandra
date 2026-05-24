// Pattern: Testing (@effect/vitest + alchemy/Test)
// ----------------------------------------------------------------------
//
// Five projects, one per environment, all in root `vite.config.ts` under
// `test.projects`. Rule: one project per environment type.
//
//   | Project   | Tool                              | Environment
//   |-----------|-----------------------------------|------------
//   | sim       | @effect/vitest                    | Chromium (browser mode)
//   | ui        | @testing-library/svelte           | happy-dom
//   | scene     | Vitest Browser Mode               | Playwright Chromium (WebGL)
//   | workers   | @cloudflare/vitest-pool-workers   | workerd
//   | deploy    | alchemy/Test/Vitest               | real Cloudflare infra
//
// `sim` is wired today (PR-A1); the other four projects land in PR-F.
//
// 4.0 detail:
//   `@effect/vitest` exposes `it.effect`, `it.live`, `it.layer`,
//   `it.prop`, `it.flakyTest`, `it.scoped`, etc. All wrap Vitest's `it`
//   so the rest of Vitest (`describe`, `expect`, `vi.mock`) is unchanged.
//
// Test reference (copy-paste skeleton — NOT run from this file, see
// libraries/domain/simulation/src/stats.test.ts for the running version):
//
// ```ts
// import { it, expect } from '@effect/vitest';
// import { Effect, Random } from 'effect';
// import { Combat, WorldRef, SimLayer } from '@kassandra/simulation-domain-library';
//
// // Layer-bound integration: every `it.effect` inside this block runs
// // with SimLayer provided.
// it.layer(SimLayer)('Combat', (it) => {
//   it.effect('slash deals expected damage', () =>
//     Effect.gen(function* () {
//       const world = yield* WorldRef;
//       const combat = yield* Combat;
//       yield* combat.slash('attacker-1', 'wolf-1');
//       const after = yield* world.get;
//       expect(after.entities[0].hp).toBe(70);
//     }).pipe(Random.withSeed('combat-test-seed-1')),
//   );
// });
// ```
//
// `alchemy/Test/Vitest` skeleton for the `deploy` project:
//
// ```ts
// import * as Test from 'alchemy/Test/Vitest';
// import * as Cloudflare from 'alchemy/Cloudflare';
// import Stack from '../../alchemy.run';
//
// const { test, beforeAll, afterAll, deploy, destroy } = Test.make({
//   providers: Cloudflare.providers(),
//   state: Cloudflare.state(),
// });
//
// const stack = beforeAll(deploy(Stack));
// afterAll.skipIf(!process.env.CI)(destroy(Stack));
//
// test('snapshot stream emits ≥10 Hz', /* … */);
// ```

// This file exports nothing — the patterns are in the comments above.
export {};
