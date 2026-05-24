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
import { TickLayer } from './Tick.ts';
import { TimeLayer } from './Time.ts';

/**
 * The Effect-native sim's service layer. Compose with a `WorldRef`
 * implementation (e.g., `Layer.effect(WorldRef)(makeWorldRef(initial))`)
 * to get a full runtime.
 *
 * PR-D3a structure: every per-system layer is a sibling (none depend
 * on each other), but `TickLayer` requires every other one. We can't
 * use a flat `Layer.mergeAll` because mergeAll unions requirements
 * rather than wiring siblings — TickLayer's deps would leak out.
 * Instead, build a flat layer of the sibling services first, then
 * `provideMerge` it into TickLayer so the orchestrator's requirements
 * are satisfied and ALL services are exposed in the result.
 */
const SimSystemLayers = Layer.mergeAll(
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

export const SimLayer = TickLayer.pipe(Layer.provideMerge(SimSystemLayers));
