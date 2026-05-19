<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { HTML } from '@threlte/extras';
  import { DoubleSide } from 'three';
  import { ARMOR_COLORS, HAIR_COLORS } from '../cosmetics';
  import { selection } from '../selection.svelte';
  import { settings } from '../settings.svelte';
  import { getEffectiveStat } from '../sim/stats';
  import { world } from '../sim/world.svelte';

  // Player.svelte is reused by the CharacterCreation preview, which
  // controls position/rotation/slashTrigger externally — so those
  // come in as props instead of reading the live world fields.
  // Cosmetic + identity bits (name, hair, armor, sex, level, level-
  // up trigger) read straight from world.player.
  const player = world.player;

  interface Props {
    position: [number, number, number];
    rotation: number;
    moving: boolean;
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
    moving,
    slashTrigger,
    paused = false,
    oncreate,
  }: Props = $props();

  const skin = '#f0907e';

  const hair = $derived(HAIR_COLORS[player.hairColor]);
  const leather = '#5a3a28';
  const armorMain = $derived(ARMOR_COLORS[player.armor].skirt);
  const boot = $derived(ARMOR_COLORS[player.armor].boot);
  const blade = '#c0c0c8';
  const crossguard = '#a8a8b0';
  const grip = '#3a2a1a';
  const pommel = '#7a5a30';

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

  useTask((delta) => {
    if (paused) return;
    if (moving) {
      phase += delta * 9;
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

  <!-- Body parts wrap in an inner group so death drops the whole
       avatar flat on its back without affecting the nameplate or
       level-up effect that live above. -->
  <T.Group rotation.x={world.death.alive ? 0 : -Math.PI / 2}>
    <!-- Torso (skin under the armor). -->
    <T.Mesh position={[0, 1.2, 0]} castShadow>
    <T.BoxGeometry args={[0.4, 0.5, 0.25]} />
    <T.MeshStandardMaterial color={skin} />
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
  <T.Mesh position={[0, 0.92, 0]} castShadow>
    <T.CylinderGeometry args={[0.23, 0.23, 0.05, 8]} />
    <T.MeshStandardMaterial color={leather} />
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
  <T.Mesh position={[0, 1.6, 0.03]} castShadow>
    <T.BoxGeometry args={[0.3, 0.3, 0.3]} />
    <T.MeshStandardMaterial color={skin} />
  </T.Mesh>

  <!-- Left leg pivots at hip (group origin = hip joint, leg + boot hang
       below). Opposite-phase leg/arm pairs give the classic walk cycle. -->
  <T.Group position={[-0.12, 0.7, 0]} rotation.x={swing}>
    <T.Mesh position={[0, -0.25, 0]} castShadow>
      <T.CylinderGeometry args={[0.09, 0.09, 0.5, 8]} />
      <T.MeshStandardMaterial color={skin} />
    </T.Mesh>
    <T.Mesh position={[0, -0.6, 0]} castShadow>
      <T.BoxGeometry args={[0.2, 0.2, 0.25]} />
      <T.MeshStandardMaterial color={boot} />
    </T.Mesh>
  </T.Group>

  <T.Group position={[0.12, 0.7, 0]} rotation.x={-swing}>
    <T.Mesh position={[0, -0.25, 0]} castShadow>
      <T.CylinderGeometry args={[0.09, 0.09, 0.5, 8]} />
      <T.MeshStandardMaterial color={skin} />
    </T.Mesh>
    <T.Mesh position={[0, -0.6, 0]} castShadow>
      <T.BoxGeometry args={[0.2, 0.2, 0.25]} />
      <T.MeshStandardMaterial color={boot} />
    </T.Mesh>
  </T.Group>

  <!-- Left arm pivots at shoulder, swings opposite the left leg. -->
  <T.Group position={[-0.27, 1.325, 0]} rotation.x={-swing}>
    <T.Mesh position={[0, -0.225, 0]} castShadow>
      <T.CylinderGeometry args={[0.07, 0.07, 0.45, 8]} />
      <T.MeshStandardMaterial color={skin} />
    </T.Mesh>
    <T.Mesh position={[0, -0.5, 0]} castShadow>
      <T.CylinderGeometry args={[0.09, 0.09, 0.15, 8]} />
      <T.MeshStandardMaterial color={armorMain} />
    </T.Mesh>
  </T.Group>

  <!-- Right arm holds the sword. Walk swing when idle/moving, slash
       arc when triggered. -->
  <T.Group position={[0.27, 1.325, 0]} rotation.x={rightArmRotation}>
    <T.Mesh position={[0, -0.225, 0]} castShadow>
      <T.CylinderGeometry args={[0.07, 0.07, 0.45, 8]} />
      <T.MeshStandardMaterial color={skin} />
    </T.Mesh>
    <T.Mesh position={[0, -0.5, 0]} castShadow>
      <T.CylinderGeometry args={[0.09, 0.09, 0.15, 8]} />
      <T.MeshStandardMaterial color={armorMain} />
    </T.Mesh>

    <!-- Sword: pommel above hand, grip in hand, crossguard, blade
         extending in the arm's down direction so it follows the slash. -->
    <T.Group position={[0, -0.55, 0]}>
      <T.Mesh position={[0, 0.1, 0]} castShadow>
        <T.SphereGeometry args={[0.035, 6, 6]} />
        <T.MeshStandardMaterial color={pommel} />
      </T.Mesh>
      <T.Mesh castShadow>
        <T.CylinderGeometry args={[0.022, 0.022, 0.16, 6]} />
        <T.MeshStandardMaterial color={grip} />
      </T.Mesh>
      <T.Mesh position={[0, -0.1, 0]} castShadow>
        <T.BoxGeometry args={[0.22, 0.04, 0.06]} />
        <T.MeshStandardMaterial color={crossguard} />
      </T.Mesh>
      <T.Mesh position={[0, -0.45, 0]} castShadow>
        <T.BoxGeometry args={[0.07, 0.6, 0.04]} />
        <T.MeshStandardMaterial color={blade} />
      </T.Mesh>
    </T.Group>
  </T.Group>
  </T.Group>
</T.Group>
