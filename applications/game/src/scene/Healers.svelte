<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { isInCity } from '../city';
  import { healers, healingCircles } from '../healers.svelte';
  import { player } from '../state.svelte';
  import Healer from './Healer.svelte';

  interface Props {
    playerX: number;
    playerZ: number;
  }
  let { playerX, playerZ }: Props = $props();

  const MAX_HEALERS = 2;
  const SPAWN_INTERVAL = 10; // sec between spawn attempts
  const SPAWN_DISTANCE_MIN = 10;
  const SPAWN_DISTANCE_MAX = 20;
  const DESPAWN_DISTANCE = 35;
  // Each healer drops a circle this often, somewhere near itself.
  const HEAL_COOLDOWN = 7;
  const CIRCLE_OFFSET_MAX = 4;
  const CIRCLE_RADIUS = 1.5;
  const CIRCLE_TTL = 5; // sec — circle vanishes after this long
  const HEAL_RATE = 10; // hp/sec while player stands inside
  const HEALER_MAX_HP = 50;

  let spawnTimer = 0;
  let nextId = 1;

  useTask((delta) => {
    // Spawn a new healer periodically up to the cap.
    spawnTimer += delta;
    if (spawnTimer >= SPAWN_INTERVAL && healers.length < MAX_HEALERS) {
      spawnTimer = 0;
      const angle = Math.random() * Math.PI * 2;
      const dist =
        SPAWN_DISTANCE_MIN +
        Math.random() * (SPAWN_DISTANCE_MAX - SPAWN_DISTANCE_MIN);
      const hx = playerX + Math.cos(angle) * dist;
      const hz = playerZ + Math.sin(angle) * dist;
      // Skip this spawn if the rolled position lands in the city —
      // Janna only appears out in the wilds with the player.
      if (isInCity(hx, hz)) return;
      healers.push({
        id: `h${nextId++}`,
        x: hx,
        z: hz,
        rotation: Math.atan2(-(playerX - hx), -(playerZ - hz)),
        cooldown: Math.random() * HEAL_COOLDOWN,
        hp: HEALER_MAX_HP,
      });
    }

    // Healer update: face player, tick cooldown, drop circle when ready.
    for (let i = healers.length - 1; i >= 0; i--) {
      const h = healers[i];
      if (!h) continue;
      const toPlayerX = playerX - h.x;
      const toPlayerZ = playerZ - h.z;
      const dist = Math.hypot(toPlayerX, toPlayerZ);
      if (dist > DESPAWN_DISTANCE) {
        healers.splice(i, 1);
        continue;
      }
      h.rotation = Math.atan2(-toPlayerX, -toPlayerZ);
      h.cooldown -= delta;
      if (h.cooldown <= 0) {
        h.cooldown = HEAL_COOLDOWN;
        const angle = Math.random() * Math.PI * 2;
        const offset = Math.random() * CIRCLE_OFFSET_MAX;
        healingCircles.push({
          id: `c${nextId++}`,
          x: h.x + Math.cos(angle) * offset,
          z: h.z + Math.sin(angle) * offset,
          ttl: CIRCLE_TTL,
        });
      }
    }

    // Circle update: tick TTL, heal player if standing inside.
    for (let i = healingCircles.length - 1; i >= 0; i--) {
      const c = healingCircles[i];
      if (!c) continue;
      c.ttl -= delta;
      if (c.ttl <= 0) {
        healingCircles.splice(i, 1);
        continue;
      }
      const inside =
        Math.hypot(c.x - playerX, c.z - playerZ) < CIRCLE_RADIUS;
      if (inside && player.health < 100) {
        player.health = Math.min(100, player.health + HEAL_RATE * delta);
      }
    }
  });
</script>

{#each healers as healer (healer.id)}
  <Healer
    position={[healer.x, 0, healer.z]}
    rotation={healer.rotation}
    hpPercent={healer.hp / HEALER_MAX_HP}
  />
{/each}

{#each healingCircles as c (c.id)}
  <T.Mesh
    position={[c.x, 0.05, c.z]}
    rotation={[-Math.PI / 2, 0, 0]}
    receiveShadow
  >
    <T.CircleGeometry args={[1.5, 24]} />
    <T.MeshStandardMaterial
      color="#a3d8ff"
      emissive="#6ab3ff"
      emissiveIntensity={0.9}
      transparent
      opacity={0.55}
    />
  </T.Mesh>
{/each}
