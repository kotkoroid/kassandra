<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { HTML } from '@threlte/extras';
  import { lootBagOpen } from '../lootBagOpen.svelte';
  import { BAG_PICKUP_RADIUS, dispatch } from '@kassandra/simulation';
  import { world } from '../world.svelte';
  import Coin from './Coin.svelte';
  import { rockSnapshot, type RockSnapshot } from './rockPhysics';

  // Up to this many coin meshes are rendered per bag. Beyond it the
  // visual pile saturates; the actual Lars total still picks up
  // fully on collection.
  const MAX_COIN_SPRITES = 8;

  // Bag physics — same model as rocks in Props.svelte but the whole
  // loot bag is the moveable unit, not individual coins. Only kicks
  // in for currency-only piles; mixed/weapon bags stay anchored so
  // the player doesn't accidentally punt their real loot away.
  const KICK_RADIUS = 0.45;
  const KICK_IMPULSE = 8;
  const KICK_MIN_PLAYER_SPEED = 0.5;
  const BAG_FRICTION = 4;
  // Effective ground radius of a coin pile. Used for bag-bag
  // collisions so two piles don't pass through each other.
  const BAG_RADIUS = 0.22;

  interface BagPhysics { vx: number; vz: number; }
  const bagPhysics = new Map<string, BagPhysics>();

  // Spatial grid for collision queries. Cell size must be at least
  // the largest collision diameter; we use 1.0 since the worst-case
  // contact (bag + scaled rock) is ~0.5, leaving comfortable margin
  // so a 3×3 neighbour sweep is guaranteed to catch every overlap.
  const SPATIAL_CELL = 1.0;
  function cellKey(cx: number, cz: number): number {
    // Pack two integer cell coords into one number. Offsets keep
    // keys positive for typical world bounds (±200 units / 1.0).
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  // Deterministic scatter for the initial coin pile layout. A small
  // hash off the bag id makes the pile stable across reactive reads
  // (so the coins don't reshuffle when the bag's items array mutates).
  function coinOffsets(bagId: string, n: number) {
    const offsets: { dx: number; dz: number; rot: number }[] = [];
    let seed = 0;
    for (let i = 0; i < bagId.length; i++) seed = (seed * 31 + bagId.charCodeAt(i)) >>> 0;
    for (let i = 0; i < n; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const r = ((seed >>> 0) % 1000) / 1000;
      seed = (seed * 1103515245 + 12345) >>> 0;
      const a = (((seed >>> 0) % 1000) / 1000) * Math.PI * 2;
      const radius = 0.08 + r * 0.18;
      offsets.push({ dx: Math.cos(a) * radius, dz: Math.sin(a) * radius, rot: a });
    }
    return offsets;
  }

  let lastPlayerX = 0;
  let lastPlayerZ = 0;

  // Threlte's pointer raycaster fires on pointerdown — earlier than
  // the `click` event — so stopping propagation in onclick alone is
  // too late and the ground onclick still runs with whatever the
  // ray hit beyond the timer. Eat the whole pointer sequence so the
  // canvas never sees the press.
  function eatPointer(e: PointerEvent) {
    e.stopPropagation();
  }

  function onTimerClick(e: MouseEvent, bagId: string, x: number, z: number) {
    e.stopPropagation();
    // Always dispatch click_ground to the bag position, even when
    // the player is already inside pickup range. Threlte's raycaster
    // fires on pointerdown — earlier than our handlers can catch —
    // and may queue a click_ground at whatever ground point the
    // camera ray hit *beyond* the timer button. Dispatching ours in
    // the same tick guarantees navTarget ends up on the bag, not on
    // that stray point. If the player is already there, the player
    // system's arrive logic clears navTarget on the next tick.
    dispatch(world, { kind: 'click_ground', x, z });
    const lp = world.players[world.localPlayerId];
    const dx = lp.x - x;
    const dz = lp.z - z;
    if (dx * dx + dz * dz <= BAG_PICKUP_RADIUS * BAG_PICKUP_RADIUS) {
      lootBagOpen.value = bagId;
      lootBagOpen.pendingArrival = null;
    } else {
      lootBagOpen.pendingArrival = bagId;
    }
  }

  // Visual-only pulse driver — the simulation ticks the actual TTL.
  let pulse = $state(0);
  useTask((delta) => {
    if (delta <= 0) return;
    pulse += delta;

    const lp2 = world.players[world.localPlayerId];
    const px = lp2.x;
    const pz = lp2.z;
    const playerVx = (px - lastPlayerX) / delta;
    const playerVz = (pz - lastPlayerZ) / delta;
    lastPlayerX = px;
    lastPlayerZ = pz;
    const playerSpeed = Math.hypot(playerVx, playerVz);
    const decay = Math.exp(-BAG_FRICTION * delta);

    // Currency-only bags participate in the kick/slide/collide
    // system; mixed and weapon bags stay anchored. `isCurrencyOnly`
    // is precomputed by refreshLootBagFlags at every mutation, so
    // this is a flat property read, not a per-frame items scan.
    const movable = world.lootBags.filter(
      (b) => !b.isDeathBag && b.isCurrencyOnly,
    );

    // Drop stale velocity records for bags that vanished (picked up
    // or TTL-expired) so the Map doesn't grow unbounded.
    const alive = new Set(movable.map((b) => b.id));
    for (const key of bagPhysics.keys()) {
      if (!alive.has(key)) bagPhysics.delete(key);
    }

    // Pass 1: player kick + integration + friction. Mutating
    // bag.x/bag.z directly means the pulse ring, bundle/coin meshes,
    // and the timer HTML overlay all follow the bag in one piece,
    // and pickup-radius checks (tick.ts + Hud arrival watcher) stay
    // accurate.
    for (const bag of movable) {
      let state = bagPhysics.get(bag.id);
      if (!state) {
        state = { vx: 0, vz: 0 };
        bagPhysics.set(bag.id, state);
      }
      if (playerSpeed > KICK_MIN_PLAYER_SPEED) {
        const dx = bag.x - px;
        const dz = bag.z - pz;
        const dist = Math.hypot(dx, dz);
        if (dist < KICK_RADIUS) {
          const norm = Math.max(dist, 0.001);
          state.vx = (dx / norm) * KICK_IMPULSE;
          state.vz = (dz / norm) * KICK_IMPULSE;
        }
      }
      if (state.vx !== 0 || state.vz !== 0) {
        bag.x += state.vx * delta;
        bag.z += state.vz * delta;
        state.vx *= decay;
        state.vz *= decay;
        if (Math.abs(state.vx) < 0.01) state.vx = 0;
        if (Math.abs(state.vz) < 0.01) state.vz = 0;
      }
    }

    // Build the spatial grid once per frame. For ~10 bags + ~25
    // rocks this is a couple of dozen Map writes — cheaper than the
    // O(n·m) sweep it replaces, and grows linearly with the world
    // instead of quadratically.
    const bagBuckets = new Map<number, typeof movable>();
    for (const bag of movable) {
      const k = cellKey(
        Math.floor(bag.x / SPATIAL_CELL),
        Math.floor(bag.z / SPATIAL_CELL),
      );
      let arr = bagBuckets.get(k);
      if (!arr) {
        arr = [];
        bagBuckets.set(k, arr);
      }
      arr.push(bag);
    }
    const rockBuckets = new Map<number, RockSnapshot[]>();
    for (const rock of rockSnapshot.values()) {
      const k = cellKey(
        Math.floor(rock.x / SPATIAL_CELL),
        Math.floor(rock.z / SPATIAL_CELL),
      );
      let arr = rockBuckets.get(k);
      if (!arr) {
        arr = [];
        rockBuckets.set(k, arr);
      }
      arr.push(rock);
    }

    // Pass 1.5: one-way rock→bag collision. Treat rocks as
    // infinite-mass: the bag is shoved out of any overlap and its
    // normal velocity is matched to the rock's (inelastic e=0), so
    // a stationary rock stops a moving bag flat and a moving rock
    // pushes a stationary bag in the rock's direction. The rock is
    // never altered, so coins can't drag rocks around. Squared-dist
    // early-exit skips the sqrt for the (very common) non-contact.
    for (const bag of movable) {
      const sa = bagPhysics.get(bag.id)!;
      const cx = Math.floor(bag.x / SPATIAL_CELL);
      const cz = Math.floor(bag.z / SPATIAL_CELL);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const rocks = rockBuckets.get(cellKey(cx + ox, cz + oz));
          if (!rocks) continue;
          for (const rock of rocks) {
            const dx = bag.x - rock.x;
            const dz = bag.z - rock.z;
            const minDist = BAG_RADIUS + rock.radius;
            const dist2 = dx * dx + dz * dz;
            if (dist2 >= minDist * minDist || dist2 < 0.0001 * 0.0001) continue;
            const dist = Math.sqrt(dist2);
            const nx = dx / dist;
            const nz = dz / dist;
            bag.x += nx * (minDist - dist);
            bag.z += nz * (minDist - dist);
            const vbagN = sa.vx * nx + sa.vz * nz;
            const vrockN = rock.vx * nx + rock.vz * nz;
            const dv = vrockN - vbagN;
            if (dv > 0) {
              // Closing: replace the bag's normal-velocity component
              // with the rock's. Tangential motion is untouched.
              sa.vx += dv * nx;
              sa.vz += dv * nz;
            }
          }
        }
      }
    }

    // Pass 2: bag-bag elastic collisions (equal masses). Same grid
    // sweep, but with an id-ordering guard so each pair is visited
    // exactly once across the 3×3 neighbourhood.
    for (const a of movable) {
      const sa = bagPhysics.get(a.id)!;
      const cx = Math.floor(a.x / SPATIAL_CELL);
      const cz = Math.floor(a.z / SPATIAL_CELL);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const cellBags = bagBuckets.get(cellKey(cx + ox, cz + oz));
          if (!cellBags) continue;
          for (const b of cellBags) {
            if (b.id <= a.id) continue;
            const sb = bagPhysics.get(b.id)!;
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const minDist = BAG_RADIUS * 2;
            const dist2 = dx * dx + dz * dz;
            if (dist2 >= minDist * minDist || dist2 < 0.0001 * 0.0001) continue;
            const dist = Math.sqrt(dist2);
            const nx = dx / dist;
            const nz = dz / dist;
            const overlap = (minDist - dist) / 2;
            a.x -= nx * overlap;
            a.z -= nz * overlap;
            b.x += nx * overlap;
            b.z += nz * overlap;
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
      }
    }
  });

  function format(ttl: number) {
    const s = Math.max(0, Math.ceil(ttl));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  }
