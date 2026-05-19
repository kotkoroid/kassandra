// Shared procedural world generation: chunked deterministic props.
// Imported by Props.svelte (renders) and Scene.svelte (collision).
//
// The chunk cache lives at module scope so both consumers hit the same
// memoised results — a chunk is only generated once per session.

import { isInCity } from './city';

export const CHUNK_SIZE = 10;
export const RENDER_RADIUS = 2;

export type PropType = 'tree' | 'grass' | 'rock';

export interface PropInstance {
  id: string;
  type: PropType;
  x: number;
  z: number;
  scale: number;
  rotation: number;
}

// Mulberry32 PRNG seeded per chunk so the same chunk produces the
// same props on every visit.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateChunk(cx: number, cz: number): PropInstance[] {
  const random = mulberry32((cx * 73856093) ^ (cz * 19349663));
  const props: PropInstance[] = [];
  const count = 4 + Math.floor(random() * 5);
  for (let i = 0; i < count; i++) {
    const r = random();
    const type: PropType = r < 0.3 ? 'tree' : r < 0.8 ? 'grass' : 'rock';
    const x = cx * CHUNK_SIZE + random() * CHUNK_SIZE;
    const z = cz * CHUNK_SIZE + random() * CHUNK_SIZE;
    const scale = 0.8 + random() * 0.5;
    const rotation = random() * Math.PI * 2;
    // The city is paved over — no trees, grass or rocks inside.
    if (isInCity(x, z)) continue;
    props.push({ id: `${cx},${cz},${i}`, type, x, z, scale, rotation });
  }
  return props;
}

const cache = new Map<string, PropInstance[]>();

export function getChunk(cx: number, cz: number): PropInstance[] {
  const key = `${cx},${cz}`;
  let chunk = cache.get(key);
  if (!chunk) {
    chunk = generateChunk(cx, cz);
    cache.set(key, chunk);
  }
  return chunk;
}

export function getVisibleProps(playerX: number, playerZ: number): PropInstance[] {
  const currentCX = Math.floor(playerX / CHUNK_SIZE);
  const currentCZ = Math.floor(playerZ / CHUNK_SIZE);
  const all: PropInstance[] = [];
  for (let dx = -RENDER_RADIUS; dx <= RENDER_RADIUS; dx++) {
    for (let dz = -RENDER_RADIUS; dz <= RENDER_RADIUS; dz++) {
      for (const prop of getChunk(currentCX + dx, currentCZ + dz)) {
        all.push(prop);
      }
    }
  }
  return all;
}

// Water patches use an independent seed offset so their layout
// doesn't correlate with the prop layout in the same chunk.
export interface WaterPatch {
  id: string;
  x: number;
  z: number;
  radius: number;
}

function generateWaterChunk(cx: number, cz: number): WaterPatch[] {
  const random = mulberry32(((cx * 73856093) ^ (cz * 19349663) ^ 0xdeadbeef) >>> 0);
  // ~35% of chunks contain a single small water patch.
  if (random() > 0.35) return [];
  const x = cx * CHUNK_SIZE + random() * CHUNK_SIZE;
  const z = cz * CHUNK_SIZE + random() * CHUNK_SIZE;
  const radius = 1.5 + random() * 2;
  // No water inside the city either — the plaza stays dry.
  if (isInCity(x, z)) return [];
  return [{ id: `w${cx},${cz}`, x, z, radius }];
}

const waterCache = new Map<string, WaterPatch[]>();

export function getWaterChunk(cx: number, cz: number): WaterPatch[] {
  const key = `${cx},${cz}`;
  let chunk = waterCache.get(key);
  if (!chunk) {
    chunk = generateWaterChunk(cx, cz);
    waterCache.set(key, chunk);
  }
  return chunk;
}

export function getVisibleWaters(playerX: number, playerZ: number): WaterPatch[] {
  const currentCX = Math.floor(playerX / CHUNK_SIZE);
  const currentCZ = Math.floor(playerZ / CHUNK_SIZE);
  const all: WaterPatch[] = [];
  for (let dx = -RENDER_RADIUS; dx <= RENDER_RADIUS; dx++) {
    for (let dz = -RENDER_RADIUS; dz <= RENDER_RADIUS; dz++) {
      for (const w of getWaterChunk(currentCX + dx, currentCZ + dz)) {
        all.push(w);
      }
    }
  }
  return all;
}
