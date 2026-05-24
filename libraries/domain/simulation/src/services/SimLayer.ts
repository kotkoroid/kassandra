// SimLayer — composed runtime layer for the Effect-native sim services.
//
// PR-D2 grows this to 13 systems: every consumer-relevant sim module
// now has an Effect-native surface. Internals are still the original
// sync implementations — PR-D3 swaps the pieces that need it (RNG via
// effect/Random, EventBus via PubSub, the orchestrator).
//
// WorldRef intentionally is NOT in the layer — its implementation is
// per-environment (realm provides a Ref-backed one, future client
// provides a SubscriptionRef-backed one) so callers compose it in.

import * as Layer from 'effect/Layer';

import { CombatLayer } from './Combat.ts';
import { DeathLayer } from './Death.ts';
import { EventBusLayer } from './EventBus.ts';
import { HealingCirclesLayer } from './HealingCircles.ts';
import { InputsLayer } from './Inputs.ts';
import { LootLayer } from './Loot.ts';
import { MonstersLayer } from './Monsters.ts';
import { MovementLayer } from './Movement.ts';
import { NpcChatLayer } from './NpcChat.ts';
import { ProjectilesLayer } from './Projectiles.ts';
import { SpawnerLayer } from './Spawner.ts';
import { SpellsLayer } from './Spells.ts';
import { TimeLayer } from './Time.ts';

/**
 * The Effect-native sim's service layer. Compose with a `WorldRef`
 * implementation (e.g., `Layer.effect(WorldRef)(makeWorldRef(initial))`)
 * to get a full runtime.
 *
 * PR-D3 adds an Effect-native `Tick` orchestrator that yields every
 * service in here to drive the simulation in one step. Until then,
 * the realm side still calls the function-based `tick()` directly.
 */
export const SimLayer = Layer.mergeAll(
  CombatLayer,
  DeathLayer,
  EventBusLayer,
  HealingCirclesLayer,
  InputsLayer,
  LootLayer,
  MonstersLayer,
  MovementLayer,
  NpcChatLayer,
  ProjectilesLayer,
  SpawnerLayer,
  SpellsLayer,
  TimeLayer,
);
