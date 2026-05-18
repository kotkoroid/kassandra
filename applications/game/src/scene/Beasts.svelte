<script lang="ts">
  import { useTask } from '@threlte/core';
  import { beasts, type BeastKind } from '../beasts.svelte';
  import { isInCity } from '../city';
  import { healers } from '../healers.svelte';
  import { rollLoot } from '../loot';
  import { spawnLootBag } from '../lootBags.svelte';
  import {
    getMonster,
    MONSTER_BEAR,
    MONSTER_WOLF,
    type MonsterId,
  } from '../monsters';
  import { getEffectiveDamage, grantExperience, player } from '../state.svelte';
  import { nightStatMultiplier } from '../time.svelte';
  import { getVisibleWaters } from './world';
  import Bear from './Bear.svelte';
  import Wolf from './Wolf.svelte';

  interface Props {
    playerX: number;
    playerZ: number;
    playerRotation: number;
    slashTrigger: number;
  }
  let { playerX, playerZ, playerRotation, slashTrigger }: Props = $props();

  // Population caps per kind. Bears are rarer than wolves.
  const MAX_WOLVES = 4;
  const MAX_BEARS = 2;
  const WOLF_SPAWN_INTERVAL = 8;
  const BEAR_SPAWN_INTERVAL = 20;
  const SPAWN_DISTANCE_MIN = 14;
  const SPAWN_DISTANCE_MAX = 24;
  const DESPAWN_DISTANCE = 40;
  const ATTACK_RANGE = 0.9;
  // Wolves are quicker, bears lumber.
  const SPEED: Record<BeastKind, number> = { wolf: 3.0, bear: 1.8 };
  const SWORD_REACH = 1.6;
  const SWORD_DOT_THRESHOLD = 0.5;

  const visibleWaters = $derived(getVisibleWaters(playerX, playerZ));

  function isInWater(x: number, z: number): boolean {
    for (const w of visibleWaters) {
      if (Math.hypot(x - w.x, z - w.z) < w.radius) return true;
    }
    return false;
  }

  let wolfSpawnTimer = 0;
  let bearSpawnTimer = 0;
  let nextId = 1;
  let lastSlashTrigger = 0;

  function countKind(kind: BeastKind): number {
    let n = 0;
    for (const b of beasts) if (b.kind === kind) n++;
    return n;
  }

  function spawnBeast(kind: BeastKind, monsterId: MonsterId) {
    const monster = getMonster(monsterId);
    const angle = Math.random() * Math.PI * 2;
    const dist =
      SPAWN_DISTANCE_MIN +
      Math.random() * (SPAWN_DISTANCE_MAX - SPAWN_DISTANCE_MIN);
    const bx = playerX + Math.cos(angle) * dist;
    const bz = playerZ + Math.sin(angle) * dist;
    const maxHp = monster.attributes.health * nightStatMultiplier();
    beasts.push({
      id: `b${nextId++}`,
      kind,
      monsterId,
      x: bx,
      z: bz,
      rotation: Math.atan2(-(playerX - bx), -(playerZ - bz)),
      hp: maxHp,
      maxHp,
      attackCooldown: 0,
    });
  }

  useTask((delta) => {
    if (delta <= 0) return;

    wolfSpawnTimer += delta;
    if (wolfSpawnTimer >= WOLF_SPAWN_INTERVAL && countKind('wolf') < MAX_WOLVES) {
      wolfSpawnTimer = 0;
      spawnBeast('wolf', MONSTER_WOLF);
    }
    bearSpawnTimer += delta;
    if (bearSpawnTimer >= BEAR_SPAWN_INTERVAL && countKind('bear') < MAX_BEARS) {
      bearSpawnTimer = 0;
      spawnBeast('bear', MONSTER_BEAR);
    }

    // Sword hits: same forward-cone test as spiders/enemies.
    if (slashTrigger !== lastSlashTrigger) {
      lastSlashTrigger = slashTrigger;
      const fwdX = Math.sin(playerRotation);
      const fwdZ = Math.cos(playerRotation);
      const damage = getEffectiveDamage();
      for (let i = beasts.length - 1; i >= 0; i--) {
        const b = beasts[i];
        if (!b) continue;
        const dx = b.x - playerX;
        const dz = b.z - playerZ;
        const dist = Math.hypot(dx, dz);
        if (dist > SWORD_REACH || dist < 0.001) continue;
        const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ;
        if (dot < SWORD_DOT_THRESHOLD) continue;
        b.hp -= damage;
        if (b.hp <= 0) {
          const monster = getMonster(b.monsterId);
          spawnLootBag(b.x, b.z, rollLoot(b.monsterId));
          grantExperience(monster.attributes.experience);
          beasts.splice(i, 1);
        }
      }
    }

    for (let i = beasts.length - 1; i >= 0; i--) {
      const b = beasts[i];
      if (!b) continue;
      const monster = getMonster(b.monsterId);

      if (Math.hypot(b.x - playerX, b.z - playerZ) > DESPAWN_DISTANCE) {
        beasts.splice(i, 1);
        continue;
      }

      const mul = nightStatMultiplier();
      if (b.hp < b.maxHp && monster.attributes.healthRegen > 0) {
        b.hp = Math.min(
          b.maxHp,
          b.hp + monster.attributes.healthRegen * mul * delta,
        );
      }

      // Pick nearest reachable target — player or healer — skipping
      // anyone standing in water (same shoreline rule as spiders).
      let bestX = 0;
      let bestZ = 0;
      let bestDist = Infinity;
      let bestHealerIndex = -1;
      let hasTarget = false;

      if (!isInWater(playerX, playerZ) && !isInCity(playerX, playerZ)) {
        bestX = playerX;
        bestZ = playerZ;
        bestDist = Math.hypot(b.x - playerX, b.z - playerZ);
        hasTarget = true;
      }
      for (let h = 0; h < healers.length; h++) {
        const healer = healers[h]!;
        if (isInWater(healer.x, healer.z)) continue;
        const d = Math.hypot(b.x - healer.x, b.z - healer.z);
        if (d < bestDist) {
          bestDist = d;
          bestX = healer.x;
          bestZ = healer.z;
          bestHealerIndex = h;
          hasTarget = true;
        }
      }

      if (!hasTarget) {
        b.attackCooldown = Math.max(0, b.attackCooldown - delta);
        continue;
      }

      const dx = bestX - b.x;
      const dz = bestZ - b.z;
      const norm = Math.max(bestDist, 0.0001);
      const step = SPEED[b.kind] * delta;
      if (bestDist > ATTACK_RANGE) {
        const newX = b.x + (dx / norm) * step;
        const newZ = b.z + (dz / norm) * step;
        if (!isInWater(newX, newZ) && !isInCity(newX, newZ)) {
          b.x = newX;
          b.z = newZ;
        }
      }
      b.rotation = Math.atan2(dx, dz);

      b.attackCooldown -= delta;
      if (bestDist <= ATTACK_RANGE && b.attackCooldown <= 0) {
        b.attackCooldown =
          1 / Math.max(monster.attributes.attackSpeed * mul, 0.0001);
        const dmg = monster.attributes.damage * mul;
        if (bestHealerIndex < 0) {
          player.health = Math.max(0, player.health - dmg);
        } else {
          const target = healers[bestHealerIndex]!;
          target.hp -= dmg;
          if (target.hp <= 0) healers.splice(bestHealerIndex, 1);
        }
      }
    }
  });
</script>

{#each beasts as beast (beast.id)}
  {@const monster = getMonster(beast.monsterId)}
  {#if beast.kind === 'wolf'}
    <Wolf
      id={beast.id}
      position={[beast.x, 0, beast.z]}
      rotation={beast.rotation}
      name={monster.name}
      level={monster.level}
      hpPercent={beast.hp / beast.maxHp}
    />
  {:else}
    <Bear
      id={beast.id}
      position={[beast.x, 0, beast.z]}
      rotation={beast.rotation}
      name={monster.name}
      level={monster.level}
      hpPercent={beast.hp / beast.maxHp}
    />
  {/if}
{/each}
