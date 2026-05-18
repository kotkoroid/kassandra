<script lang="ts">
  import { useTask } from '@threlte/core';
  import { isInCity } from '../city';
  import { healers } from '../healers.svelte';
  import { rollLoot } from '../loot';
  import { spawnLootBag } from '../lootBags.svelte';
  import { getMonster } from '../monsters';
  import { SPIDER_VISUALS, spiders, type SpiderSize } from '../spiders.svelte';
  import { getEffectiveDamage, grantExperience, player } from '../state.svelte';
  import { nightStatMultiplier } from '../time.svelte';
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
  const DESPAWN_DISTANCE = 40;
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
    const monster = getMonster(SPIDER_VISUALS[size].monsterId);
    // Health is locked in at spawn so existing spiders don't gain or
    // lose hp when the cycle flips — only night-spawned ones get the
    // boost.
    const maxHp = monster.attributes.health * nightStatMultiplier();
    spiders.push({
      id: `s${nextId++}`,
      size,
      x,
      z,
      rotation,
      hp: maxHp,
      maxHp,
      attackCooldown: 0,
    });
  }

  function killSpider(index: number) {
    const s = spiders[index];
    if (!s) return;
    const visual = SPIDER_VISUALS[s.size];
    const monster = getMonster(visual.monsterId);
    spawnLootBag(s.x, s.z, rollLoot(visual.monsterId));
    grantExperience(monster.attributes.experience);
    spiders.splice(index, 1);
    if (visual.childSize && visual.childCount) {
      for (let i = 0; i < visual.childCount; i++) {
        const angle = (i / visual.childCount) * Math.PI * 2;
        const dist = 0.4;
        spawnSpider(
          visual.childSize,
          s.x + Math.cos(angle) * dist,
          s.z + Math.sin(angle) * dist,
          angle,
        );
      }
    }
  }

  useTask((delta) => {
    if (delta <= 0) return;

    spawnTimer += delta;
    if (spawnTimer >= SPAWN_INTERVAL && spiders.length < MAX_SPIDERS) {
      // Skip trees inside the city — spiders spawning there would
      // immediately be unable to move (the city blocks every step).
      const trees = visibleProps.filter(
        (p) => p.type === 'tree' && !isInCity(p.x, p.z),
      );
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

    if (slashTrigger !== lastSlashTrigger) {
      lastSlashTrigger = slashTrigger;
      const fwdX = Math.sin(playerRotation);
      const fwdZ = Math.cos(playerRotation);
      const damage = getEffectiveDamage();
      for (let i = spiders.length - 1; i >= 0; i--) {
        const s = spiders[i];
        if (!s) continue;
        const dx = s.x - playerX;
        const dz = s.z - playerZ;
        const dist = Math.hypot(dx, dz);
        if (dist > SWORD_REACH || dist < 0.001) continue;
        const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ;
        if (dot < SWORD_DOT_THRESHOLD) continue;
        s.hp -= damage;
        if (s.hp <= 0) killSpider(i);
      }
    }

    for (let i = spiders.length - 1; i >= 0; i--) {
      const s = spiders[i];
      if (!s) continue;
      const visual = SPIDER_VISUALS[s.size];
      const monster = getMonster(visual.monsterId);

      if (Math.hypot(s.x - playerX, s.z - playerZ) > DESPAWN_DISTANCE) {
        spiders.splice(i, 1);
        continue;
      }

      // Passive health regen from catalog, boosted at night.
      const mul = nightStatMultiplier();
      if (s.hp < s.maxHp && monster.attributes.healthRegen > 0) {
        s.hp = Math.min(
          s.maxHp,
          s.hp + monster.attributes.healthRegen * mul * delta,
        );
      }

      let bestX = 0;
      let bestZ = 0;
      let bestDist = Infinity;
      let bestHealerIndex = -1;
      let hasTarget = false;

      if (!isInWater(playerX, playerZ) && !isInCity(playerX, playerZ)) {
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

      if (!hasTarget) {
        s.attackCooldown = Math.max(0, s.attackCooldown - delta);
        continue;
      }

      const dx = bestX - s.x;
      const dz = bestZ - s.z;
      const norm = Math.max(bestDist, 0.0001);
      const step = visual.speed * delta;
      if (bestDist > ATTACK_RANGE) {
        const newX = s.x + (dx / norm) * step;
        const newZ = s.z + (dz / norm) * step;
        if (!isInWater(newX, newZ) && !isInCity(newX, newZ)) {
          s.x = newX;
          s.z = newZ;
        }
      }
      s.rotation = Math.atan2(dx, dz);

      s.attackCooldown -= delta;
      if (bestDist <= ATTACK_RANGE && s.attackCooldown <= 0) {
        s.attackCooldown =
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

{#each spiders as spider (spider.id)}
  {@const monster = getMonster(SPIDER_VISUALS[spider.size].monsterId)}
  <Spider
    id={spider.id}
    position={[spider.x, 0, spider.z]}
    rotation={spider.rotation}
    scale={SPIDER_VISUALS[spider.size].scale}
    name={monster.name}
    level={monster.level}
    hpPercent={spider.hp / spider.maxHp}
  />
{/each}
