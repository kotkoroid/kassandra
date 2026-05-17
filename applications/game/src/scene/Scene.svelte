<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { onMount } from 'svelte';
  import {
    DirectionalLight,
    MeshStandardMaterial,
    PerspectiveCamera,
    Vector3,
  } from 'three';
  import { death } from '../death.svelte';
  import { player, STAMINA_MAX } from '../state.svelte';
  import Death from './Death.svelte';
  import Enemies from './Enemies.svelte';
  import Healers from './Healers.svelte';
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

  let playerX = $state(0);
  let playerZ = $state(0);
  let playerRotation = $state(0);
  let playerMoving = $state(false);
  // Increments each time space is pressed so Player can latch onto
  // the transition without us managing slash timing here.
  let slashTrigger = $state(0);
  let cameraYaw = $state(0);
  let cameraPitch = $state(0.55);
  let cameraRef: PerspectiveCamera | undefined = $state();
  let lightRef: DirectionalLight | undefined = $state();

  // Exhaustion lock: once stamina hits 0, regen stays slow until the
  // bar is fully refilled, regardless of how the player picks back up.
  let exhausted = false;

  const visibleProps = $derived(getVisibleProps(playerX, playerZ));
  const visibleWaters = $derived(getVisibleWaters(playerX, playerZ));

  const keys = new Set<string>();
  let dragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  const lookAtTarget = new Vector3();

  onMount(() => {
    const keyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        // Stop the page from scrolling and only count fresh presses
        // as new slashes — holding space shouldn't spam-trigger.
        e.preventDefault();
        if (!e.repeat) slashTrigger++;
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
      if (lightRef) {
        lightRef.position.set(playerX + 10, 20, playerZ + 8);
        lightRef.target.position.set(playerX, 0, playerZ);
        lightRef.target.updateMatrixWorld();
      }
      return;
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

    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz);
      const nx = dx / len;
      const nz = dz / len;
      const sinY = Math.sin(cameraYaw);
      const cosY = Math.cos(cameraYaw);
      // Forward (W) = away from camera = (-sinY, 0, -cosY).
      // Right (D) = (cosY, 0, -sinY). Map (nx, nz) onto those axes.
      const worldX = nx * cosY + nz * sinY;
      const worldZ = -nx * sinY + nz * cosY;
      playerX += worldX * speed * delta;
      playerZ += worldZ * speed * delta;
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

    // Keep the directional light + its shadow frustum centered on the
    // player so the shadow map always covers the visible area instead
    // of clipping at the world's default 10-unit frustum.
    if (lightRef) {
      lightRef.position.set(playerX + 10, 20, playerZ + 8);
      lightRef.target.position.set(playerX, 0, playerZ);
      lightRef.target.updateMatrixWorld();
    }
  });

  // Minecraft Superflat: a single grass-block-thick ground layer.
  // BoxGeometry face order is +X, -X, +Y, -Y, +Z, -Z, so the third
  // material colours the top (grass) and the rest colour the dirt
  // sides + bottom visible at the world edge.
  const grass = new MeshStandardMaterial({ color: '#7caa3e' });
  const dirt = new MeshStandardMaterial({ color: '#8b5a2b' });
  const groundMaterials = [dirt, dirt, grass, dirt, dirt, dirt];
</script>

<T.Color attach="background" args={['#d8e5b0']} />
<T.Fog attach="fog" args={['#d8e5b0', 20, 50]} />

<T.PerspectiveCamera
  makeDefault
  fov={50}
  oncreate={(ref) => {
    cameraRef = ref;
  }}
/>

<T.AmbientLight intensity={0.55} />
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

<T.Mesh position={[0, -0.5, 0]} material={groundMaterials} receiveShadow>
  <T.BoxGeometry args={[200, 1, 200]} />
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
<Spiders
  {playerX}
  {playerZ}
  {playerRotation}
  {slashTrigger}
/>
<Death {playerX} {playerZ} />
