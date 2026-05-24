// Effect-native sim service barrel.
//
// Stage-by-stage migration target: every system that's currently a
// function in src/<system>.ts or src/systems/<system>.ts gets an
// Effect-native wrapper here. PR-D1 ships Combat + Time + the shared
// WorldRef tag.

export { Combat, CombatLayer, makeCombat, type CombatShape } from './Combat.ts';
export {
  makeWorldRef,
  WorldRef,
  worldToSnapshot,
  type WorldRefShape,
} from './WorldRef.ts';
export { makeTime, Time, TimeLayer, type TimeShape } from './Time.ts';
export { SimLayer } from './SimLayer.ts';
