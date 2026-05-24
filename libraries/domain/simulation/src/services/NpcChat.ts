// NpcChat service — wraps systems/npcChat.ts.
//
// Drives ambient NPC speech bubbles; uses world.rng for picking lines
// and timing.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { tickNpcChat as tickNpcChatImpl } from '../systems/npcChat.ts';
import type { World } from '../types.ts';

export interface NpcChatShape {
  /** Roll for ambient NPC chatter this tick. */
  readonly tick: (world: World) => Effect.Effect<void>;
}

export class NpcChat extends Context.Service<NpcChat, NpcChatShape>()(
  'kassandra/sim/NpcChat',
) {}

export const makeNpcChat: Effect.Effect<NpcChatShape> = Effect.succeed({
  tick: Effect.fn('NpcChat.tick')(function* (world) {
    tickNpcChatImpl(world);
  }),
});

export const NpcChatLayer = Layer.effect(NpcChat)(makeNpcChat);
