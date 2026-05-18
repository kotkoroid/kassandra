<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { interactivity } from '@threlte/extras';
  import { onMount } from 'svelte';
  import {
    AmbientLight,
    Color,
    DirectionalLight,
    DoubleSide,
    Fog,
    MeshStandardMaterial,
    PerspectiveCamera,
    Vector3,
  } from 'three';
  import { chat, openChat } from '../chat.svelte';
  import { CITY_RADIUS, CITY_X, CITY_Z, isInCity } from '../city';
  import { clearSelection, getSelectionView, selection } from '../selection.svelte';
  import { death } from '../death.svelte';
  import { settings } from '../settings.svelte';
  import { getEffectiveAttackSpeed, player, STAMINA_MAX } from '../state.svelte';
  import { currentHour, CYCLE_SECONDS, isNight, time } from '../time.svelte';
  import Beasts from './Beasts.svelte';
  import Death from './Death.svelte';
  import Enemies from './Enemies.svelte';
  import Healers from './Healers.svelte';
  import LootBags from './LootBags.svelte';
  import Player from './Player.svelte';
  import Props from './Props.svelte';
  import Spiders from './Spiders.svelte';
  import Water from './Water.svelte';
  import { getVisibleProps, getVisibleWaters } from './world';

  const SPEED_NORMAL = 5;
  // Speed when stamina is exhausted — player can still move but slower.
  const SPEED_EXHAUSTED = 2;
  // Speed multiplier while standing in water.
  const WATER_SPEED_FACTOR = 0.5;
  // Stamina drains 12.5/s while moving (twice that in water).
  const STAMINA_DRAIN = 12.5;
  const STAMINA_WATER_DRAIN_MULT = 2;
  // Regen rates scaled so partial = MAX/15s, empty = MAX/30s (same
  // 3× duration as the 100-cap version since MAX is 300 now).
  const STAMINA_REGEN_PARTIAL = 20;
  const STAMINA_REGEN_EMPTY = 10;
  const cameraDistance = 12;
  // Player and tree collider radii. Sum is the minimum centre-to-centre
  // distance allowed before the player gets pushed out.
  const PLAYER_RADIUS = 0.25;
  const TREE_RADIUS = 0.3;
  // Aim the orbit camera at roughly the character's chest, not the feet.
  const cameraTargetHeight = 1.1;
  const yawSensitivity = 0.005;
  const pitchSensitivity = 0.005;
  // Keep camera above ground and from flipping past straight-down.
  const pitchMin = 0.15;
  const pitchMax = Math.PI / 2 - 0.1;

  let playerX = $state(CITY_X);
  let playerZ = $state(CITY_Z);
  // Tracks death.alive transitions so we teleport the player to the
  // city exactly once at the moment they revive.
  let wasAlive = true;
  // Click-to-move destination set by ground clicks. Cleared once the
  // player arrives, or as soon as a WASD key resumes manual control.
  let navTarget: { x: number; z: number } | null = $state(null);
  const ARRIVE_RADIUS = 0.15;
  // Sticky "should the player auto-engage the selected hostile?"
  // flag. Set to true whenever a new selection is made, flipped to
  // false the first time the player presses a movement key, and
  // reset again only when they click another target. Without this
  // WASD would only cancel chasing for the frame the key was held.
  let engageActive = $state(true);
  $effect(() => {
    // Reads selection.value so the effect re-runs on each new
    // selection — clicking another hostile rearms the auto-engage.
    if (selection.value) engageActive = true;
  });
  // Engage / auto-slash range. Slightly less than the slash reach so
  // the player stops a hair inside cone instead of grinding right at
  // the edge, where a single step backwards by the target would drop
  // them out again.
  const ENGAGE_RANGE = 1.45;
  const HOSTILE_KINDS: ReadonlyArray<string> = [
    'spider',
    'enemy',
    'beast',
    'troller',
  ];
  let playerRotation = $state(0);
  let playerMoving = $state(false);
  // Increments each time space is pressed so Player can latch onto
  // the transition without us managing slash timing here.
  let slashTrigger = $state(0);
  let cameraYaw = $state(0);
  let cameraPitch = $state(0.55);
  // Register Threlte's interactivity plugin so `onclick` works on
  // every entity's T.Group. Click-on-empty-ground deselects via the
  // ground mesh's own onclick below.
  interactivity();

  let cameraRef: PerspectiveCamera | undefined = $state();
  let lightRef: DirectionalLight | undefined = $state();
  // Captured via oncreate so sun-driven color/intensity updates each
  // frame mutate the existing objects instead of recreating them.
  let ambientRef: AmbientLight | undefined = $state();
  let fogRef: Fog | undefined = $state();
  let bgColorRef: Color | undefined = $state();

  // Sun rig constants. Distance is the radius of the arc the sun
  // travels along, kept inside the shadow camera frustum (±80) so
  // shadows don't pop as the light swings.
  const SUN_DISTANCE = 40;
  const PEAK_INTENSITY = 1.3;
  const NIGHT_INTENSITY = 0.04;
  const PEAK_AMBIENT = 0.55;
  const NIGHT_AMBIENT = 0.18;

  // Color stops sampled along the day. Allocated once, copied into
  // the live objects each frame to avoid per-tick allocations.
  const COLOR_MIDDAY = new Color('#fff4d6');
  const COLOR_HORIZON = new Color('#ffb56e');
  const COLOR_NIGHT = new Color('#5a7fc0');
  const SKY_MIDDAY = new Color('#d8e5b0');
  const SKY_HORIZON = new Color('#e89a72');
  const SKY_NIGHT = new Color('#1c2238');
  const tmpColor = new Color();
  const tmpColor2 = new Color();

  // Map sun height (-1..1) to a light tint. White at noon, warm at
  // the horizons, cool blue when the sun has set.
  function sampleSunColor(sunY: number, out: Color) {
    if (sunY >= 0.35) out.copy(COLOR_MIDDAY);
    else if (sunY >= 0)
      out.copy(COLOR_HORIZON).lerp(COLOR_MIDDAY, sunY / 0.35);
    else if (sunY >= -0.2)
      out.copy(COLOR_HORIZON).lerp(COLOR_NIGHT, -sunY / 0.2);
    else out.copy(COLOR_NIGHT);
  }

  // Same shape but on the sky palette so fog/background track sun
  // height without coupling to the light tint exactly.
  function sampleSkyColor(sunY: number, out: Color) {
    if (sunY >= 0.35) out.copy(SKY_MIDDAY);
    else if (sunY >= 0)
      out.copy(SKY_HORIZON).lerp(SKY_MIDDAY, sunY / 0.35);
    else if (sunY >= -0.15)
      out.copy(SKY_HORIZON).lerp(SKY_NIGHT, -sunY / 0.15);
    else out.copy(SKY_NIGHT);
  }

  // Exhaustion lock: once stamina hits 0, regen stays slow until the
  // bar is fully refilled, regardless of how the player picks back up.
  let exhausted = false;
  // Wall-clock timestamp (ms) of the last accepted slash. We compare
  // against performance.now() in the key handler so attack-speed
  // gating doesn't depend on useTask having ticked yet.
  let lastSlashAt = -Infinity;

  const visibleProps = $derived(getVisibleProps(playerX, playerZ));
  const visibleWaters = $derived(getVisibleWaters(playerX, playerZ));

  const keys = new Set<string>();
  let dragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  const lookAtTarget = new Vector3();

  onMount(() => {
    const keyDown = (e: KeyboardEvent) => {
      // The chat panel owns its own keystrokes — don't let any of
      // them double-trigger game bindings (WASD typing, F-keys, …).
      if (chat.open) return;

      // Enter opens chat (closing is handled inside Chat.svelte).
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!e.repeat) openChat();
        return;
      }

      // Item / skill quick slots. Slots aren't wired to anything yet,
      // but consuming the key here prevents the browser default and
      // keeps WASD / Space behavior clean. F1..F5 also stop the
      // browser from opening dev tools / help dialogs.
      if (!e.repeat && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        return;
      }
      if (!e.repeat && /^F[1-5]$/.test(e.key)) {
        e.preventDefault();
        return;
      }

      if (e.code === 'Space') {
        // Stop the page from scrolling and only count fresh presses
        // as new slashes — holding space shouldn't spam-trigger.
        e.preventDefault();
        if (!e.repeat) {
          // Reject the press if attack-speed cooldown hasn't elapsed.
          const now = performance.now();
          const minGapMs = 1000 / Math.max(getEffectiveAttackSpeed(), 0.0001);
          if (now - lastSlashAt >= minGapMs) {
            slashTrigger++;
            lastSlashAt = now;
          }
        }
      }
      if (e.repeat) return;
      keys.add(e.key.toLowerCase());
    };
    const keyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const contextMenu = (e: MouseEvent) => e.preventDefault();
    const mouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
      dragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    };
    const mouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      cameraYaw -= dx * yawSensitivity;
      cameraPitch = Math.max(
        pitchMin,
        Math.min(pitchMax, cameraPitch + dy * pitchSensitivity),
      );
    };
    const mouseUp = (e: MouseEvent) => {
      if (e.button === 2) dragging = false;
    };

    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('contextmenu', contextMenu);
    window.addEventListener('mousedown', mouseDown);
    window.addEventListener('mousemove', mouseMove);
    window.addEventListener('mouseup', mouseUp);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('contextmenu', contextMenu);
      window.removeEventListener('mousedown', mouseDown);
      window.removeEventListener('mousemove', mouseMove);
      window.removeEventListener('mouseup', mouseUp);
    };
  });

  useTask((delta) => {
    let dx = 0;
    let dz = 0;
    if (keys.has('w') || keys.has('arrowup')) dz -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dz += 1;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;

    // Advance the day/night clock. Wraps cleanly at cycle end.
    time.elapsed = (time.elapsed + delta) % CYCLE_SECONDS;

    // On dead → alive transition, teleport back to the city.
    if (death.alive && !wasAlive) {
      playerX = CITY_X;
      playerZ = CITY_Z;
    }
    wasAlive = death.alive;

    // Mirror player position into the shared state so the minimap
    // can render it without prop plumbing.
    player.x = playerX;
    player.z = playerZ;

    // While dead, the body lies frozen — no input, no slash, no stamina.
    if (!death.alive) {
      playerMoving = false;
      if (cameraRef) {
        const cp = Math.cos(cameraPitch);
        cameraRef.position.set(
          playerX + Math.sin(cameraYaw) * cp * cameraDistance,
          cameraTargetHeight + Math.sin(cameraPitch) * cameraDistance,
          playerZ + Math.cos(cameraYaw) * cp * cameraDistance,
        );
        lookAtTarget.set(playerX, cameraTargetHeight, playerZ);
        cameraRef.lookAt(lookAtTarget);
      }
      updateSunRig();
      return;
    }

    // Passive Health Regen: hp/sec, capped at 100. Runs only while alive.
    if (player.health < 100 && player.healthRegen > 0) {
      player.health = Math.min(100, player.health + player.healthRegen * delta);
    }

    const empty = player.stamina <= 0;
    let inWater = false;
    for (const w of visibleWaters) {
      if (Math.hypot(playerX - w.x, playerZ - w.z) < w.radius) {
        inWater = true;
        break;
      }
    }
    let speed: number;
    if (empty) speed = SPEED_EXHAUSTED;
    else if (inWater) speed = SPEED_NORMAL * WATER_SPEED_FACTOR;
    else speed = SPEED_NORMAL;

    // Auto-engage: if a hostile entity is selected and the player
    // isn't taking manual WASD control, steer toward it and slash
    // once in range. Friendly selections (player / Janna) are
    // ignored — clicking them just inspects.
    const hasManualInput = dx !== 0 || dz !== 0;
    if (hasManualInput) engageActive = false;
    if (!hasManualInput && engageActive && selection.value && HOSTILE_KINDS.includes(selection.value.kind)) {
      const view = getSelectionView();
      if (!view) {
        // Target died or despawned — drop the selection and any
        // lingering chase target so the player doesn't keep walking
        // toward an empty spot.
        clearSelection();
        navTarget = null;
      } else {
        const tdx = view.x - playerX;
        const tdz = view.z - playerZ;
        const dist = Math.hypot(tdx, tdz);
        if (dist > ENGAGE_RANGE) {
          // Out of reach: keep the click-nav pointer updated to the
          // target's live position so the regular movement block
          // chases it.
          navTarget = { x: view.x, z: view.z };
        } else {
          // In reach: stop running, face the target, and auto-slash
          // at the player's effective attack-speed cadence.
          navTarget = null;
          playerRotation = Math.atan2(tdx, tdz);
          const now = performance.now();
          const minGapMs = 1000 / Math.max(getEffectiveAttackSpeed(), 0.0001);
          if (now - lastSlashAt >= minGapMs) {
            slashTrigger++;
            lastSlashAt = now;
            // One-attack mode: a single swing then disengage. The
            // selection stays so the player can see hp / re-click to
            // resume — only the auto-chain is stopped.
            if (!settings.autoAttack) engageActive = false;
          }
        }
      }
    }

    // Resolve world-space movement direction this frame: WASD wins
    // when held (and cancels click-nav); otherwise steer toward the
    // click-nav target until we arrive.
    let worldX = 0;
    let worldZ = 0;
    let moving = false;
    if (dx !== 0 || dz !== 0) {
      navTarget = null;
      const len = Math.hypot(dx, dz);
      const nx = dx / len;
      const nz = dz / len;
      const sinY = Math.sin(cameraYaw);
      const cosY = Math.cos(cameraYaw);
      // Forward (W) = away from camera = (-sinY, 0, -cosY).
      // Right (D) = (cosY, 0, -sinY). Map (nx, nz) onto those axes.
      worldX = nx * cosY + nz * sinY;
      worldZ = -nx * sinY + nz * cosY;
      moving = true;
    } else if (navTarget) {
      const tdx = navTarget.x - playerX;
      const tdz = navTarget.z - playerZ;
      const dist = Math.hypot(tdx, tdz);
      if (dist <= ARRIVE_RADIUS) {
        navTarget = null;
      } else {
        worldX = tdx / dist;
        worldZ = tdz / dist;
        moving = true;
      }
    }

    if (moving) {
      const stepX = worldX * speed * delta;
      const stepZ = worldZ * speed * delta;
      const newX = playerX + stepX;
      const newZ = playerZ + stepZ;
      // At night the city is sealed: monsters can't enter (already)
      // and the player can't cross in from outside either. Stepping
      // from inside outward is still fine, so an already-inside
      // player isn't trapped if they want to leave.
      const cityClosed =
        isNight() && !isInCity(playerX, playerZ) && isInCity(newX, newZ);
      if (!cityClosed) {
        playerX = newX;
        playerZ = newZ;
      } else {
        // Don't keep grinding against the closed gate.
        navTarget = null;
      }
      // Player model is authored with its face on +Z (head + horns
      // sit slightly forward, hair slab behind), so the rotation
      // needs to align +Z with the velocity direction.
      playerRotation = Math.atan2(worldX, worldZ);
      playerMoving = true;

      // Drain while moving; doubled in water. Latch exhausted on 0.
      if (player.stamina > 0) {
        const drain =
          STAMINA_DRAIN * (inWater ? STAMINA_WATER_DRAIN_MULT : 1);
        player.stamina = Math.max(0, player.stamina - drain * delta);
        if (player.stamina === 0) exhausted = true;
      }
    } else {
      playerMoving = false;

      // Regen only while idle. Slow rate after exhaustion until full.
      if (player.stamina < STAMINA_MAX) {
        const rate = exhausted ? STAMINA_REGEN_EMPTY : STAMINA_REGEN_PARTIAL;
        player.stamina = Math.min(STAMINA_MAX, player.stamina + rate * delta);
      }
    }

    // Clear exhaustion any time stamina is full — including external
    // restorations like level-up — so the slow-regen lock doesn't
    // carry over to the next drain cycle.
    if (player.stamina >= STAMINA_MAX) {
      exhausted = false;
    }

    // Resolve tree collisions: after movement, if the player is inside
    // any tree's collider radius, push them out radially. Single pass
    // handles one tree well; corners between two trees may need
    // multiple passes but rarely matter at this density.
    for (const prop of visibleProps) {
      if (prop.type !== 'tree') continue;
      const dxTree = playerX - prop.x;
      const dzTree = playerZ - prop.z;
      const dist = Math.hypot(dxTree, dzTree);
      const minDist = TREE_RADIUS * prop.scale + PLAYER_RADIUS;
      if (dist < minDist) {
        const norm = Math.max(dist, 0.0001);
        const push = minDist - dist;
        playerX += (dxTree / norm) * push;
        playerZ += (dzTree / norm) * push;
      }
    }

    if (cameraRef) {
      const cp = Math.cos(cameraPitch);
      cameraRef.position.set(
        playerX + Math.sin(cameraYaw) * cp * cameraDistance,
        cameraTargetHeight + Math.sin(cameraPitch) * cameraDistance,
        playerZ + Math.cos(cameraYaw) * cp * cameraDistance,
      );
      lookAtTarget.set(playerX, cameraTargetHeight, playerZ);
      cameraRef.lookAt(lookAtTarget);
    }

    updateSunRig();
  });

  // Drives the sun's east→up→west arc, plus matching ambient, fog
  // and sky colors. Called once per frame from useTask (alive *and*
  // dead branches) so the world keeps darkening on the death screen.
  function updateSunRig() {
    const hour = currentHour();
    // alpha = 0 at sunrise (hour 6, east), pi at sunset (hour 18,
    // west). Night hours produce alpha outside [0, pi] which puts
    // the sun below the horizon — exactly what we want.
    const alpha = ((hour - 6) / 12) * Math.PI;
    const sunX = Math.cos(alpha);
    const sunY = Math.sin(alpha);

    if (lightRef) {
      // Keep the directional light following the player so the
      // shadow frustum (set wide at create time) stays centered on
      // the visible area. The Y is clamped to a small positive value
      // when the sun is below the horizon, otherwise the shadow
      // camera ends up underground and shadows invert.
      lightRef.position.set(
        playerX + sunX * SUN_DISTANCE,
        Math.max(2, sunY * SUN_DISTANCE),
        // Slight north tilt so the sun never sits exactly on the
        // camera-target axis (which would zero the shadow stretch).
        playerZ - SUN_DISTANCE * 0.15,
      );
      lightRef.target.position.set(playerX, 0, playerZ);
      lightRef.target.updateMatrixWorld();

      const dayWeight = Math.max(0, sunY);
      lightRef.intensity = NIGHT_INTENSITY + dayWeight * PEAK_INTENSITY;
      sampleSunColor(sunY, tmpColor);
      lightRef.color.copy(tmpColor);
    }

    if (ambientRef) {
      const dayWeight = Math.max(0, sunY);
      ambientRef.intensity =
        NIGHT_AMBIENT + dayWeight * (PEAK_AMBIENT - NIGHT_AMBIENT);
      sampleSkyColor(sunY, tmpColor2);
      ambientRef.color.copy(tmpColor2);
    }

    if (fogRef || bgColorRef) {
      sampleSkyColor(sunY, tmpColor2);
      if (fogRef) fogRef.color.copy(tmpColor2);
      if (bgColorRef) bgColorRef.copy(tmpColor2);
    }
  }

  // Minecraft Superflat: a single grass-block-thick ground layer.
  // BoxGeometry face order is +X, -X, +Y, -Y, +Z, -Z, so the third
  // material colours the top (grass) and the rest colour the dirt
  // sides + bottom visible at the world edge.
  const grass = new MeshStandardMaterial({ color: '#7caa3e' });
  const dirt = new MeshStandardMaterial({ color: '#8b5a2b' });
  const groundMaterials = [dirt, dirt, grass, dirt, dirt, dirt];
