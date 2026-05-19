import { createWorld, type World } from '@kassandra/simulation';
export const world = $state<World>(createWorld());
export function resetWorld(seed: number = Date.now() >>> 0) {
  const fresh = createWorld(seed);
  for (const key of Object.keys(world) as (keyof World)[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (world as any)[key] = (fresh as any)[key];
  }
}
