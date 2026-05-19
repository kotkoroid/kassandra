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
    Plane,
    Raycaster,
    Vector2,
    Vector3,
  } from 'three';
  import { chat, closeChat, openChat } from '../chat.svelte';
  import { fireClickIndicator } from '../clickIndicator.svelte';
  import { CITY_RADIUS, CITY_X, CITY_Z } from '../city';
  import { clearSelection, getSelectionView, selection } from '../selection.svelte';
  import { BAG_PICKUP_RADIUS, NIGHT_END, NIGHT_START } from '../sim/constants';
  import { dispatch } from '../sim/input';
  import { currentHour } from '../sim/systems/time';
  import { tick } from '../sim/tick';
  import { world } from '../sim/world.svelte';
  import Beasts from './Beasts.svelte';
  import ClickIndicator from './ClickIndicator.svelte';
  import Death from './Death.svelte';
  import Enemies from './Enemies.svelte';
  import Healers from './Healers.svelte';
  import CityLamps from './CityLamps.svelte';
  import CityWalls from './CityWalls.svelte';
  import DamageNumbers from './DamageNumbers.svelte';
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
  // Left-mouse-button click-to-move drag state. While `groundFollow`
  // is on, every mousemove re-targets the player at the cursor's
  // ground projection — the character chases the cursor in real time
  // instead of waiting for the click to be released.
  let groundFollow = false;
  // Scratch instances for the per-move raycast against the ground
  // plane. Allocated once at module mount so the move handler is
  // GC-free (it can fire dozens of times during a single drag).
  const followRaycaster = new Raycaster();
  const followPointer = new Vector2();
  const followHit = new Vector3();
  // Infinite ground plane at y = 0 — matches the top face of the
  // ground BoxGeometry below (which sits at y = -0.5 with height 1).
  const GROUND_PLANE = new Plane(new Vector3(0, 1, 0), 0);
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
  // shadow coverage stays centered on the camera target. The sun's
  // arc is split so the lit half (sunY ≥ 0) spans the gameplay day
  // window [NIGHT_END, NIGHT_START] and the dark half spans the
  // night window — i.e. the world only goes dark after 22:00 to
  // match the night-start gameplay rules and the lamps.
  const DAY_HOURS = NIGHT_START - NIGHT_END; // 16
  const NIGHT_HOURS = 24 - DAY_HOURS;        // 8
  function updateSunRig() {
    const hour = currentHour(world);
    let alpha: number;
    if (hour >= NIGHT_END && hour < NIGHT_START) {
      // Daytime: alpha 0 (dawn) → π (dusk) across 16 hours.
      alpha = ((hour - NIGHT_END) / DAY_HOURS) * Math.PI;
    } else {
      // Nighttime: alpha π → 2π across 8 hours, wrapping midnight.
      const h = hour < NIGHT_END ? hour + 24 : hour;
      alpha = Math.PI + ((h - NIGHT_START) / NIGHT_HOURS) * Math.PI;
    }
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
  // `hasOwnerItems` is precomputed on the bag so the inner check is
  // O(1) instead of scanning items per bag per keypress.
  function pickupNearbyOwnedLoot() {
    const px = world.player.x;
    const pz = world.player.z;
    const radius2 = BAG_PICKUP_RADIUS * BAG_PICKUP_RADIUS;
    for (const bag of world.lootBags) {
      if (!bag.hasOwnerItems) continue;
      const dx = bag.x - px;
      const dz = bag.z - pz;
      if (dx * dx + dz * dz > radius2) continue;
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
      // Right-button drag: camera yaw/pitch.
      if (dragging) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        cameraYaw -= dx * yawSensitivity;
        cameraPitch = Math.max(
          pitchMin,
          Math.min(pitchMax, cameraPitch + dy * pitchSensitivity),
        );
      }

      // Left-button drag: continuously re-target the player at the
      // cursor's ground-plane projection. The Threlte mesh
      // `onpointerdown` started the drag — once it's on we raycast
      // ourselves against an infinite y = 0 plane so the player
      // keeps tracking even when the cursor wanders off the ground
      // mesh (over an entity, off the edge of the world, etc.).
      if (groundFollow && cameraRef) {
        followPointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        followPointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
        followRaycaster.setFromCamera(followPointer, cameraRef);
        const hit = followRaycaster.ray.intersectPlane(
          GROUND_PLANE,
          followHit,
        );
        if (hit) {
          dispatch(world, { kind: 'click_ground', x: hit.x, z: hit.z });
        }
      }
    };
    const mouseUp = (e: MouseEvent) => {
      if (e.button === 2) dragging = false;
      if (e.button === 0 && groundFollow) {
        // Final-position indicator. On a drag the initial click ring
        // is back where the press landed; we want a fresh marker at
        // the release point so the player can see where they ended.
        // For a pure click (no movement) the release lands on the
        // same spot as the press so this just re-fires the ring
        // harmlessly.
        if (cameraRef) {
          followPointer.x = (e.clientX / window.innerWidth) * 2 - 1;
          followPointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
          followRaycaster.setFromCamera(followPointer, cameraRef);
          const hit = followRaycaster.ray.intersectPlane(
            GROUND_PLANE,
            followHit,
          );
          if (hit) fireClickIndicator(hit.x, hit.z);
        }
        groundFollow = false;
      }
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
  onpointerdown={(e: {
    point: { x: number; z: number };
    nativeEvent: PointerEvent;
  }) => {
    // Trigger on the left button only; right-click is reserved for
    // the camera-rotation drag handled globally above. Threlte's
    // event spreads the THREE.Intersection at the top level — the
    // mouse-button bit lives on `nativeEvent`, not on the event
    // wrapper itself, so `e.button` would be undefined here.
    if (e.nativeEvent.button !== 0) return;
    // Same housekeeping the old onclick used to do: ground click
    // dismisses chat (click-out-to-close convention), clears any
    // entity selection, and drops the transient ring marker.
    if (chat.open) closeChat();
    clearSelection();
    fireClickIndicator(e.point.x, e.point.z);
    dispatch(world, { kind: 'click_ground', x: e.point.x, z: e.point.z });
    // Arm drag-follow so the global mousemove handler keeps
    // re-targeting the player at the cursor's ground projection
    // until the button is released. Pure-click (no movement) is
    // still covered by the initial dispatch above.
    groundFollow = true;
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

<CityWalls />
<CityLamps />

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
<DamageNumbers />
<Spiders />
<Beasts />
<ClickIndicator />
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