</script>

<T.Color
  attach="background"
  args={['#d8e5b0']}
  oncreate={(ref) => {
    bgColorRef = ref;
  }}
/>
<T.Fog
  attach="fog"
  args={['#d8e5b0', 20, 50]}
  oncreate={(ref) => {
    fogRef = ref;
  }}
/>

<T.PerspectiveCamera
  makeDefault
  fov={50}
  oncreate={(ref) => {
    cameraRef = ref;
  }}
/>

<T.AmbientLight
  intensity={0.55}
  oncreate={(light) => {
    ambientRef = light;
  }}
/>
<T.DirectionalLight
  intensity={1.1}
  castShadow
  oncreate={(light) => {
    // Frustum must cover the entire visible ground: camera distance
    // (12) + fog far (50) ≈ 60 units from the player in the worst
    // case (low pitch). ±80 leaves margin so the frustum edge never
    // intersects what the camera is rendering.
    light.shadow.camera.left = -80;
    light.shadow.camera.right = 80;
    light.shadow.camera.top = 80;
    light.shadow.camera.bottom = -80;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 150;
    light.shadow.camera.updateProjectionMatrix();
    // 4k map keeps per-texel area small (~0.04 world units) so small
    // props still cast crisp shadows despite the larger frustum.
    light.shadow.mapSize.set(4096, 4096);
    light.shadow.bias = -0.0005;
    light.shadow.normalBias = 0.04;
    lightRef = light;
  }}
