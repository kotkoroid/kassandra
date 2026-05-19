// Re-export passthrough. Procedural world-gen has moved to
// @kassandra/simulation. Scene consumers (Props.svelte, Water.svelte)
// that import from './world' continue to work unchanged.
export {
  CHUNK_SIZE,
  RENDER_RADIUS,
  getChunk,
  getVisibleProps,
  getWaterChunk,
  getVisibleWaters,
  type PropInstance,
  type PropType,
  type WaterPatch,
} from '@kassandra/simulation';
