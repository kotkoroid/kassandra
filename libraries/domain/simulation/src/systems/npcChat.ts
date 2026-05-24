// Ambient NPC chatter — thin wrapper over the pure-core in
// `pure/npcChat.ts`. The chatter map, line picker, and cadence math
// all live in the pure module; this file's only job is to bind
// `world.rng.next` as the rng callable for runtime callers.

import { tickNpcChat as tickNpcChatPure } from '../pure/npcChat.ts';
import type { World } from '../types.ts';

export function tickNpcChat(world: World) {
  tickNpcChatPure(world, () => world.rng.next());
}
