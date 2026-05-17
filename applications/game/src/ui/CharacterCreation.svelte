<script lang="ts">
  import { Canvas, T } from '@threlte/core';
  import { onMount } from 'svelte';
  import Player from '../scene/Player.svelte';
  import {
    ARMOR_COLORS,
    type ArmorColor,
    HAIR_COLORS,
    type HairColor,
    player,
  } from '../state.svelte';

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

  // Bind form controls directly to the shared player state so the
  // preview canvas re-renders the model live as fields change.
  onMount(() => {
    if (!player.name) {
      player.name = randomName();
      player.sex = Math.random() < 0.5 ? 'male' : 'female';
      player.hairColor = randomHair();
      player.armor = randomArmor();
    }
  });

  function randomize() {
    player.name = randomName();
    player.sex = Math.random() < 0.5 ? 'male' : 'female';
    player.hairColor = randomHair();
    player.armor = randomArmor();
  }

  function create() {
    const trimmed = player.name.trim();
    if (!trimmed) return;
    player.name = trimmed;
    onCreate();
  }

  // Slow turntable spin for the preview model. Pauses as soon as the
  // user takes manual control (drag or arrow click) so they can study
  // the angle they picked.
  let previewRotation = $state(0);
  let manualRotation = $state(false);
  let dragging = false;
  let lastMouseX = 0;

  $effect(() => {
    let last = performance.now();
    let raf: number;
    function tick(now: number) {
      const delta = (now - last) / 1000;
      last = now;
      if (!manualRotation) previewRotation += delta * 0.6;
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
    };
    const onUp = () => {
      dragging = false;
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
    manualRotation = true;
    lastMouseX = e.clientX;
  }

  function nudge(amount: number) {
    manualRotation = true;
    previewRotation += amount;
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-stone-950 via-neutral-900 to-stone-950 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.7)]"
>
  <div
    class="flex w-full max-w-3xl border-2 border-amber-700/70 bg-black/85 shadow-2xl shadow-black/60"
  >
    <div
      class="relative h-[440px] w-72 shrink-0 border-r border-amber-700/40 bg-stone-950/60"
    >
      <button
        type="button"
        aria-label="Rotate"
        onmousedown={startDrag}
        class="absolute inset-0 cursor-grab active:cursor-grabbing"
      >
        <Canvas>
          <T.Color attach="background" args={['#0d0d0d']} />
          <T.PerspectiveCamera
            makeDefault
            fov={32}
            position={[0, 1.3, 4]}
            oncreate={(c) => c.lookAt(0, 1, 0)}
          />
          <T.AmbientLight intensity={0.65} />
          <T.DirectionalLight position={[3, 5, 3]} intensity={1.1} />
          <Player
            position={[0, 0, 0]}
            rotation={previewRotation}
            moving={false}
            slashTrigger={0}
          />
        </Canvas>
      </button>

      <div
        class="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-2"
      >
        <button
          type="button"
          aria-label="Rotate left"
          onclick={() => nudge(-Math.PI / 6)}
          class="pointer-events-auto flex h-9 w-9 items-center justify-center border border-amber-700/50 bg-black/70 text-lg text-amber-200 transition hover:border-amber-400 hover:bg-amber-900/40"
        >
          ◀
        </button>
        <button
          type="button"
          aria-label="Rotate right"
          onclick={() => nudge(Math.PI / 6)}
          class="pointer-events-auto flex h-9 w-9 items-center justify-center border border-amber-700/50 bg-black/70 text-lg text-amber-200 transition hover:border-amber-400 hover:bg-amber-900/40"
        >
          ▶
        </button>
      </div>
    </div>

    <div class="flex-1 px-10 py-9">
      <h1
        class="mb-9 text-center text-5xl font-bold tracking-[0.35em] text-amber-400 uppercase"
      >
        Hero
      </h1>

      <div class="space-y-5">
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

      <div class="mt-9 flex flex-col items-center gap-3">
        <button
          type="button"
          onclick={randomize}
          class="border-2 border-amber-700/40 bg-neutral-900/70 px-8 py-2 text-sm font-semibold tracking-widest text-white/70 uppercase transition hover:border-amber-500 hover:text-amber-200"
        >
          Random
        </button>

        <button
          type="button"
          onclick={create}
          disabled={!player.name.trim()}
          class="border-2 border-amber-400 bg-amber-500/20 px-12 py-3 font-bold tracking-widest text-amber-100 uppercase transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-amber-500/20"
        >
          Create
        </button>
      </div>
    </div>
  </div>
</div>
