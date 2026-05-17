<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { getVisibleProps, type PropInstance } from './world';

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
  // Treat each rock as a disc of this base radius (× its prop.scale).
  // The mesh is 0.3×0.25; this is a slightly forgiving cylinder fit.
  const ROCK_RADIUS = 0.18;

  interface RockState {
    offsetX: number;
    offsetZ: number;
    vx: number;
    vz: number;
  }

  const visibleProps = $derived(getVisibleProps(playerX, playerZ));

  // Rock kick state. $state.raw because we reassign the Map by
  // shallow-copy when entries change. Persists across chunk
  // visibility so a kicked rock stays kicked.
  let rockStates = $state.raw<Map<string, RockState>>(new Map());
  let lastPlayerX = 0;
  let lastPlayerZ = 0;

  useTask((delta) => {
    if (delta <= 0) return;

    const playerVx = (playerX - lastPlayerX) / delta;
    const playerVz = (playerZ - lastPlayerZ) / delta;
    lastPlayerX = playerX;
    lastPlayerZ = playerZ;
    const playerSpeed = Math.hypot(playerVx, playerVz);

    const decay = Math.exp(-ROCK_FRICTION * delta);

    // Gather working copies of every visible rock's state. We mutate
    // these across two passes (player kick + integration, then
    // rock-rock pair resolution) and only write back at the end.
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
    // the ~5 rocks per chunk × ~25 chunks density in play. Separates
    // any overlap and exchanges the normal velocity component (equal
    // masses), so two stones bounce off each other naturally.
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
        // Split the overlap evenly so neither rock teleports through.
        sa.offsetX -= nx * overlap;
        sa.offsetZ -= nz * overlap;
        sb.offsetX += nx * overlap;
        sb.offsetZ += nz * overlap;

        // Project velocities onto the contact normal; if they're
        // already separating, leave them alone (avoids re-pinging
        // after the position fix).
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

    // Write back: replace entries whose state actually changed.
    let dirty = false;
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
        dirty = true;
      }
    }

    if (dirty) rockStates = new Map(rockStates);
  });
</script>

{#each visibleProps as prop (prop.id)}
  {#if prop.type === 'tree'}
    <T.Group
      position={[prop.x, 0, prop.z]}
      rotation.y={prop.rotation}
      scale={prop.scale}
    >
      <T.Mesh position={[0, 0.4, 0]} castShadow>
        <T.CylinderGeometry args={[0.08, 0.1, 0.8, 6]} />
        <T.MeshStandardMaterial color="#5a3a25" />
      </T.Mesh>
      <T.Mesh position={[0, 1.3, 0]} castShadow>
        <T.ConeGeometry args={[0.55, 1.4, 8]} />
        <T.MeshStandardMaterial color="#3a6b3a" />
      </T.Mesh>
    </T.Group>
  {:else if prop.type === 'grass'}
    <T.Mesh
      position={[prop.x, 0.12, prop.z]}
      rotation.y={prop.rotation}
      scale={prop.scale}
      castShadow
    >
      <T.ConeGeometry args={[0.1, 0.25, 4]} />
      <T.MeshStandardMaterial color="#5a8c3a" />
    </T.Mesh>
  {:else}
    {@const rock = rockStates.get(prop.id)}
    <T.Mesh
      position={[
        prop.x + (rock?.offsetX ?? 0),
        0.1,
        prop.z + (rock?.offsetZ ?? 0),
      ]}
      rotation.y={prop.rotation}
      scale={prop.scale}
      castShadow
    >
      <T.BoxGeometry args={[0.3, 0.2, 0.25]} />
      <T.MeshStandardMaterial color="#7d7d77" />
    </T.Mesh>
  {/if}
{/each}
