<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { HTML } from '@threlte/extras';
  import { BAG_XP_RECOVERY, death, loseProgressOnDeath } from '../death.svelte';
  import { getMonster, MONSTER_TROLLER } from '../monsters';
  import { selection } from '../selection.svelte';
  import { getEffectiveDamage, grantExperience, player } from '../state.svelte';
  import EntityNameplate from './EntityNameplate.svelte';

  interface Props {
    playerX: number;
    playerZ: number;
    playerRotation: number;
    slashTrigger: number;
  }
  let { playerX, playerZ, playerRotation, slashTrigger }: Props = $props();

  // Sword reach + cone match the values used in Enemies/Spiders/Beasts
  // so the Troller can be cleaved from the same range as anything else.
  const SWORD_REACH = 1.6;
  const SWORD_DOT_THRESHOLD = 0.5;
  let lastSlashTrigger = 0;

  const GNOME_SPEED = 5;
  const GNOME_LEAVE_DISTANCE = 30;
  const GNOME_COLLECT_TIME = 1.2;
  const BAG_TTL = 5 * 60; // 5 minutes
  const BAG_PICKUP_RADIUS = 1.2;
  const BUG_SPEED = 1.6;
  const BUG_WANDER_RADIUS = 4;
  const BUG_RETARGET_MIN = 1.5;
  const BUG_RETARGET_MAX = 3;
  const BUG_BAG_BIAS = 0.55;

  // Animation phase for the pulsing ring under the bag.
  let pulse = $state(0);
  // Cached so the HUD countdown formats consistently every frame.
  const bagSeconds = $derived(
    death.bag ? Math.max(0, Math.ceil(death.bag.ttl)) : 0,
  );
  const bagCountdown = $derived.by(() => {
    const m = Math.floor(bagSeconds / 60);
    const s = bagSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  });

  $effect(() => {
    // Trigger death sequence once health drops to 0. Respawn is
    // user-initiated from the Hud — we set up the death scene and
    // wait, no auto-timer.
    if (player.health <= 0 && death.alive) {
      death.alive = false;
      death.deathX = playerX;
      death.deathZ = playerZ;
      // Stash held XP into the bag and reset level + stats to base.
      // The bag returns BAG_XP_RECOVERY of the XP (and, eventually,
      // every dropped item) when the player walks back to it.
      loseProgressOnDeath();
      // Troller appears nearby and walks toward the corpse. HP comes
      // from the monster catalog so any future balance tweak flows
      // straight through.
      const trollerHp = getMonster(MONSTER_TROLLER).attributes.health;
      const angle = Math.random() * Math.PI * 2;
      death.gnome = {
        phase: 'approach',
        x: death.deathX + Math.cos(angle) * 4,
        z: death.deathZ + Math.sin(angle) * 4,
        targetX: death.deathX,
        targetZ: death.deathZ,
        rotation: 0,
        timer: 0,
        hp: trollerHp,
        maxHp: trollerHp,
      };
      death.bag = null;
      death.bug = null;
    }
  });

  function stepGnome(delta: number) {
    const g = death.gnome;
    if (!g) return;
    const dx = g.targetX - g.x;
    const dz = g.targetZ - g.z;
    const dist = Math.hypot(dx, dz);

    if (g.phase === 'collect') {
      g.timer -= delta;
      if (g.timer <= 0) {
        // Pick a direction and walk that far away from the corpse.
        const angle = Math.random() * Math.PI * 2;
        g.targetX = death.deathX + Math.cos(angle) * GNOME_LEAVE_DISTANCE;
        g.targetZ = death.deathZ + Math.sin(angle) * GNOME_LEAVE_DISTANCE;
        g.phase = 'leave';
      }
      return;
    }

    if (dist < 0.15) {
      if (g.phase === 'approach') {
        g.phase = 'collect';
        g.timer = GNOME_COLLECT_TIME;
      } else if (g.phase === 'leave') {
        // Drop the bag where the gnome stopped and disappear.
        death.bag = { x: g.x, z: g.z, ttl: BAG_TTL };
        death.gnome = null;
      }
      return;
    }

    const norm = Math.max(dist, 0.0001);
    g.x += (dx / norm) * GNOME_SPEED * delta;
    g.z += (dz / norm) * GNOME_SPEED * delta;
    g.rotation = Math.atan2(dx, dz);
  }

  function stepBag(delta: number) {
    const b = death.bag;
    if (!b) return;
    b.ttl -= delta;
    if (b.ttl <= 0) {
      death.bag = null;
      death.bagXp = 0;
      death.bug = null;
      return;
    }
    if (!death.alive) return;
    if (Math.hypot(b.x - playerX, b.z - playerZ) < BAG_PICKUP_RADIUS) {
      grantExperience(Math.round(death.bagXp * BAG_XP_RECOVERY));
      death.bag = null;
      death.bagXp = 0;
      death.bug = null;
    }
  }

  function stepBug(delta: number) {
    const b = death.bug;
    if (!b || !death.alive) return;
    b.retargetTimer -= delta;
    if (b.retargetTimer <= 0) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * BUG_WANDER_RADIUS;
      let tx = playerX + Math.cos(angle) * dist;
      let tz = playerZ + Math.sin(angle) * dist;
      // If a bag exists, bias the wander target toward it so the bug
      // visibly leads the player back to their loot.
      if (death.bag) {
        tx = tx * (1 - BUG_BAG_BIAS) + death.bag.x * BUG_BAG_BIAS;
        tz = tz * (1 - BUG_BAG_BIAS) + death.bag.z * BUG_BAG_BIAS;
      }
      b.wanderTargetX = tx;
      b.wanderTargetZ = tz;
      b.retargetTimer =
        BUG_RETARGET_MIN +
        Math.random() * (BUG_RETARGET_MAX - BUG_RETARGET_MIN);
    }
    const dx = b.wanderTargetX - b.x;
    const dz = b.wanderTargetZ - b.z;
    const norm = Math.max(Math.hypot(dx, dz), 0.0001);
    b.x += (dx / norm) * BUG_SPEED * delta;
    b.z += (dz / norm) * BUG_SPEED * delta;
    b.rotation = Math.atan2(dx, dz);
  }

  // Sword hit on the Troller. If the player kills him before he
  // delivers the player's loot, the bag drops at his current
  // position so the player still has a chance to reclaim it.
  function tryHitTroller() {
    if (slashTrigger === lastSlashTrigger) return;
    lastSlashTrigger = slashTrigger;
    const g = death.gnome;
    if (!g) return;
    const dx = g.x - playerX;
    const dz = g.z - playerZ;
    const dist = Math.hypot(dx, dz);
    if (dist > SWORD_REACH || dist < 0.001) return;
    const fwdX = Math.sin(playerRotation);
    const fwdZ = Math.cos(playerRotation);
    const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ;
    if (dot < SWORD_DOT_THRESHOLD) return;
    g.hp -= getEffectiveDamage();
    if (g.hp <= 0) {
      // Troller dies. Drop the player's loot bag right here, grant
      // the standard kill XP, and clear the carrier sprite.
      death.bag = { x: g.x, z: g.z, ttl: BAG_TTL };
      grantExperience(getMonster(MONSTER_TROLLER).attributes.experience);
      death.gnome = null;
    }
  }

  useTask((delta) => {
    if (delta <= 0) return;
    pulse += delta;

    tryHitTroller();
    stepGnome(delta);
    stepBag(delta);
    stepBug(delta);
  });
