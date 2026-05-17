<script lang="ts">
  import { useTask } from '@threlte/core';
  import { healers } from '../healers.svelte';
  import { SPIDER_CONFIGS, spiders, type SpiderSize } from '../spiders.svelte';
  import { player } from '../state.svelte';
  import Spider from './Spider.svelte';
  import { getVisibleProps, getVisibleWaters } from './world';

  interface Props {
    playerX: number;
    playerZ: number;
    playerRotation: number;
    slashTrigger: number;
  }
  let { playerX, playerZ, playerRotation, slashTrigger }: Props = $props();

  // Cap counts new "big" spawns from trees only; splits always happen.
  const MAX_SPIDERS = 20;
  const SPAWN_INTERVAL = 7; // sec between tree-spawn attempts
  const TREE_SPAWN_OFFSET = 1.5;
  const ATTACK_RANGE = 0.6;
  const ATTACK_INTERVAL = 1; // sec between bites
  const DESPAWN_DISTANCE = 40;
  // Sword hit settings — match the values used for human enemies.
  const SWORD_DAMAGE = 10;
  const SWORD_REACH = 1.6;
  const SWORD_DOT_THRESHOLD = 0.5;

  const visibleProps = $derived(getVisibleProps(playerX, playerZ));
  const visibleWaters = $derived(getVisibleWaters(playerX, playerZ));

  function isInWater(x: number, z: number): boolean {
    for (const w of visibleWaters) {
      if (Math.hypot(x - w.x, z - w.z) < w.radius) return true;
    }
    return false;
  }

  let spawnTimer = 0;
  let nextId = 1;
  let lastSlashTrigger = 0;

  function spawnSpider(
    size: SpiderSize,
    x: number,
    z: number,
    rotation = 0,
  ) {
    spiders.push({
      id: `s${nextId++}`,
      size,
      x,
      z,
      rotation,
      hp: SPIDER_CONFIGS[size].hp,
      attackCooldown: 0,
    });
  }

  function killSpider(index: number) {
    const s = spiders[index];
    if (!s) return;
    const config = SPIDER_CONFIGS[s.size];
    spiders.splice(index, 1);
    if (config.childSize && config.childCount) {
      for (let i = 0; i < config.childCount; i++) {
        const angle = (i / config.childCount) * Math.PI * 2;
        const dist = 0.4;
        spawnSpider(
          config.childSize,
          s.x + Math.cos(angle) * dist,
          s.z + Math.sin(angle) * dist,
          angle,
        );
      }
    }
  }

  useTask((delta) => {
    if (delta <= 0) return;

    // Periodic "big" spawn from a random visible tree.
    spawnTimer += delta;
    if (spawnTimer >= SPAWN_INTERVAL && spiders.length < MAX_SPIDERS) {
      const trees = visibleProps.filter((p) => p.type === 'tree');
      if (trees.length > 0) {
        spawnTimer = 0;
        const tree = trees[Math.floor(Math.random() * trees.length)]!;
        spawnSpider(
          'big',
          tree.x + (Math.random() - 0.5) * TREE_SPAWN_OFFSET,
          tree.z + (Math.random() - 0.5) * TREE_SPAWN_OFFSET,
        );
      }
    }

    // Sword hit detection. Iterate backwards because we splice.
    if (slashTrigger !== lastSlashTrigger) {
      lastSlashTrigger = slashTrigger;
      const fwdX = Math.sin(playerRotation);
      const fwdZ = Math.cos(playerRotation);
      for (let i = spiders.length - 1; i >= 0; i--) {
        const s = spiders[i];
        if (!s) continue;
        const dx = s.x - playerX;
        const dz = s.z - playerZ;
        const dist = Math.hypot(dx, dz);
        if (dist > SWORD_REACH || dist < 0.001) continue;
        const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ;
        if (dot < SWORD_DOT_THRESHOLD) continue;
        s.hp -= SWORD_DAMAGE;
        if (s.hp <= 0) killSpider(i);
      }
    }

    // AI: each spider picks nearest target (player or healer), moves
    // toward it, melees on contact when the per-spider cooldown is up.
    for (let i = spiders.length - 1; i >= 0; i--) {
      const s = spiders[i];
      if (!s) continue;
      const config = SPIDER_CONFIGS[s.size];

      // Despawn anything that wandered too far.
      if (Math.hypot(s.x - playerX, s.z - playerZ) > DESPAWN_DISTANCE) {
        spiders.splice(i, 1);
        continue;
      }

      // Find nearest target, skipping anyone standing in water —
      // spiders won't pursue or attack a target the water protects.
      let bestX = 0;
      let bestZ = 0;
      let bestDist = Infinity;
      let bestHealerIndex = -1;
      let hasTarget = false;

      if (!isInWater(playerX, playerZ)) {
        const d = Math.hypot(s.x - playerX, s.z - playerZ);
        bestX = playerX;
        bestZ = playerZ;
        bestDist = d;
        hasTarget = true;
      }
      for (let h = 0; h < healers.length; h++) {
        const healer = healers[h]!;
        if (isInWater(healer.x, healer.z)) continue;
        const d = Math.hypot(s.x - healer.x, s.z - healer.z);
        if (d < bestDist) {
          bestDist = d;
          bestX = healer.x;
          bestZ = healer.z;
          bestHealerIndex = h;
          hasTarget = true;
        }
      }

      // No reachable target → idle (and lose aggro implicitly).
      if (!hasTarget) {
        s.attackCooldown = Math.max(0, s.attackCooldown - delta);
        continue;
      }

      // Move toward target. Block the step if it would put the spider
      // inside water — they stop at the shoreline.
      const dx = bestX - s.x;
      const dz = bestZ - s.z;
      const norm = Math.max(bestDist, 0.0001);
      const step = config.speed * delta;
      if (bestDist > ATTACK_RANGE) {
        const newX = s.x + (dx / norm) * step;
        const newZ = s.z + (dz / norm) * step;
        if (!isInWater(newX, newZ)) {
          s.x = newX;
          s.z = newZ;
        }
      }
      s.rotation = Math.atan2(dx, dz);

      // Bite on contact when cooldown elapsed.
      s.attackCooldown -= delta;
      if (bestDist <= ATTACK_RANGE && s.attackCooldown <= 0) {
        s.attackCooldown = ATTACK_INTERVAL;
        if (bestHealerIndex < 0) {
          player.health = Math.max(0, player.health - config.damage);
        } else {
          const target = healers[bestHealerIndex]!;
          target.hp -= config.damage;
          if (target.hp <= 0) healers.splice(bestHealerIndex, 1);
        }
      }
    }
  });
</script>

{#each spiders as spider (spider.id)}
  <Spider
    position={[spider.x, 0, spider.z]}
    rotation={spider.rotation}
    scale={SPIDER_CONFIGS[spider.size].scale}
  />
{/each}