/>

<T.Mesh
  position={[0, -0.5, 0]}
  material={groundMaterials}
  receiveShadow
  onclick={(e: { point: { x: number; z: number } }) => {
    // Terrain click: drop any selected entity (this isn't an
    // attack target) and walk to where the cursor pointed.
    clearSelection();
    navTarget = { x: e.point.x, z: e.point.z };
  }}
>
  <T.BoxGeometry args={[200, 1, 200]} />
</T.Mesh>

<!-- City plaza: gray cobble disc sitting just above the grass so it
     reads as a paved hub. Lifted slightly so z-fighting with the
     ground-block top face doesn't shimmer. -->
<T.Mesh
  position={[CITY_X, 0.01, CITY_Z]}
  rotation={[-Math.PI / 2, 0, 0]}
  receiveShadow
>
  <T.CircleGeometry args={[CITY_RADIUS, 48]} />
  <T.MeshStandardMaterial color="#9a9a9a" />
</T.Mesh>

<Player
  position={[playerX, 0, playerZ]}
  rotation={playerRotation}
  moving={playerMoving}
  {slashTrigger}
/>
<Water {playerX} {playerZ} />
<Props {playerX} {playerZ} />
<Enemies
  {playerX}
  {playerZ}
  {playerRotation}
  {slashTrigger}
/>
<Healers {playerX} {playerZ} />
<LootBags />
<Spiders
  {playerX}
  {playerZ}
  {playerRotation}
  {slashTrigger}
/>
<Beasts
  {playerX}
  {playerZ}
  {playerRotation}
  {slashTrigger}
/>
<Death
  {playerX}
  {playerZ}
  {playerRotation}
  {slashTrigger}
/>

{#if selection.value}
  {@const view = getSelectionView()}
  {#if view}
    <!-- Red selection ring at the entity's feet, repositioned each
         render. The ring is offset slightly above the ground to
         avoid z-fighting with the grass; double-sided so it reads
         even when the camera pitches low. -->
    <T.Mesh
      position={[view.x, 0.03, view.z]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <T.RingGeometry args={[0.6, 0.8, 48]} />
      <T.MeshBasicMaterial
        color="#ff3030"
        transparent
        opacity={0.9}
        depthWrite={false}
        side={DoubleSide}
      />
    </T.Mesh>
  {/if}
{/if}
