// Bridge between Svelte UI and the simulation. UI handlers push
// SimEvents onto the world's inputQueue; tick drains the queue at
// the top of every step. The same shape will plug into network
// packet handlers when multiplayer lands — server tick reads its
// own world's queue, populated by deserialized client packets.

import type { SimEvent, World } from './types';

export function dispatch(world: World, event: SimEvent) {
  world.inputQueue.push(event);
}
