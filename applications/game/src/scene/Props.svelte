<script lang="ts">
  // Procedural prop renderer. Trees, grass, and rocks across the
  // streaming chunk window are packed into four InstancedMesh meshes
  // (tree trunk, tree leaves, grass blade, rock) so the per-frame
  // draw-call cost is constant in prop count instead of linear. At
  // RENDER_RADIUS=2 the visible window peaks at ~225 props, which
  // would otherwise be ~400 draw calls between trunks and leaves.
  //
  // Rocks still need per-instance matrix rebuilds every frame because
  // the kick physics in this same file mutates their world position;
  // trees and grass are static across a chunk's lifetime so we only
  // rewrite their instance matrices when the visible chunk set
  // actually changes.

  import { T, useTask } from '@threlte/core';
  import {
    BoxGeometry,
    ConeGeometry,
    CylinderGeometry,
    InstancedMesh,
    Matrix4,
    MeshStandardMaterial,
    Quaternion,
    Vector3,
  } from 'three';
  import { SvelteMap } from 'svelte/reactivity';
  import { ROCK_RADIUS, rockSnapshot } from './rockPhysics';
  import { CHUNK_SIZE, getVisibleProps, type PropInstance } from './world';

  interface Props {
    playerX: number;
    playerZ: number;
  }
  let { playerX, playerZ }: Props = $props();

  // Rock physics parameters.
  const KICK_RADIUS = 0.45;
  const KICK_IMPULSE = 8;
  const KICK_MIN_PLAYER_SPEED = 0.5;
  const ROCK_FRICTION = 4;

  interface RockState {
    offsetX: number;
    offsetZ: number;
    vx: number;
    vz: number;
  }

  const visibleProps = $derived(getVisibleProps(playerX, playerZ));

  // Rock kick state. Persists across chunk visibility so a kicked
  // rock stays kicked if the player wanders away and back.
  const rockStates = new SvelteMap<string, RockState>();
  let lastPlayerX = 0;
  let lastPlayerZ = 0;

  // Reused per-frame for "which rocks are still visible" checks
  // when pruning the cross-system rockSnapshot.
  const snapshotScratch = new Set<string>();

  // Geometry + material assets, defined once at module load and
  // shared by every instance. Reusing the same MeshStandardMaterial
  // refs across meshes also lets Three.js skip redundant state
  // changes between draw calls.
  const TRUNK_GEO = new CylinderGeometry(0.08, 0.1, 0.8, 6);
  const TRUNK_MAT = new MeshStandardMaterial({ color: '#5a3a25' });
  const LEAVES_GEO = new ConeGeometry(0.55, 1.4, 8);
  const LEAVES_MAT = new MeshStandardMaterial({ color: '#3a6b3a' });
  const GRASS_GEO = new ConeGeometry(0.1, 0.25, 4);
  const GRASS_MAT = new MeshStandardMaterial({ color: '#5a8c3a' });
  const ROCK_GEO = new BoxGeometry(0.3, 0.2, 0.25);
  const ROCK_MAT = new MeshStandardMaterial({ color: '#7d7d77' });

  // Upper bound on visible props per type. RENDER_RADIUS=2 → 25
  // chunks × ~9 props/chunk = 225 max, conservatively rounded up.
  // The InstancedMesh's `count` setter clamps draws to actual usage.
  const MAX_INSTANCES = 512;

  // Reusable scratch transforms; per-frame allocations would spam GC.
  const TMP_POS = new Vector3();
  const TMP_QUAT = new Quaternion();
  const TMP_SCALE = new Vector3(1, 1, 1);
  const TMP_AXIS = new Vector3(0, 1, 0);
  const TMP_MAT = new Matrix4();

  let trunkMesh: InstancedMesh | undefined;
  let leavesMesh: InstancedMesh | undefined;
  let grassMesh: InstancedMesh | undefined;
  let rockMesh: InstancedMesh | undefined;

  // Last chunk coordinates the static instance matrices were built
  // for. Tree + grass world poses are constant within a chunk, so we
  // only rewrite their instance buffers when the player crosses a
  // chunk boundary. Initialized to NaN so the first frame triggers a
  // rebuild regardless of spawn position.
  let lastChunkCX = NaN;
  let lastChunkCZ = NaN;

  function composeTRS(x: number, y: number, z: number, rotY: number, scale: number) {
    TMP_POS.set(x, y, z);
    TMP_QUAT.setFromAxisAngle(TMP_AXIS, rotY);
    TMP_SCALE.set(scale, scale, scale);
    TMP_MAT.compose(TMP_POS, TMP_QUAT, TMP_SCALE);
  }

  function rebuildStaticInstances(props: PropInstance[]): boolean {
    if (!trunkMesh || !leavesMesh || !grassMesh) return false;
    let treeI = 0;
    let grassI = 0;
    for (const prop of props) {
      if (prop.type === 'tree') {
        // The original Group placed trunk at y=0.4 and leaves at
        // y=1.3 with both inheriting the prop's rotation and scale.
        // Bake those locals into the world matrix directly.
        composeTRS(prop.x, 0.4 * prop.scale, prop.z, prop.rotation, prop.scale);
        trunkMesh.setMatrixAt(treeI, TMP_MAT);
        composeTRS(prop.x, 1.3 * prop.scale, prop.z, prop.rotation, prop.scale);
        leavesMesh.setMatrixAt(treeI, TMP_MAT);
        treeI++;
      } else if (prop.type === 'grass') {
        composeTRS(prop.x, 0.12, prop.z, prop.rotation, prop.scale);
        grassMesh.setMatrixAt(grassI, TMP_MAT);
        grassI++;
      }
    }
    trunkMesh.count = treeI;
    leavesMesh.count = treeI;
    grassMesh.count = grassI;
    trunkMesh.instanceMatrix.needsUpdate = true;
    leavesMesh.instanceMatrix.needsUpdate = true;
    grassMesh.instanceMatrix.needsUpdate = true;
    return true;
  }

  function rebuildRockInstances(rocks: PropInstance[]) {
    if (!rockMesh) return;
    for (let i = 0; i < rocks.length; i++) {
      const prop = rocks[i]!;
      const state = rockStates.get(prop.id);
      const ox = state?.offsetX ?? 0;
      const oz = state?.offsetZ ?? 0;
      composeTRS(prop.x + ox, 0.1, prop.z + oz, prop.rotation, prop.scale);
      rockMesh.setMatrixAt(i, TMP_MAT);
    }
    rockMesh.count = rocks.length;
    rockMesh.instanceMatrix.needsUpdate = true;
  }

  useTask((delta) => {
    if (delta <= 0) return;

    const playerVx = (playerX - lastPlayerX) / delta;
    const playerVz = (playerZ - lastPlayerZ) / delta;
    lastPlayerX = playerX;
    lastPlayerZ = playerZ;
    const playerSpeed = Math.hypot(playerVx, playerVz);

    const decay = Math.exp(-ROCK_FRICTION * delta);

    // Gather working copies of every visible rock's state.
    const rockProps: PropInstance[] = [];
    const working = new Map<string, RockState>();
    for (const prop of visibleProps) {
      if (prop.type !== 'rock') continue;
      rockProps.push(prop);
      const prev = rockStates.get(prop.id) ?? {
        offsetX: 0,
        offsetZ: 0,
        vx: 0,
        vz: 0,
      };
      working.set(prop.id, { ...prev });
    }

    // Pass 1: player kick + velocity integration + friction.
    for (const prop of rockProps) {
      const state = working.get(prop.id)!;

      if (playerSpeed > KICK_MIN_PLAYER_SPEED) {
        const rx = prop.x + state.offsetX;
        const rz = prop.z + state.offsetZ;
        const dxToRock = rx - playerX;
        const dzToRock = rz - playerZ;
        const dist = Math.hypot(dxToRock, dzToRock);
        if (dist < KICK_RADIUS) {
          const norm = Math.max(dist, 0.001);
          state.vx = (dxToRock / norm) * KICK_IMPULSE;
          state.vz = (dzToRock / norm) * KICK_IMPULSE;
        }
      }

      if (state.vx !== 0 || state.vz !== 0) {
        state.offsetX += state.vx * delta;
        state.offsetZ += state.vz * delta;
        state.vx *= decay;
        state.vz *= decay;
        if (Math.abs(state.vx) < 0.01) state.vx = 0;
        if (Math.abs(state.vz) < 0.01) state.vz = 0;
      }
    }

    // Pass 2: rock-rock elastic collisions. Pairwise sweep — fine for
    // the ~5 rocks per chunk × ~25 chunks density in play.
    for (let i = 0; i < rockProps.length; i++) {
      const a = rockProps[i]!;
      const sa = working.get(a.id)!;
      const ax = a.x + sa.offsetX;
      const az = a.z + sa.offsetZ;
      const radA = ROCK_RADIUS * a.scale;

      for (let j = i + 1; j < rockProps.length; j++) {
        const b = rockProps[j]!;
        const sb = working.get(b.id)!;
        const bx = b.x + sb.offsetX;
        const bz = b.z + sb.offsetZ;
        const radB = ROCK_RADIUS * b.scale;

        const dx = bx - ax;
        const dz = bz - az;
        const dist = Math.hypot(dx, dz);
        const minDist = radA + radB;
        if (dist >= minDist || dist < 0.0001) continue;

        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = (minDist - dist) / 2;
        sa.offsetX -= nx * overlap;
        sa.offsetZ -= nz * overlap;
        sb.offsetX += nx * overlap;
        sb.offsetZ += nz * overlap;

        const va = sa.vx * nx + sa.vz * nz;
        const vb = sb.vx * nx + sb.vz * nz;
        const dv = vb - va;
        if (dv >= 0) continue;
        sa.vx += dv * nx;
        sa.vz += dv * nz;
        sb.vx -= dv * nx;
        sb.vz -= dv * nz;
      }
    }

    // Write back: only re-publish entries whose state actually
    // changed. Keeps SvelteMap quiet between physics events.
    for (const [id, state] of working) {
      const prev = rockStates.get(id);
      if (
        !prev ||
        prev.vx !== state.vx ||
        prev.vz !== state.vz ||
        prev.offsetX !== state.offsetX ||
        prev.offsetZ !== state.offsetZ
      ) {
        rockStates.set(id, state);
      }
    }

    // Rocks always need a per-frame matrix update because the kick
    // physics mutates their offsets. Trees and grass only need a
    // refresh when the visible chunk window has scrolled.
    rebuildRockInstances(rockProps);
    const chunkCX = Math.floor(playerX / CHUNK_SIZE);
    const chunkCZ = Math.floor(playerZ / CHUNK_SIZE);
    if (chunkCX !== lastChunkCX || chunkCZ !== lastChunkCZ) {
      // If the mesh refs aren't bound yet (very first frame, before
      // oncreate fires), leave lastChunk* unchanged so we retry next
      // frame instead of silently skipping the initial buffer fill.
      if (rebuildStaticInstances(visibleProps)) {
        lastChunkCX = chunkCX;
        lastChunkCZ = chunkCZ;
      }
    }

    // Publish the rock snapshot for cross-system collisions.
    snapshotScratch.clear();
    for (const prop of rockProps) snapshotScratch.add(prop.id);
    for (const id of rockSnapshot.keys()) {
      if (!snapshotScratch.has(id)) rockSnapshot.delete(id);
    }
    for (const prop of rockProps) {
      const s = working.get(prop.id)!;
      let entry = rockSnapshot.get(prop.id);
      if (!entry) {
        entry = { x: 0, z: 0, radius: 0, vx: 0, vz: 0 };
        rockSnapshot.set(prop.id, entry);
      }
      entry.x = prop.x + s.offsetX;
      entry.z = prop.z + s.offsetZ;
      entry.radius = ROCK_RADIUS * prop.scale;
      entry.vx = s.vx;
      entry.vz = s.vz;
    }
  });
