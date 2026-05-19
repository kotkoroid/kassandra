<script lang="ts">
  import { Canvas, T } from '@threlte/core';
  import { onMount } from 'svelte';
  import {
      ARMOR_COLORS,
      type ArmorColor,
      HAIR_COLORS,
      type HairColor,
      PLAYER_CLASSES,
      type PlayerClass,
  } from '../cosmetics';
  import Player from '../scene/Player.svelte';
  import { resetWorld, world } from '../simulation/world.svelte';

  // Local alias so the existing form bindings stay readable.
  const player = world.player;

  interface Props {
    onCreate: () => void;
  }
  let { onCreate }: Props = $props();

  const NAMES = [
    'Aldric',
    'Brynn',
    'Cassia',
    'Dax',
    'Elara',
    'Fenris',
    'Gwyn',
    'Hale',
    'Iyla',
    'Joren',
    'Kael',
    'Lyra',
    'Mael',
    'Nyx',
    'Orin',
    'Ravia',
    'Sable',
    'Theron',
    'Vela',
    'Wren',
  ];
  function randomName(): string {
    return NAMES[Math.floor(Math.random() * NAMES.length)]!;
  }

  const HAIR_KEYS = Object.keys(HAIR_COLORS) as HairColor[];
  function randomHair(): HairColor {
    return HAIR_KEYS[Math.floor(Math.random() * HAIR_KEYS.length)]!;
  }

  const ARMOR_KEYS = Object.keys(ARMOR_COLORS) as ArmorColor[];
  function randomArmor(): ArmorColor {
    return ARMOR_KEYS[Math.floor(Math.random() * ARMOR_KEYS.length)]!;
  }

  const CLASS_KEYS = Object.keys(PLAYER_CLASSES) as PlayerClass[];
  function randomClass(): PlayerClass {
    return CLASS_KEYS[Math.floor(Math.random() * CLASS_KEYS.length)]!;
  }

  // Bind form controls directly to world.player so the preview
  // canvas re-renders the model live as fields change. A blank
  // name signals a fresh creation flow — seed with random defaults.
  onMount(() => {
    if (!player.name) {
      player.name = randomName();
      player.sex = 'male';
      player.hairColor = HAIR_KEYS[0]!;
      player.armor = ARMOR_KEYS[0]!;
      player.playerClass = CLASS_KEYS[0]!;
    }
  });

  function randomize() {
    player.name = randomName();
    player.sex = Math.random() < 0.5 ? 'male' : 'female';
    player.hairColor = randomHair();
    player.armor = randomArmor();
    player.playerClass = randomClass();
  }

  function create() {
    const trimmed = player.name.trim();
    if (!trimmed) return;
    if (activating) return; // ignore double-clicks during the animation
    activating = true;
    // Hold the click for the duration of the platform's "powering
    // up" ring spin before swapping to the game canvas.
    setTimeout(() => {
      // Snapshot the chosen identity, reset the world to start a
      // fresh run, then write the identity onto the new world.player
      // before flipping views.
      const { sex, hairColor, armor, playerClass } = player;
      resetWorld();
      world.player.name = trimmed;
      world.player.sex = sex;
      world.player.hairColor = hairColor;
      world.player.armor = armor;
      world.player.playerClass = playerClass;
      onCreate();
    }, ACTIVATION_DURATION_MS);
  }

  // Slow turntable spin for the preview model. Pauses as soon as the
  // user takes manual control (drag or arrow click) so they can study
  // the angle they picked.
  let previewRotation = $state(0);
  let manualRotation = $state(false);
  let dragging = false;
  let lastMouseX = 0;
  // Plays the walk-cycle on the preview model. Off by default so
  // the player can study the silhouette in a static pose first.
  let running = $state(false);
  // Counter passed straight to `<Player slashTrigger>`. Incrementing
  // it makes the model play one sword swing.
  let slashTrigger = $state(0);
  // True between Create click and the actual onCreate() transition.
  // Drives the platform's trim ring to glow green and spin as a
  // "powering up" cue before the view swaps to the game.
  let activating = $state(false);
  // Continuously-advanced Y-rotation for the platform ring during
  // activation. Bumped by the existing raf tick below.
  let ringSpin = $state(0);
  const RING_SPIN_SPEED = 6; // rad/s while activating
  const ACTIVATION_DURATION_MS = 900;
  // ±1 — direction the auto-turntable spins. Default clockwise from
  // the camera's POV. Drag flips this so on release the model keeps
  // turning the same way the player just pushed it.
  let spinDirection = 1;
  // While an arrow button is held down, rotate continuously at
  // HOLD_SPEED in that direction. 0 = no arrow held.
  let heldDirection: -1 | 0 | 1 = 0;
  const HOLD_SPEED = 2.4;   // rad/s while ◀ / ▶ is pressed
  const AUTO_SPEED = 0.35;  // rad/s for the idle turntable

  $effect(() => {
    let last = performance.now();
    let raf: number;
    function tick(now: number) {
      const delta = (now - last) / 1000;
      last = now;
      // Active hold on an arrow button beats the idle turntable.
      // Dragging suspends the turntable too — but neither toggles
      // the pause state, so a user-paused model stays paused once
      // the input ends.
      if (heldDirection !== 0) {
        previewRotation += delta * HOLD_SPEED * heldDirection;
      } else if (!manualRotation && !dragging) {
        previewRotation += delta * AUTO_SPEED * spinDirection;
      }
      // Trim ring "powering up" spin while the Create activation is
      // playing. Ignores pause / drag — this is the leave-screen
      // animation, it shouldn't care about input state.
      if (activating) ringSpin += delta * RING_SPIN_SPEED;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  $effect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastMouseX;
      lastMouseX = e.clientX;
      // ~115 pixels per full turn.
      previewRotation += dx * 0.0055;
      // Track which way the player is pushing the model. Ignore
      // sub-pixel jitter so a near-zero dx doesn't flip the sign
      // unintentionally.
      if (Math.abs(dx) > 0.5) spinDirection = dx > 0 ? 1 : -1;
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      // Pause state is owned by the play/pause button — don't
      // implicitly resume just because a drag ended. If the user
      // had paused, the model stays paused on release.
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  });

  function startDrag(e: MouseEvent) {
    if (e.button !== 0) return;
    dragging = true;
    // Suspend the auto-spin while the user is actively dragging so
    // the model doesn't fight them. Pause-state isn't touched —
    // when they release, the model resumes whatever it was doing
    // before (auto-spinning or paused).
    lastMouseX = e.clientX;
  }

  function startHold(direction: -1 | 1) {
    heldDirection = direction;
    spinDirection = direction;
  }
  function endHold() {
    heldDirection = 0;
  }

  // Global pointerup safety net — if the user releases the mouse
  // outside the button (or drags off it), still stop spinning.
  $effect(() => {
    const onUp = () => endHold();
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  });

  // Keyboard rotation: ←/A spin left, →/D spin right. Mirrors the
  // ◀ / ▶ buttons exactly (same startHold / endHold).
  function keyDirection(e: KeyboardEvent): -1 | 0 | 1 {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') return -1;
    if (k === 'ArrowRight' || k === 'd' || k === 'D') return 1;
    return 0;
  }
  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  }
  $effect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Hold is driven by the tick loop, so OS-level key-repeat
      // should be ignored.
      if (e.repeat) return;
      // Don't hijack arrows / A / D when the player is typing the
      // hero name.
      if (isTypingTarget(e.target)) return;
      const dir = keyDirection(e);
      if (dir === 0) return;
      e.preventDefault();
      startHold(dir);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const dir = keyDirection(e);
      if (dir === 0) return;
      // Only release if the key being lifted matches the direction
      // we're currently spinning — handles the case where the user
      // presses ←, then →, then releases ← (still want to spin →).
      if (dir === heldDirection) endHold();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  });
