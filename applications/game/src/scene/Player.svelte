<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { HTML } from '@threlte/extras';
  import { DoubleSide } from 'three';
  import { ARMOR_COLORS, HAIR_COLORS } from '../cosmetics';
  import {
    BRONZE_POMMEL_MAT,
    NEAR_BLACK_MAT,
    PLAYER_BLADE_MAT,
    PLAYER_CROSSGUARD_MAT,
    PLAYER_GRIP_MAT,
    PLAYER_LEATHER_MAT,
    PLAYER_SKIN_MAT,
  } from './materials';
  import { selection } from '../selection.svelte';
  import { settings } from '../settings.svelte';
  import { getEffectiveStat } from '@kassandra/simulation';
  import { world } from '../world.svelte';

  // Player.svelte is reused by the CharacterCreation preview, which
  // controls position/rotation/slashTrigger externally — so those
  // come in as props instead of reading the live world fields.
  // Cosmetic + identity bits (name, hair, armor, sex, level, level-
  // up trigger) read straight from world.player.
  const player = $derived(world.players[world.localPlayerId]);

  interface Props {
    position: [number, number, number];
    rotation: number;
    /** Actual movement speed in world-units/sec. 0 = idle. Walk cycle
     *  advances at speed × PHASE_FACTOR so the leg stride matches the
     *  ground pace automatically (slow in water, sluggish when exhausted). */
    speed: number;
    slashTrigger: number;
    // When true, every per-frame animation update on this instance
    // (walk cycle, slash, level-up effect) is short-circuited so the
    // model freezes mid-pose. Used by the character-creation preview
    // so its pause button stops the walk where the legs are, instead
    // of easing back to idle.
    paused?: boolean;
    // Optional ref-capture for the top-level Group. Scene.svelte uses
    // it to keep the player's pose updated imperatively in the same
    // useTask as the camera — otherwise Svelte's prop-binding flush
    // lags one frame behind Threlte's render call, making the player
    // appear to trail the camera while walking.
    oncreate?: (group: import('three').Group) => void;
  }
  let {
    position,
    rotation,
    speed,
    slashTrigger,
    paused = false,
    oncreate,
  }: Props = $props();

  // At SPEED_NORMAL (5 u/s) this matches the old hard-coded delta*9
  // cycle rate. Slower movement (water, exhaustion) produces a
  // proportionally slower stride automatically.
  const PHASE_FACTOR = 1.8;

  const hair = $derived(HAIR_COLORS[player.hairColor]);
  const armorMain = $derived(ARMOR_COLORS[player.armor].skirt);
  const boot = $derived(ARMOR_COLORS[player.armor].boot);

  // Walk-cycle phase advances while moving; amplitude lerps in/out
  // so the limbs ease into/out of the swing instead of snapping.
  let phase = $state(0);
  let amp = $state(0);
  // -1 = idle, 0..1 = playing the slash. Latched from slashTrigger
  // transitions so the parent only has to bump a counter.
  let slashPhase = $state(-1);
  let lastSlashTrigger = $state(0);
  // Level-up effect timer: -1 = idle, 0..LEVEL_UP_DURATION = playing.
  const LEVEL_UP_DURATION = 3;
  let levelUpTime = $state(-1);
  let levelUpRingSpin = $state(0);
  let lastLevelUpTrigger = $state(0);

  // Spell VFX state.
  let hailRingSpin = $state(0);
  // Blade whip flash: timer in [0..WHIP_DURATION] while showing, -1 idle.
  const WHIP_DURATION = 0.22;
  let whipTime = $state(-1);
  let whipTargetX = $state(0);
  let whipTargetZ = $state(0);
  let lastSpellAnimTrigger = $state(0);

  useTask((delta) => {
    if (paused) return;
    if (speed > 0.1) {
      phase += delta * speed * PHASE_FACTOR;
      amp = Math.min(1, amp + delta * 8);
    } else {
      amp = Math.max(0, amp - delta * 8);
    }

    if (slashTrigger !== lastSlashTrigger) {
      slashPhase = 0;
      lastSlashTrigger = slashTrigger;
    }
    if (slashPhase >= 0) {
      // Animation length = 1 / attackSpeed seconds, so the visible
      // swing plays at exactly the rate the stat advertises.
      slashPhase += delta * Math.max(getEffectiveStat(player, 'attackSpeed'), 0.0001);
      if (slashPhase >= 1) slashPhase = -1;
    }

    if (player.levelUpTrigger !== lastLevelUpTrigger) {
      lastLevelUpTrigger = player.levelUpTrigger;
      levelUpTime = 0;
    }
    if (levelUpTime >= 0) {
      levelUpTime += delta;
      levelUpRingSpin += delta * 2;
      if (levelUpTime >= LEVEL_UP_DURATION) levelUpTime = -1;
    }

    // Hail of Blades rings spin continuously while the channel is active.
    if (player.activeSpell?.kind === 'hail-of-blades') {
      hailRingSpin += delta * 6;
    }

    // Blade Whip flash: latch on spellAnimTrigger when active spell just
    // fired whip (not a channel), capture target position, run the timer.
    if (player.spellAnimTrigger !== lastSpellAnimTrigger) {
      lastSpellAnimTrigger = player.spellAnimTrigger;
      // Only start the whip flash if no channel is running (channels have
      // their own vfx) and the player has an engage target.
      if (player.activeSpell === null && player.engageTargetId !== null) {
        const t = world.entityById.get(player.engageTargetId);
        if (t) {
          whipTargetX = t.x;
          whipTargetZ = t.z;
          whipTime = 0;
        }
      }
    }
    if (whipTime >= 0) {
      whipTime += delta;
      if (whipTime >= WHIP_DURATION) whipTime = -1;
    }
  });

  // Sine envelope so the effect eases in and out instead of popping.
  const levelUpOpacity = $derived(
    levelUpTime >= 0
      ? Math.sin((levelUpTime / LEVEL_UP_DURATION) * Math.PI)
      : 0,
  );

  // Wind-up → fast forward swing → recovery, expressed as a piecewise
  // arc on the right arm's X rotation. The model faces +Z, and a
  // positive rotation.x sweeps an arm hanging at −Y toward −Z (i.e.
  // behind the character), so "wind up backward, swing forward"
  // means *positive* angles on the wind-up and *negative* angles on
  // the strike.
  function slashAngleAt(t: number): number {
    if (t < 0.25) return (t / 0.25) * 0.6;
    if (t < 0.6) return 0.6 - ((t - 0.25) / 0.35) * 2.2;
    return -1.6 * (1 - (t - 0.6) / 0.4);
  }

  const swing = $derived(Math.sin(phase) * amp * 0.55);
  // Right arm runs the slash when active, otherwise the walk swing.
  const rightArmRotation = $derived(
    slashPhase >= 0 ? slashAngleAt(slashPhase) : swing,
  );
