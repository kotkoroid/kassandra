// SimLayer — composed runtime layer for the Effect-native sim services.
//
// PR-D1 ships with two systems wrapped (Combat, Time). PR-D2 will add
// Spawner, Movement, Monsters, Projectiles, Spells, Loot, Death,
// NpcChat, HealingCircles, Inputs as their pure cores get extracted.
// Tick (the orchestrator) lands in PR-D3 once every system has an
// Effect-native surface.
//
// WorldRef intentionally is NOT in the layer — its implementation is
// per-environment (realm provides a Ref-backed one, future client
// provides a SubscriptionRef-backed one) so callers compose it in.

import * as Layer from 'effect/Layer';

import { CombatLayer } from './Combat.ts';
import { TimeLayer } from './Time.ts';

/**
 * The Effect-native sim's service layer. Compose with a `WorldRef`
 * implementation (e.g., `Layer.effect(WorldRef)(makeWorldRef(initial))`)
 * to get a full runtime.
 *
 * As more systems migrate in PR-D2, they get merged in here.
 */
export const SimLayer = Layer.mergeAll(CombatLayer, TimeLayer);
