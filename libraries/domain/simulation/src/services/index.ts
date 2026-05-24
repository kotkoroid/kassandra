// Effect-native sim service barrel.
//
// PR-D2: 13 systems all have Effect-native surfaces. Internals are
// still the original sync impls; PR-D3 swaps the RNG (effect/Random
// for Mulberry32), the EventBus (PubSub for Set<Handler>), and adds
// the orchestrator `Tick` service that yields every other service to
// drive the simulation in one Effect.

export { Combat, CombatLayer, makeCombat, type CombatShape } from './Combat.ts';
export { Death, DeathLayer, makeDeath, type DeathShape } from './Death.ts';
export {
  EventBus,
  EventBusLayer,
  makeEventBus,
  type EventBusShape,
} from './EventBus.ts';
export {
  HealingCircles,
  HealingCirclesLayer,
  makeHealingCircles,
  type HealingCirclesShape,
} from './HealingCircles.ts';
export { Inputs, InputsLayer, makeInputs, type InputsShape } from './Inputs.ts';
export { Loot, LootLayer, makeLoot, type LootShape } from './Loot.ts';
export {
  makeMonsters,
  Monsters,
  MonstersLayer,
  type MonstersShape,
} from './Monsters.ts';
export {
  makeMovement,
  Movement,
  MovementLayer,
  type MovementShape,
} from './Movement.ts';
export {
  makeNpcChat,
  NpcChat,
  NpcChatLayer,
  type NpcChatShape,
} from './NpcChat.ts';
export {
  makeProjectiles,
  Projectiles,
  ProjectilesLayer,
  type ProjectilesShape,
} from './Projectiles.ts';
export {
  makeSpawner,
  Spawner,
  SpawnerLayer,
  type SpawnerShape,
} from './Spawner.ts';
export { makeSpells, Spells, SpellsLayer, type SpellsShape } from './Spells.ts';
export { makeTime, Time, TimeLayer, type TimeShape } from './Time.ts';
export {
  makeWorldRef,
  WorldRef,
  worldToSnapshot,
  type WorldRefShape,
} from './WorldRef.ts';
export { SimLayer } from './SimLayer.ts';