</script>

<!-- Full-screen character creation. No card border — left half is
     a tall hero-portrait canvas, right half is the form, both
     bleeding into the same dark background. -->
<div
  class="fixed inset-0 z-50 flex bg-gradient-to-br from-stone-950 via-neutral-900 to-stone-950 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.7)]"
>
  <!-- Left pane: a faint radial vignette behind the canvas pulls
       the eye toward the model and keeps the figure from dissolving
       into pure black at the edges. The canvas's scene background
       is layered on top of this but matches the gradient's centre,
       so the seam isn't visible. -->
  <div
    class="relative h-full w-1/2 shrink-0 bg-[radial-gradient(ellipse_at_center,_#1a1411_0%,_#0d0a08_45%,_#050403_100%)]"
  >
    <button
      type="button"
      aria-label="Rotate"
      onmousedown={startDrag}
      class="absolute inset-0 cursor-grab active:cursor-grabbing"
    >
      <Canvas>
        <!-- Stage backdrop: slightly warmer than pure black so the
             rim light has something to bleed into. -->
        <T.Color attach="background" args={['#0f0c0a']} />
        <T.PerspectiveCamera
          makeDefault
          fov={22}
          position={[0, 0.85, 5.8]}
          oncreate={(c) => c.lookAt(0, 0.75, 0)}
        />

        <!-- Three-point rig. Ambient is dim + warm so it doesn't
             wash out the directional contrast. -->
        <T.AmbientLight intensity={0.28} color="#fff4d6" />
        <!-- Key light: cool white from upper-left in front of the
             camera. Defines the model's primary form. -->
        <T.DirectionalLight position={[-3, 5, 3]} intensity={1.4} />
        <!-- Rim light: warm amber from upper-right-back. Paints a
             gold edge that matches the UI accent and makes the
             armor colour selection actually pop against the dark
             backdrop. -->
        <T.DirectionalLight
          position={[3, 3, -2]}
          intensity={1.3}
          color="#f0b040"
        />
        <!-- Front bounce: low warm fill so the chest plate / belt
             pick up a soft highlight from below the camera. -->
        <T.PointLight
          position={[0, 0.4, 2]}
          intensity={0.35}
          color="#fff4d6"
          distance={5}
        />

        <!-- Low-poly stone platform: a wide stubby cylinder so the
             character has something to stand on. Slight taper +
             matte material keeps it readable as worn stone. -->
        <T.Mesh position={[0, -0.06, 0]}>
          <T.CylinderGeometry args={[0.7, 0.78, 0.12, 28]} />
          <T.MeshStandardMaterial
            color="#3a3530"
            roughness={0.95}
            metalness={0.05}
          />
        </T.Mesh>
        <!-- Inset top trim ring so the platform edge catches light
             and reads as carved instead of flat. While the Create
             activation plays it glows green and spins around the
             vertical axis as a "powering up" cue. -->
        <T.Group position={[0, 0.001, 0]} rotation.y={ringSpin}>
          <T.Mesh rotation={[-Math.PI / 2, 0, 0]}>
            <T.RingGeometry args={[0.6, 0.68, 28]} />
            <T.MeshStandardMaterial
              color={activating ? '#2dd76e' : '#2a2520'}
              emissive={activating ? '#1aff75' : '#000000'}
              emissiveIntensity={activating ? 1.4 : 0}
              roughness={1}
            />
          </T.Mesh>
        </T.Group>

        <!-- Fake contact shadow: low-opacity dark disc sitting just
             above the platform's top surface. Reads as an
             elliptical ground shadow from the camera angle without
             paying for real shadow-mapping. -->
        <T.Mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <T.CircleGeometry args={[0.55, 32]} />
          <T.MeshBasicMaterial
            color="#000"
            transparent
            opacity={0.55}
            depthWrite={false}
          />
        </T.Mesh>

        <Player
          position={[0, 0, 0]}
          rotation={previewRotation}
          speed={running ? 5 : 0}
          paused={manualRotation}
          {slashTrigger}
        />
      </Canvas>
    </button>

    <!-- Rotation controls — styled as carved stone tiles sitting on
         the platform's front rim, centered so they read as the
         platform's built-in turntable. -->
    <div
      class="pointer-events-none absolute inset-x-0 bottom-[44px] flex justify-center"
    >
      <div class="pointer-events-auto flex gap-1">
        <button
          type="button"
          aria-label="Rotate left"
          onpointerdown={() => startHold(-1)}
          onpointerup={endHold}
          onpointerleave={endHold}
          onpointercancel={endHold}
          class="stone-tile flex h-9 w-9 items-center justify-center text-lg"
        >
          ◀
        </button>
        <button
          type="button"
          aria-label={manualRotation ? 'Resume rotation' : 'Pause rotation'}
          onclick={() => (manualRotation = !manualRotation)}
          class="stone-tile flex h-9 w-9 items-center justify-center text-base"
        >
          {manualRotation ? '▷' : '❚❚'}
        </button>
        <button
          type="button"
          aria-label="Rotate right"
          onpointerdown={() => startHold(1)}
          onpointerup={endHold}
          onpointerleave={endHold}
          onpointercancel={endHold}
          class="stone-tile flex h-9 w-9 items-center justify-center text-lg"
        >
          ▶
        </button>
      </div>
    </div>

    <!-- Animation toggles — pinned to the top-right corner so they
         read as standalone UI affordances rather than part of the
         platform's turntable. -->
    <div
      class="pointer-events-auto absolute top-6 right-6 flex gap-2"
    >
      <button
        type="button"
        aria-label={running ? 'Stop running animation' : 'Play running animation'}
        onclick={() => (running = !running)}
        class="flex h-9 items-center justify-center border bg-black/70 px-2 text-[10px] font-bold tracking-widest uppercase transition {running
          ? 'border-amber-400 bg-amber-900/40 text-amber-100'
          : 'border-amber-700/50 text-amber-200 hover:border-amber-400 hover:bg-amber-900/40'}"
      >
        Run
      </button>
      <button
        type="button"
        aria-label="Play slash animation"
        onclick={() => slashTrigger++}
        class="flex h-9 items-center justify-center border border-amber-700/50 bg-black/70 px-2 text-[10px] font-bold tracking-widest text-amber-200 uppercase transition hover:border-amber-400 hover:bg-amber-900/40"
      >
        Slash
      </button>
    </div>
  </div>

  <div class="flex h-full flex-1 flex-col justify-center overflow-y-auto px-16 py-8">
      <header class="mb-6 text-center">
        <h1
          class="text-4xl font-bold tracking-[0.3em] text-amber-400 uppercase"
        >
          The World of Kassandra Awaits!
        </h1>
        <p
          class="mt-2 font-mono text-sm tracking-[0.2em] text-amber-200/70"
        >
          &lt; Create your hero… &gt;
        </p>
      </header>

      <div class="space-y-3">
        <label class="flex items-center gap-4">
          <span
            class="w-16 text-sm font-semibold tracking-widest text-amber-300/80 uppercase"
          >
            Name
          </span>
          <input
            bind:value={player.name}
            maxlength="20"
            placeholder="—"
            class="flex-1 border border-amber-700/40 bg-neutral-900/80 px-3 py-2 text-white outline-none focus:border-amber-400"
          />
        </label>

        <div class="flex items-center gap-4">
          <span
            class="w-16 text-sm font-semibold tracking-widest text-amber-300/80 uppercase"
          >
            Sex
          </span>
          <div class="flex gap-2">
            <button
              type="button"
              aria-label="Male"
              onclick={() => (player.sex = 'male')}
              class="flex h-11 w-11 items-center justify-center border-2 text-2xl transition {player.sex ===
              'male'
                ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                : 'border-amber-700/30 text-white/40 hover:border-amber-500'}"
            >
              ♂
            </button>
            <button
              type="button"
              aria-label="Female"
              onclick={() => (player.sex = 'female')}
              class="flex h-11 w-11 items-center justify-center border-2 text-2xl transition {player.sex ===
              'female'
                ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                : 'border-amber-700/30 text-white/40 hover:border-amber-500'}"
            >
              ♀
            </button>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <span
            class="w-16 text-sm font-semibold tracking-widest text-amber-300/80 uppercase"
          >
            Class
          </span>
          <div class="flex flex-wrap gap-2">
            {#each CLASS_KEYS as key (key)}
              <button
                type="button"
                aria-label={PLAYER_CLASSES[key].label}
                onclick={() => (player.playerClass = key)}
                class="border-2 px-3 py-1.5 text-xs font-semibold tracking-widest uppercase transition {player.playerClass ===
                key
                  ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                  : 'border-amber-700/30 text-white/50 hover:border-amber-500'}"
              >
                {PLAYER_CLASSES[key].label}
              </button>
            {/each}
          </div>
        </div>

        <div class="flex items-center gap-4">
          <span
            class="w-16 text-sm font-semibold tracking-widest text-amber-300/80 uppercase"
          >
            Hair
          </span>
          <div class="flex gap-2">
            {#each HAIR_KEYS as key (key)}
              <button
                type="button"
                aria-label={key}
                title={key}
                onclick={() => (player.hairColor = key)}
                class="h-8 w-8 rounded-full border-2 transition {player.hairColor ===
                key
                  ? 'border-amber-400'
                  : 'border-amber-700/30 hover:border-amber-500'}"
                style:background-color={HAIR_COLORS[key]}
              ></button>
            {/each}
          </div>
        </div>

        <div class="flex items-center gap-4">
          <span
            class="w-16 text-sm font-semibold tracking-widest text-amber-300/80 uppercase"
          >
            Armor
          </span>
          <div class="flex flex-wrap gap-2">
            {#each ARMOR_KEYS as key (key)}
              <button
                type="button"
                aria-label={key}
                title={key}
                onclick={() => (player.armor = key)}
                class="h-8 w-8 rounded-full border-2 transition {player.armor ===
                key
                  ? 'border-amber-400'
                  : 'border-amber-700/30 hover:border-amber-500'}"
                style:background-color={ARMOR_COLORS[key].skirt}
              ></button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Inline action row: dice = secondary, Create = primary.
           Create stretches and uses a solid-gold fill so it reads
           unambiguously as the next step; Random sits next to it
           as a small icon-only chip. -->
      <div class="mt-6 flex items-stretch gap-3">
        <button
          type="button"
          onclick={randomize}
          aria-label="Randomise hero"
          title="Randomise"
          class="flex w-14 shrink-0 items-center justify-center border-2 border-amber-700/40 bg-neutral-900/70 text-2xl text-amber-300 transition hover:border-amber-400 hover:text-amber-100"
        >
          ⚄
        </button>

        <button
          type="button"
          onclick={create}
          disabled={!player.name.trim() || activating}
          class="flex-1 border-2 border-amber-300 bg-amber-400 px-8 py-3 font-bold tracking-widest text-stone-950 uppercase shadow-lg shadow-amber-900/40 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:border-amber-700/40 disabled:bg-amber-700/40 disabled:text-stone-950/40 disabled:shadow-none"
        >
          Create
        </button>
      </div>
    </div>
  </div>

<style>
  /* Stone tile button used by the rotation controls. Reads as the
     same carved-rock material as the platform under the model:
     warm dark fill, slightly lighter warm border, an inset shadow
     for a bit of depth, and a warm amber glyph that picks up the
     scene's rim light. */
  .stone-tile {
    color: #f5d68a;
    background-color: #2a2520;
    border: 1px solid #5a4a36;
    box-shadow:
      inset 0 1px 0 rgb(255 235 180 / 0.08),
      inset 0 -2px 4px rgb(0 0 0 / 0.45);
    transition: background-color 120ms ease, border-color 120ms ease;
  }
  .stone-tile:hover {
    background-color: #3a3024;
    border-color: #7a6444;
  }
  .stone-tile:active {
    background-color: #1f1916;
    box-shadow:
      inset 0 2px 3px rgb(0 0 0 / 0.6),
      inset 0 -1px 0 rgb(255 235 180 / 0.04);
  }</style>
