<script lang="ts">
  import { Canvas } from '@threlte/core';
  import { ACESFilmicToneMapping, PCFSoftShadowMap } from 'three';
  import { profile } from './profile.svelte';
  import { connect, realm, sendFrame } from './realm.svelte';
  import Scene from './scene/Scene.svelte';
  import CharacterCreation from './ui/CharacterCreation.svelte';
  import Hud from './ui/Hud.svelte';
  import PartySetup from './ui/PartySetup.svelte';

  type View = 'party' | 'creation' | 'game';
  let view = $state<View>('party');
  let activePartyId = $state('');

  // PR-G3: when the player already has a persisted character (loaded
  // by `initProfile()` during boot), skip the CharacterCreation panel
  // and jump straight to the game view. The same connect + identity
  // dispatch CharacterCreation.create() does, just sourced from the
  // PlayerProfile DO instead of fresh form input.
  function onPartyReady(id: string) {
    activePartyId = id;
    const cached = profile.character;
    if (cached !== null) {
      connect(id);
      sendFrame(0, 0, [
        {
          kind: 'create_character',
          name: cached.name,
          sex: cached.sex,
          hairColor: cached.hairColor,
          armor: cached.armor,
          playerClass: cached.playerClass,
        },
      ]);
      view = 'game';
    } else {
      view = 'creation';
    }
  }

  // Cap render DPR. Low-poly art doesn't benefit from the 2-3x fill
  // cost of native pixel density on Retina/4K — 1.5 is the sweet
  // spot for sharp UI overlays without quartering the fragment budget.
  const dpr = Math.min(window.devicePixelRatio, 1.5);

  // Listen for disband events from the realm. realm.disbandCount is
  // bumped exactly once per 'disbanded' message; the local `seenDisbands`
  // cursor (plain `let`, intentionally NOT $state — writing to it must
  // not retrigger this effect) tracks which bumps we've already handled.
  // Don't derive from realm.partyId here: it's null during normal
  // create-party flow too (the brief window after PartySetup.onReady
  // before CharacterCreation calls connect()), which would loop the
  // effect back to 'party' on every fresh party.
  let seenDisbands = 0;
  $effect(() => {
    if (realm.disbandCount > seenDisbands) {
      seenDisbands = realm.disbandCount;
      view = 'party';
      activePartyId = '';
    }
  });
</script>

<div class="stage">
  {#if view === 'party'}
    <PartySetup onReady={onPartyReady} />
  {:else if view === 'creation'}
    <CharacterCreation {activePartyId} onCreate={() => (view = 'game')} />
  {:else}
    <Canvas shadows={PCFSoftShadowMap} toneMapping={ACESFilmicToneMapping} {dpr}>
      <Scene />
    </Canvas>
    <Hud />
  {/if}
</div>

<style>
  .stage {
    position: absolute;
    inset: 0;
  }
</style>