</script>

{#if !death.alive || death.bag}
  <!-- Blood pool at the death location. Sticks around as long as the
       bag is in the world; cleared when the bag is picked up. -->
  <T.Mesh
    position={[death.deathX, 0.045, death.deathZ]}
    rotation={[-Math.PI / 2, 0, 0]}
  >
    <T.CircleGeometry args={[1.1, 28]} />
    <T.MeshStandardMaterial
      color="#4a0606"
      emissive="#1a0202"
      emissiveIntensity={0.2}
      transparent
      opacity={0.85}
    />
  </T.Mesh>
{/if}

{#if death.gnome}
  {@const g = death.gnome}
  {@const troller = getMonster(MONSTER_TROLLER)}
  <T.Group
    position={[g.x, 0, g.z]}
    rotation.y={g.rotation}
    onclick={(e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      selection.value = { kind: 'troller' };
    }}
  >
    <EntityNameplate
      position={[0, 1.5, 0]}
      name={troller.name}
      level={troller.level}
      hpPercent={g.hp / g.maxHp}
      barWidthPx={56}
    />
    <!-- Legs -->
    <T.Mesh position={[-0.08, 0.18, 0]} castShadow>
      <T.CylinderGeometry args={[0.06, 0.06, 0.32, 6]} />
      <T.MeshStandardMaterial color="#3a2614" />
    </T.Mesh>
    <T.Mesh position={[0.08, 0.18, 0]} castShadow>
      <T.CylinderGeometry args={[0.06, 0.06, 0.32, 6]} />
      <T.MeshStandardMaterial color="#3a2614" />
    </T.Mesh>
    <!-- Body -->
    <T.Mesh position={[0, 0.55, 0]} castShadow>
      <T.CylinderGeometry args={[0.18, 0.2, 0.42, 8]} />
      <T.MeshStandardMaterial color="#2c5fa0" />
    </T.Mesh>
    <!-- Head -->
    <T.Mesh position={[0, 0.86, 0]} castShadow>
      <T.SphereGeometry args={[0.14, 10, 10]} />
      <T.MeshStandardMaterial color="#f0c8a8" />
    </T.Mesh>
    <!-- Beard -->
    <T.Mesh position={[0, 0.78, 0.08]} castShadow>
      <T.BoxGeometry args={[0.16, 0.14, 0.08]} />
      <T.MeshStandardMaterial color="#e8e3d4" />
    </T.Mesh>
    <!-- Pointed red hat -->
    <T.Mesh position={[0, 1.1, 0]} castShadow>
      <T.ConeGeometry args={[0.16, 0.32, 8]} />
      <T.MeshStandardMaterial color="#a82424" />
    </T.Mesh>
    {#if g.phase === 'leave'}
      <!-- Sack the gnome carries while leaving. -->
      <T.Mesh position={[0.18, 0.55, 0.15]} castShadow>
        <T.SphereGeometry args={[0.14, 8, 8]} />
        <T.MeshStandardMaterial color="#6b4625" />
      </T.Mesh>
    {/if}
  </T.Group>
{/if}

{#if death.bag}
  {@const b = death.bag}
  {@const pulseScale = 1 + Math.sin(pulse * 3) * 0.15}
  {@const pulseOpacity = 0.45 + Math.sin(pulse * 3) * 0.25}
  <!-- Pulsating ring around the bag -->
  <T.Mesh
    position={[b.x, 0.06, b.z]}
    rotation={[-Math.PI / 2, 0, 0]}
    scale={pulseScale}
  >
    <T.RingGeometry args={[0.7, 0.95, 32]} />
    <T.MeshBasicMaterial
      color="#d4a23a"
      transparent
      opacity={pulseOpacity}
      depthWrite={false}
    />
  </T.Mesh>
  <!-- Bag body -->
  <T.Group position={[b.x, 0, b.z]}>
    <T.Mesh position={[0, 0.18, 0]} castShadow>
      <T.SphereGeometry args={[0.22, 10, 10]} />
      <T.MeshStandardMaterial color="#6b4625" />
    </T.Mesh>
    <T.Mesh position={[0, 0.36, 0]} castShadow>
      <T.CylinderGeometry args={[0.05, 0.07, 0.08, 6]} />
      <T.MeshStandardMaterial color="#3d2715" />
    </T.Mesh>
  </T.Group>
  <!-- Floating countdown above the bag -->
  <HTML position={[b.x, 0.9, b.z]} center pointerEvents="none" zIndexRange={[40, 0]}>
    <div
      class="border border-amber-700/70 bg-black/80 px-2 py-0.5 text-xs font-semibold text-amber-200 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.8)]"
    >
      {bagCountdown}
    </div>
  </HTML>
{/if}

{#if death.bug && death.alive}
  {@const bu = death.bug}
  <T.Group position={[bu.x, 0.06, bu.z]} rotation.y={bu.rotation}>
    <T.Mesh castShadow>
      <T.SphereGeometry args={[0.07, 6, 6]} />
      <T.MeshStandardMaterial color="#1a0d12" />
    </T.Mesh>
    <!-- Tiny glowing eyes so it reads as alive -->
    <T.Mesh position={[-0.02, 0.04, 0.05]}>
      <T.SphereGeometry args={[0.012, 4, 4]} />
      <T.MeshStandardMaterial
        color="#ffd040"
        emissive="#c08018"
        emissiveIntensity={2}
      />
    </T.Mesh>
    <T.Mesh position={[0.02, 0.04, 0.05]}>
      <T.SphereGeometry args={[0.012, 4, 4]} />
      <T.MeshStandardMaterial
        color="#ffd040"
        emissive="#c08018"
        emissiveIntensity={2}
      />
    </T.Mesh>
  </T.Group>
{/if}
