<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { HTML } from '@threlte/extras';
  import { LARS_ID } from '../items';
  import { lootBagOpen } from '../lootBagOpen.svelte';
  import { BAG_PICKUP_RADIUS } from '../sim/constants';
  import { dispatch } from '../sim/input';
  import { world } from '../sim/world.svelte';
  import Coin from './Coin.svelte';

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
    const dx = world.player.x - x;
    const dz = world.player.z - z;
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

    const px = world.player.x;
    const pz = world.player.z;
    const playerVx = (px - lastPlayerX) / delta;
    const playerVz = (pz - lastPlayerZ) / delta;
    lastPlayerX = px;
    lastPlayerZ = pz;
    const playerSpeed = Math.hypot(playerVx, playerVz);
    const decay = Math.exp(-BAG_FRICTION * delta);

    // Currency-only bags participate in the kick/slide/collide
    // system; mixed and weapon bags stay anchored.
    const movable = world.lootBags.filter(
      (b) =>
        !b.isDeathBag &&
        b.items.length > 0 &&
        b.items.every((it) => it.itemId === LARS_ID),
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

    // Pass 2: bag-bag elastic collisions (equal masses) so two
    // currency piles bump off each other instead of overlapping.
    for (let i = 0; i < movable.length; i++) {
      const a = movable[i]!;
      const sa = bagPhysics.get(a.id)!;
      for (let j = i + 1; j < movable.length; j++) {
        const b = movable[j]!;
        const sb = bagPhysics.get(b.id)!;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        const minDist = BAG_RADIUS * 2;
        if (dist >= minDist || dist < 0.0001) continue;
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
  {@const larsCount = b.items.reduce((n, it) => n + (it.itemId === LARS_ID ? 1 : 0), 0)}
  {@const coinSpriteCount = Math.min(larsCount, MAX_COIN_SPRITES)}
  {@const offsets = coinSpriteCount > 0 ? coinOffsets(b.id, coinSpriteCount) : []}
  <!-- Show the bag bundle only when there's something other than
       currency to carry. A coin-only drop renders as the pile alone,
       matching the inspiration's loose-coin look on the ground.
       Death bags always show the bundle so the player's corpse-bag
       remains visually distinct even if it's empty. -->
  {@const hasNonCurrency = b.items.some((it) => it.itemId !== LARS_ID)}
  {@const showBundle = b.isDeathBag || hasNonCurrency}
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
