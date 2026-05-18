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
    Group,
    MeshStandardMaterial,
    PerspectiveCamera,
    Vector3,
  } from 'three';
  import { chat, openChat } from '../chat.svelte';
  import { CITY_RADIUS, CITY_X, CITY_Z } from '../city';
  import { clearSelection, getSelectionView, selection } from '../selection.svelte';
  import { BAG_PICKUP_RADIUS } from '../sim/constants';
  import { dispatch } from '../sim/input';
  import { currentHour } from '../sim/systems/time';
  import { tick } from '../sim/tick';
  import { world } from '../sim/world.svelte';
  import Beasts from './Beasts.svelte';
  import Death from './Death.svelte';
  import Enemies from './Enemies.svelte';
  import Healers from './Healers.svelte';
  import LootBags from './LootBags.svelte';
  import Player from './Player.svelte';
  import Props from './Props.svelte';
  import Spiders from './Spiders.svelte';
  import Water from './Water.svelte';

  // Threlte's pointer/click plugin. Required for the entity click
  // handlers + the ground-click navigation/deselect.
  interactivity();

  const cameraDistance = 12;
  const cameraTargetHeight = 1.1;
  const yawSensitivity = 0.005;
  const pitchSensitivity = 0.005;
  const pitchMin = 0.15;
  const pitchMax = Math.PI / 2 - 0.1;

  // --- Sun rig (visual-only — drives DirectionalLight/Ambient/Fog) ---
  const SUN_DISTANCE = 40;
  const PEAK_INTENSITY = 1.3;
  const NIGHT_INTENSITY = 0.04;
  const PEAK_AMBIENT = 0.55;
  const NIGHT_AMBIENT = 0.18;
  const COLOR_MIDDAY = new Color('#fff4d6');
  const COLOR_HORIZON = new Color('#ffb56e');
  const COLOR_NIGHT = new Color('#5a7fc0');
  const SKY_MIDDAY = new Color('#d8e5b0');
  const SKY_HORIZON = new Color('#e89a72');
  const SKY_NIGHT = new Color('#1c2238');
  const tmpColor = new Color();
  const tmpColor2 = new Color();

  let cameraYaw = $state(0);
  let cameraPitch = $state(0.55);
  let cameraRef: PerspectiveCamera | undefined = $state();
  let playerGroupRef: Group | undefined = $state();
  let lightRef: DirectionalLight | undefined = $state();
  let ambientRef: AmbientLight | undefined = $state();
  let fogRef: Fog | undefined = $state();

  // Visual moving flag for the walk cycle. True iff the player
  // actually translated this frame; tracked separately because the
  // sim doesn't expose a "moving this tick" bit.
  let playerMoving = $state(false);
  let lastPlayerX = world.player.x;
  let lastPlayerZ = world.player.z;

  // Inputs collected outside the sim: keys held, mouse drag for the
  // camera. The render loop steps the sim once per frame with the
  // frame's dt, so render and sim are aligned by construction.
  const keys = new Set<string>();
  let dragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  const lookAtTarget = new Vector3();

  function sampleSunColor(sunY: number, out: Color) {
    if (sunY >= 0.35) out.copy(COLOR_MIDDAY);
    else if (sunY >= 0)
      out.copy(COLOR_HORIZON).lerp(COLOR_MIDDAY, sunY / 0.35);
    else if (sunY >= -0.2)
      out.copy(COLOR_HORIZON).lerp(COLOR_NIGHT, -sunY / 0.2);
    else out.copy(COLOR_NIGHT);
  }

  function sampleSkyColor(sunY: number, out: Color) {
    if (sunY >= 0.35) out.copy(SKY_MIDDAY);
    else if (sunY >= 0)
      out.copy(SKY_HORIZON).lerp(SKY_MIDDAY, sunY / 0.35);
    else if (sunY >= -0.15)
      out.copy(SKY_HORIZON).lerp(SKY_NIGHT, -sunY / 0.15);
    else out.copy(SKY_NIGHT);
  }

  // Sun rig follows world.time and the player's world position so
  // shadow coverage stays centered on the camera target.
  function updateSunRig() {
    const hour = currentHour(world);
    const alpha = ((hour - 6) / 12) * Math.PI;
    const sunX = Math.cos(alpha);
    const sunY = Math.sin(alpha);

    if (lightRef) {
      lightRef.position.set(
        world.player.x + sunX * SUN_DISTANCE,
        Math.max(2, sunY * SUN_DISTANCE),
        world.player.z - SUN_DISTANCE * 0.15,
      );
      lightRef.target.position.set(world.player.x, 0, world.player.z);
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

    if (fogRef) {
      sampleSkyColor(sunY, tmpColor2);
      fogRef.color.copy(tmpColor2);
    }
  }

  // Z-key shortcut: grabs every in-range bag whose owned items
  // belong to the player. Multiple bags can be claimed in one press
  // — useful after a fight that drops several. No dialog is shown.
  function pickupNearbyOwnedLoot() {
    const px = world.player.x;
    const pz = world.player.z;
    const radius2 = BAG_PICKUP_RADIUS * BAG_PICKUP_RADIUS;
    const me = world.player.name;
    for (const bag of world.lootBags) {
      const dx = bag.x - px;
      const dz = bag.z - pz;
      if (dx * dx + dz * dz > radius2) continue;
      if (!bag.items.some((it) => it.owner === me)) continue;
      dispatch(world, { kind: 'pickup_loot', bagId: bag.id });
    }
  }

  onMount(() => {
    const keyDown = (e: KeyboardEvent) => {
      // Chat owns its own keystrokes while open.
      if (chat.open) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        if (!e.repeat) openChat();
        return;
      }
      if (!e.repeat && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        return;
      }
      if (!e.repeat && /^F[1-5]$/.test(e.key)) {
        e.preventDefault();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) dispatch(world, { kind: 'manual_attack' });
      }
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (!e.repeat) pickupNearbyOwnedLoot();
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

  // Compute the world-space WASD direction from the keys currently
  // held + the live camera yaw. Returned fresh inside the inputs
  // factory each fixed step so the sim doesn't see stale yaw.
  function computeMove(): { x: number; z: number } {
    let nx = 0;
    let nz = 0;
    if (keys.has('w') || keys.has('arrowup')) nz -= 1;
    if (keys.has('s') || keys.has('arrowdown')) nz += 1;
    if (keys.has('a') || keys.has('arrowleft')) nx -= 1;
    if (keys.has('d') || keys.has('arrowright')) nx += 1;
    if (nx === 0 && nz === 0) return { x: 0, z: 0 };
    const len = Math.hypot(nx, nz);
    nx /= len;
    nz /= len;
    const sinY = Math.sin(cameraYaw);
    const cosY = Math.cos(cameraYaw);
    // Forward (W) = away from camera = (-sinY, 0, -cosY).
    // Right (D)   = (cosY, 0, -sinY). Map (nx, nz) onto those axes.
    return { x: nx * cosY + nz * sinY, z: -nx * sinY + nz * cosY };
  }

  useTask((frameDt) => {
    // One sim step per frame, sized to the actual frame delta. Sim
    // and render are aligned by construction — no interpolation, no
    // fixed-step beating, no input-lag from a leftover accumulator.
    // tick() caps frameDt internally so a tab unfreeze can't warp
    // the simulation forward by seconds. Queued SimEvents are
    // drained off world.inputQueue inside tick().
    const move = computeMove();
    tick(world, frameDt, { moveX: move.x, moveZ: move.z });

    // Walk-cycle flag: did the player actually translate this frame?
    playerMoving =
      Math.hypot(world.player.x - lastPlayerX, world.player.z - lastPlayerZ) >
      0.0001;
    lastPlayerX = world.player.x;
    lastPlayerZ = world.player.z;

    // Imperative pose update for the local player. Bypasses Svelte's
    // prop-binding flush (which would land one render frame later)
    // so the model stays locked to the same world.player.x/z this
    // frame's camera reads from. Without this the camera trails the
    // model by one frame while walking and the player visibly "slides
    // back" relative to the camera.
    if (playerGroupRef) {
      playerGroupRef.position.set(world.player.x, 0, world.player.z);
      playerGroupRef.rotation.y = world.player.rotation;
    }

    if (cameraRef) {
      const cp = Math.cos(cameraPitch);
      cameraRef.position.set(
        world.player.x + Math.sin(cameraYaw) * cp * cameraDistance,
        cameraTargetHeight + Math.sin(cameraPitch) * cameraDistance,
        world.player.z + Math.cos(cameraYaw) * cp * cameraDistance,
      );
      lookAtTarget.set(world.player.x, cameraTargetHeight, world.player.z);
      cameraRef.lookAt(lookAtTarget);
    }

    updateSunRig();
  });

  const grass = new MeshStandardMaterial({ color: '#7caa3e' });
  const dirt = new MeshStandardMaterial({ color: '#8b5a2b' });
  const groundMaterials = [dirt, dirt, grass, dirt, dirt, dirt];
</script>

<T.Color attach="background" args={['#d8e5b0']} />
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
    light.shadow.camera.left = -80;
    light.shadow.camera.right = 80;
    light.shadow.camera.top = 80;
    light.shadow.camera.bottom = -80;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 150;
    light.shadow.camera.updateProjectionMatrix();
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
    clearSelection();
    dispatch(world, { kind: 'click_ground', x: e.point.x, z: e.point.z });
  }}
>
  <T.BoxGeometry args={[200, 1, 200]} />
</T.Mesh>

<T.Mesh
  position={[CITY_X, 0.01, CITY_Z]}
  rotation={[-Math.PI / 2, 0, 0]}
  receiveShadow
>
  <T.CircleGeometry args={[CITY_RADIUS, 48]} />
  <T.MeshStandardMaterial color="#9a9a9a" />
</T.Mesh>

<Player
  position={[world.player.x, 0, world.player.z]}
  rotation={world.player.rotation}
  moving={playerMoving}
  slashTrigger={world.player.slashTrigger}
  oncreate={(g) => {
    playerGroupRef = g;
  }}
/>
<Water playerX={world.player.x} playerZ={world.player.z} />
<Props playerX={world.player.x} playerZ={world.player.z} />
<Enemies />
<Healers />
<LootBags />
<Spiders />
<Beasts />
<Death />

{#if selection.value}
  {@const view = getSelectionView()}
  {#if view}
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