</script>

<!-- frustumCulled is disabled because Three.js culls an InstancedMesh
     by its *source* geometry's bounding sphere — centered at the
     local origin, not around the actual instance positions. With
     instances scattered hundreds of units away from origin, the
     whole batch winks out the moment the camera looks away from
     (0, 0, 0). The batches already span the entire visible chunk
     window, so view-frustum culling has nothing to gain here. -->
<T.InstancedMesh
  args={[TRUNK_GEO, TRUNK_MAT, MAX_INSTANCES]}
  castShadow
  count={0}
  frustumCulled={false}
  oncreate={(m: InstancedMesh) => {
    trunkMesh = m;
  }}
/>
<T.InstancedMesh
  args={[LEAVES_GEO, LEAVES_MAT, MAX_INSTANCES]}
  castShadow
  count={0}
  frustumCulled={false}
  oncreate={(m: InstancedMesh) => {
    leavesMesh = m;
  }}
/>
<T.InstancedMesh
  args={[GRASS_GEO, GRASS_MAT, MAX_INSTANCES]}
  castShadow
  count={0}
  frustumCulled={false}
  oncreate={(m: InstancedMesh) => {
    grassMesh = m;
  }}
/>
<T.InstancedMesh
  args={[ROCK_GEO, ROCK_MAT, MAX_INSTANCES]}
  castShadow
  count={0}
  frustumCulled={false}
  oncreate={(m: InstancedMesh) => {
    rockMesh = m;
  }}
/>
