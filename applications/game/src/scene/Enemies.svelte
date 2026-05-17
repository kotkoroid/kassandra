<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { enemies, projectiles } from '../enemies.svelte';
  import { healers } from '../healers.svelte';
  import { player, STAMINA_MAX } from '../state.svelte';
  import Enemy from './Enemy.svelte';

  interface Props {
    playerX: number;
    playerZ: number;
    playerRotation: number;
    slashTrigger: number;
  }
  let { playerX, playerZ, playerRotation, slashTrigger }: Props = $props();

  const MAX_ENEMIES = 5;
  const SPAWN_INTERVAL = 5; // sec between spawn attempts
  const SPAWN_DISTANCE_MIN = 12;
  const SPAWN_DISTANCE_MAX = 22;
  const DESPAWN_DISTANCE = 35;
  const SHOT_COOLDOWN = 3; // sec between an enemy's shots
  const PROJECTILE_SPEED = 8;
  // Max world distance an orb can fly before fizzling out.
  const PROJECTILE_MAX_DISTANCE = 10;
  const PROJECTILE_DAMAGE = 10;
  const HIT_RADIUS = 0.5;
  const PROJECTILE_HEIGHT = 1.2;
  const ENEMY_MAX_HP = 50;
  const SWORD_DAMAGE = 10;
  const SWORD_REACH = 1.6;
  // Forward-cone width: dot product with player forward must exceed
  // this. 0.5 ≈ 60° half-angle, so the slash sweeps a ~120° arc.
  const SWORD_DOT_THRESHOLD = 0.5;
  const EXP_PER_KILL = 10;
  const EXP_PER_LEVEL = 50;

  let spawnTimer = 0;
  let nextId = 1;
  let lastSlashTrigger = 0;

  useTask((delta) => {
    // Periodic spawn: drop a new enemy at a random angle around the
    // player, between the min and max ring distance.
    spawnTimer += delta;
    if (spawnTimer >= SPAWN_INTERVAL && enemies.length < MAX_ENEMIES) {
      spawnTimer = 0;
      const angle = Math.random() * Math.PI * 2;
      const dist =
        SPAWN_DISTANCE_MIN +
        Math.random() * (SPAWN_DISTANCE_MAX - SPAWN_DISTANCE_MIN);
      const ex = playerX + Math.cos(angle) * dist;
      const ez = playerZ + Math.sin(angle) * dist;
      enemies.push({
        id: `e${nextId++}`,
        x: ex,
        z: ez,
        // Face the player at spawn.
        rotation: Math.atan2(-(playerX - ex), -(playerZ - ez)),
        // Stagger initial cooldowns so spawns don't all fire together.
        cooldown: Math.random() * SHOT_COOLDOWN,
        hp: ENEMY_MAX_HP,
      });
    }

    // Enemy update: despawn if far, otherwise tick shot cooldown and
    // fire when ready. Iterate backwards because we splice.
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (!e) continue;
      const toPlayerX = playerX - e.x;
      const toPlayerZ = playerZ - e.z;
      const dist = Math.hypot(toPlayerX, toPlayerZ);
      if (dist > DESPAWN_DISTANCE) {
        enemies.splice(i, 1);
        continue;
      }
      // Always face the player.
      e.rotation = Math.atan2(-toPlayerX, -toPlayerZ);
      e.cooldown -= delta;
      if (e.cooldown <= 0) {
        e.cooldown = SHOT_COOLDOWN;
        const norm = Math.max(dist, 0.001);
        projectiles.push({
          id: `p${nextId++}`,
          x: e.x,
          z: e.z,
          vx: (toPlayerX / norm) * PROJECTILE_SPEED,
          vz: (toPlayerZ / norm) * PROJECTILE_SPEED,
          traveled: 0,
        });
      }
    }

    // Sword hit detection — runs once per slash trigger transition.
    // Any enemy inside SWORD_REACH and within the forward cone takes
    // SWORD_DAMAGE; killed enemies despawn and grant XP, which can
    // cascade level-ups while the bar is over EXP_PER_LEVEL.
    if (slashTrigger !== lastSlashTrigger) {
      lastSlashTrigger = slashTrigger;
      // Player model faces +Z at rotation 0, so its world forward is
      // (sin(rotation), cos(rotation)).
      const fwdX = Math.sin(playerRotation);
      const fwdZ = Math.cos(playerRotation);
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (!e) continue;
        const dx = e.x - playerX;
        const dz = e.z - playerZ;
        const dist = Math.hypot(dx, dz);
        if (dist > SWORD_REACH || dist < 0.001) continue;
        const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ;
        if (dot < SWORD_DOT_THRESHOLD) continue;
        e.hp -= SWORD_DAMAGE;
        if (e.hp <= 0) {
          enemies.splice(i, 1);
          player.experience += EXP_PER_KILL;
          while (player.experience >= EXP_PER_LEVEL) {
            player.experience -= EXP_PER_LEVEL;
            player.level += 1;
            player.health = 100;
            player.mana = 100;
            player.stamina = STAMINA_MAX;
            player.levelUpTrigger += 1;
          }
        }
      }
    }

    // Projectile update: integrate, accumulate traveled distance,
    // check ally then player hit, expire on max range.
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (!p) continue;
      const stepX = p.vx * delta;
      const stepZ = p.vz * delta;
      p.x += stepX;
      p.z += stepZ;
      p.traveled += Math.hypot(stepX, stepZ);

      // Check ally hits first — projectile can intercept on a healer
      // before reaching the player. Despawn ally at 0 hp.
      let consumed = false;
      for (let j = healers.length - 1; j >= 0; j--) {
        const h = healers[j];
        if (!h) continue;
        if (Math.hypot(p.x - h.x, p.z - h.z) < HIT_RADIUS) {
          h.hp -= PROJECTILE_DAMAGE;
          if (h.hp <= 0) healers.splice(j, 1);
          projectiles.splice(i, 1);
          consumed = true;
          break;
        }
      }
      if (consumed) continue;

      if (Math.hypot(p.x - playerX, p.z - playerZ) < HIT_RADIUS) {
        player.health = Math.max(0, player.health - PROJECTILE_DAMAGE);
        projectiles.splice(i, 1);
        continue;
      }

      if (p.traveled >= PROJECTILE_MAX_DISTANCE) {
        projectiles.splice(i, 1);
      }
    }
  });
</script>

{#each enemies as enemy (enemy.id)}
  <Enemy
    position={[enemy.x, 0, enemy.z]}
    rotation={enemy.rotation}
    hpPercent={enemy.hp / ENEMY_MAX_HP}
  />
{/each}

{#each projectiles as p (p.id)}
  <T.Mesh position={[p.x, PROJECTILE_HEIGHT, p.z]} castShadow>
    <T.SphereGeometry args={[0.16, 12, 12]} />
    <T.MeshStandardMaterial
      color="#ff3a3a"
      emissive="#c41a1a"
      emissiveIntensity={1.8}
    />
  </T.Mesh>
{/each}