</script>

<T.Group
  {position}
  rotation.y={rotation}
  oncreate={(g) => oncreate?.(g)}
  onclick={(e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    selection.value = 'player';
  }}
>
  {#if world.death.alive && (settings.showNames || player.saying)}
    <!-- Nameplate + speech bubble above the head. Both are hidden
         while dead so the corpse doesn't keep floating labels over
         it. Nameplate is toggleable via the Settings dialog; the
         say-bubble auto-dismisses 5s after each chat send. -->
    <HTML position={[0, 2.25, 0]} center pointerEvents="none" zIndexRange={[40, 0]}>
      <div
        class="flex flex-col items-center gap-1 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.85)]"
      >
        {#if settings.showNames}
          <div
            class="flex items-baseline gap-1.5 text-sm font-semibold whitespace-nowrap"
          >
            <span class="text-amber-400">Level {player.level}</span>
            <span class="text-white/50">|</span>
            <span class="text-white">{player.name}</span>
          </div>
        {/if}
        {#if player.saying}
          <div
            class="max-w-[240px] border border-amber-900/70 bg-black/85 px-2 py-0.5 text-xs text-white"
          >
            {player.saying}
          </div>
        {/if}
      </div>
    </HTML>
  {/if}

  {#if levelUpTime >= 0 && world.death.alive}
    <!-- Pillar of golden light wrapping the character. Open-ended
         cylinder + DoubleSide so it renders from both inside and out;
         depthWrite off so it doesn't clip the model behind it. -->
    <T.Mesh position={[0, 3, 0]}>
      <T.CylinderGeometry args={[0.75, 0.75, 6.5, 18, 1, true]} />
      <T.MeshBasicMaterial
        color="#ffe680"
        transparent
        opacity={levelUpOpacity * 0.55}
        side={DoubleSide}
        depthWrite={false}
      />
    </T.Mesh>
    <!-- Inner brighter core -->
    <T.Mesh position={[0, 3, 0]}>
      <T.CylinderGeometry args={[0.35, 0.35, 6.5, 18, 1, true]} />
      <T.MeshBasicMaterial
        color="#fff5c0"
        transparent
        opacity={levelUpOpacity * 0.8}
        side={DoubleSide}
        depthWrite={false}
      />
    </T.Mesh>
    <!-- Glowing ring at feet -->
    <T.Mesh
      position={[0, 0.04, 0]}
      rotation={[-Math.PI / 2, 0, levelUpRingSpin]}
    >
      <T.RingGeometry args={[0.7, 1.1, 32]} />
      <T.MeshBasicMaterial
        color="#ffd040"
        transparent
        opacity={levelUpOpacity}
        side={DoubleSide}
        depthWrite={false}
      />
    </T.Mesh>
  {/if}

  <!-- Rush: cyan trail ring at feet while dashing. -->
  {#if player.activeSpell?.kind === 'rush' && world.death.alive}
    {@const sp = player.activeSpell}
    {@const t = Math.min((world.time - sp.startedAt) / Math.max(sp.endsAt - sp.startedAt, 0.001), 1)}
    <T.Mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <T.RingGeometry args={[0.5, 0.85, 32]} />
      <T.MeshBasicMaterial
        color="#40e0ff"
        transparent
        opacity={(1 - t) * 0.85}
        side={DoubleSide}
        depthWrite={false}
      />
    </T.Mesh>
    <T.Mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <T.RingGeometry args={[0.2, 0.5, 32]} />
      <T.MeshBasicMaterial
        color="#80f8ff"
        transparent
        opacity={(1 - t) * 0.6}
        side={DoubleSide}
        depthWrite={false}
      />
    </T.Mesh>
  {/if}

  <!-- Mayhem: pulsing amber/orange aura while buff is active. -->
  {#if player.effects.find(e => e.id === 'mayhem') && world.death.alive}
    {@const pulse = 0.35 + 0.25 * Math.sin(world.time * 6)}
    <T.Mesh position={[0, 1.0, 0]}>
      <T.CylinderGeometry args={[0.55, 0.55, 2.2, 14, 1, true]} />
      <T.MeshBasicMaterial
        color="#ff8800"
        transparent
        opacity={pulse}
        side={DoubleSide}
        depthWrite={false}
      />
    </T.Mesh>
    <T.Mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, world.time * 2]}>
      <T.RingGeometry args={[0.5, 0.75, 32]} />
      <T.MeshBasicMaterial
        color="#ffcc00"
        transparent
        opacity={pulse * 0.9}
        side={DoubleSide}
        depthWrite={false}
      />
    </T.Mesh>
  {/if}

  <!-- Hail of Blades: two counter-rotating gold rings while channelling. -->
  {#if player.activeSpell?.kind === 'hail-of-blades' && world.death.alive}
    <T.Mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, hailRingSpin]}>
      <T.RingGeometry args={[1.8, 2.6, 32]} />
      <T.MeshBasicMaterial
        color="#ffe044"
        transparent
        opacity={0.55}
        side={DoubleSide}
        depthWrite={false}
      />
    </T.Mesh>
    <T.Mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, -hailRingSpin * 0.7]}>
      <T.RingGeometry args={[1.2, 1.85, 32]} />
      <T.MeshBasicMaterial
        color="#ffd080"
        transparent
        opacity={0.4}
        side={DoubleSide}
        depthWrite={false}
      />
    </T.Mesh>
  {/if}

  <!-- Blade Whip: brief orange cylinder from player toward target. -->
  {#if whipTime >= 0 && world.death.alive}
    {@const progress = whipTime / WHIP_DURATION}
    {@const localDx = whipTargetX - position[0]}
    {@const localDz = whipTargetZ - position[2]}
    {@const whipLen = Math.hypot(localDx, localDz)}
    {@const whipAngle = Math.atan2(localDx, localDz)}
    <T.Group rotation.y={whipAngle}>
      <!-- Cylinder is Y-up; rotate it 90° on X to point along Z. -->
      <T.Mesh position={[0, 1.1, whipLen / 2]} rotation.x={Math.PI / 2}>
        <T.CylinderGeometry args={[0.045, 0.085, whipLen, 6]} />
        <T.MeshBasicMaterial
          color="#ff6600"
          transparent
          opacity={(1 - progress) * 0.9}
          depthWrite={false}
        />
      </T.Mesh>
    </T.Group>
  {/if}

  <!-- Body parts wrap in an inner group so death drops the whole
       avatar flat on its back without affecting the nameplate or
       level-up effect that live above. -->
  <T.Group rotation.x={world.death.alive ? 0 : -Math.PI / 2}>
    <!-- Torso (skin under the armor). -->
    <T.Mesh position={[0, 1.2, 0]} castShadow material={PLAYER_SKIN_MAT}>
    <T.BoxGeometry args={[0.4, 0.5, 0.25]} />
  </T.Mesh>

  <!-- Chest armor plate over the upper torso. -->
  <T.Mesh position={[0, 1.32, 0]} castShadow>
    <T.BoxGeometry args={[0.42, 0.3, 0.28]} />
    <T.MeshStandardMaterial color={armorMain} />
  </T.Mesh>

  {#if player.sex === 'female'}
    <!-- Breast bumps molded into the chest plate. -->
    <T.Mesh position={[-0.09, 1.32, 0.14]} castShadow>
      <T.SphereGeometry args={[0.08, 10, 10]} />
      <T.MeshStandardMaterial color={armorMain} />
    </T.Mesh>
    <T.Mesh position={[0.09, 1.32, 0.14]} castShadow>
      <T.SphereGeometry args={[0.08, 10, 10]} />
      <T.MeshStandardMaterial color={armorMain} />
    </T.Mesh>
  {/if}

  <!-- Belt -->
  <T.Mesh position={[0, 0.92, 0]} castShadow material={PLAYER_LEATHER_MAT}>
    <T.CylinderGeometry args={[0.23, 0.23, 0.05, 8]} />
  </T.Mesh>

  <!-- Skirt -->
  <T.Mesh position={[0, 0.78, 0]} castShadow>
    <T.CylinderGeometry args={[0.28, 0.22, 0.22, 8]} />
    <T.MeshStandardMaterial color={armorMain} />
  </T.Mesh>

  <!-- Pauldrons (match the chosen armor colour). -->
  <T.Mesh position={[-0.27, 1.35, 0]} castShadow>
    <T.BoxGeometry args={[0.18, 0.2, 0.27]} />
    <T.MeshStandardMaterial color={armorMain} />
  </T.Mesh>
  <T.Mesh position={[0.27, 1.35, 0]} castShadow>
    <T.BoxGeometry args={[0.18, 0.2, 0.27]} />
    <T.MeshStandardMaterial color={armorMain} />
  </T.Mesh>

  <!-- Hair: short for male, long flowing slab down the back for female. -->
  {#if player.sex === 'female'}
    <T.Mesh position={[0, 1.35, -0.08]} castShadow>
      <T.BoxGeometry args={[0.38, 0.85, 0.18]} />
      <T.MeshStandardMaterial color={hair} />
    </T.Mesh>
  {:else}
    <T.Mesh position={[0, 1.6, -0.06]} castShadow>
      <T.BoxGeometry args={[0.36, 0.36, 0.2]} />
      <T.MeshStandardMaterial color={hair} />
    </T.Mesh>
  {/if}

  <!-- Head -->
  <T.Mesh position={[0, 1.6, 0.03]} castShadow material={PLAYER_SKIN_MAT}>
    <T.BoxGeometry args={[0.3, 0.3, 0.3]} />
  </T.Mesh>

  <!-- Eyes -->
  <T.Mesh position={[-0.075, 1.635, 0.185]} material={NEAR_BLACK_MAT}>
    <T.BoxGeometry args={[0.055, 0.04, 0.015]} />
  </T.Mesh>
  <T.Mesh position={[0.075, 1.635, 0.185]} material={NEAR_BLACK_MAT}>
    <T.BoxGeometry args={[0.055, 0.04, 0.015]} />
  </T.Mesh>

  <!-- Eyebrows — hair-coloured; arched on female, flat on male -->
  {#if player.sex === 'female'}
    <T.Mesh position={[-0.075, 1.662, 0.183]} rotation.z={0.18}>
      <T.BoxGeometry args={[0.052, 0.013, 0.012]} />
      <T.MeshStandardMaterial color={hair} />
    </T.Mesh>
    <T.Mesh position={[0.075, 1.662, 0.183]} rotation.z={-0.18}>
      <T.BoxGeometry args={[0.052, 0.013, 0.012]} />
      <T.MeshStandardMaterial color={hair} />
    </T.Mesh>
  {:else}
    <T.Mesh position={[-0.075, 1.662, 0.183]}>
      <T.BoxGeometry args={[0.065, 0.017, 0.012]} />
      <T.MeshStandardMaterial color={hair} />
    </T.Mesh>
    <T.Mesh position={[0.075, 1.662, 0.183]}>
      <T.BoxGeometry args={[0.065, 0.017, 0.012]} />
      <T.MeshStandardMaterial color={hair} />
    </T.Mesh>
  {/if}

  <!-- Nose bump -->
  <T.Mesh position={[0, 1.607, 0.189]} material={PLAYER_SKIN_MAT}>
    <T.BoxGeometry args={[0.025, 0.022, 0.018]} />
  </T.Mesh>

  <!-- Mouth -->
  <T.Mesh position={[0, 1.566, 0.185]} material={NEAR_BLACK_MAT}>
    <T.BoxGeometry args={[0.075, 0.013, 0.012]} />
  </T.Mesh>

  <!-- Left leg pivots at hip (group origin = hip joint, leg + boot hang
       below). Opposite-phase leg/arm pairs give the classic walk cycle. -->
  <T.Group position={[-0.12, 0.7, 0]} rotation.x={swing}>
    <T.Mesh position={[0, -0.25, 0]} castShadow material={PLAYER_SKIN_MAT}>
      <T.CylinderGeometry args={[0.09, 0.09, 0.5, 8]} />
    </T.Mesh>
    <T.Mesh position={[0, -0.6, 0]} castShadow>
      <T.BoxGeometry args={[0.2, 0.2, 0.25]} />
      <T.MeshStandardMaterial color={boot} />
    </T.Mesh>
  </T.Group>

  <T.Group position={[0.12, 0.7, 0]} rotation.x={-swing}>
    <T.Mesh position={[0, -0.25, 0]} castShadow material={PLAYER_SKIN_MAT}>
      <T.CylinderGeometry args={[0.09, 0.09, 0.5, 8]} />
    </T.Mesh>
    <T.Mesh position={[0, -0.6, 0]} castShadow>
      <T.BoxGeometry args={[0.2, 0.2, 0.25]} />
      <T.MeshStandardMaterial color={boot} />
    </T.Mesh>
  </T.Group>

  <!-- Left arm pivots at shoulder, swings opposite the left leg. -->
  <T.Group position={[-0.27, 1.325, 0]} rotation.x={-swing}>
    <T.Mesh position={[0, -0.225, 0]} castShadow material={PLAYER_SKIN_MAT}>
      <T.CylinderGeometry args={[0.07, 0.07, 0.45, 8]} />
    </T.Mesh>
    <T.Mesh position={[0, -0.5, 0]} castShadow>
      <T.CylinderGeometry args={[0.09, 0.09, 0.15, 8]} />
      <T.MeshStandardMaterial color={armorMain} />
    </T.Mesh>
  </T.Group>

  <!-- Right arm holds the sword. Walk swing when idle/moving, slash
       arc when triggered. -->
  <T.Group position={[0.27, 1.325, 0]} rotation.x={rightArmRotation}>
    <T.Mesh position={[0, -0.225, 0]} castShadow material={PLAYER_SKIN_MAT}>
      <T.CylinderGeometry args={[0.07, 0.07, 0.45, 8]} />
    </T.Mesh>
    <T.Mesh position={[0, -0.5, 0]} castShadow>
      <T.CylinderGeometry args={[0.09, 0.09, 0.15, 8]} />
      <T.MeshStandardMaterial color={armorMain} />
    </T.Mesh>

    <!-- Sword: pommel above hand, grip in hand, crossguard, blade
         extending in the arm's down direction so it follows the slash. -->
    <T.Group position={[0, -0.55, 0]}>
      <T.Mesh position={[0, 0.1, 0]} castShadow material={BRONZE_POMMEL_MAT}>
        <T.SphereGeometry args={[0.035, 6, 6]} />
      </T.Mesh>
      <T.Mesh castShadow material={PLAYER_GRIP_MAT}>
        <T.CylinderGeometry args={[0.022, 0.022, 0.16, 6]} />
      </T.Mesh>
      <T.Mesh position={[0, -0.1, 0]} castShadow material={PLAYER_CROSSGUARD_MAT}>
        <T.BoxGeometry args={[0.22, 0.04, 0.06]} />
      </T.Mesh>
      <T.Mesh position={[0, -0.45, 0]} castShadow material={PLAYER_BLADE_MAT}>
        <T.BoxGeometry args={[0.07, 0.6, 0.04]} />
      </T.Mesh>
    </T.Group>
  </T.Group>
  </T.Group>
</T.Group>