</script>

{#each world.lootBags as b (b.id)}
  {@const pulseScale = 1 + Math.sin(pulse * 3) * 0.15}
  {@const pulseOpacity = 0.45 + Math.sin(pulse * 3) * 0.25}
  {@const coinSpriteCount = Math.min(b.larsCount, MAX_COIN_SPRITES)}
  {@const offsets = coinSpriteCount > 0 ? coinOffsets(b.id, coinSpriteCount) : []}
  <!-- Show the bag bundle only when there's something other than
       currency to carry. A coin-only drop renders as the pile alone,
       matching the inspiration's loose-coin look on the ground.
       Death bags always show the bundle so the player's corpse-bag
       remains visually distinct even if it's empty. -->
  {@const showBundle = b.isDeathBag || !b.isCurrencyOnly}
  <T.Mesh
    position={[b.x, 0.06, b.z]}
    rotation={[-Math.PI / 2, 0, 0]}
    scale={pulseScale}
  >
    <T.RingGeometry args={[b.isDeathBag ? 0.7 : 0.5, b.isDeathBag ? 0.95 : 0.7, 32]} />
    <T.MeshBasicMaterial
      color="#d4a23a"
      transparent
      opacity={pulseOpacity}
      depthWrite={false}
    />
  </T.Mesh>
  <T.Group position={[b.x, 0, b.z]}>
    {#if showBundle}
      <T.Mesh position={[0, 0.18, 0]} castShadow>
        <T.SphereGeometry args={[b.isDeathBag ? 0.22 : 0.2, 10, 10]} />
        <T.MeshStandardMaterial color="#6b4625" />
      </T.Mesh>
      <T.Mesh position={[0, b.isDeathBag ? 0.36 : 0.32, 0]} castShadow>
        <T.CylinderGeometry args={[0.05, 0.07, 0.08, 6]} />
        <T.MeshStandardMaterial color="#3d2715" />
      </T.Mesh>
    {/if}
    {#each offsets as o, i (i)}
      <Coin
        position={[o.dx, 0.015 + (i % 3) * 0.012, o.dz]}
        rotation={o.rot}
        scale={1}
      />
    {/each}
  </T.Group>
  <HTML
    position={[b.x, b.isDeathBag ? 0.9 : 0.85, b.z]}
    center
    pointerEvents="none"
    zIndexRange={[40, 0]}
  >
    <button
      type="button"
      class="pointer-events-auto cursor-pointer border border-amber-700/70 bg-black/85 px-2 py-0.5 text-xs font-semibold text-amber-200 hover:border-amber-400 hover:text-amber-100 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.85)]"
      onpointerdown={eatPointer}
      onpointerup={eatPointer}
      onclick={(e) => onTimerClick(e, b.id, b.x, b.z)}
    >
      {format(b.ttl)}
    </button>
  </HTML>
{/each}
