<script lang="ts">
  // Spiders share a single set of InstancedMeshes across all three
  // tiers — the tier-specific scale (1 / 0.7 / 0.45) is folded into
  // each instance's matrix, so big/medium/tiny live in the same
  // draw calls without per-tier asset duplication.
  import EntityInstances from './EntityInstances.svelte';
  import { SPIDER_DEFS } from './entityMeshDefs';

  const SCALE = {
    'spider-big': 1,
    'spider-medium': 0.7,
    'spider-tiny': 0.45,
  } as const;
</script>

<EntityInstances
  kinds={['spider-big', 'spider-medium', 'spider-tiny']}
  defs={SPIDER_DEFS}
  nameplateY={0.6}
  scaleByKind={SCALE}
  barWidthPx={56}
/>
